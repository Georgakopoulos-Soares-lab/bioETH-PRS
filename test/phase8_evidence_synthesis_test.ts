import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

import {
  buildFeeSensitivity,
  buildScaleEvidence,
  buildTransactionUse,
  ceilDiv,
  parseReleasePolicyGas,
  renderScaleMarkdown,
  renderTransactionUseMarkdown,
  streamingTransactionGeometry,
} from "../scripts/phase8_evidence_synthesis";

const REPO_ROOT = path.join(__dirname, "..");

function keysAtAllLevels(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysAtAllLevels);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    key,
    ...keysAtAllLevels(child),
  ]);
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
      computeTransactions: geometry.inputUploadAndCalculation,
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
        uploadAndCompute: geometry.inputUploadAndCalculation,
        resultFinalization: 1,
        totalIncludingModelAndSample: geometry.total,
      },
    },
    streamingGas: { total: "1" },
  };
}

function livePublicFixture() {
  const labels = [
    "sample.register",
    "model.createShell",
    "model.appendPublicChunk.0",
    "model.appendPublicChunk.1",
    "model.appendPublicChunk.2",
    "model.appendPublicChunk.3",
    "model.finalize",
    "job.create",
    "job.appendSnpChunk.0",
    "job.appendSnpChunk.1",
    "job.appendSnpChunk.2",
    "job.appendSnpChunk.3",
    "job.finalizeSnpUpload",
    ...Array.from({ length: 11 }, (_, i) => `job.computeChunk.${i}`),
    "job.finalize",
  ];
  return {
    network: "sepolia",
    chainId: "11155111",
    evidenceClass: "Live fhEVM",
    fheMode: "real",
    modelVisibility: "public",
    fixtureSize: 100,
    uploadChunkSize: 32,
    computeChunkSize: 10,
    passed: true,
    transactionCount: labels.length,
    transactions: labels.map((label) => ({ label, gasUsed: "1", status: 1 })),
    gas: { total: labels.length.toString() },
    timing: {
      inputProofPreparationMs: 66_101,
      submissionToResultMs: 269_320,
      endToEndValidationMs: 464_253,
      decryptMs: 8_081,
    },
    decodedEncodedScore: "758685",
    expectedEncodedScore: "758685",
    scoreHandle: "0xhandle",
    provenance: { model: { descriptor: { encodedPositions: 101 } } },
  };
}

function liveDeploymentFixture() {
  return {
    network: "sepolia",
    chainId: "11155111",
    evidenceClass: "Live fhEVM",
    transactionCount: 4,
    totalDeploymentGas: "4",
    transactions: Array.from({ length: 4 }, (_, i) => ({
      contract: `c${i}`,
      gasUsed: "1",
      status: 1,
    })),
    contracts: { a: "0x1" },
  };
}

function matchedPublicMockFixture() {
  const fixture = livePublicFixture();
  return {
    ...fixture,
    network: "chain-31337",
    chainId: "31337",
    evidenceClass: "Hardhat mock",
    fheMode: "mock",
    uploadChunkSize: 32,
    computeChunkSize: 10,
  };
}

function liveVerificationFixture() {
  return {
    deployment: {
      transactionsVerified: 4,
      totalGas: "4",
      feePaid: { wei: "4", eth: "0.000000000000000004" },
    },
    publicValidation: {
      transactionsVerified: 25,
      totalGas: "25",
      decodedEncodedScore: "758685",
      feePaid: { wei: "25", eth: "0.000000000000000025" },
    },
  };
}

describe("Evidence summary", function () {
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

  it("contains only measured rows up to 5,000 variants and one Sepolia row", function () {
    const scale = buildScaleEvidence(
      [100, 500, 1000, 5000].map(profileFixture) as any,
      preflightFixture(),
      livePublicFixture()
    );
    expect(scale.results.every((row: any) => row.variantCount <= 5000)).to.equal(true);
    expect(scale.results).to.have.lengthOf(6);
    expect([...new Set(scale.results.map((row: any) => row.setting))]).to.deep.equal([
      "Sepolia",
      "local simulation",
    ]);
    expect(scale.setup.publicSepoliaCalculation).to.include({
      variantCount: 100,
      leadingConstantIncluded: true,
      weightVisibility: "public",
      transactionCount: 25,
      decodedEncodedScore: "758685",
    });
    expect(
      scale.results.filter((row: any) => row.setting === "Sepolia")
    ).to.have.lengthOf(1);
    const markdown = renderScaleMarkdown(scale);
    expect(markdown).to.include("| Setting | Method | Model | Variants |");
    expect(markdown).to.include("local simulation");
    expect(markdown).not.to.include("Evidence class");
    expect(keysAtAllLevels(scale)).not.to.include.members([
      "action",
      "evidenceClass",
      "executionStatus",
      "workflow",
      "jobs",
      "provenance",
      "commit",
      "dirtyFiles",
      "producer",
      "runner",
      "gate",
    ]);
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
        liveDeploymentFixture(),
        livePublicFixture(),
        matchedPublicMockFixture(),
        liveVerificationFixture()
      )
    ).to.throw(/components do not sum/);
  });

  it("calculates fee examples and omits USD", function () {
    const transactionUse = buildTransactionUse(
      preflightFixture(),
      { setReleasePolicy: "77314", finalizeAndClassify: "432230" },
      liveDeploymentFixture(),
      livePublicFixture(),
      matchedPublicMockFixture(),
      liveVerificationFixture()
    );
    const fee = buildFeeSensitivity(transactionUse);
    const transactionMarkdown = renderTransactionUseMarkdown(transactionUse);
    expect(transactionMarkdown).to.include(
      "Classic method (stored inputs), full 100-SNP calculation"
    );
    expect(transactionMarkdown).to.include(
      "Streaming method, full 100-SNP calculation"
    );
    expect(transactionMarkdown).to.include("Calculation creation");
    expect(transactionMarkdown).not.to.include("Full 100-SNP job");
    expect(fee.setting).to.equal("calculated estimate");
    expect(fee.usdConversion).to.include("not provided");
    const oneGwei = fee.quantities[0].scenarios.find(
      (scenario) => scenario.exampleGasPriceGwei === "1"
    );
    expect(oneGwei?.feeEth).to.equal("0.005892613");
    expect(keysAtAllLevels(transactionUse)).not.to.include.members([
      "action",
      "evidenceClass",
      "executionStatus",
      "workflow",
      "jobs",
      "provenance",
      "commit",
      "dirtyFiles",
    ]);
    expect(keysAtAllLevels(fee)).not.to.include.members([
      "action",
      "evidenceClass",
      "executionStatus",
      "provenance",
      "commit",
      "dirtyFiles",
    ]);
  });
});
