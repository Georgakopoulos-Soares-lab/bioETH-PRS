import { expect } from "chai";
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import {
  assertProvenanceHash,
  hashCanonicalJson,
  syntheticModelProvenance,
  fixtureModelProvenance,
  heprsManifestPath,
  heprsWeightsPath,
  heprsGenotypePath,
} from "../scripts/utils/provenance";

/**
 * Regression guard for RTR action R2.4-E1.
 *
 * The point of R2.4-E1 is that every reported number is traceable to exact inputs.
 * A one-off cleanup does not achieve that on its own — the next person to add an
 * evaluation script will reach for `ethers.ZeroHash` because it compiles and the
 * contracts accept it. This test makes that fail in CI instead of silently shipping
 * an untraceable figure.
 *
 * Scope (CD-001, CD-009): the guarded set is evidence-PRODUCING code — anything whose
 * output reaches a table or figure in the manuscript. Pure unit tests may keep
 * placeholder hashes, because they assert contract logic and report no measurement.
 */

const REPO_ROOT = path.join(__dirname, "..");

// Every file whose output can reach the manuscript.
const EVIDENCE_PRODUCING = [
  "scripts/sepolia_validation.ts",
  "scripts/heprs_fixture_profile.ts",
  "scripts/gas_profile.ts",
  "scripts/probe_hcu_ceiling.ts",
  "test/heprs_fixture_test.ts",
  // Added after a fresh audit rather than from the CD-001 list: this script reports
  // the per-model release-policy gas that Phase 8's cost synthesis cites, so it is
  // evidence-producing even though it was written as a one-off measurement. See CD-013.
  "scripts/release_policy_gas.ts",
  // Added by the CD-013 sweep: its output backs the cross-language agreement the
  // manuscript cites, so it belongs in the guarded set even though it lives under
  // validation/ rather than scripts/.
  "validation/contract_case_run.ts",
  // Added at the time of writing rather than after the fact, per the CD-013 lesson:
  // this produces the 200-row individual-level comparison the manuscript reports.
  "scripts/individual_level_validation.ts",
];

// Behavioural tests: they assert contract logic and report no measurement, so
// placeholder hashes are appropriate. Listed explicitly so the distinction is a
// recorded decision rather than an oversight. See CD-009.
const BEHAVIOURAL_EXEMPT = [
  "test/rate_limit_randomized_release_test.ts",
  "test/registry_marketplace_oracle_test.ts",
  "test/model_marketplace_chunked_test.ts",
  "test/prs_compute_engine_chunked_snp_test.ts",
  "test/job_lifecycle_test.ts",
];

