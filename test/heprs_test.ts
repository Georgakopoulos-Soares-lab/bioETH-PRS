import { expect } from "chai";
import { ethers } from "hardhat";
import { encrypt64Array, getFhevmInstance } from "./utils/fhevm";

describe("HEPRS", function () {
  before(function () {
    if (process.env.FHEVM !== "1") {
      throw new Error("Set FHEVM=1 and configure fhevmjs env vars to run this test against a local fhEVM node.");
    }
  });

  it("computes PRS via chunked dot product", async function () {
    const HEPRS = await ethers.getContractFactory("HEPRS");
    const heprs = (await HEPRS.deploy()) as any;

    const [signer] = await ethers.getSigners();
    const contractAddress = await heprs.getAddress();

    const weights = await encrypt64Array(await getFhevmInstance(), contractAddress, signer.address, [2n, 3n, 4n]);
    const snps = await encrypt64Array(await getFhevmInstance(), contractAddress, signer.address, [5n, 6n, 7n]);

    const modelId = await heprs.uploadModel.staticCall(weights.handles, false);
    await heprs.uploadModel(weights.handles, false);

    const jobId = await heprs.startPRS.staticCall(modelId, snps.handles, 2);
    await heprs.startPRS(modelId, snps.handles, 2);

    await heprs.computeChunk(jobId);
    const partial = await heprs.readPartial(jobId);
    expect(partial).to.not.equal(ethers.ZeroHash);

    await heprs.computeChunk(jobId);
    const finalScore = await heprs.finalize(jobId);
    expect(finalScore).to.not.equal(ethers.ZeroHash);
  });
});
