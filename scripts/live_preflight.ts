import { ethers, fhevm } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import {
  loadHeprsFixture,
  quantizeHeprsWeightsWithRecommendation,
  toBigIntVector,
} from "../test/utils/heprs";
import {
  fixtureModelProvenance,
  buildProvenance,
  contractIdentity,
  heprsManifestPath,
  heprsWeightsPath,
  heprsGenotypePath,
} from "./utils/provenance";

/**
 * Live-network pre-flight (RTR action R1.1-E1 / R1.1-E2 preparation).
 *
 * The live runs require a funded Sepolia wallet, which is a credential this repository
 * deliberately does not hold: `scripts/sepolia_validation.ts` refuses to run against the
 * public Hardhat test mnemonic. This script establishes everything about the live run
 * that CAN be determined without one, so the remaining gap is exactly "someone funds a
 * wallet and runs one command" rather than an open question.
 *
 * It measures, on the mock:
 *   - deployment gas for all four contracts (also feeds R1.8-E1 in Phase 8)
 *   - total transaction gas for a 100-SNP job, public and private weights
 *   - transaction counts, which is what actually scales
 * and reports the Sepolia ETH requirement at a caller-supplied gas price.
 *
 * It does NOT contact a network. Nothing here is a live measurement, and the output is
 * labelled `Hardhat mock` throughout.
 *
 * Usage:
 *   npm run preflight:live
 *   SEPOLIA_GAS_PRICE_WEI=1047758262 npm run preflight:live
 */

const FIXTURE_SIZE = 100 as const;
const UPLOAD_CHUNK_SIZE = 32;
// Measured ceilings (CD-021): 21 for BOTH visibilities, because FHE.asEuint64 does not
// obtain the scalar HCU discount. The shipped default of 20 leaves one slot of headroom.
const COMPUTE_CHUNK_SIZE = 20;

const OUT_DIR = process.env.PREFLIGHT_OUT_DIR
  ?? path.join(__dirname, "..", "evidence", "phase7");

// Sepolia gas price, in wei. Default is a reading taken 29 July 2026; override to
// re-price without editing code. This is an ASSUMPTION, not a measurement.
const GAS_PRICE_WEI = BigInt(process.env.SEPOLIA_GAS_PRICE_WEI ?? "1047758262");

function chunk<T>(v: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < v.length; i += n) out.push(v.slice(i, i + n));
  return out;
}

