/**
 * scripts/sepolia_validation.ts
 *
 * End-to-end validation of the 100-SNP HEPRS fixture on any network.
 *
 * Run on local mock (sanity check, fast):
 *   npx hardhat test scripts/sepolia_validation.ts
 *
 * Run on Sepolia (real FHE — deploy first with scripts/deploy.ts):
 *   npx hardhat test scripts/sepolia_validation.ts --network sepolia
 *
 * The script:
 *  1. Loads deployed contract addresses from deployments/{network}.json if
 *     present; otherwise deploys fresh contracts (useful on first Sepolia run
 *     or local mock).
 *  2. Publishes a 100-SNP public or private GWAS model (`MODEL_VISIBILITY`).
 *  3. Runs the full PRS job lifecycle (createPRSJob → appendSnpChunk ×10 →
 *     finalizeSnpUpload → computeChunk ×10 → finalize).
 *  4. Decrypts the score using `userDecryptEuint` on Sepolia (real FHE) or
 *     `debugger.decryptEuint` on local mock.
 *  5. Asserts the decrypted score matches the expected plaintext dot-product.
 *  6. Writes a JSON report to
 *     deployments/{network}-validation-100snp-{public|private}.json.
 *
 * Validated items (maps to docs/roadmap.md):
 *  - ciphertext input flow (externalEuint64 + inputProof through gateway)
 *  - ACL behavior (registry hasAccess check at createPRSJob)
 *  - gateway / re-encryption / decryption flow
 *  - JobFinalized event + score decryption via re-encryption key
 *  - per-chunk gas and timing (basis for HCU ceiling estimate)
 */

import fs from "fs";
import path from "path";

import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

import {
  fixtureModelProvenance,
  buildProvenance,
  contractIdentity,
  hashedInput,
  heprsManifestPath,
  heprsWeightsPath,
  heprsGenotypePath,
  heprsReferencePath,
} from "./utils/provenance";

import {
  chunkBigIntVector,
  dotProductBigInt,
  getHeprsBalancedRecommendation,
  loadHeprsFixture,
  quantizeHeprsWeightsWithRecommendation,
  toBigIntVector
} from "../test/utils/heprs";

const FIXTURE_SIZE = 100 as const;
// Decoupled chunk sizes:
//   UPLOAD_CHUNK_SIZE=32 — 2048-bit input-proof budget (max 32 euint64s per call)
//   mock computeChunkSize=20 — confirmed safe on the local HCU probe
//   Sepolia computeChunkSize=10 — conservative starting point; run probe:hcu to find real ceiling
const UPLOAD_CHUNK_SIZE = 32;
const MOCK_COMPUTE_CHUNK_SIZE = 20;
const SEPOLIA_COMPUTE_CHUNK_SIZE = 10;
const DEFAULT_HARDHAT_DEPLOYER =
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

interface SavedDeployment {
  contracts: {
    GenomicRegistry: string;
    ModelMarketplace: string;
    PRSComputeEngine: string;
  };
}

type ModelVisibility = "public" | "private";

interface RecordedTransaction {
  label: string;
  hash: string;
  blockNumber: number;
  gasUsed: string;
  status: number | null;
}

export function parseModelVisibility(value: string | undefined): ModelVisibility {
  const normalized = (value ?? "public").toLowerCase();
  if (normalized !== "public" && normalized !== "private") {
    throw new Error('MODEL_VISIBILITY must be "public" or "private"');
  }
  return normalized;
}

async function waitAndRecord(
  label: string,
  tx: any,
  records: RecordedTransaction[]
) {
  const receipt = await tx.wait();
  if (!receipt) throw new Error(`${label}: transaction receipt is missing`);
  records.push({
    label,
    hash: tx.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
  });
  return receipt;
}

function loadDeployment(networkKey: string): SavedDeployment | undefined {
  const p = path.resolve(__dirname, "../deployments", `${networkKey}.json`);
  if (!fs.existsSync(p)) return undefined;
  return JSON.parse(fs.readFileSync(p, "utf8")) as SavedDeployment;
}

