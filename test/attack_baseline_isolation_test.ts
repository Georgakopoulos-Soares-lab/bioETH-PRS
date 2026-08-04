import { expect } from "chai";
import { ethers } from "hardhat";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Isolation and fidelity guarantees for `contracts/attack-baseline/` (CD-005).
 *
 * The adversarial analysis needs a contract with requester-selected thresholds. The copy in
 * this directory is used only for that analysis and must match commit 2d6f21d. These checks
 * keep it out of deployment code and confirm that only documented names and paths differ.
 */

const REPO_ROOT = path.join(__dirname, "..");
const BASELINE_DIR = path.join(REPO_ROOT, "contracts", "attack-baseline");
const FROZEN_COMMIT = "2d6f21d";

// Files permitted to name the baseline contracts.
const ALLOWED = [
  "contracts/attack-baseline/BaselineModelMarketplace.sol",
  "contracts/attack-baseline/BaselinePRSComputeEngine.sol",
  "scripts/anti_probing_evaluation.ts",
  "test/attack_baseline_isolation_test.ts",
];

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

describe("Requester-selected-threshold contract isolation (CD-005)", function () {
  it("no deployment path references the contract copy", function () {
    const deployScript = path.join(REPO_ROOT, "scripts", "deploy.ts");
    const src = fs.readFileSync(deployScript, "utf8");
    expect(
      /Baseline(ModelMarketplace|PRSComputeEngine)/.test(src),
      "scripts/deploy.ts must not deploy the requester-selected-threshold contract copy"
    ).to.equal(false);
  });

  it("only explicitly allowed files name the contract copy", function () {
    const offenders: string[] = [];
    for (const dir of ["contracts", "scripts", "test", "validation"]) {
      for (const full of walk(path.join(REPO_ROOT, dir), [".sol", ".ts"])) {
        const rel = path.relative(REPO_ROOT, full);
        if (ALLOWED.includes(rel)) continue;
        const src = fs.readFileSync(full, "utf8");
        if (/Baseline(ModelMarketplace|PRSComputeEngine)/.test(src)) offenders.push(rel);
      }
    }
    expect(
      offenders,
      "unexpected references to the attack baseline:\n" + offenders.join("\n")
    ).to.deep.equal([]);
  });

  it("current contracts do not import the contract copy", function () {
    for (const full of walk(path.join(REPO_ROOT, "contracts"), [".sol"])) {
      if (full.startsWith(BASELINE_DIR)) continue;
      const src = fs.readFileSync(full, "utf8");
      expect(
        /attack-baseline/.test(src),
        `${path.relative(REPO_ROOT, full)} imports from attack-baseline/`
      ).to.equal(false);
    }
  });

  it("reversing the recorded renames reproduces the source at commit 2d6f21d", function () {
    // Reversing only the documented renames must recover the source at the recorded commit.
    const cases: Array<[string, string]> = [
      ["ModelMarketplace", "BaselineModelMarketplace"],
      ["PRSComputeEngine", "BaselinePRSComputeEngine"],
    ];
    for (const [orig, renamed] of cases) {
      const frozen = execFileSync(
        "git",
        ["show", `${FROZEN_COMMIT}:contracts/${orig}.sol`],
        { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
      );
      const ours = fs.readFileSync(path.join(BASELINE_DIR, `${renamed}.sol`), "utf8");

      // Both sides start at the first import; our added header sits above it.
      const recovered = ours
        .slice(ours.indexOf("import {"))
        .replace(/import "\.\/BaselineModelMarketplace\.sol";/g, 'import "./ModelMarketplace.sol";')
        .replace(/import "\.\.\/GenomicRegistry\.sol";/g, 'import "./GenomicRegistry.sol";')
        .replace(/IBaselineResultOracle/g, "IResultOracle")
        .replace(/BaselineModelMarketplace/g, "ModelMarketplace")
        .replace(/BaselinePRSComputeEngine/g, "PRSComputeEngine");

      expect(
        recovered,
        `contracts/attack-baseline/${renamed}.sol is no longer a faithful copy of ` +
          `${FROZEN_COMMIT}:contracts/${orig}.sol. Only renames and import paths may differ.`
      ).to.equal(frozen.slice(frozen.indexOf("import {")));
    }
  });

  it("the contract copy accepts requester thresholds and the current contract does not", function () {
    const baseline = fs.readFileSync(
      path.join(BASELINE_DIR, "BaselinePRSComputeEngine.sol"), "utf8"
    );
    const live = fs.readFileSync(
      path.join(REPO_ROOT, "contracts", "PRSComputeEngine.sol"), "utf8"
    );
    const sig = (src: string) => {
      const m = src.match(/function finalizeAndClassify\(([\s\S]*?)\) external/);
      return (m?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    };
    const baselineArgs = sig(baseline);
    const liveArgs = sig(live);

    expect(baselineArgs).to.have.lengthOf(4);
    expect(baselineArgs.join(" | ")).to.match(/lowThreshold/);
    expect(baselineArgs.join(" | ")).to.match(/highThreshold/);

    expect(liveArgs, "live finalizeAndClassify must take only jobId").to.have.lengthOf(1);
    expect(liveArgs[0]).to.equal("uint256 jobId");
  });

  it("the contract copy deploys and accepts requester-chosen thresholds", async function () {
    const [owner] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("ResultOracle");
    const oracle = await Oracle.deploy(128n);
    const Mkt = await ethers.getContractFactory("BaselineModelMarketplace");
    const marketplace = await Mkt.deploy();
    const shell = [
      false, 2n, 2n, 2n, "ipfs://baseline",
      ethers.keccak256(ethers.toUtf8Bytes("baseline-manifest")),
      ethers.keccak256(ethers.toUtf8Bytes("baseline-weights")),
      0n, 0n,
    ] as const;
    const modelId = await marketplace.createModelShell.staticCall(...shell);
    await marketplace.createModelShell(...shell);
    await marketplace.appendPublicModelChunk(modelId, [1n, 2n]);
    await marketplace.finalizeModel(modelId);

    // These setters configure the requester-selected-threshold contract copy.
    await marketplace.setOracleRequired(modelId, true);
    await marketplace.setApprovedOracle(modelId, await oracle.getAddress());
    expect(await marketplace.isOracleRequired(modelId)).to.equal(true);

    const Registry = await ethers.getContractFactory("GenomicRegistry");
    const registry = await Registry.deploy();
    const sampleId = await registry.registerSampleWithManifest.staticCall(
      "ipfs://baseline-sample",
      ethers.keccak256(ethers.toUtf8Bytes("baseline-genotypes"))
    );
    await registry.registerSampleWithManifest(
      "ipfs://baseline-sample",
      ethers.keccak256(ethers.toUtf8Bytes("baseline-genotypes"))
    );

    const Eng = await ethers.getContractFactory("BaselinePRSComputeEngine");
    const engine = await Eng.deploy(
      await marketplace.getAddress(), await registry.getAddress()
    );

    // Four arguments accepted: the requester chooses both thresholds per call.
    const frag = (engine.interface as any).getFunction(
      "finalizeAndClassify(uint256,address,uint64,uint64)"
    );
    expect(frag, "baseline must expose the 4-argument entry point").to.not.equal(null);
    expect(frag!.inputs.map((i: any) => i.name)).to.deep.equal([
      "jobId", "oracle", "lowThreshold", "highThreshold",
    ]);
    expect(await engine.jobCount()).to.equal(0n);
    expect(owner.address).to.match(/^0x[0-9a-fA-F]{40}$/);
  });
});