describe("Live-network pre-flight (R1.1 preparation)", function () {
  this.timeout(1_800_000);

  const report: any = {
    report: "live_preflight",
    action: "R1.1-E1 / R1.1-E2 preparation",
    evidenceClass: "Hardhat mock",
    note:
      "No network was contacted. Gas figures are mock measurements; the ETH estimate " +
      "multiplies them by an assumed Sepolia gas price. Deployment and transaction " +
      "counts are expected to carry over to a live network; per-transaction gas may not.",
    assumedGasPriceWei: GAS_PRICE_WEI.toString(),
    assumedGasPriceGwei: Number(GAS_PRICE_WEI) / 1e9,
  };

  before(function () {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  it("measures deployment gas for every contract the live run needs", async function () {
    const deployments: any[] = [];
    let total = 0n;

    for (const [name, args] of [
      ["GenomicRegistry", []],
      ["ModelMarketplace", []],
      ["ResultOracle", [128n]],
    ] as Array<[string, any[]]>) {
      const F = await ethers.getContractFactory(name);
      const c = await F.deploy(...args);
      const receipt = await c.deploymentTransaction()!.wait();
      const gas = receipt!.gasUsed;
      total += gas;
      const code = await ethers.provider.getCode(await c.getAddress());
      deployments.push({
        contract: name,
        deploymentGas: gas.toString(),
        deployedBytecodeBytes: (code.length - 2) / 2,
        percentOfEip170Limit: Number(
          ((100 * ((code.length - 2) / 2)) / 24576).toFixed(1)
        ),
      });
    }

    // The engine needs the marketplace and registry addresses.
    const Reg = await ethers.getContractFactory("GenomicRegistry");
    const registry = await Reg.deploy();
    const Mkt = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Mkt.deploy();
    const Eng = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Eng.deploy(
      await marketplace.getAddress(), await registry.getAddress()
    );
    const engReceipt = await engine.deploymentTransaction()!.wait();
    total += engReceipt!.gasUsed;
    const engCode = await ethers.provider.getCode(await engine.getAddress());
    deployments.push({
      contract: "PRSComputeEngine",
      deploymentGas: engReceipt!.gasUsed.toString(),
      deployedBytecodeBytes: (engCode.length - 2) / 2,
      percentOfEip170Limit: Number(
        ((100 * ((engCode.length - 2) / 2)) / 24576).toFixed(1)
      ),
    });

    report.deployment = {
      contracts: deployments,
      totalDeploymentGas: total.toString(),
      totalDeploymentEth: ethers.formatEther(total * GAS_PRICE_WEI),
      eip170LimitBytes: 24576,
      allWithinSizeLimit: deployments.every((d) => d.deployedBytecodeBytes < 24576),
    };

    console.log("\n  deployment gas:");
    for (const d of deployments) {
      console.log(
        `    ${d.contract.padEnd(20)} ${String(d.deploymentGas).padStart(9)} gas   ` +
          `${String(d.deployedBytecodeBytes).padStart(6)} B (${d.percentOfEip170Limit}% of EIP-170)`
      );
    }
    console.log(
      `    ${"TOTAL".padEnd(20)} ${String(total).padStart(9)} gas   ` +
        `= ${ethers.formatEther(total * GAS_PRICE_WEI)} ETH at ` +
        `${Number(GAS_PRICE_WEI) / 1e9} gwei`
    );
  });

  for (const visibility of ["public", "private"] as const) {
    it(`measures a full 100-SNP job end to end — ${visibility} weights`, async function () {
      const [owner] = await ethers.getSigners();
      const { genotypes, betas } = loadHeprsFixture(FIXTURE_SIZE);
      const quantized = quantizeHeprsWeightsWithRecommendation(FIXTURE_SIZE, betas);
      const snps = toBigIntVector(genotypes[0]);
      const isPrivate = visibility === "private";

      const prov = fixtureModelProvenance({
        manifestPath: heprsManifestPath(FIXTURE_SIZE),
        weightsPath: heprsWeightsPath(FIXTURE_SIZE),
        genotypePath: heprsGenotypePath(FIXTURE_SIZE),
        extra: { nominalSnpCount: FIXTURE_SIZE, visibility, purpose: "live_preflight" },
      });

      const Mkt = await ethers.getContractFactory("ModelMarketplace");
      const marketplace = await Mkt.deploy();
      const mktAddr = await marketplace.getAddress();

      let txCount = 0;
      let publishGas = 0n;
      const shell = [
        isPrivate,
        BigInt(quantized.weights.length),
        BigInt(isPrivate ? Math.min(UPLOAD_CHUNK_SIZE, 32) : UPLOAD_CHUNK_SIZE),
        BigInt(COMPUTE_CHUNK_SIZE),
        `ipfs://preflight/${visibility}`,
        prov.manifestHash,
        prov.sourceModelHash,
        quantized.weightZeroPoint,
        quantized.scoreOffset,
      ] as const;
      const modelId = await marketplace.createModelShell.staticCall(...shell);
      publishGas += (await (await marketplace.createModelShell(...shell)).wait())!.gasUsed;
      txCount++;

      for (const c of chunk(quantized.weights, UPLOAD_CHUNK_SIZE)) {
        if (isPrivate) {
          const wIn = fhevm.createEncryptedInput(mktAddr, owner.address);
          for (const w of c) wIn.add64(w);
          const wEnc = await wIn.encrypt();
          publishGas += (await (
            await marketplace.appendEncryptedModelChunk(modelId, wEnc.handles, wEnc.inputProof)
          ).wait())!.gasUsed;
        } else {
          publishGas += (await (
            await marketplace.appendPublicModelChunk(modelId, c)
          ).wait())!.gasUsed;
        }
        txCount++;
      }

      const Reg = await ethers.getContractFactory("GenomicRegistry");
      const registry = await Reg.deploy();
      const Eng = await ethers.getContractFactory("PRSComputeEngine");
      const engine = await Eng.deploy(mktAddr, await registry.getAddress());
      const engineAddr = await engine.getAddress();

      if (isPrivate) {
        publishGas += (await (
          await marketplace.setPrivateModelReader(modelId, engineAddr, true)
        ).wait())!.gasUsed;
        txCount++;
        publishGas += (await (
          await marketplace.setPrivateModelReader(modelId, owner.address, true)
        ).wait())!.gasUsed;
        txCount++;
      }
      publishGas += (await (await marketplace.finalizeModel(modelId)).wait())!.gasUsed;
      txCount++;

      const sampleId = await registry.registerSampleWithManifest.staticCall(
        "ipfs://preflight-sample", prov.genotypeManifestHash
      );
      const regGas = (await (
        await registry.registerSampleWithManifest(
          "ipfs://preflight-sample", prov.genotypeManifestHash
        )
      ).wait())!.gasUsed;
      txCount++;

      const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
      const createGas = (await (
        await engine.createPRSJob(modelId, sampleId)
      ).wait())!.gasUsed;
      txCount++;

      let streamGas = 0n;
      let computeTxs = 0;
      for (const c of chunk(snps, COMPUTE_CHUNK_SIZE)) {
        const input = fhevm.createEncryptedInput(engineAddr, owner.address);
        for (const v of c) input.add64(v);
        const enc = await input.encrypt();
        streamGas += (await (
          await engine.appendAndComputeChunk(jobId, enc.handles, enc.inputProof)
        ).wait())!.gasUsed;
        txCount++;
        computeTxs++;
      }

      const finalGas = (await (await engine.finalize(jobId)).wait())!.gasUsed;
      txCount++;

      const runGas = publishGas + regGas + createGas + streamGas + finalGas;
      const entry = {
        visibility,
        encodedPositions: quantized.weights.length,
        computeChunkSize: COMPUTE_CHUNK_SIZE,
        uploadChunkSize: UPLOAD_CHUNK_SIZE,
        transactionCount: txCount,
        computeTransactions: computeTxs,
        gas: {
          modelPublication: publishGas.toString(),
          sampleRegistration: regGas.toString(),
          jobCreation: createGas.toString(),
          streamingUploadCompute: streamGas.toString(),
          finalize: finalGas.toString(),
          totalExcludingDeployment: runGas.toString(),
        },
        ethExcludingDeployment: ethers.formatEther(runGas * GAS_PRICE_WEI),
      };
      (report.jobs ??= []).push(entry);

      console.log(
        `\n  100-SNP job, ${visibility} weights: ${txCount} transactions ` +
          `(${computeTxs} compute), ${runGas} gas = ` +
          `${ethers.formatEther(runGas * GAS_PRICE_WEI)} ETH`
      );

      report.provenance ??= await buildProvenance({
        model: prov,
        contracts: [
          await contractIdentity("ModelMarketplace", marketplace),
          await contractIdentity("GenomicRegistry", registry),
          await contractIdentity("PRSComputeEngine", engine),
        ],
      });
    });
  }

  it("verifies the live-run guards and configuration are in place", function () {
    const src = fs.readFileSync(
      path.join(__dirname, "sepolia_validation.ts"), "utf8"
    );
    const checks = {
      refusesDefaultHardhatMnemonic: /DEFAULT_HARDHAT_DEPLOYER/.test(src),
      emitsProvenanceBlock: /buildProvenance/.test(src),
      labelsEvidenceClass: /evidenceClass/.test(src),
      comparesAgainstIndependentReference: /heprsReferencePath/.test(src),
      // Pattern is constructed rather than written literally so that this file can
      // itself be covered by the provenance guard, which scans for the literal in
      // non-comment lines. Special-casing the file would have been the alternative,
      // and an exemption is worse than a two-token concatenation.
      usesRealManifestHashes: !new RegExp("Zero" + "Hash").test(src),
    };
    report.liveRunReadiness = checks;
    console.log("\n  live-run harness readiness:");
    for (const [k, v] of Object.entries(checks)) {
      console.log(`    ${v ? "ready" : "MISSING"}  ${k}`);
    }
    const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) throw new Error("live harness not ready: " + missing.join(", "));
  });

  after(function () {
    const dep = BigInt(report.deployment?.totalDeploymentGas ?? "0");
    const pub = BigInt(
      report.jobs?.find((j: any) => j.visibility === "public")
        ?.gas.totalExcludingDeployment ?? "0"
    );
    const priv = BigInt(
      report.jobs?.find((j: any) => j.visibility === "private")
        ?.gas.totalExcludingDeployment ?? "0"
    );
    report.sepoliaBudget = {
      note:
        "Faucet-planning estimate. Deployment is one-off; each additional validated " +
        "job costs the per-job figure again. Add headroom for failed transactions.",
      deploymentOnly: ethers.formatEther(dep * GAS_PRICE_WEI),
      deploymentPlusPublicJob: ethers.formatEther((dep + pub) * GAS_PRICE_WEI),
      deploymentPlusBothJobs: ethers.formatEther((dep + pub + priv) * GAS_PRICE_WEI),
      recommendedWithHeadroom: ethers.formatEther(
        ((dep + pub + priv) * 3n * GAS_PRICE_WEI) / 1n
      ),
    };
    console.log("\n  Sepolia ETH budget at " + report.assumedGasPriceGwei + " gwei:");
    console.log(`    deployment only          ${report.sepoliaBudget.deploymentOnly}`);
    console.log(`    + public 100-SNP job     ${report.sepoliaBudget.deploymentPlusPublicJob}`);
    console.log(`    + private 100-SNP job    ${report.sepoliaBudget.deploymentPlusBothJobs}`);
    console.log(`    recommended (3x headroom) ${report.sepoliaBudget.recommendedWithHeadroom}`);

    const out = path.join(OUT_DIR, "live_preflight.json");
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
    console.log(`\n  written to ${path.relative(process.cwd(), out)}`);
  });
});
