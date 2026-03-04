import { expect } from "chai";
import { ethers } from "hardhat";
import { encrypt64Array, getFhevmInstance } from "./utils/fhevm";

describe("bioETH PRS (BioETHPRS contract)", function () {
  before(function () {
    if (process.env.FHEVM !== "1") {
      throw new Error("Set FHEVM=1 and configure fhevmjs env vars to run this test against a local fhEVM node.");
    }
  });

  it("computes PRS via chunked dot product", async function () {
    const BioETHPRS = await ethers.getContractFactory("BioETHPRS");
    const bioeth = (await BioETHPRS.deploy()) as any;

    const [signer] = await ethers.getSigners();
    const contractAddress = await bioeth.getAddress();

    const weights = await encrypt64Array(await getFhevmInstance(), contractAddress, signer.address, [2n, 3n, 4n]);
    const snps = await encrypt64Array(await getFhevmInstance(), contractAddress, signer.address, [5n, 6n, 7n]);

    const modelId = await bioeth.uploadModel.staticCall(weights.handles, false);
    await bioeth.uploadModel(weights.handles, false);

    const jobId = await bioeth.startPRS.staticCall(modelId, snps.handles, 2);
    await bioeth.startPRS(modelId, snps.handles, 2);

    await bioeth.computeChunk(jobId);
    const partial = await bioeth.readPartial(jobId);
    expect(partial).to.not.equal(ethers.ZeroHash);

    await bioeth.computeChunk(jobId);
    const finalScore = await bioeth.finalize(jobId);
    expect(finalScore).to.not.equal(ethers.ZeroHash);
  });
});
