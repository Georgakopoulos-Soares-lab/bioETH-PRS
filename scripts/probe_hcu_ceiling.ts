/**
 * scripts/probe_hcu_ceiling.ts
 *
 * Determines the maximum safe chunkSize for computeChunk on the current
 * network by trying synthetic models with increasing chunk sizes.
 *
 * Usage:
 *   npx hardhat test scripts/probe_hcu_ceiling.ts --network sepolia
 *   npx hardhat test scripts/probe_hcu_ceiling.ts   # local mock (expect PASS through 20, fail at 25+)
 *
 * How it works:
 *   For each candidate chunkSize the script:
 *     1. Deploys a fresh ModelMarketplace + GenomicRegistry + PRSComputeEngine.
 *     2. Publishes a synthetic model with exactly 2 × chunkSize weights (2 chunks).
 *     3. Uploads 2 SNP chunks of chunkSize synthetic values each.
 *     4. Calls computeChunk() twice and records gas + success/failure.
 *
 *   Because the SNP upload proof budget caps at 32 encrypted values per call,
 *   the maximum testable chunkSize is 32.  If Sepolia's HCU budget is higher
 *   than 32 × 3 = 96 ops, the real ceiling will require the decoupled-chunk
 *   architecture (docs/roadmap.md) to observe.
 *
 * Output:
 *   Console table + deployments/{network}-hcu-probe.json
 *
 * Candidate sizes:
 *   [10, 15, 20, 25, 32]
 *   - 20 is the current confirmed safe mock chunk size
 *   - 32 is the upload-proof ceiling (2048-bit / 64-bit per euint64)
 */

import fs from "fs";
import path from "path";

import { ethers, fhevm } from "hardhat";

const CANDIDATE_CHUNK_SIZES = [10, 15, 20, 25, 32];
const DEFAULT_HARDHAT_DEPLOYER =
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

interface ProbeResult {
  chunkSize: number;
  passed: boolean;
  errorMessage?: string;
  computeGasPerChunk: string[];
  totalComputeGas: string;
  timingsMs: number[];
}

