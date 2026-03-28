import fs from "fs";
import path from "path";

import { ethers } from "hardhat";

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
    startPrs: number;
    readPartial: number;
    finalize: number;
  };
}

interface StartPrsBoundaryFixtureProfile {
  fixtureSize: HeprsFixtureSize;
  vectorLength: number;
  chunkSize: number;
  recommendation: HeprsAdvisorRecommendation;
  localChunkCount: number;
  status: "start_prs_out_of_gas";
  failedStep: "startPRS";
  failureMessage: string;
  timingsMs: {
    total: number;
    loadFixture: number;
    quantizeWeights: number;
    localReferenceDotProduct: number;
    localChunkedDotProduct: number;
    deployMarketplace: number;
    publishModel: number;
    deployEngine: number;
    startPrsFailure: number;
  };
}

type FixtureProfile = SuccessfulFixtureProfile | StartPrsBoundaryFixtureProfile;

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
  let chunkSize = 128;
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

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    fixtureSizes: fixtureSizes.length > 0 ? fixtureSizes : [...HEPRS_FIXTURE_SIZES],
    chunkSize,
    verbose,
    jsonOutPath
  };
}

function chunkedDotProductBigInt(
  lhs: bigint[],
  rhs: bigint[],
  chunkLength: number
): bigint {
  let sum = 0n;
  for (let start = 0; start < lhs.length; start += chunkLength) {
    sum += dotProductBigInt(
      lhs.slice(start, start + chunkLength),
      rhs.slice(start, start + chunkLength)
    );
  }
  return sum;
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
  const expected = expectedResult.value;

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
      ethers.ZeroHash
    );
    const tx = await marketplace.createModelShell(
      false,
      BigInt(quantized.weights.length),
      BigInt(chunkSize),
      `ipfs://heprs/${fixtureSize}`,
      ethers.ZeroHash,
      ethers.ZeroHash
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

  const jobId = await engine.jobCount();
  const startPrsStart = nowNs();
  let startPrsResult:
    | { value: void; ms: number }
    | undefined;
  try {
    startPrsResult = await timed(async () => {
      const tx = await engine.startPRS(modelId, snps);
      await tx.wait();
    });
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : String(error);
    if (!/out of gas/i.test(failureMessage)) {
      throw error;
    }

    const chunkedLocalResult = await timed(() => (
      chunkedDotProductBigInt(snps, quantized.weights, chunkSize)
    ));
    if (chunkedLocalResult.value !== expected) {
      throw new Error(`Fixture ${fixtureSize} local chunked math mismatch after startPRS failure`);
    }

    return {
      fixtureSize,
      vectorLength: snps.length,
      chunkSize,
      recommendation,
      localChunkCount: Math.ceil(snps.length / chunkSize),
      status: "start_prs_out_of_gas",
      failedStep: "startPRS",
      failureMessage,
      timingsMs: {
        total: nsToMs(nowNs() - totalStart),
        loadFixture: fixtureResult.ms,
        quantizeWeights: quantizeResult.ms,
        localReferenceDotProduct: expectedResult.ms,
        localChunkedDotProduct: chunkedLocalResult.ms,
        deployMarketplace: deployMarketplaceResult.ms,
        publishModel: publishModelResult.ms,
        deployEngine: deployEngineResult.ms,
        startPrsFailure: nsToMs(nowNs() - startPrsStart)
      }
    };
  }

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
        return engine.readPartial.staticCall(jobId);
      });
    }
  }

  if (!readPartialResult) {
    throw new Error(`Fixture ${fixtureSize} did not record a partial result`);
  }

  const finalizeResult = await timed(async () => {
    return engine.finalize.staticCall(jobId);
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
      startPrs: startPrsResult.ms,
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

  if (profile.status === "full_flow") {
    lines.push(
      `timings: total=${formatMs(profile.timingsMs.total)}, load=${formatMs(profile.timingsMs.loadFixture)}, quantize=${formatMs(profile.timingsMs.quantizeWeights)}, publishModel=${formatMs(profile.timingsMs.publishModel)}, startPRS=${formatMs(profile.timingsMs.startPrs)}, chunkTotal=${formatMs(profile.chunkTiming.totalMs)}, finalize=${formatMs(profile.timingsMs.finalize)}`,
      `chunks: count=${profile.chunkTiming.chunkCount}, avg=${formatMs(profile.chunkTiming.averageMs)}, min=${formatMs(profile.chunkTiming.minMs)}, max=${formatMs(profile.chunkTiming.maxMs)}`
    );
    if (verbose) {
      lines.push(`perChunkMs=${profile.chunkTiming.perChunkMs.map((value) => value.toFixed(2)).join(", ")}`);
    }
  } else {
    lines.push(
      `timings: total=${formatMs(profile.timingsMs.total)}, load=${formatMs(profile.timingsMs.loadFixture)}, quantize=${formatMs(profile.timingsMs.quantizeWeights)}, publishModel=${formatMs(profile.timingsMs.publishModel)}, startPRSFailure=${formatMs(profile.timingsMs.startPrsFailure)}, localChunkedMath=${formatMs(profile.timingsMs.localChunkedDotProduct)}`,
      `boundary: failedStep=${profile.failedStep}, localChunkCount=${profile.localChunkCount}`
    );
    if (verbose) {
      lines.push(`failureMessage=${profile.failureMessage}`);
    }
  }

  return lines.join("\n");
}

function stringifyProfiles(profiles: FixtureProfile[]): string {
  return JSON.stringify(profiles, null, 2);
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const profiles: FixtureProfile[] = [];

  for (const fixtureSize of options.fixtureSizes) {
    profiles.push(await profileFixture(fixtureSize, options.chunkSize));
  }

  console.log("HEPRS fixture profile");
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
