import fs from "fs";
import path from "path";

import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

import {
  HEPRS_FIXTURE_SIZES,
  HeprsAdvisorRecommendation,
  HeprsFixtureSize,
  chunkBigIntVector,
  dotProductBigInt,
  getHeprsBalancedRecommendation,
  loadHeprsFixture,
  quantizeHeprsWeightsWithRecommendation,
  toBigIntVector
} from "../test/utils/heprs";
import {
  fixtureModelProvenance,
  buildProvenance,
  contractIdentity,
  heprsManifestPath,
  heprsWeightsPath,
  heprsGenotypePath,
  heprsReferencePath,
} from "./utils/provenance";

interface CliOptions {
  fixtureSizes: HeprsFixtureSize[];
  uploadChunkSize: number;
  computeChunkSize: number;
  verbose: boolean;
  jsonOutPath?: string;
}

interface ChunkTimingSummary {
  chunkCount: number;
  totalMs: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  perChunkMs: number[];
}

interface GasSummary {
  publishModel: bigint;
  createJob: bigint;
  uploadSnps: bigint;
  finalizeSnpUpload: bigint;
  compute: bigint;
  finalize: bigint;
  total: bigint;
}

// Streaming path collapses upload + compute into a single phase (no snpData storage).
interface StreamingGasSummary {
  publishModel: bigint;   // shared — model published once for both paths
  createJob: bigint;
  uploadAndCompute: bigint; // appendAndComputeChunk calls; replaces uploadSnps + compute
  finalize: bigint;
  total: bigint;
}

interface TransactionSummary {
  modelPublication: number;
  sampleRegistration: number;
  classic: {
    jobCreation: number;
    uploadSnps: number;
    finalizeSnpUpload: number;
    compute: number;
    resultFinalization: number;
    totalIncludingModelAndSample: number;
  };
  streaming: {
    jobCreation: number;
    uploadAndCompute: number;
    resultFinalization: number;
    totalIncludingModelAndSample: number;
  };
}

interface SuccessfulFixtureProfile {
  fixtureSize: HeprsFixtureSize;
  vectorLength: number;
  uploadChunkSize: number;
  computeChunkSize: number;
  recommendation: HeprsAdvisorRecommendation;
  evidenceClass: string;
  provenance: unknown;
  chunkTiming: ChunkTimingSummary;
  gas: GasSummary;
  streamingGas: StreamingGasSummary;
  transactions: TransactionSummary;
  status: "full_flow";
  timingsMs: {
    total: number;
    loadFixture: number;
    quantizeWeights: number;
    localReferenceDotProduct: number;
    deployMarketplace: number;
    publishModel: number;
    deployEngine: number;
    createJob: number;
    uploadSnps: number;
    finalizeSnpUpload: number;
    readPartial: number;
    finalize: number;
    streamingUploadAndCompute: number;
    streamingFinalize: number;
  };
}

type FixtureProfile = SuccessfulFixtureProfile;

function nowNs(): bigint {
  return process.hrtime.bigint();
}

function nsToMs(value: bigint): number {
  return Number(value) / 1_000_000;
}

async function timed<T>(fn: () => Promise<T> | T): Promise<{ value: T; ms: number }> {
  const start = nowNs();
  const value = await fn();
  return { value, ms: nsToMs(nowNs() - start) };
}

function parseFixtureSize(value: string): HeprsFixtureSize {
  const parsed = Number(value);
  if (!HEPRS_FIXTURE_SIZES.includes(parsed as HeprsFixtureSize)) {
    throw new Error(`Unsupported fixture size "${value}". Expected one of: ${HEPRS_FIXTURE_SIZES.join(", ")}`);
  }
  return parsed as HeprsFixtureSize;
}

function parseCliArgs(argv: string[]): CliOptions {
  const fixtureSizes: HeprsFixtureSize[] = [];
  // Decoupled defaults:
  //   uploadChunkSize=32 — 2048-bit input-proof budget (max 32 euint64s per call)
  //   computeChunkSize=20 — HCU-safe on mock; Sepolia ceiling TBD (run probe:hcu)
  let uploadChunkSize = 32;
  let computeChunkSize = 20;
  let verbose = false;
  // Hardhat consumes and rejects unknown CLI flags before Mocha can expose them to
  // this script. The environment variable is therefore the reproducible path used
  // by Phase 8; direct invocation can still use --json-out.
  let jsonOutPath = process.env.HEPRS_PROFILE_JSON_OUT;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--fixture") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --fixture");
      }
      fixtureSizes.push(parseFixtureSize(value));
      i += 1;
      continue;
    }

    if (arg === "--upload-chunk-size") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("Upload chunk size must be a positive integer");
      }
      uploadChunkSize = value;
      i += 1;
      continue;
    }

    if (arg === "--compute-chunk-size") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("Compute chunk size must be a positive integer");
      }
      computeChunkSize = value;
      i += 1;
      continue;
    }

    if (arg === "--verbose") {
      verbose = true;
      continue;
    }

    if (arg === "--json-out") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --json-out");
      }
      jsonOutPath = value;
      i += 1;
      continue;
    }

    // Skip non-flag tokens injected by `hardhat run` (e.g. "run", the script path)
    if (!arg.startsWith("--")) {
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    fixtureSizes: fixtureSizes.length > 0 ? fixtureSizes : [...HEPRS_FIXTURE_SIZES],
    uploadChunkSize,
    computeChunkSize,
    verbose,
    jsonOutPath
  };
}

