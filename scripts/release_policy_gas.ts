import { ethers } from "hardhat";

/**
 * Measures the one-time gas cost of fixing a model's release policy (R1.4-C1).
 *
 * scripts/gas_profile.ts publishes models without a policy, so its "Model publish
 * gas" figure excludes this transaction. A real deployment adds exactly one
 * setReleasePolicy call per model, regardless of variant count — it is a fixed
 * per-model cost, not a per-SNP one.
 */
describe("Release policy gas", function () {
  it("measures setReleasePolicy and the finalizeAndClassify path", async function () {
    const [signer] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("ResultOracle");
    const oracle = await Oracle.deploy(128n);
    const oracleAddr = await oracle.getAddress();

    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();

    const shell = [
      false, 2n, 2n, 2n, "ipfs://policy-gas",
      ethers.ZeroHash, ethers.ZeroHash, 0n, 0n,
    ] as const;
    const modelId = await marketplace.createModelShell.staticCall(...shell);
    await marketplace.createModelShell(...shell);
    await marketplace.appendPublicModelChunk(modelId, [1n, 2n]);

    const policyTx = await marketplace.setReleasePolicy(
      modelId, oracleAddr, 200n, 400n, true
    );
    const policyGas = (await policyTx.wait())!.gasUsed;

    await marketplace.finalizeModel(modelId);

    const Registry = await ethers.getContractFactory("GenomicRegistry");
    const registry = await Registry.deploy();
    const sampleId = await registry.registerSample.staticCall("ipfs://s");
    await registry.registerSample("ipfs://s");

    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(
      await marketplace.getAddress(), await registry.getAddress()
    );
    const engineAddr = await engine.getAddress();

    const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
    await engine.createPRSJob(modelId, sampleId);
    const { encryptUint64Array } = await import("../test/utils/fhevm-helpers");
    const enc = await encryptUint64Array(engineAddr, signer.address, [1n, 2n]);
    await engine.appendAndComputeChunk(jobId, enc.handles, enc.inputProof);

    const classifyTx = await engine.finalizeAndClassify(jobId);
    const classifyGas = (await classifyTx.wait())!.gasUsed;

    console.log("=== Release Policy Gas ===");
    console.log(`setReleasePolicy gas     : ${policyGas}`);
    console.log(`finalizeAndClassify gas  : ${classifyGas}`);
    console.log("Note: setReleasePolicy is a fixed one-time per-model cost,");
    console.log("      independent of variant count.");
  });
});
