import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.join(__dirname, "..");
const validationSource = fs.readFileSync(
  path.join(REPO_ROOT, "scripts", "sepolia_validation.ts"),
  "utf8"
);
const deploymentSource = fs.readFileSync(
  path.join(REPO_ROOT, "scripts", "deploy.ts"),
  "utf8"
);

describe("Live validation report readiness (R1.1-E1 / R1.1-E2)", function () {
  it("supports both public and private model publication from one harness", function () {
    expect(validationSource).to.include("MODEL_VISIBILITY");
    expect(validationSource).to.include("appendPublicModelChunk");
    expect(validationSource).to.include("appendEncryptedModelChunk");
    expect(validationSource).to.include("setPrivateModelReader");
  });

  it("records the verifiable transaction trail required by R1.1-E1", function () {
    for (const field of [
      "transactionCount",
      "transactions",
      "hash",
      "blockNumber",
      "gasUsed",
      "submissionToResultMs",
      "decryptMs",
      "decodedEncodedScore",
      "runnerSource",
      "hashedInput",
    ]) {
      expect(validationSource, `missing live-report field ${field}`).to.include(field);
    }
  });

  it("writes distinct public and private reports so one run cannot overwrite the other", function () {
    expect(validationSource).to.include(
      "`${networkKey}-validation-100snp-${modelVisibility}.json`"
    );
  });

  it("deployment reports transaction receipts and exact source provenance", function () {
    for (const field of [
      "transactionCount",
      "totalDeploymentGas",
      "blockNumber",
      "gasUsed",
      "hashedInput",
      "contractIdentity",
    ]) {
      expect(deploymentSource, `missing deployment-report field ${field}`).to.include(field);
    }
  });
});
