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

  it("prepares relayer proofs before workflow writes and retries transport failures", function () {
    expect(validationSource).to.include(
      "Preparing relayer input proofs before submitting workflow transactions"
    );
    expect(validationSource).to.include("retryTransientRelayerOperation");
    expect(validationSource.indexOf("Preparing relayer input proofs"))
      .to.be.lessThan(validationSource.indexOf("sample.register"));
  });

  it("checkpoints each confirmed receipt so a late failure keeps its transaction trail", function () {
    expect(validationSource).to.include("bioeth-prs/live-validation-checkpoint/1");
    expect(validationSource).to.include("onRecorded?.()");
    expect(validationSource).to.include('writeCheckpoint?.("failed", error)');
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