async function profileFixture(
  fixtureSize: HeprsFixtureSize,
  uploadChunkSize: number,
  computeChunkSize: number
): Promise<FixtureProfile> {
  const totalStart = nowNs();

  const fixtureResult = await timed(() => loadHeprsFixture(fixtureSize));
  const { genotypes, betas } = fixtureResult.value;

  const recommendation = getHeprsBalancedRecommendation(fixtureSize);
  const quantizeResult = await timed(() => (
    quantizeHeprsWeightsWithRecommendation(fixtureSize, betas)
  ));
  const quantized = quantizeResult.value;
  const snps = toBigIntVector(genotypes[0]);

  if (snps.length !== quantized.weights.length) {
    throw new Error(`Fixture ${fixtureSize} has mismatched vector lengths`);
  }

  const expectedResult = await timed(() => dotProductBigInt(snps, quantized.weights));
  const naiveDotProduct = expectedResult.value;

  // V1 offset-corrected encoded score: (weighted_sum + scoreOffset) - weightZeroPoint * genoSum
  const genoSum = snps.reduce((a, b) => a + b, 0n);
  const expected = naiveDotProduct + quantized.scoreOffset - quantized.weightZeroPoint * genoSum;

  // R2.4-E1: commit to the exact fixture bytes and to the same model manifest the
  // independent Python reference consumes, so a reported figure ties back to both.
  const prov = fixtureModelProvenance({
    manifestPath: heprsManifestPath(fixtureSize),
    weightsPath: heprsWeightsPath(fixtureSize),
    genotypePath: heprsGenotypePath(fixtureSize),
    extra: {
      nominalSnpCount: fixtureSize,
      encodedPositions: quantized.weights.length,
      encodedPositionsNote:
        "nominal + 1: the fixtures carry a leading intercept column (weight 0, dosage 1)",
      scale: quantized.scale,
      uploadChunkSize,
      computeChunkSize,
      individual: 0,
    },
  });

  const deployMarketplaceResult = await timed(async () => {
    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    return Marketplace.deploy();
  });
  const marketplace = deployMarketplaceResult.value;

  let publishModelGas = 0n;
  let publishModelTransactions = 0;
  const publishModelResult = await timed(async () => {
    const modelId = await marketplace.createModelShell.staticCall(
      false,
      BigInt(quantized.weights.length),
      BigInt(uploadChunkSize),
      BigInt(computeChunkSize),
      `ipfs://heprs/${fixtureSize}`,
      prov.manifestHash,
      prov.sourceModelHash,
      quantized.weightZeroPoint,
      quantized.scoreOffset
    );
    const tx = await marketplace.createModelShell(
      false,
      BigInt(quantized.weights.length),
      BigInt(uploadChunkSize),
      BigInt(computeChunkSize),
      `ipfs://heprs/${fixtureSize}`,
      prov.manifestHash,
      prov.sourceModelHash,
      quantized.weightZeroPoint,
      quantized.scoreOffset
    );
    publishModelGas += (await tx.wait())?.gasUsed ?? 0n;
    publishModelTransactions++;

    for (const chunk of chunkBigIntVector(quantized.weights, uploadChunkSize)) {
      const appendTx = await marketplace.appendPublicModelChunk(modelId, chunk);
      publishModelGas += (await appendTx.wait())?.gasUsed ?? 0n;
      publishModelTransactions++;
    }

    const finalizeTx = await marketplace.finalizeModel(modelId);
    publishModelGas += (await finalizeTx.wait())?.gasUsed ?? 0n;
    publishModelTransactions++;
    return modelId;
  });
  const modelId = publishModelResult.value;

  const deployEngineResult = await timed(async () => {
    const Registry = await ethers.getContractFactory("GenomicRegistry");
    const registry = await Registry.deploy();
    const sid = await registry.registerSampleWithManifest.staticCall(
      "ipfs://heprs-profile-sample",
      prov.genotypeManifestHash
    );
    await registry.registerSampleWithManifest(
      "ipfs://heprs-profile-sample",
      prov.genotypeManifestHash
    );
    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(await marketplace.getAddress(), await registry.getAddress());
    return { engine, sampleId: sid };
  });
  const { engine, sampleId } = deployEngineResult.value;

  let createJobGas = 0n;
  const createJobResult = await timed(async () => {
    const tx = await engine.createPRSJob(modelId, sampleId);
    createJobGas = (await tx.wait())?.gasUsed ?? 0n;
  });

  const jobId = await engine.jobCount() - 1n;
  const [signer] = await ethers.getSigners();
  const engineAddr = await engine.getAddress();

  let uploadSnpsGas = 0n;
  let uploadSnpTransactions = 0;
  const uploadSnpsResult = await timed(async () => {
    for (const chunk of chunkBigIntVector(snps, uploadChunkSize)) {
      const input = fhevm.createEncryptedInput(engineAddr, signer.address);
      for (const v of chunk) input.add64(v);
      const { handles, inputProof } = await input.encrypt();
      const tx = await engine.appendSnpChunk(jobId, handles, inputProof);
      uploadSnpsGas += (await tx.wait())?.gasUsed ?? 0n;
      uploadSnpTransactions++;
    }
  });

  let finalizeSnpUploadGas = 0n;
  const finalizeSnpUploadResult = await timed(async () => {
    const tx = await engine.finalizeSnpUpload(jobId);
    finalizeSnpUploadGas = (await tx.wait())?.gasUsed ?? 0n;
  });

  const chunkTimes: number[] = [];
  let computeGas = 0n;
  const totalChunks = Math.ceil(snps.length / computeChunkSize);
  let readPartialResult:
    | { value: bigint; ms: number }
    | undefined;
  const partialFirstChunk = dotProductBigInt(
    snps.slice(0, computeChunkSize),
    quantized.weights.slice(0, computeChunkSize)
  );
  for (let i = 0; i < totalChunks; i++) {
    const chunkResult = await timed(async () => {
      const tx = await engine.computeChunk(jobId);
      computeGas += (await tx.wait())?.gasUsed ?? 0n;
    });
    chunkTimes.push(chunkResult.ms);
    if (i === 0) {
      readPartialResult = await timed(async () => {
        const handle = await engine.getPartialSum(jobId);
        return fhevm.debugger.decryptEuint(FhevmType.euint64, handle);
      });
    }
  }

  if (!readPartialResult) {
    throw new Error(`Fixture ${fixtureSize} did not record a partial result`);
  }

  let finalizeGas = 0n;
  const finalizeResult = await timed(async () => {
    const tx = await engine.finalize(jobId);
    const receipt = await tx.wait();
    finalizeGas = receipt?.gasUsed ?? 0n;
    const finalEvent = receipt!.logs.find(
      (log: any) => engine.interface.parseLog(log)?.name === "JobFinalized"
    );
    const scoreHandle = engine.interface.parseLog(finalEvent as any)!.args.encodedScore;
    return fhevm.debugger.decryptEuint(FhevmType.euint64, scoreHandle);
  });

  if (readPartialResult.value !== partialFirstChunk) {
    throw new Error(`Fixture ${fixtureSize} partial result mismatch`);
  }
  if (finalizeResult.value !== expected) {
    throw new Error(`Fixture ${fixtureSize} final score mismatch`);
  }

  // --- Streaming path: appendAndComputeChunk (one call per compute chunk, no snpData storage) ---
  // A second job is created against the same already-deployed engine and marketplace.
  let streamingCreateJobGas = 0n;
  await timed(async () => {
    const tx = await engine.createPRSJob(modelId, sampleId);
    streamingCreateJobGas = (await tx.wait())?.gasUsed ?? 0n;
  });
  const streamingJobId = await engine.jobCount() - 1n;

  let streamingUploadAndComputeGas = 0n;
  let streamingUploadAndComputeTransactions = 0;
  // Streaming chunks must match computeChunkSize (HCU budget), NOT uploadChunkSize.
  // computeChunkSize=20 < 32 (fhEVM input-proof budget), so this is safe.
  const streamingUploadAndComputeResult = await timed(async () => {
    for (const chunk of chunkBigIntVector(snps, computeChunkSize)) {
      const input = fhevm.createEncryptedInput(engineAddr, signer.address);
      for (const v of chunk) input.add64(v);
      const { handles, inputProof } = await input.encrypt();
      const tx = await engine.appendAndComputeChunk(streamingJobId, handles, inputProof);
      streamingUploadAndComputeGas += (await tx.wait())?.gasUsed ?? 0n;
      streamingUploadAndComputeTransactions++;
    }
  });

  let streamingFinalizeGas = 0n;
  const streamingFinalizeResult = await timed(async () => {
    const tx = await engine.finalize(streamingJobId);
    const receipt = await tx.wait();
    streamingFinalizeGas = receipt?.gasUsed ?? 0n;
    const finalEvent = receipt!.logs.find(
      (log: any) => engine.interface.parseLog(log)?.name === "JobFinalized"
    );
    const scoreHandle = engine.interface.parseLog(finalEvent as any)!.args.encodedScore;
    return fhevm.debugger.decryptEuint(FhevmType.euint64, scoreHandle);
  });

  if (streamingFinalizeResult.value !== expected) {
    throw new Error(`Fixture ${fixtureSize} streaming score mismatch — expected ${expected}, got ${streamingFinalizeResult.value}`);
  }

  const streamingTotal = publishModelGas + streamingCreateJobGas + streamingUploadAndComputeGas + streamingFinalizeGas;
  // --- end streaming path ---

  const chunkTotal = chunkTimes.reduce((sum, value) => sum + value, 0);
  const totalGas = publishModelGas + createJobGas + uploadSnpsGas + finalizeSnpUploadGas + computeGas + finalizeGas;
  const sampleRegistrationTransactions = 1;
  const classicTransactions = {
    jobCreation: 1,
    uploadSnps: uploadSnpTransactions,
    finalizeSnpUpload: 1,
    compute: totalChunks,
    resultFinalization: 1,
  };
  const streamingTransactions = {
    jobCreation: 1,
    uploadAndCompute: streamingUploadAndComputeTransactions,
    resultFinalization: 1,
  };
  return {
    fixtureSize,
    vectorLength: snps.length,
    uploadChunkSize,
    computeChunkSize,
    recommendation,
    evidenceClass: "Hardhat mock",
    provenance: await buildProvenance({
      model: prov,
      contracts: [
        await contractIdentity("ModelMarketplace", marketplace),
        await contractIdentity("PRSComputeEngine", engine),
      ],
      referenceOutputPath: heprsReferencePath(fixtureSize),
    }),
    gas: {
      publishModel: publishModelGas,
      createJob: createJobGas,
      uploadSnps: uploadSnpsGas,
      finalizeSnpUpload: finalizeSnpUploadGas,
      compute: computeGas,
      finalize: finalizeGas,
      total: totalGas
    },
    streamingGas: {
      publishModel: publishModelGas,
      createJob: streamingCreateJobGas,
      uploadAndCompute: streamingUploadAndComputeGas,
      finalize: streamingFinalizeGas,
      total: streamingTotal
    },
    transactions: {
      modelPublication: publishModelTransactions,
      sampleRegistration: sampleRegistrationTransactions,
      classic: {
        ...classicTransactions,
        totalIncludingModelAndSample:
          publishModelTransactions +
          sampleRegistrationTransactions +
          Object.values(classicTransactions).reduce((sum, value) => sum + value, 0),
      },
      streaming: {
        ...streamingTransactions,
        totalIncludingModelAndSample:
          publishModelTransactions +
          sampleRegistrationTransactions +
          Object.values(streamingTransactions).reduce((sum, value) => sum + value, 0),
      },
    },
    chunkTiming: {
      chunkCount: chunkTimes.length,
      totalMs: chunkTotal,
      averageMs: chunkTotal / chunkTimes.length,
      minMs: Math.min(...chunkTimes),
      maxMs: Math.max(...chunkTimes),
      perChunkMs: chunkTimes
    },
    status: "full_flow",
    timingsMs: {
      total: nsToMs(nowNs() - totalStart),
      loadFixture: fixtureResult.ms,
      quantizeWeights: quantizeResult.ms,
      localReferenceDotProduct: expectedResult.ms,
      deployMarketplace: deployMarketplaceResult.ms,
      publishModel: publishModelResult.ms,
      deployEngine: deployEngineResult.ms,
      createJob: createJobResult.ms,
      uploadSnps: uploadSnpsResult.ms,
      finalizeSnpUpload: finalizeSnpUploadResult.ms,
      readPartial: readPartialResult.ms,
      finalize: finalizeResult.ms,
      streamingUploadAndCompute: streamingUploadAndComputeResult.ms,
      streamingFinalize: streamingFinalizeResult.ms
    }
  };
}

