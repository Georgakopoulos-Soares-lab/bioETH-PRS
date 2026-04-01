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

interface CliOptions {
  fixtureSizes: HeprsFixtureSize[];
  chunkSize: number;
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

interface SuccessfulFixtureProfile {
  fixtureSize: HeprsFixtureSize;
  vectorLength: number;
  chunkSize: number;
  recommendation: HeprsAdvisorRecommendation;
  chunkTiming: ChunkTimingSummary;
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
  let chunkSize = 10;
  let verbose = false;
  let jsonOutPath: string | undefined;

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

    if (arg === "--chunk-size") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("Chunk size must be a positive integer");
      }
      chunkSize = value;
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
    chunkSize,
    verbose,
    jsonOutPath
  };
}

async function profileFixture(
  fixtureSize: HeprsFixtureSize,
  chunkSize: number
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

  const deployMarketplaceResult = await timed(async () => {
    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    return Marketplace.deploy();
  });
  const marketplace = deployMarketplaceResult.value;

  const publishModelResult = await timed(async () => {
    const modelId = await marketplace.createModelShell.staticCall(
      false,
      BigInt(quantized.weights.length),
      BigInt(chunkSize),
      `ipfs://heprs/${fixtureSize}`,
      ethers.ZeroHash,
      ethers.ZeroHash,
      quantized.weightZeroPoint,
      quantized.scoreOffset
    );
    const tx = await marketplace.createModelShell(
      false,
      BigInt(quantized.weights.length),
      BigInt(chunkSize),
      `ipfs://heprs/${fixtureSize}`,
      ethers.ZeroHash,
      ethers.ZeroHash,
      quantized.weightZeroPoint,
      quantized.scoreOffset
    );
    await tx.wait();

    for (const chunk of chunkBigIntVector(quantized.weights, chunkSize)) {
      const appendTx = await marketplace.appendPublicModelChunk(modelId, chunk);
      await appendTx.wait();
    }

    const finalizeTx = await marketplace.finalizeModel(modelId);
    await finalizeTx.wait();
    return modelId;
  });
  const modelId = publishModelResult.value;

  const deployEngineResult = await timed(async () => {
    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    return Engine.deploy(await marketplace.getAddress());
  });
  const engine = deployEngineResult.value;

  const createJobResult = await timed(async () => {
    const tx = await engine.createPRSJob(modelId);
    await tx.wait();
  });

  const jobId = await engine.jobCount() - 1n;
  const [signer] = await ethers.getSigners();
  const engineAddr = await engine.getAddress();

  const uploadSnpsResult = await timed(async () => {
    for (const chunk of chunkBigIntVector(snps, chunkSize)) {
      const input = fhevm.createEncryptedInput(engineAddr, signer.address);
      for (const v of chunk) input.add64(v);
      const { handles, inputProof } = await input.encrypt();
      const tx = await engine.appendSnpChunk(jobId, handles, inputProof);
      await tx.wait();
    }
  });

  const finalizeSnpUploadResult = await timed(async () => {
    const tx = await engine.finalizeSnpUpload(jobId);
    await tx.wait();
  });

  const chunkTimes: number[] = [];
  const totalChunks = Math.ceil(snps.length / chunkSize);
  let readPartialResult:
    | { value: bigint; ms: number }
    | undefined;
  const partialFirstChunk = dotProductBigInt(
    snps.slice(0, chunkSize),
    quantized.weights.slice(0, chunkSize)
  );
  for (let i = 0; i < totalChunks; i++) {
    const chunkResult = await timed(async () => {
      const tx = await engine.computeChunk(jobId);
      await tx.wait();
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

  const finalizeResult = await timed(async () => {
    const tx = await engine.finalize(jobId);
    const receipt = await tx.wait();
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

  const chunkTotal = chunkTimes.reduce((sum, value) => sum + value, 0);
  return {
    fixtureSize,
    vectorLength: snps.length,
    chunkSize,
    recommendation,
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
      finalize: finalizeResult.ms
    }
  };
}

function formatMs(ms: number): string {
  return `${ms.toFixed(2)}ms`;
}

function summarizeProfile(profile: FixtureProfile, verbose: boolean): string {
  const lines = [
    `fixture=${profile.fixtureSize} SNP (vectorLength=${profile.vectorLength}, chunkSize=${profile.chunkSize})`,
    `status=${profile.status}`
  ];

  lines.push(
    `advisor: tier=${profile.recommendation.tier}, scale=${profile.recommendation.scale}, bits=${profile.recommendation.requiredWeightBits}/${profile.recommendation.requiredAccumulatorBits}`
  );

  lines.push(
    `timings: total=${formatMs(profile.timingsMs.total)}, load=${formatMs(profile.timingsMs.loadFixture)}, quantize=${formatMs(profile.timingsMs.quantizeWeights)}, publishModel=${formatMs(profile.timingsMs.publishModel)}, createJob=${formatMs(profile.timingsMs.createJob)}, uploadSnps=${formatMs(profile.timingsMs.uploadSnps)}, finalizeSnpUpload=${formatMs(profile.timingsMs.finalizeSnpUpload)}, chunkTotal=${formatMs(profile.chunkTiming.totalMs)}, finalize=${formatMs(profile.timingsMs.finalize)}`,
    `chunks: count=${profile.chunkTiming.chunkCount}, avg=${formatMs(profile.chunkTiming.averageMs)}, min=${formatMs(profile.chunkTiming.minMs)}, max=${formatMs(profile.chunkTiming.maxMs)}`
  );
  if (verbose) {
    lines.push(`perChunkMs=${profile.chunkTiming.perChunkMs.map((value) => value.toFixed(2)).join(", ")}`);
  }

  return lines.join("\n");
}

function stringifyProfiles(profiles: FixtureProfile[]): string {
  return JSON.stringify(profiles, null, 2);
}

// Run as a Hardhat test so the @fhevm/hardhat-plugin mock coprocessor is
// fully initialized before any FHE operations execute.
// Usage: npm run profile:heprs [-- --fixture 100 --chunk-size 10]
describe("HEPRS fixture profiler", function () {
  // Allow up to 30 min for all four fixtures at chunkSize=10
  this.timeout(1_800_000);

  it("profiles all requested fixtures and prints timing summary", async function () {
    const options = parseCliArgs(process.argv.slice(2));
    const profiles: FixtureProfile[] = [];

    for (const fixtureSize of options.fixtureSizes) {
      profiles.push(await profileFixture(fixtureSize, options.chunkSize));
    }

    console.log("\nHEPRS fixture profile");
    console.log(`fixtures=${options.fixtureSizes.join(",")}`);
    console.log(`chunkSize=${options.chunkSize}`);
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
