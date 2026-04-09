import { ethers, fhevm } from "hardhat";

const DEFAULT_SNP_COUNTS = [100, 300, 600];
// Decoupled chunk sizes:
//   uploadChunkSize=32 — 2048-bit input-proof budget (max 32 euint64s per call)
//   computeChunkSize=20 — HCU-safe on mock; Sepolia ceiling TBD (run probe:hcu)
const DEFAULT_UPLOAD_CHUNK_SIZE = 32;
const DEFAULT_COMPUTE_CHUNK_SIZE = 20;
const DEFAULT_GAS_PRICE_GWEI = "30";

const chunkArray = <T>(values: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += chunkSize) {
    chunks.push(values.slice(start, start + chunkSize));
  }
  return chunks;
};

async function profile(n: number, uploadChunkSize: number, computeChunkSize: number, gasPriceGwei: string) {
  const Marketplace = await ethers.getContractFactory("ModelMarketplace");
  const marketplace = await Marketplace.deploy();

  const Registry = await ethers.getContractFactory("GenomicRegistry");
  const registry = await Registry.deploy();
  const sampleId = await registry.registerSample.staticCall(`ipfs://gas-profile/${n}-sample`);
  await registry.registerSample(`ipfs://gas-profile/${n}-sample`);
  const Engine = await ethers.getContractFactory("PRSComputeEngine");
  const engine = await Engine.deploy(await marketplace.getAddress(), await registry.getAddress());

  const weights = Array.from({ length: n }, (_, i) => BigInt((i + 1) % 11));
  const snps = Array.from({ length: n }, (_, i) => BigInt((i + 2) % 3));

  const modelId = await marketplace.createModelShell.staticCall(
    false,
    BigInt(weights.length),
    BigInt(uploadChunkSize),
    BigInt(computeChunkSize),
    `ipfs://gas-profile/${n}`,
    ethers.ZeroHash,
    ethers.ZeroHash,
    0n,
    0n
  );
  const shellTx = await marketplace.createModelShell(
    false,
    BigInt(weights.length),
    BigInt(uploadChunkSize),
    BigInt(computeChunkSize),
    `ipfs://gas-profile/${n}`,
    ethers.ZeroHash,
    ethers.ZeroHash,
    0n,
    0n
  );
  let publishGas = (await shellTx.wait())?.gasUsed ?? 0n;

  for (const chunk of chunkArray(weights, uploadChunkSize)) {
    const tx = await marketplace.appendPublicModelChunk(modelId, chunk);
    publishGas += (await tx.wait())?.gasUsed ?? 0n;
  }

  const finalizeTx = await marketplace.finalizeModel(modelId);
  publishGas += (await finalizeTx.wait())?.gasUsed ?? 0n;

  const createJobTx = await engine.createPRSJob(modelId, sampleId);
  const createJobReceipt = await createJobTx.wait();
  const createJobGas = createJobReceipt?.gasUsed ?? 0n;

  const jobId = await engine.jobCount() - 1n;
  const [signer] = await ethers.getSigners();
  const engineAddr = await engine.getAddress();

  let snpUploadGas = 0n;
  for (const chunk of chunkArray(snps, uploadChunkSize)) {
    const input = fhevm.createEncryptedInput(engineAddr, signer.address);
    for (const v of chunk) input.add64(v);
    const { handles, inputProof } = await input.encrypt();
    const tx = await engine.appendSnpChunk(jobId, handles, inputProof);
    snpUploadGas += (await tx.wait())?.gasUsed ?? 0n;
  }

  const finalizeSnpTx = await engine.finalizeSnpUpload(jobId);
  snpUploadGas += (await finalizeSnpTx.wait())?.gasUsed ?? 0n;

  let computeGas = 0n;
  const chunks = Math.ceil(n / computeChunkSize);
  for (let i = 0; i < chunks; i++) {
    const tx = await engine.computeChunk(jobId);
    computeGas += (await tx.wait())?.gasUsed ?? 0n;
  }

  const finalizeScoreTx = await engine.finalize(jobId);
  const finalizeGas = (await finalizeScoreTx.wait())?.gasUsed ?? 0n;

  const totalGas = publishGas + createJobGas + snpUploadGas + computeGas + finalizeGas;
  const gasPrice = ethers.parseUnits(gasPriceGwei, "gwei");
  const totalEth = ethers.formatEther(totalGas * gasPrice);

  return {
    n,
    uploadChunkSize,
    computeChunkSize,
    chunks,
    publishGas,
    createJobGas,
    snpUploadGas,
    computeGas,
    finalizeGas,
    totalGas,
    totalEth,
    gasPriceGwei
  };
}

describe("Gas profile — synthetic SNP counts", function () {
  this.timeout(600_000);

  it("profiles gas vs SNP count", async function () {
    const counts = process.env.SNP_COUNTS
      ? process.env.SNP_COUNTS.split(",").map((value) => Number(value.trim()))
      : DEFAULT_SNP_COUNTS;
    const uploadChunkSize = process.env.UPLOAD_CHUNK_SIZE ? Number(process.env.UPLOAD_CHUNK_SIZE) : DEFAULT_UPLOAD_CHUNK_SIZE;
    const computeChunkSize = process.env.COMPUTE_CHUNK_SIZE ? Number(process.env.COMPUTE_CHUNK_SIZE) : DEFAULT_COMPUTE_CHUNK_SIZE;
    const gasPriceGwei = process.env.GAS_PRICE_GWEI ?? DEFAULT_GAS_PRICE_GWEI;

    const results = [];
    for (const count of counts) {
      results.push(await profile(count, uploadChunkSize, computeChunkSize, gasPriceGwei));
    }

    for (const result of results) {
      console.log("\n=== Gas Profile ===");
      console.log(`SNPs: ${result.n}`);
      console.log(`Upload chunk size: ${result.uploadChunkSize}`);
      console.log(`Compute chunk size: ${result.computeChunkSize}`);
      console.log(`Chunks: ${result.chunks}`);
      console.log(`Model publish gas: ${result.publishGas}`);
      console.log(`Job create gas: ${result.createJobGas}`);
      console.log(`SNP upload gas: ${result.snpUploadGas}`);
      console.log(`Compute gas: ${result.computeGas}`);
      console.log(`Finalize gas: ${result.finalizeGas}`);
      console.log(`Total gas: ${result.totalGas}`);
      console.log(`Gas price: ${result.gasPriceGwei} gwei`);
      console.log(`Estimated ETH: ${result.totalEth}`);
    }
  });
});