function formatMs(ms: number): string {
  return `${ms.toFixed(2)}ms`;
}

function summarizeProfile(profile: FixtureProfile, verbose: boolean): string {
  const lines = [
    `fixture=${profile.fixtureSize} SNP (vectorLength=${profile.vectorLength}, uploadChunkSize=${profile.uploadChunkSize}, computeChunkSize=${profile.computeChunkSize})`,
    `status=${profile.status}`
  ];

  lines.push(
    `advisor: tier=${profile.recommendation.tier}, scale=${profile.recommendation.scale}, bits=${profile.recommendation.requiredWeightBits}/${profile.recommendation.requiredAccumulatorBits}`
  );

  const gasSavings = profile.gas.total - profile.streamingGas.total;
  const savingsPct = ((Number(gasSavings) / Number(profile.gas.total)) * 100).toFixed(1);
  lines.push(
    `timings: total=${formatMs(profile.timingsMs.total)}, load=${formatMs(profile.timingsMs.loadFixture)}, quantize=${formatMs(profile.timingsMs.quantizeWeights)}, publishModel=${formatMs(profile.timingsMs.publishModel)}, createJob=${formatMs(profile.timingsMs.createJob)}, uploadSnps=${formatMs(profile.timingsMs.uploadSnps)}, finalizeSnpUpload=${formatMs(profile.timingsMs.finalizeSnpUpload)}, chunkTotal=${formatMs(profile.chunkTiming.totalMs)}, finalize=${formatMs(profile.timingsMs.finalize)}, stream.uploadAndCompute=${formatMs(profile.timingsMs.streamingUploadAndCompute)}, stream.finalize=${formatMs(profile.timingsMs.streamingFinalize)}`,
    `chunks: count=${profile.chunkTiming.chunkCount}, avg=${formatMs(profile.chunkTiming.averageMs)}, min=${formatMs(profile.chunkTiming.minMs)}, max=${formatMs(profile.chunkTiming.maxMs)}`,
    `transactions: classic=${profile.transactions.classic.totalIncludingModelAndSample}, streaming=${profile.transactions.streaming.totalIncludingModelAndSample} (fresh model + registered sample + one job; deployments excluded)`,
    `gas (classic):  total=${profile.gas.total}, publishModel=${profile.gas.publishModel}, createJob=${profile.gas.createJob}, uploadSnps=${profile.gas.uploadSnps}, finalizeSnpUpload=${profile.gas.finalizeSnpUpload}, compute=${profile.gas.compute}, finalize=${profile.gas.finalize}`,
    `gas (streaming): total=${profile.streamingGas.total}, publishModel=${profile.streamingGas.publishModel}, createJob=${profile.streamingGas.createJob}, uploadAndCompute=${profile.streamingGas.uploadAndCompute}, finalize=${profile.streamingGas.finalize}`,
    `gas savings (streaming vs classic): ${gasSavings} (${savingsPct}%)`
  );
  if (verbose) {
    lines.push(`perChunkMs=${profile.chunkTiming.perChunkMs.map((value) => value.toFixed(2)).join(", ")}`);
  }

  return lines.join("\n");
}

