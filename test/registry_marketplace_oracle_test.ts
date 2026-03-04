import { expect } from "chai";
import { ethers } from "hardhat";
import { encrypt64Array, getFhevmInstance } from "./utils/fhevm";

describe("Registry/Marketplace/Oracle", function () {
  before(function () {
    if (process.env.FHEVM !== "1") {
      throw new Error("Set FHEVM=1 and configure fhevmjs env vars to run this test against a local fhEVM node.");
    }
  });

  it("handles sample access, model listing, PRS compute, and classification", async function () {
    const [owner, researcher] = await ethers.getSigners();

  const Registry = await ethers.getContractFactory("GenomicRegistry");
  const registry = (await Registry.deploy()) as any;

    const sampleId = await registry.registerSample.staticCall("ipfs://sample");
    await registry.registerSample("ipfs://sample");
    await registry.grantAccess(sampleId, researcher.address);

    const sample = await registry.connect(researcher).getSample(sampleId);
    expect(sample[0]).to.equal("ipfs://sample");

  const Marketplace = await ethers.getContractFactory("ModelMarketplace");
  const marketplace = (await Marketplace.deploy()) as any;
  const modelId = await marketplace.listPublicModel.staticCall([1, 2, 3]);
  await marketplace.listPublicModel([1, 2, 3]);

  const Engine = await ethers.getContractFactory("PRSComputeEngine");
  const engine = (await Engine.deploy(await marketplace.getAddress())) as any;

    const engineAddress = await engine.getAddress();
    const snps = await encrypt64Array(await getFhevmInstance(), engineAddress, owner.address, [4n, 5n, 6n]);

  const jobId = await engine.startPRS.staticCall(modelId, snps.handles, 2);
  await engine.startPRS(modelId, snps.handles, 2);

    await engine.computeChunk(jobId);
    await engine.computeChunk(jobId);
    const score = await engine.finalize(jobId);
  expect(score).to.not.equal(ethers.ZeroHash);

    const Oracle = await ethers.getContractFactory("ResultOracle");
    const oracle = (await Oracle.deploy()) as any;
    const oracleAddress = await oracle.getAddress();
    const noise = await encrypt64Array(await getFhevmInstance(), oracleAddress, owner.address, [0n]);
    const category = await oracle.classify(score, noise.handles[0], 10, 20);
    expect(category).to.not.equal(ethers.ZeroHash);
  });
});
