import { ethers, fhevm } from "hardhat";

const DEFAULT_SNP_COUNTS = [100, 300, 600];
const DEFAULT_CHUNK_SIZE = 10;
const DEFAULT_GAS_PRICE_GWEI = "30";

const chunkArray = <T>(values: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += chunkSize) {
    chunks.push(values.slice(start, start + chunkSize));
  }
  return chunks;
};

async function profile(n: number, chunkSize: number, gasPriceGwei: string) {
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
    BigInt(chunkSize),
    `ipfs://gas-profile/${n}`,
    ethers.ZeroHash,
    ethers.ZeroHash,
    0n,
    0n
  );
  const shellTx = await marketplace.createModelShell(
    false,
    BigInt(weights.length),
    BigInt(chunkSize),
    `ipfs://gas-profile/${n}`,
    ethers.ZeroHash,
    ethers.ZeroHash,
    0n,
    0n
  );
  let publishGas = (await shellTx.wait())?.gasUsed ?? 0n;

  for (const chunk of chunkArray(weights, chunkSize)) {
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
  for (const chunk of chunkArray(snps, chunkSize)) {
    const input = fhevm.createEncryptedInput(engineAddr, signer.address);
    for (const v of chunk) input.add64(v);
    const { handles, inputProof } = await input.encrypt();
    const tx = await engine.appendSnpChunk(jobId, handles, inputProof);
    snpUploadGas += (await tx.wait())?.gasUsed ?? 0n;
  }

  const finalizeSnpTx = await engine.finalizeSnpUpload(jobId);
  snpUploadGas += (await finalizeSnpTx.wait())?.gasUsed ?? 0n;

  let computeGas = 0n;
  const chunks = Math.ceil(n / chunkSize);
  for (let i = 0; i < chunks; i++) {
    const tx = await engine.computeChunk(jobId);
    computeGas += (await tx.wait())?.gasUsed ?? 0n;
  }

  const totalGas = publishGas + createJobGas + snpUploadGas + computeGas;
  const gasPrice = ethers.parseUnits(gasPriceGwei, "gwei");
  const totalEth = ethers.formatEther(totalGas * gasPrice);

  return {
    n,
    chunkSize,
    chunks,
    publishGas,
    createJobGas,
    snpUploadGas,
    computeGas,
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
    const chunkSize = process.env.CHUNK_SIZE ? Number(process.env.CHUNK_SIZE) : DEFAULT_CHUNK_SIZE;
    const gasPriceGwei = process.env.GAS_PRICE_GWEI ?? DEFAULT_GAS_PRICE_GWEI;

    const results = [];
    for (const count of counts) {
      results.push(await profile(count, chunkSize, gasPriceGwei));
    }

    for (const result of results) {
      console.log("\n=== Gas Profile ===");
      console.log(`SNPs: ${result.n}`);
      console.log(`Chunk size: ${result.chunkSize}`);
      console.log(`Chunks: ${result.chunks}`);
      console.log(`Model publish gas: ${result.publishGas}`);
      console.log(`Job create gas: ${result.createJobGas}`);
      console.log(`SNP upload gas: ${result.snpUploadGas}`);
      console.log(`Compute gas: ${result.computeGas}`);
      console.log(`Total gas: ${result.totalGas}`);
      console.log(`Gas price: ${result.gasPriceGwei} gwei`);
      console.log(`Estimated ETH: ${result.totalEth}`);
    }
  });
});
