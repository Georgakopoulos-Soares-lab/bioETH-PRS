import { ethers } from "hardhat";

const DEFAULT_SNP_COUNTS = [100, 300, 600];
const DEFAULT_CHUNK_SIZE = 100;
const DEFAULT_GAS_PRICE_GWEI = "30";
const DEFAULT_BLOCK_TIME_SEC = 12;

const toArray = (count: number, offset: number) =>
  Array.from({ length: count }, (_, i) => (i + 1 + offset) % 11);

const toEncryptedPlaceholders = (count: number) =>
  Array.from({ length: count }, () => ethers.ZeroHash);

const chunkArray = <T>(values: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += chunkSize) {
    chunks.push(values.slice(start, start + chunkSize));
  }
  return chunks;
};

async function profile(n: number, chunkSize: number, gasPriceGwei: string, blockTimeSec: number) {
  if (process.env.FHEVM !== "1") {
    throw new Error("Gas profiling requires FHEVM=1 and a local fhEVM node.");
  }

  const Marketplace = await ethers.getContractFactory("ModelMarketplace");
  const marketplace = await Marketplace.deploy();

  const Engine = await ethers.getContractFactory("PRSComputeEngine");
  const engine = await Engine.deploy(await marketplace.getAddress());

  const weights = toArray(n, 0);
  const snps = toEncryptedPlaceholders(n);

  const modelId = await marketplace.createModelShell.staticCall(
    false,
    BigInt(weights.length),
    BigInt(chunkSize),
    `ipfs://profile/${n}`,
    ethers.ZeroHash,
    ethers.ZeroHash,
    { gasLimit: 16_000_000 }
  );
  const shellTx = await marketplace.createModelShell(
    false,
    BigInt(weights.length),
    BigInt(chunkSize),
    `ipfs://profile/${n}`,
    ethers.ZeroHash,
    ethers.ZeroHash,
    { gasLimit: 16_000_000 }
  );
  const shellReceipt = await shellTx.wait();

  let publishGas = shellReceipt?.gasUsed ?? 0n;
  for (const chunk of chunkArray(weights, chunkSize)) {
    const tx = await marketplace.appendPublicModelChunk(modelId, chunk, {
      gasLimit: 16_000_000
    });
    const receipt = await tx.wait();
    publishGas += receipt?.gasUsed ?? 0n;
  }

  const finalizeTx = await marketplace.finalizeModel(modelId, {
    gasLimit: 16_000_000
  });
  const finalizeReceipt = await finalizeTx.wait();
  publishGas += finalizeReceipt?.gasUsed ?? 0n;

  const jobId = await engine.createPRSJob.staticCall(modelId, {
    gasLimit: 16_000_000
  });
  const createJobTx = await engine.createPRSJob(modelId, {
    gasLimit: 16_000_000
  });
  const createJobReceipt = await createJobTx.wait();

  let snpUploadGas = 0n;
  for (const chunk of chunkArray(snps, chunkSize)) {
    const tx = await engine.appendSnpChunk(jobId, chunk, {
      gasLimit: 16_000_000
    });
    const receipt = await tx.wait();
    snpUploadGas += receipt?.gasUsed ?? 0n;
  }

  const finalizeSnpTx = await engine.finalizeSnpUpload(jobId, {
    gasLimit: 16_000_000
  });
  const finalizeSnpReceipt = await finalizeSnpTx.wait();
  snpUploadGas += finalizeSnpReceipt?.gasUsed ?? 0n;

  let computeGas = 0n;
  const chunks = Math.ceil(n / chunkSize);
  for (let i = 0; i < chunks; i++) {
    const tx = await engine.computeChunk(jobId, { gasLimit: 16_000_000 });
    const receipt = await tx.wait();
    computeGas += receipt?.gasUsed ?? 0n;
  }

  const totalGas =
    publishGas +
    (createJobReceipt?.gasUsed ?? 0n) +
    snpUploadGas +
    computeGas;
  const gasPrice = ethers.parseUnits(gasPriceGwei, "gwei");
  const totalEth = ethers.formatEther(totalGas * gasPrice);
  const estimatedSeconds = chunks * blockTimeSec;

  return {
    n,
    chunkSize,
    chunks,
    publishGas,
    createJobGas: createJobReceipt?.gasUsed ?? 0n,
    snpUploadGas,
    computeGas,
    totalGas,
    totalEth,
    estimatedSeconds,
    gasPriceGwei,
    blockTimeSec
  };
}

async function main() {
  const counts = process.env.SNP_COUNTS
    ? process.env.SNP_COUNTS.split(",").map((value) => Number(value.trim()))
    : DEFAULT_SNP_COUNTS;
  const chunkSize = process.env.CHUNK_SIZE ? Number(process.env.CHUNK_SIZE) : DEFAULT_CHUNK_SIZE;
  const gasPriceGwei = process.env.GAS_PRICE_GWEI ?? DEFAULT_GAS_PRICE_GWEI;
  const blockTimeSec = process.env.BLOCK_TIME_SEC ? Number(process.env.BLOCK_TIME_SEC) : DEFAULT_BLOCK_TIME_SEC;

  const results = [];
  for (const count of counts) {
    results.push(await profile(count, chunkSize, gasPriceGwei, blockTimeSec));
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
    console.log(`Estimated wall time: ${result.estimatedSeconds}s`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