describe("Sepolia 100-SNP validation", function () {
  // Real FHE transactions can take several minutes each — allow 2 hours total.
  this.timeout(7_200_000);

  it("runs 100-SNP HEPRS fixture end-to-end and decrypts the score", async function () {
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId;
    const networkKey =
      chainId === 11155111n ? "sepolia"
        : chainId === 1n ? "mainnet"
          : `chain-${chainId}`;
    const isMock = fhevm.isMock;
    const modelVisibility = parseModelVisibility(process.env.MODEL_VISIBILITY);
    const isPrivateModel = modelVisibility === "private";
    const computeChunkSize = process.env.COMPUTE_CHUNK_SIZE
      ? Number(process.env.COMPUTE_CHUNK_SIZE)
      : (isMock ? MOCK_COMPUTE_CHUNK_SIZE : SEPOLIA_COMPUTE_CHUNK_SIZE);

    if (!Number.isInteger(computeChunkSize) || computeChunkSize <= 0) {
      throw new Error("COMPUTE_CHUNK_SIZE must be a positive integer");
    }

    console.log(`\nNetwork  : ${network.name} (chainId=${chainId})`);
    console.log(`FHE mode : ${isMock ? "mock — plaintext arithmetic" : "REAL TFHE ciphertext"}`);
    console.log(`Model    : ${modelVisibility} weights`);
    console.log(`Fixture  : ${FIXTURE_SIZE} SNPs, uploadChunkSize=${UPLOAD_CHUNK_SIZE}, computeChunkSize=${computeChunkSize}\n`);

    const [signer] = await ethers.getSigners();
    if (
      chainId === 11155111n &&
      signer.address.toLowerCase() === DEFAULT_HARDHAT_DEPLOYER
    ) {
      throw new Error(
        "Refusing Sepolia validation with the public Hardhat test mnemonic. " +
          "Set a funded private mnemonic with `npx hardhat vars set MNEMONIC`."
      );
    }

    // ── 1. Load + quantize fixture ───────────────────────────────────────────
    const { genotypes, betas } = loadHeprsFixture(FIXTURE_SIZE);
    const recommendation = getHeprsBalancedRecommendation(FIXTURE_SIZE);
    const quantized = quantizeHeprsWeightsWithRecommendation(FIXTURE_SIZE, betas);
    const snps = toBigIntVector(genotypes[0]);

    const genoSum = snps.reduce((a, b) => a + b, 0n);
    const naiveDot = dotProductBigInt(snps, quantized.weights);
    const expected = naiveDot + quantized.scoreOffset - quantized.weightZeroPoint * genoSum;

    // R2.4-E1: commit to the exact fixture bytes and to the same model manifest the
    // independent Python reference consumes, before anything is published on-chain.
    // On a live run these hashes are the only thing tying a transaction to an input.
    const prov = fixtureModelProvenance({
      manifestPath: heprsManifestPath(FIXTURE_SIZE),
      weightsPath: heprsWeightsPath(FIXTURE_SIZE),
      genotypePath: heprsGenotypePath(FIXTURE_SIZE),
      extra: {
        nominalSnpCount: FIXTURE_SIZE,
        encodedPositions: quantized.weights.length,
        scale: quantized.scale,
        uploadChunkSize: UPLOAD_CHUNK_SIZE,
        computeChunkSize,
        individual: 0,
        modelVisibility,
      },
    });
    console.log(`manifestHash    : ${prov.manifestHash}`);
    console.log(`sourceModelHash : ${prov.sourceModelHash}`);
    console.log(`genotypeHash    : ${prov.genotypeManifestHash}\n`);

    console.log(`Scale     : ${recommendation.scale}`);
    console.log(`Expected  : ${expected}\n`);

    // ── 2. Deploy or load contracts ──────────────────────────────────────────
    let registryAddress: string;
    let marketplaceAddress: string;
    let engineAddress: string;
    let sampleId: bigint;
    let sampleRegistrationGas = 0n;
    const deploymentTransactions: RecordedTransaction[] = [];
    const workflowTransactions: RecordedTransaction[] = [];
    const validationStartedAtMs = Date.now();
    const startedAt = new Date(validationStartedAtMs).toISOString();

    const saved = loadDeployment(networkKey);
    if (saved && networkKey === "sepolia") {
      registryAddress = saved.contracts.GenomicRegistry;
      marketplaceAddress = saved.contracts.ModelMarketplace;
      engineAddress = saved.contracts.PRSComputeEngine;
      console.log(`Using deployed contracts from deployments/sepolia.json`);
      console.log(`  Registry   : ${registryAddress}`);
      console.log(`  Marketplace: ${marketplaceAddress}`);
      console.log(`  Engine     : ${engineAddress}`);

      const registry = await ethers.getContractAt("GenomicRegistry", registryAddress);
      sampleId = await registry.registerSampleWithManifest.staticCall(
        "ipfs://validation-100snp",
        prov.genotypeManifestHash
      );
      const sampleTx = await registry.registerSampleWithManifest(
        "ipfs://validation-100snp",
        prov.genotypeManifestHash
      );
      sampleRegistrationGas = (
        await waitAndRecord("sample.register", sampleTx, workflowTransactions)
      ).gasUsed;
      console.log(`  SampleId   : ${sampleId}\n`);
    } else {
      console.log("Deploying fresh contracts...");
      const t0 = Date.now();

      const Reg = await ethers.getContractFactory("GenomicRegistry");
      const registry = await Reg.deploy();
      await registry.waitForDeployment();
      await waitAndRecord(
        "deploy.GenomicRegistry",
        registry.deploymentTransaction(),
        deploymentTransactions
      );
      registryAddress = await registry.getAddress();

      const Mkt = await ethers.getContractFactory("ModelMarketplace");
      const marketplace = await Mkt.deploy();
      await marketplace.waitForDeployment();
      await waitAndRecord(
        "deploy.ModelMarketplace",
        marketplace.deploymentTransaction(),
        deploymentTransactions
      );
      marketplaceAddress = await marketplace.getAddress();

      const Eng = await ethers.getContractFactory("PRSComputeEngine");
      const engine_ = await Eng.deploy(marketplaceAddress, registryAddress);
      await engine_.waitForDeployment();
      await waitAndRecord(
        "deploy.PRSComputeEngine",
        engine_.deploymentTransaction(),
        deploymentTransactions
      );
      engineAddress = await engine_.getAddress();

      sampleId = await registry.registerSampleWithManifest.staticCall(
        "ipfs://validation-100snp",
        prov.genotypeManifestHash
      );
      const sampleTx = await registry.registerSampleWithManifest(
        "ipfs://validation-100snp",
        prov.genotypeManifestHash
      );
      sampleRegistrationGas = (
        await waitAndRecord("sample.register", sampleTx, workflowTransactions)
      ).gasUsed;

      console.log(`  Deployed in ${Date.now() - t0}ms`);
      console.log(`  Registry   : ${registryAddress}`);
      console.log(`  Marketplace: ${marketplaceAddress}`);
      console.log(`  Engine     : ${engineAddress}`);
      console.log(`  SampleId   : ${sampleId}\n`);
    }

    const marketplace = await ethers.getContractAt("ModelMarketplace", marketplaceAddress);
    const engine = await ethers.getContractAt("PRSComputeEngine", engineAddress);

    // ── 3. Publish model ─────────────────────────────────────────────────────
    console.log(`Publishing 100-SNP ${modelVisibility} model...`);
    const t_pub = Date.now();
    let publishGas = 0n;

    const modelId = await marketplace.createModelShell.staticCall(
      isPrivateModel,
      BigInt(quantized.weights.length),
      BigInt(UPLOAD_CHUNK_SIZE),
      BigInt(computeChunkSize),
      `ipfs://heprs/100`,
      prov.manifestHash,
      prov.sourceModelHash,
      quantized.weightZeroPoint,
      quantized.scoreOffset
    );
    let tx = await marketplace.createModelShell(
      isPrivateModel,
      BigInt(quantized.weights.length),
      BigInt(UPLOAD_CHUNK_SIZE),
      BigInt(computeChunkSize),
      `ipfs://heprs/100`,
      prov.manifestHash,
      prov.sourceModelHash,
      quantized.weightZeroPoint,
      quantized.scoreOffset
    );
    publishGas += (
      await waitAndRecord("model.createShell", tx, workflowTransactions)
    ).gasUsed;

    const weightChunks = chunkBigIntVector(quantized.weights, UPLOAD_CHUNK_SIZE);
    for (let i = 0; i < weightChunks.length; i++) {
      const chunk = weightChunks[i];
      if (isPrivateModel) {
        const input = fhevm.createEncryptedInput(marketplaceAddress, signer.address);
        for (const weight of chunk) input.add64(weight);
        const encrypted = await input.encrypt();
        tx = await marketplace.appendEncryptedModelChunk(
          modelId,
          encrypted.handles,
          encrypted.inputProof
        );
        publishGas += (
          await waitAndRecord(
            `model.appendEncryptedChunk.${i}`,
            tx,
            workflowTransactions
          )
        ).gasUsed;
      } else {
        tx = await marketplace.appendPublicModelChunk(modelId, chunk);
        publishGas += (
          await waitAndRecord(
            `model.appendPublicChunk.${i}`,
            tx,
            workflowTransactions
          )
        ).gasUsed;
      }
    }

    if (isPrivateModel) {
      tx = await marketplace.setPrivateModelReader(modelId, engineAddress, true);
      publishGas += (
        await waitAndRecord(
          "model.authorizeEngine",
          tx,
          workflowTransactions
        )
      ).gasUsed;
      tx = await marketplace.setPrivateModelReader(modelId, signer.address, true);
      publishGas += (
        await waitAndRecord(
          "model.authorizeRequester",
          tx,
          workflowTransactions
        )
      ).gasUsed;
    }

    tx = await marketplace.finalizeModel(modelId);
    publishGas += (
      await waitAndRecord("model.finalize", tx, workflowTransactions)
    ).gasUsed;
    console.log(`  Done in ${Date.now() - t_pub}ms  gas=${publishGas}\n`);

    // ── 4. Create PRS job (registry ACL check fires here) ───────────────────
    console.log("Creating PRS job...");
    const jobSubmittedAtMs = Date.now();
    const t_job = Date.now();
    tx = await engine.createPRSJob(modelId, sampleId);
    const createJobGas = (
      await waitAndRecord("job.create", tx, workflowTransactions)
    ).gasUsed;
    const jobId = await engine.jobCount() - 1n;
    console.log(`  Job ${jobId} in ${Date.now() - t_job}ms  gas=${createJobGas}\n`);

    // ── 5. Upload SNP chunks ─────────────────────────────────────────────────
    const totalUploadChunks = Math.ceil(snps.length / UPLOAD_CHUNK_SIZE);
    const totalComputeChunks = Math.ceil(snps.length / computeChunkSize);
    console.log(`Uploading ${totalUploadChunks} SNP chunks (${UPLOAD_CHUNK_SIZE} SNPs each)...`);
    const t_upload = Date.now();
    let uploadGas = 0n;

    const snpChunks = chunkBigIntVector(snps, UPLOAD_CHUNK_SIZE);
    for (let i = 0; i < snpChunks.length; i++) {
      const chunk = snpChunks[i];
      const input = fhevm.createEncryptedInput(engineAddress, signer.address);
      for (const v of chunk) input.add64(v);
      const { handles, inputProof } = await input.encrypt();
      tx = await engine.appendSnpChunk(jobId, handles, inputProof);
      uploadGas += (
        await waitAndRecord(`job.appendSnpChunk.${i}`, tx, workflowTransactions)
      ).gasUsed;
    }

    tx = await engine.finalizeSnpUpload(jobId);
    const finalizeUploadGas = (
      await waitAndRecord("job.finalizeSnpUpload", tx, workflowTransactions)
    ).gasUsed;
    console.log(`  Upload ${Date.now() - t_upload}ms  gas=${uploadGas}`);
    console.log(`  finalizeSnpUpload gas=${finalizeUploadGas}\n`);

    // ── 6. Compute chunks ────────────────────────────────────────────────────
    console.log(`Computing ${totalComputeChunks} chunks (${computeChunkSize} SNPs each)...`);
    const chunkTimesMs: number[] = [];
    const chunkGasPerCall: string[] = [];
    let computeGas = 0n;

    for (let i = 0; i < totalComputeChunks; i++) {
      const t_chunk = Date.now();
      tx = await engine.computeChunk(jobId);
      const receipt = await waitAndRecord(
        `job.computeChunk.${i}`,
        tx,
        workflowTransactions
      );
      const elapsed = Date.now() - t_chunk;
      computeGas += receipt!.gasUsed;
      chunkTimesMs.push(elapsed);
      chunkGasPerCall.push(receipt!.gasUsed.toString());
      console.log(`  chunk ${String(i + 1).padStart(2)}/${totalComputeChunks}  ${elapsed}ms  gas=${receipt!.gasUsed}`);
    }
    console.log(`  Compute total gas=${computeGas}\n`);

    // ── 7. Finalize + extract JobFinalized event ─────────────────────────────
    console.log("Finalizing...");
    const t_finalize = Date.now();
    tx = await engine.finalize(jobId);
    const finalReceipt = await waitAndRecord(
      "job.finalize",
      tx,
      workflowTransactions
    );
    const finalizeGas = finalReceipt!.gasUsed;
    const resultReadyAtMs = Date.now();

    const finalEvent = finalReceipt!.logs.find(
      (log: any) => engine.interface.parseLog(log)?.name === "JobFinalized"
    );
    if (!finalEvent) throw new Error("JobFinalized event not emitted by finalize()");
    const scoreHandle: string = engine.interface.parseLog(finalEvent as any)!.args.encodedScore;
    console.log(`  finalize ${Date.now() - t_finalize}ms  gas=${finalizeGas}`);
    console.log(`  JobFinalized event received`);
    console.log(`  Score handle: ${scoreHandle}\n`);

    // ── 8. Decrypt score ─────────────────────────────────────────────────────
    console.log(`Decrypting score (${isMock ? "debugger path" : "userDecrypt path"})...`);
    const t_decrypt = Date.now();
    let actualScore: bigint;

    if (isMock) {
      // Local mock: bypass the KMS, read plaintext directly from the coprocessor
      actualScore = await fhevm.debugger.decryptEuint(FhevmType.euint64, scoreHandle);
    } else {
      // Sepolia: full EIP-712 signing → relayer → KMS re-encryption flow.
      // Requires that FHE.allow(scoreHandle, signer.address) was called in finalize().
      actualScore = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        scoreHandle,
        engineAddress,
        signer
      );
    }

    const decryptMs = Date.now() - t_decrypt;
    console.log(`  Decrypted in ${decryptMs}ms`);
    console.log(`  Actual  : ${actualScore}`);
    console.log(`  Expected: ${expected}`);

    if (actualScore !== expected) {
      throw new Error(`Score mismatch — got ${actualScore}, expected ${expected}`);
    }
    console.log("  PASS\n");

    // ── 9. Write report ──────────────────────────────────────────────────────
    const totalGas =
      sampleRegistrationGas + publishGas + createJobGas + uploadGas +
      finalizeUploadGas + computeGas + finalizeGas;
    const avgChunkMs = chunkTimesMs.reduce((a, b) => a + b, 0) / chunkTimesMs.length;

    const report = {
      network: networkKey,
      chainId: chainId.toString(),
      fheMode: isMock ? "mock" : "real",
      evidenceClass: isMock ? "Hardhat mock" : "Live fhEVM",
      startedAt,
      completedAt: new Date().toISOString(),
      modelVisibility,
      signer: signer.address,
      fixtureSize: FIXTURE_SIZE,
      uploadChunkSize: UPLOAD_CHUNK_SIZE,
      computeChunkSize,
      scale: recommendation.scale,
      passed: true,
      expectedEncodedScore: expected.toString(),
      decodedEncodedScore: actualScore.toString(),
      scoreHandle,
      decryptionPath: isMock ? "hardhat debugger" : "Gateway/KMS userDecrypt",
      runnerSource: hashedInput("validation_script", __filename),
      transactionCount: workflowTransactions.length,
      deploymentTransactionCount: deploymentTransactions.length,
      transactions: workflowTransactions,
      deploymentTransactions,
      gas: {
        sampleRegistration: sampleRegistrationGas.toString(),
        publishModel: publishGas.toString(),
        createJob: createJobGas.toString(),
        uploadSnps: uploadGas.toString(),
        finalizeSnpUpload: finalizeUploadGas.toString(),
        compute: computeGas.toString(),
        finalize: finalizeGas.toString(),
        total: totalGas.toString(),
        chunkGasPerCall
      },
      timing: {
        submissionToResultMs: resultReadyAtMs - jobSubmittedAtMs,
        endToEndValidationMs: Date.now() - validationStartedAtMs,
        chunkTimesMs,
        avgChunkMs,
        minChunkMs: Math.min(...chunkTimesMs),
        maxChunkMs: Math.max(...chunkTimesMs),
        decryptMs
      },
      contracts: {
        GenomicRegistry: registryAddress,
        ModelMarketplace: marketplaceAddress,
        PRSComputeEngine: engineAddress
      },
      // R2.4-E1. On a live network this block is what lets a reader verify the run:
      // commit, fixture hashes, the manifest the independent reference consumed,
      // deployed bytecode digests, and the reference output this was checked against.
      provenance: await buildProvenance({
        model: prov,
        contracts: [
          await contractIdentity(
            "GenomicRegistry",
            await ethers.getContractAt("GenomicRegistry", registryAddress)
          ),
          await contractIdentity("ModelMarketplace", marketplace),
          await contractIdentity("PRSComputeEngine", engine)
        ],
        referenceOutputPath: heprsReferencePath(100)
      })
    };

    const deploymentsDir = path.resolve(__dirname, "../deployments");
    const validationOutDir = process.env.VALIDATION_OUT_DIR
      ? path.resolve(process.env.VALIDATION_OUT_DIR)
      : deploymentsDir;
    fs.mkdirSync(validationOutDir, { recursive: true });
    const outPath = path.join(
      validationOutDir,
      `${networkKey}-validation-100snp-${modelVisibility}.json`
    );
    fs.writeFileSync(
      outPath,
      JSON.stringify(report, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)
    );

    console.log(`Report saved to ${outPath}`);
    console.log("\n=== Summary ===");
    console.log(`Network    : ${networkKey} (${isMock ? "mock" : "REAL FHE"})`);
    console.log(`Visibility : ${modelVisibility}`);
    console.log(`Transactions: ${workflowTransactions.length}`);
    console.log(`Upload     : ${totalUploadChunks} × uploadChunkSize=${UPLOAD_CHUNK_SIZE}`);
    console.log(`Compute    : ${totalComputeChunks} × computeChunkSize=${computeChunkSize}`);
    console.log(`Total gas  : ${totalGas}`);
    console.log(`Avg chunk  : ${avgChunkMs.toFixed(1)}ms`);
    console.log(`Decrypt    : ${decryptMs}ms`);
    console.log(`Status     : PASS`);
  });
});