function stringifyProfiles(profiles: FixtureProfile[]): string {
  return JSON.stringify(profiles, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
    , 2);
}

// Run as a Hardhat test so the @fhevm/hardhat-plugin mock coprocessor is
// fully initialized before any FHE operations execute.
// Usage:
//   npm run profile:heprs
//   HEPRS_PROFILE_JSON_OUT=evidence/phase8/heprs_profile.json npm run profile:heprs
describe("HEPRS fixture profiler", function () {
  // Allow up to 30 min for all four fixtures at computeChunkSize=20
  this.timeout(1_800_000);

  it("profiles all requested fixtures and prints timing summary", async function () {
    const options = parseCliArgs(process.argv.slice(2));
    const profiles: FixtureProfile[] = [];

    for (const fixtureSize of options.fixtureSizes) {
      profiles.push(await profileFixture(fixtureSize, options.uploadChunkSize, options.computeChunkSize));
    }

    console.log("\nHEPRS fixture profile");
    console.log(`fixtures=${options.fixtureSizes.join(",")}`);
    console.log(`uploadChunkSize=${options.uploadChunkSize}`);
    console.log(`computeChunkSize=${options.computeChunkSize}`);
    console.log("");

    for (const profile of profiles) {
      console.log(summarizeProfile(profile, options.verbose));
      console.log("");
    }

    if (options.jsonOutPath) {
      const outPath = path.resolve(options.jsonOutPath);
      fs.writeFileSync(outPath, stringifyProfiles(profiles));
      console.log(`Wrote JSON profile to ${outPath}`);
    }
  });
});