async function probeChunkSize(chunkSize: number): Promise<ProbeResult> {
  const [signer] = await ethers.getSigners();
  const weightCount = chunkSize * 2; // two full compute chunks
  // Upload chunk size is always 32 (input-proof budget) so SNP upload is never the bottleneck.
  const uploadChunkSize = Math.min(32, weightCount);

  // Deploy a fresh contract set for this probe — avoids cross-contamination
  const Registry = await ethers.getContractFactory("GenomicRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  const Marketplace = await ethers.getContractFactory("ModelMarketplace");
  const marketplace = await Marketplace.deploy();
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();

  const Engine = await ethers.getContractFactory("PRSComputeEngine");
  const engine = await Engine.deploy(marketplaceAddress, await registry.getAddress());
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();

  // Register a sample
  const sampleId = await registry.registerSample.staticCall("ipfs://hcu-probe");
  await (await registry.registerSample("ipfs://hcu-probe")).wait();

  // Publish model — all weights = 1n (synthetic, value doesn't matter for HCU test)
  const weights = Array(weightCount).fill(1n);
  const modelId = await marketplace.createModelShell.staticCall(
    false,
    BigInt(weightCount),
    BigInt(uploadChunkSize),
    BigInt(chunkSize), // computeChunkSize — this is what we're probing
    "ipfs://hcu-probe-model",
    ethers.ZeroHash,
    ethers.ZeroHash,
    0n, // weightZeroPoint
    0n  // scoreOffset
  );
  await (
    await marketplace.createModelShell(
      false,
      BigInt(weightCount),
      BigInt(uploadChunkSize),
      BigInt(chunkSize),
      "ipfs://hcu-probe-model",
      ethers.ZeroHash,
      ethers.ZeroHash,
      0n,
      0n
    )
  ).wait();

  // Append weight chunks using uploadChunkSize batches
  for (let start = 0; start < weightCount; start += uploadChunkSize) {
    const slice = weights.slice(start, start + uploadChunkSize);
    await (await marketplace.appendPublicModelChunk(modelId, slice)).wait();
  }
  await (await marketplace.finalizeModel(modelId)).wait();

  // Create job
  await (await engine.createPRSJob(modelId, sampleId)).wait();
  const jobId = await engine.jobCount() - 1n;

  // Upload SNP chunks using uploadChunkSize batches — all SNP values = 1n (synthetic)
  const snps = Array(weightCount).fill(1n);
  for (let start = 0; start < weightCount; start += uploadChunkSize) {
    const slice = snps.slice(start, start + uploadChunkSize);
    const input = fhevm.createEncryptedInput(engineAddress, signer.address);
    for (const v of slice) input.add64(v);
    const { handles, inputProof } = await input.encrypt();
    await (await engine.appendSnpChunk(jobId, handles, inputProof)).wait();
  }
  await (await engine.finalizeSnpUpload(jobId)).wait();

  // Compute — this is the HCU-sensitive step
  const computeGasPerChunk: string[] = [];
  const timingsMs: number[] = [];
  let totalComputeGas = 0n;

  try {
    for (let i = 0; i < 2; i++) {
      const t0 = Date.now();
      const tx = await engine.computeChunk(jobId);
      const receipt = await tx.wait();
      const elapsed = Date.now() - t0;
      totalComputeGas += receipt!.gasUsed;
      computeGasPerChunk.push(receipt!.gasUsed.toString());
      timingsMs.push(elapsed);
    }

    return {
      chunkSize,
      passed: true,
      computeGasPerChunk,
      totalComputeGas: totalComputeGas.toString(),
      timingsMs
    };
  } catch (err: any) {
    return {
      chunkSize,
      passed: false,
      errorMessage: String(err?.message ?? err),
      computeGasPerChunk,
      totalComputeGas: totalComputeGas.toString(),
      timingsMs
    };
  }
}

describe("HCU ceiling probe", function () {
  // Each chunkSize deploys its own contract set — allow 4 min per size on Sepolia
  this.timeout(7_200_000);

  it("probes computeChunk HCU ceiling across candidate chunk sizes", async function () {
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId;
    const [signer] = await ethers.getSigners();
    if (
      chainId === 11155111n &&
      signer.address.toLowerCase() === DEFAULT_HARDHAT_DEPLOYER
    ) {
      throw new Error(
        "Refusing Sepolia HCU probe with the public Hardhat test mnemonic. " +
          "Set a funded private mnemonic with `npx hardhat vars set MNEMONIC`."
      );
    }
    const networkKey =
      chainId === 11155111n ? "sepolia"
      : chainId === 1n ? "mainnet"
      : "hardhat";
    const isMock = fhevm.isMock;

    console.log(`\nNetwork  : ${network.name} (chainId=${chainId})`);
    console.log(`FHE mode : ${isMock ? "mock — plaintext arithmetic" : "REAL TFHE ciphertext"}`);
    console.log(
      `Probing chunkSizes: ${CANDIDATE_CHUNK_SIZES.join(", ")} ` +
      `(max=32 = 2048-bit upload-proof budget)\n`
    );

    const results: ProbeResult[] = [];

    for (const cs of CANDIDATE_CHUNK_SIZES) {
      process.stdout.write(`  chunkSize=${String(cs).padStart(2)} ... `);
      const result = await probeChunkSize(cs);
      results.push(result);

      if (result.passed) {
        const avgMs = result.timingsMs.reduce((a, b) => a + b, 0) / result.timingsMs.length;
        console.log(
          `PASS  gas/chunk=${result.computeGasPerChunk[0]}  avg=${avgMs.toFixed(0)}ms`
        );
      } else {
        // Trim error to first line for readability
        const short = (result.errorMessage ?? "").split("\n")[0].slice(0, 80);
        console.log(`FAIL  ${short}`);
      }
    }

    // Identify ceiling
    const maxPassed = results
      .filter((r) => r.passed)
      .reduce<number | undefined>((max, r) => (max === undefined || r.chunkSize > max ? r.chunkSize : max), undefined);
    const minFailed = results
      .filter((r) => !r.passed)
      .reduce<number | undefined>((min, r) => (min === undefined || r.chunkSize < min ? r.chunkSize : min), undefined);

    console.log("\n--- HCU ceiling summary ---");
    if (maxPassed !== undefined) {
      console.log(`  Max passing chunkSize : ${maxPassed}`);
    }
    if (minFailed !== undefined) {
      console.log(`  Min failing chunkSize : ${minFailed}`);
    }
    if (maxPassed !== undefined && minFailed === undefined) {
      console.log(`  Ceiling : ≥${maxPassed} (all candidates passed — real ceiling is higher)`);
      console.log(`  Note    : upload-proof budget caps SNP upload at 32 values/chunk.`);
      console.log(`            To probe compute-only limits above 32, implement decoupled chunk sizes (todo Priority 4).`);
    } else if (maxPassed !== undefined && minFailed !== undefined) {
      console.log(`  Ceiling : ${maxPassed} < ceiling ≤ ${minFailed}`);
    } else {
      console.log(`  Ceiling : ≤${CANDIDATE_CHUNK_SIZES[0]} (first candidate already failed)`);
    }

    const report = {
      network: networkKey,
      chainId: chainId.toString(),
      fheMode: isMock ? "mock" : "real",
      timestamp: new Date().toISOString(),
      candidateChunkSizes: CANDIDATE_CHUNK_SIZES,
      maxPassingChunkSize: maxPassed ?? null,
      minFailingChunkSize: minFailed ?? null,
      results
    };

    const deploymentsDir = path.resolve(__dirname, "../deployments");
    fs.mkdirSync(deploymentsDir, { recursive: true });
    const outPath = path.join(deploymentsDir, `${networkKey}-hcu-probe.json`);
    fs.writeFileSync(
      outPath,
      JSON.stringify(report, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)
    );
    console.log(`\nReport saved to ${outPath}`);

    // The probe itself is informational — only fail if the known-safe size fails
    const knownSafe = results.find((r) => r.chunkSize === 20);
    if (knownSafe && !knownSafe.passed) {
      throw new Error(
        `chunkSize=20 (known safe) failed — environment problem: ${knownSafe.errorMessage}`
      );
    }
  });
});
