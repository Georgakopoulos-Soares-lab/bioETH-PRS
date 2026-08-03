import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.join(__dirname, "..");

function readJson(relativePath: string): any {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
}

function keysAtAllLevels(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysAtAllLevels);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    key,
    ...keysAtAllLevels(child),
  ]);
}

const INTERNAL_KEYS = [
  "action",
  "evidenceClass",
  "executionStatus",
  "workflow",
  "jobs",
  "provenance",
  "repository",
  "runtime",
  "commit",
  "dirtyFiles",
  "producer",
  "runner",
  "gate",
  "tool",
  "encodedPositions",
  "privateModelPermissions",
  "privateWeightPermissions",
  "permissionRecords",
  "privateModel",
  "modelVisibility",
  "sourceFile",
  "sourceFiles",
  "providerPermissionRequired",
  "modelOwnerPermissionRequired",
  "maxAbsQuantisedWeight",
];

describe("Reader-facing evidence", function () {
  const paths = [
    "evidence/phase8/scale_evidence.json",
    "evidence/phase8/measured_transaction_use.json",
    "evidence/phase8/fee_sensitivity.json",
    "evidence/phase6/anti_probing_results.json",
    "evidence/phase5/category_agreement_100snp.json",
  ];

  it("omits internal revision and repository metadata", function () {
    for (const relativePath of paths) {
      const document = readJson(relativePath);
      const keys = keysAtAllLevels(document);
      expect(keys, relativePath).not.to.include.members(INTERNAL_KEYS);
      const text = JSON.stringify(document);
      expect(text, relativePath).not.to.include("Hardhat");
      expect(text, relativePath).not.to.include("test/fixtures");
    }
  });

  it("reports Sepolia, local simulation, and calculated estimates separately", function () {
    const scale = readJson(paths[0]);
    expect(scale.results.every((row: any) => row.variantCount <= 5000)).to.equal(true);
    expect(scale.results.filter((row: any) => row.setting === "Sepolia")).to.have.lengthOf(1);
    expect(scale.setup.privateWeights).to.include("not evaluated on Sepolia");
    expect(scale.results.every((row: any) => row.leadingConstantIncluded === true)).to.equal(true);

    const transactionUse = readJson(paths[1]);
    expect(transactionUse.sepoliaPublicCalculation.method).to.equal(
      "Classic method (stored inputs)"
    );
    expect(transactionUse.localCalculations.method).to.equal("Streaming method");
    expect(
      transactionUse.sepoliaAndMatchedLocalComparison.sepoliaOverLocalPercent
    ).to.equal("10.42");

    const fee = readJson(paths[2]);
    expect(fee.setting).to.equal("calculated estimate");
    expect(fee.usdConversion).to.include("not provided");
  });

  it("does not present the planned Sepolia Streaming calculations as completed", function () {
    const status = fs.readFileSync(
      path.join(REPO_ROOT, "evidence", "sepolia_streaming_2026-08-01", "README.md"),
      "utf8"
    );
    expect(status).to.include("do not impose a fixed 100-variant model limit");
    expect(status).to.include("No new Streaming transaction was submitted");
    expect(status).to.include("There are no new Sepolia Streaming gas, time, or score measurements");
    expect(status).not.to.include("insufficient");
  });

  it("preserves the reported adversarial and category results", function () {
    const antiProbing = readJson(paths[3]);
    const adaptive = antiProbing.results.find(
      (result: any) =>
        result.attack === "requester-selected thresholds" && result.adaptive === true
    );
    const at200 = adaptive.recoveryByQueryCount.find(
      (point: any) => point.totalQueries === 200
    );
    expect(at200.pearsonR).to.equal(0.999905);
    expect(at200.signAccuracy).to.equal(1);
    expect(at200.withinNoiseBound).to.equal(0.95);
    const firstFullRecovery = adaptive.recoveryByQueryCount.find(
      (point: any) => point.withinNoiseBound === 1
    );
    expect(firstFullRecovery.totalQueries).to.equal(260);
    expect(antiProbing.setup.randomAdditionSequence).to.deep.equal({
      label: "bioeth-prs-anti-probing-v1",
      description:
        "The local analysis used a fixed sequence of random additions from 0 through 127 " +
        "so the results can be repeated exactly.",
    });

    const categories = readJson(paths[4]);
    expect(categories.method).to.include("63.5");
    expect(categories.method).to.include("64");
    expect(categories.outsideBandAgreeing).to.equal(categories.outsideBand);
    expect(categories.outsideBand).to.equal(48);
    expect(categories.withinBand).to.equal(2);
  });
});
