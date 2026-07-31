import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

import {
  buildFeeSensitivity,
  buildScaleEvidence,
  buildTransactionUse,
  ceilDiv,
  parseReleasePolicyGas,
  streamingTransactionGeometry,
} from "../scripts/phase8_evidence_synthesis";

const REPO_ROOT = path.join(__dirname, "..");

function provenanceFixture() {
  return {
    schema: "bioeth-prs/evidence-synthesis/1",
    repository: {
      commit: "test",
      shortCommit: "test",
      branch: "test",
      dirty: false,
    },
    runtime: { node: process.version, platform: process.platform },
    sourceArtifacts: [],
  };
}

function preflightFixture() {
  const mkJob = (visibility: "public" | "private") => {
    const geometry = streamingTransactionGeometry(101, visibility);
    const gas =
      visibility === "public"
        ? {
            modelPublication: "1169682",
            sampleRegistration: "115291",
            jobCreation: "321170",
            streamingUploadCompute: "9913980",
            finalize: "169898",
            totalExcludingDeployment: "11690021",
          }
        : {
            modelPublication: "10687063",
            sampleRegistration: "115291",
            jobCreation: "326695",
            streamingUploadCompute: "12208933",
            finalize: "169898",
            totalExcludingDeployment: "23507880",
          };
    return {
      visibility,
      encodedPositions: 101,
      transactionCount: geometry.total,
      computeTransactions: geometry.uploadAndCompute,
      gas,
    };
  };
  return {
    evidenceClass: "Hardhat mock",
    deployment: {
      totalDeploymentGas: "5892613",
      contracts: [{ contract: "a" }, { contract: "b" }, { contract: "c" }, { contract: "d" }],
    },
    jobs: [mkJob("public"), mkJob("private")],
  };
}

function profileFixture(nominalVariants: number) {
  const vectorLength = nominalVariants + 1;
  const geometry = streamingTransactionGeometry(vectorLength, "public");
  return {
    fixtureSize: nominalVariants,
    vectorLength,
    uploadChunkSize: 32,
    computeChunkSize: 20,
    evidenceClass: "Hardhat mock",
    status: "full_flow",
    transactions: {
      modelPublication: geometry.modelPublication,
      sampleRegistration: 1,
      streaming: {
        jobCreation: 1,
        uploadAndCompute: geometry.uploadAndCompute,
        resultFinalization: 1,
        totalIncludingModelAndSample: geometry.total,
      },
    },
    streamingGas: { total: "1" },
  };
}

describe("Phase 8 evidence synthesis", function () {
  it("uses ceiling division at chunk boundaries", function () {
    expect(ceilDiv(32, 32)).to.equal(1);
    expect(ceilDiv(33, 32)).to.equal(2);
    expect(ceilDiv(101, 20)).to.equal(6);
  });

  it("reproduces the measured public and private 100-SNP transaction counts", function () {
    expect(streamingTransactionGeometry(101, "public").total).to.equal(15);
    expect(streamingTransactionGeometry(101, "private").total).to.equal(17);
  });

  it("reproduces the measured public fixture transaction series", function () {
    expect(
      [101, 501, 1001, 5001].map(
        (positions) => streamingTransactionGeometry(positions, "public").total
      )
    ).to.deep.equal([15, 47, 88, 413]);
  });

  it("marks every larger projection unexecuted and keeps live rows empty", function () {
    const scale = buildScaleEvidence(
      [100, 500, 1000, 5000].map(profileFixture) as any,
      preflightFixture(),
      provenanceFixture()
    );
    const projections = scale.rows.filter(
      (row: any) => row.evidenceClass === "Analytic projection"
    );
    expect(projections).to.have.lengthOf(6);
    expect(projections.every((row: any) => row.executionStatus === "unexecuted")).to.equal(true);
    expect(scale.liveFhevm.successfulRows).to.deep.equal([]);
  });

  it("parses the saved release-policy measurements", function () {
    const text = fs.readFileSync(
      path.join(REPO_ROOT, "evidence", "phase2", "release_policy_gas.txt"),
      "utf8"
    );
    expect(parseReleasePolicyGas(text)).to.deep.equal({
      setReleasePolicy: "77314",
      finalizeAndClassify: "432230",
    });
  });

  it("rejects a machine-readable total that does not equal its components", function () {
    const broken = preflightFixture();
    broken.jobs[0].gas.totalExcludingDeployment = "1";
    expect(() =>
      buildTransactionUse(
        broken,
        { setReleasePolicy: "77314", finalizeAndClassify: "432230" },
        provenanceFixture()
      )
    ).to.throw(/components do not sum/);
  });

  it("keeps fee conversion analytic and omits USD", function () {
    const transactionUse = buildTransactionUse(
      preflightFixture(),
      { setReleasePolicy: "77314", finalizeAndClassify: "432230" },
      provenanceFixture()
    );
    const fee = buildFeeSensitivity(transactionUse, provenanceFixture());
    expect(fee.evidenceClass).to.equal("Analytic projection");
    expect(fee.executionStatus).to.equal("unexecuted");
    expect(fee.usdConversion).to.equal(null);
    const oneGwei = fee.quantities[0].scenarios.find(
      (scenario) => scenario.hypotheticalGasPriceGwei === "1"
    );
    expect(oneGwei?.feeEth).to.equal("0.005892613");
  });
});