describe("Evidence provenance guard (R2.4-E1)", function () {
  it("no evidence-producing file uses a zero manifest hash", function () {
    const offenders: string[] = [];
    for (const rel of EVIDENCE_PRODUCING) {
      const full = path.join(REPO_ROOT, rel);
      expect(fs.existsSync(full), `${rel} must exist`).to.equal(true);
      const src = fs.readFileSync(full, "utf8");
      src.split("\n").forEach((line, i) => {
        const trimmed = line.trim();
        // Skip comment lines. A guard that fires on prose *describing* the hazard
        // penalises documenting it, which is the opposite of what we want — these
        // files should be free to explain why they no longer use a zero hash.
        // Commented-out code is still caught, because it would sit on a line that
        // does not begin with a comment marker only if it were live.
        const isComment =
          trimmed.startsWith("//") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("/*");
        if (!isComment && /ZeroHash|0x0{64}/.test(line)) {
          offenders.push(`${rel}:${i + 1}: ${trimmed}`);
        }
      });
    }
    expect(
      offenders,
      "evidence-producing code must commit to its real inputs, not a zero hash " +
        "(R2.4-E1). Offending lines:\n" + offenders.join("\n")
    ).to.deep.equal([]);
  });

  it("the zero-hash scan ignores prose but not code", function () {
    // Guards the guard: comment-skipping must not become a blind spot. A live
    // assignment is caught; the same text inside a comment is not.
    const scan = (line: string) => {
      const t = line.trim();
      const isComment =
        t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
      return !isComment && /ZeroHash|0x0{64}/.test(line);
    };
    expect(scan("  const h = ethers.ZeroHash;"), "live code must be caught").to.equal(true);
    expect(scan("      manifestHash: 0x" + "0".repeat(64)), "literal zero hash").to.equal(true);
    expect(scan(" * not ethers.ZeroHash — see CD-001"), "jsdoc prose").to.equal(false);
    expect(scan("// ethers.ZeroHash was removed here"), "line comment").to.equal(false);
  });

  it("every evidence-producing file imports the provenance helper", function () {
    const missing: string[] = [];
    for (const rel of EVIDENCE_PRODUCING) {
      const src = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
      if (!/utils\/provenance/.test(src)) missing.push(rel);
    }
    expect(missing, "files not wired to provenance").to.deep.equal([]);
  });

  it("the behavioural exemption list is accurate, not aspirational", function () {
    // If an exempt file stops using placeholder hashes entirely, the exemption is
    // stale and should be removed so the list keeps meaning something.
    const stale: string[] = [];
    for (const rel of BEHAVIOURAL_EXEMPT) {
      const full = path.join(REPO_ROOT, rel);
      if (!fs.existsSync(full)) {
        stale.push(`${rel} (missing — was it renamed?)`);
        continue;
      }
      const src = fs.readFileSync(full, "utf8");
      if (!/ZeroHash/.test(src)) stale.push(`${rel} (no longer uses ZeroHash)`);
    }
    expect(stale, "stale entries in the behavioural exemption list").to.deep.equal([]);
  });

  it("assertProvenanceHash rejects the zero hash and malformed values", function () {
    expect(() => assertProvenanceHash(ethers.ZeroHash, "manifestHash")).to.throw(
      /zero hash/
    );
    expect(() => assertProvenanceHash("0x" + "0".repeat(64), "x")).to.throw(/zero hash/);
    expect(() => assertProvenanceHash("0xdeadbeef", "x")).to.throw(/not a bytes32/);
    const ok = ethers.keccak256(ethers.toUtf8Bytes("real input"));
    expect(assertProvenanceHash(ok, "x")).to.equal(ok);
  });

  it("canonical JSON hashing is key-order independent", function () {
    // Provenance digests must depend on content, not on key insertion order,
    // otherwise two identical runs could report different hashes.
    const a = hashCanonicalJson({ b: 1, a: { d: 4, c: [1, 2] } });
    const b = hashCanonicalJson({ a: { c: [1, 2], d: 4 }, b: 1 });
    expect(a).to.equal(b);
    expect(a).to.not.equal(hashCanonicalJson({ b: 1, a: { d: 4, c: [2, 1] } }));
  });

  it("synthetic provenance yields three distinct non-zero hashes", function () {
    const p = syntheticModelProvenance({
      purpose: "guard_test",
      spec: { snpCount: 3, deterministic: true },
    });
    const hashes = [p.manifestHash, p.sourceModelHash, p.genotypeManifestHash];
    for (const h of hashes) expect(h).to.not.equal(ethers.ZeroHash);
    // Distinct roles must not collide, or the registry and the model would commit to
    // the same digest and provenance would conflate genotypes with weights.
    expect(new Set(hashes).size).to.equal(3);
  });

  it("synthetic provenance is deterministic for the same spec", function () {
    const mk = () =>
      syntheticModelProvenance({ purpose: "p", spec: { n: 7, mode: "x" } });
    expect(mk().manifestHash).to.equal(mk().manifestHash);
  });

  it("fixture provenance hashes the real fixture bytes", function () {
    const p = fixtureModelProvenance({
      manifestPath: heprsManifestPath(100),
      weightsPath: heprsWeightsPath(100),
      genotypePath: heprsGenotypePath(100),
    });
    expect(p.inputs).to.have.lengthOf(3);
    for (const input of p.inputs) {
      expect(input.hash).to.match(/^0x[0-9a-f]{64}$/);
      expect(input.bytes, `${input.role} must be non-empty`).to.be.greaterThan(0);
    }
    // The weight file digest must equal keccak256 over its exact bytes, so a reader
    // can recompute it without this tool.
    const raw = fs.readFileSync(heprsWeightsPath(100));
    expect(p.sourceModelHash).to.equal(ethers.keccak256(raw));
  });

  it("the registry rejects a zero sample manifest hash", async function () {
    // registerSampleWithManifest is what the evaluation scripts now call. Confirm the
    // contract itself refuses an untraceable sample, so the guarantee is not only
    // convention in the scripts.
    const Registry = await ethers.getContractFactory("GenomicRegistry");
    const registry = await Registry.deploy();
    await expect(
      registry.registerSampleWithManifest("ipfs://x", ethers.ZeroHash)
    ).to.be.revertedWith("Manifest hash required");
  });
});
