import * as fs from "fs";
import * as path from "path";
import { assertProvenanceHash, hashFile } from "./utils/provenance";

const REPO_ROOT = path.join(__dirname, "..");
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, "evidence", "phase8");
const UPLOAD_CHUNK_SIZE = 32;
const COMPUTE_CHUNK_SIZE = 20;

type Visibility = "public" | "private";

interface FixtureProfile {
  fixtureSize: number;
  vectorLength: number;
  uploadChunkSize: number;
  computeChunkSize: number;
  evidenceClass: string;
  status: string;
  transactions: {
    modelPublication: number;
    sampleRegistration: number;
    streaming: {
      jobCreation: number;
      uploadAndCompute: number;
      resultFinalization: number;
      totalIncludingModelAndSample: number;
    };
  };
  streamingGas: {
    total: string;
  };
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Evidence summary: ${message}`);
}

export function ceilDiv(value: number, divisor: number): number {
  requireCondition(Number.isSafeInteger(value) && value > 0, "value must be a positive safe integer");
  requireCondition(Number.isSafeInteger(divisor) && divisor > 0, "divisor must be a positive safe integer");
  return Math.floor((value + divisor - 1) / divisor);
}

export function streamingTransactionGeometry(
  encodedPositions: number,
  visibility: Visibility
) {
  const modelUploadChunks = ceilDiv(encodedPositions, UPLOAD_CHUNK_SIZE);
  const uploadAndCompute = ceilDiv(encodedPositions, COMPUTE_CHUNK_SIZE);
  const transactionsToAllowPrivateWeightUse = visibility === "private" ? 2 : 0;
  const modelPublication = 1 + modelUploadChunks + transactionsToAllowPrivateWeightUse + 1;
  const sampleRegistration = 1;
  const jobCreation = 1;
  const resultFinalization = 1;
  return {
    modelPublication,
    modelUploadChunks,
    ...(transactionsToAllowPrivateWeightUse > 0
      ? { transactionsToAllowPrivateWeightUse }
      : {}),
    sampleRegistration,
    calculationCreation: jobCreation,
    inputUploadAndCalculation: uploadAndCompute,
    resultFinalization,
    total:
      modelPublication +
      sampleRegistration +
      jobCreation +
      uploadAndCompute +
      resultFinalization,
  };
}

export function parseReleasePolicyGas(text: string) {
  const policy = text.match(/setReleasePolicy gas\s*:\s*(\d+)/);
  const classify = text.match(/finalizeAndClassify gas\s*:\s*(\d+)/);
  requireCondition(policy, "setReleasePolicy gas is missing from the saved measurement");
  requireCondition(classify, "finalizeAndClassify gas is missing from the saved measurement");
  return {
    setReleasePolicy: policy[1],
    finalizeAndClassify: classify[1],
  };
}

export function liveClassicTransactionBreakdown(report: any) {
  requireCondition(report.evidenceClass === "Live fhEVM", "Sepolia input label changed");
  requireCondition(report.fheMode === "real", "live report is not real FHE");
  requireCondition(report.modelVisibility === "public", "live report is not public-weight");
  requireCondition(report.passed === true, "live public validation did not pass");
  requireCondition(
    report.decodedEncodedScore === report.expectedEncodedScore,
    "live public score does not match the reference"
  );
  requireCondition(
    Array.isArray(report.transactions) &&
      report.transactions.length === report.transactionCount,
    "live transaction count does not match its receipt array"
  );
  requireCondition(
    report.transactions.every((transaction: any) => transaction.status === 1),
    "live transaction trail contains a non-success receipt"
  );
  const labels = report.transactions.map((transaction: any) => transaction.label as string);
  const count = (predicate: (label: string) => boolean) => labels.filter(predicate).length;
  const breakdown = {
    modelPublication: count((label) => label.startsWith("model.")),
    sampleRegistration: count((label) => label === "sample.register"),
    calculationCreation: count((label) => label === "job.create"),
    inputUploads: count((label) => label.startsWith("job.appendSnpChunk.")),
    inputUploadFinalization: count((label) => label === "job.finalizeSnpUpload"),
    calculation: count((label) => label.startsWith("job.computeChunk.")),
    resultFinalization: count((label) => label === "job.finalize"),
    total: labels.length,
  };
  requireCondition(
    Object.values(breakdown).slice(0, -1).reduce((sum, value) => sum + value, 0) ===
      breakdown.total,
    "live transaction labels do not reconcile"
  );
  const gasSum = report.transactions.reduce(
    (sum: bigint, transaction: any) => sum + BigInt(transaction.gasUsed),
    0n
  );
  requireCondition(gasSum === BigInt(report.gas.total), "live gas total does not reconcile");
  return breakdown;
}

export function buildScaleEvidence(
  profiles: FixtureProfile[],
  preflight: any,
  livePublic: any
) {
  const expectedSizes = [100, 500, 1_000, 5_000];
  requireCondition(
    JSON.stringify(profiles.map((profile) => profile.fixtureSize)) === JSON.stringify(expectedSizes),
    `fixture profiles must be ordered ${expectedSizes.join(", ")}`
  );

  const liveBreakdown = liveClassicTransactionBreakdown(livePublic);
  const liveEncodedPositions =
    livePublic.provenance?.model?.descriptor?.encodedPositions;
  requireCondition(
    Number.isSafeInteger(liveEncodedPositions) && liveEncodedPositions > 0,
    "live encoded-position count is missing from provenance"
  );
  const rows: any[] = [{
    setting: "Sepolia",
    variantCount: livePublic.fixtureSize,
    leadingConstantIncluded: true,
    weightVisibility: "public",
    calculation:
      "public weights + registered sample + one calculation using separate upload and calculation transactions; deployments excluded",
    transactionCount: livePublic.transactionCount,
    transactionBreakdown: liveBreakdown,
    gas: livePublic.gas.total,
    decodedEncodedScore: livePublic.decodedEncodedScore,
    timing: {
      description: "measured Sepolia submission-to-result and user-decryption time",
      inputPreparationMs: livePublic.timing.inputProofPreparationMs,
      submissionToResultMs: livePublic.timing.submissionToResultMs,
      endToEndValidationMs: livePublic.timing.endToEndValidationMs,
      decryptMs: livePublic.timing.decryptMs,
    },
    costNote: "Sepolia gas is reported; no production fee is inferred.",
  }];
  for (const profile of profiles) {
    requireCondition(profile.evidenceClass === "Hardhat mock", "local profile input label changed");
    requireCondition(profile.status === "full_flow", `fixture ${profile.fixtureSize} did not complete`);
    requireCondition(
      profile.uploadChunkSize === UPLOAD_CHUNK_SIZE &&
        profile.computeChunkSize === COMPUTE_CHUNK_SIZE,
      `fixture ${profile.fixtureSize} used unexpected chunk sizes`
    );
    const expected = streamingTransactionGeometry(profile.vectorLength, "public");
    requireCondition(
      profile.transactions.streaming.totalIncludingModelAndSample === expected.total,
      `fixture ${profile.fixtureSize} transaction count does not match the executed geometry`
    );
    rows.push({
      setting: "local simulation",
      variantCount: profile.fixtureSize,
      leadingConstantIncluded: true,
      weightVisibility: "public",
      calculation:
        "public weights + registered sample + one calculation; contract deployments excluded",
      transactionCount: expected.total,
      transactionBreakdown: expected,
      timingNote:
        "Time was measured in a local contract simulation, not on a live network.",
      costNote: "Local gas is reported; no production fee is inferred.",
    });
  }

  const privateJob = preflight.jobs.find((job: any) => job.visibility === "private");
  requireCondition(privateJob, "the private-weight local result is missing");
  const privateExpected = streamingTransactionGeometry(privateJob.encodedPositions, "private");
  requireCondition(
    privateExpected.total === privateJob.transactionCount,
    "the private transaction count does not reconcile"
  );
  rows.splice(2, 0, {
    setting: "local simulation",
    variantCount: 100,
    leadingConstantIncluded: true,
    weightVisibility: "private",
    calculation:
      "private weights + two transactions that record who may use them and receive the result + registered sample + one calculation; deployments excluded",
    transactionCount: privateExpected.total,
    transactionBreakdown: privateExpected,
    timingNote: "Transactions and local gas were recorded; elapsed time was not recorded.",
    costNote: "Local gas is reported; no production fee is inferred.",
  });

  return {
    title: "Scale results",
    setup: {
      settings: ["Sepolia", "local simulation"],
      publicSepoliaCalculation: {
        variantCount: livePublic.fixtureSize,
        leadingConstantIncluded: true,
        weightVisibility: "public",
        transactionCount: livePublic.transactionCount,
        gas: livePublic.gas.total,
        decodedEncodedScore: livePublic.decodedEncodedScore,
      },
      privateWeights:
        "evaluated only by local simulation; it was not evaluated on Sepolia",
    },
    interpretation:
      "The public 100-SNP Classic calculation completed successfully on Sepolia. Streaming calculations with public weights for 100, 500, 1,000, and 5,000 variants and a 100-SNP Streaming calculation with private weights completed in a local contract simulation. The contracts process larger models in repeated groups, but no Sepolia Streaming calculation is reported. The local results do not measure live network time or production cost.",
    results: rows,
  };
}

export function buildTransactionUse(
  preflight: any,
  policyGas: ReturnType<typeof parseReleasePolicyGas>,
  liveDeployment: any,
  livePublic: any,
  matchedPublicMock: any,
  liveVerification: any
) {
  requireCondition(preflight.evidenceClass === "Hardhat mock", "local pre-flight input label changed");
  const calculationRecords = Object.fromEntries(
    preflight.jobs.map((job: any) => [job.visibility, job])
  ) as Record<Visibility, any>;

  for (const visibility of ["public", "private"] as const) {
    const calculationRecord = calculationRecords[visibility];
    requireCondition(calculationRecord, `${visibility} local calculation record is missing`);
    const componentSum = [
      "modelPublication",
      "sampleRegistration",
      "jobCreation",
      "streamingUploadCompute",
      "finalize",
    ].reduce((sum, key) => sum + BigInt(calculationRecord.gas[key]), 0n);
    requireCondition(
      componentSum === BigInt(calculationRecord.gas.totalExcludingDeployment),
      `${visibility} pre-flight gas components do not sum to the recorded total`
    );
    requireCondition(
      streamingTransactionGeometry(calculationRecord.encodedPositions, visibility).total ===
        calculationRecord.transactionCount,
      `${visibility} transaction count does not reconcile`
    );
  }

  const publicCalculation = calculationRecords.public;
  const privateCalculation = calculationRecords.private;
  const liveBreakdown = liveClassicTransactionBreakdown(livePublic);
  requireCondition(
    liveDeployment.evidenceClass === "Live fhEVM" &&
      liveDeployment.transactionCount === liveDeployment.transactions.length &&
      liveDeployment.transactions.every((transaction: any) => transaction.status === 1),
    "live deployment receipts are incomplete"
  );
  const liveDeploymentGas = liveDeployment.transactions.reduce(
    (sum: bigint, transaction: any) => sum + BigInt(transaction.gasUsed),
    0n
  );
  requireCondition(
    liveDeploymentGas === BigInt(liveDeployment.totalDeploymentGas),
    "live deployment gas does not reconcile"
  );
  requireCondition(
    liveVerification.deployment.transactionsVerified === liveDeployment.transactionCount &&
      liveVerification.deployment.totalGas === liveDeployment.totalDeploymentGas,
    "live deployment verification does not match the report"
  );
  requireCondition(
    liveVerification.publicValidation.transactionsVerified === livePublic.transactionCount &&
      liveVerification.publicValidation.totalGas === livePublic.gas.total &&
      liveVerification.publicValidation.decodedEncodedScore ===
        livePublic.decodedEncodedScore,
    "live public verification does not match the report"
  );
  requireCondition(
    matchedPublicMock.evidenceClass === "Hardhat mock" &&
      matchedPublicMock.fheMode === "mock" &&
      matchedPublicMock.passed === true &&
      matchedPublicMock.computeChunkSize === livePublic.computeChunkSize &&
      matchedPublicMock.uploadChunkSize === livePublic.uploadChunkSize &&
      matchedPublicMock.transactionCount === livePublic.transactionCount &&
      matchedPublicMock.decodedEncodedScore === livePublic.decodedEncodedScore,
    "the local comparison does not match the Sepolia public calculation"
  );
  const matchedMockGas = matchedPublicMock.transactions.reduce(
    (sum: bigint, transaction: any) => sum + BigInt(transaction.gasUsed),
    0n
  );
  requireCondition(
    matchedMockGas === BigInt(matchedPublicMock.gas.total),
    "geometry-matched mock gas does not reconcile"
  );
  const liveGasDelta = BigInt(livePublic.gas.total) - matchedMockGas;
  const localCalculation = (record: any, visibility: Visibility) => ({
    setting: "local simulation",
    weightVisibility: visibility,
    transactionCount: record.transactionCount,
    gas: {
      modelPublication: record.gas.modelPublication,
      sampleRegistration: record.gas.sampleRegistration,
      calculationCreation: record.gas.jobCreation,
      inputUploadAndCalculation: record.gas.streamingUploadCompute,
      resultFinalization: record.gas.finalize,
      totalExcludingDeployment: record.gas.totalExcludingDeployment,
    },
    transactionBreakdown: streamingTransactionGeometry(
      record.encodedPositions,
      visibility
    ),
  });
  return {
    title: "Measured transaction use",
    summary:
      "Sepolia deployment plus one public 100-SNP calculation. The calculation with private weights was evaluated only in a local contract simulation. No production or USD cost is inferred.",
    localDeployment: {
      setting: "local simulation",
      transactionCount: preflight.deployment.contracts.length,
      gas: preflight.deployment.totalDeploymentGas,
      contracts: preflight.deployment.contracts,
    },
    sepoliaDeployment: {
      setting: "Sepolia",
      transactionCount: liveDeployment.transactionCount,
      gas: liveDeployment.totalDeploymentGas,
      feePaidEth: liveVerification.deployment.feePaid.eth,
      blockRange: "11388858-11388861",
    },
    sepoliaPublicCalculation: {
      setting: "Sepolia",
      weightVisibility: livePublic.modelVisibility,
      method: "Classic method (stored inputs)",
      calculation: "separate input-upload and calculation transactions",
      transactionCount: livePublic.transactionCount,
      transactionBreakdown: liveBreakdown,
      gas: {
        sampleRegistration: livePublic.gas.sampleRegistration,
        modelPublication: livePublic.gas.publishModel,
        calculationCreation: livePublic.gas.createJob,
        inputUploads: livePublic.gas.uploadSnps,
        inputUploadFinalization: livePublic.gas.finalizeSnpUpload,
        calculation: livePublic.gas.compute,
        resultFinalization: livePublic.gas.finalize,
        total: livePublic.gas.total,
      },
      timing: {
        inputPreparationMs: livePublic.timing.inputProofPreparationMs,
        submissionToResultMs: livePublic.timing.submissionToResultMs,
        inputPreparationThroughValidationMs: livePublic.timing.endToEndValidationMs,
        decryptionMs: livePublic.timing.decryptMs,
      },
      decodedEncodedScore: livePublic.decodedEncodedScore,
      expectedEncodedScore: livePublic.expectedEncodedScore,
      feePaidEth: liveVerification.publicValidation.feePaid.eth,
    },
    matchedLocalPublicCalculation: {
      setting: "local simulation",
      method: "Classic method (stored inputs)",
      computeChunkSize: matchedPublicMock.computeChunkSize,
      uploadChunkSize: matchedPublicMock.uploadChunkSize,
      transactionCount: matchedPublicMock.transactionCount,
      gas: {
        sampleRegistration: matchedPublicMock.gas.sampleRegistration,
        modelPublication: matchedPublicMock.gas.publishModel,
        calculationCreation: matchedPublicMock.gas.createJob,
        inputUploads: matchedPublicMock.gas.uploadSnps,
        inputUploadFinalization: matchedPublicMock.gas.finalizeSnpUpload,
        calculation: matchedPublicMock.gas.compute,
        resultFinalization: matchedPublicMock.gas.finalize,
        total: matchedPublicMock.gas.total,
      },
      timing: {
        inputPreparationMs: matchedPublicMock.timing.inputProofPreparationMs,
        submissionToResultMs: matchedPublicMock.timing.submissionToResultMs,
        inputPreparationThroughValidationMs: matchedPublicMock.timing.endToEndValidationMs,
        decryptionMs: matchedPublicMock.timing.decryptMs,
      },
      decodedEncodedScore: matchedPublicMock.decodedEncodedScore,
    },
    sepoliaAndMatchedLocalComparison: {
      comparisonScope:
        "same public 100-SNP data, upload groups of 32, calculation groups of 10, and 25 transactions",
      gasDelta: liveGasDelta.toString(),
      sepoliaOverLocalPercent: (
        Number(liveGasDelta) * 100 / Number(matchedMockGas)
      ).toFixed(2),
      interpretation:
        "The Sepolia total was 10.42% above the matched local observation. This one comparison does not establish a general conversion between local and Sepolia gas.",
    },
    localCalculations: {
      method: "Streaming method",
      public: localCalculation(publicCalculation, "public"),
      private: localCalculation(privateCalculation, "private"),
    },
    resultOptions: {
      categorySetup: {
        setting: "local simulation",
        transactionCount: 1,
        gas: policyGas.setReleasePolicy,
        scope: "one transaction when a model is configured",
      },
      rawScore: {
        setting: "local simulation",
        transactionCount: 1,
        gas: publicCalculation.gas.finalize,
        scope: "100-SNP local calculation",
      },
      categoryWithRandomAddition: {
        setting: "local simulation",
        transactionCount: 1,
        gas: policyGas.finalizeAndClassify,
        scope:
          "separate local measurement; this is used instead of raw-score finalization",
      },
      decryption: {
        onChainTransactionCount: 0,
        publicSepoliaTimeMs: livePublic.timing.decryptMs,
        note:
          "User decryption does not add an Ethereum transaction. The public Sepolia decryption time was measured; the calculation with private weights was evaluated only by local simulation.",
      },
    },
    productionUsdCost: {
      available: false,
      reason:
        "No documented current production fee schedule or production deployment measurement exists.",
    },
  };
}

function formatEthFromWei(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function buildFeeSensitivity(
  transactionUse: ReturnType<typeof buildTransactionUse>
) {
  const quantities = [
    {
      label: "four-contract deployment",
      gas: BigInt(transactionUse.localDeployment.gas),
    },
    {
      label: "public 100-SNP calculation, excluding deployment",
      gas: BigInt(transactionUse.localCalculations.public.gas.totalExcludingDeployment),
    },
    {
      label: "private 100-SNP calculation, excluding deployment",
      gas: BigInt(transactionUse.localCalculations.private.gas.totalExcludingDeployment),
    },
  ];
  const gasPrices = [
    { gwei: "0.01", wei: 10_000_000n },
    { gwei: "0.1", wei: 100_000_000n },
    { gwei: "1", wei: 1_000_000_000n },
    { gwei: "10", wei: 10_000_000_000n },
    { gwei: "30", wei: 30_000_000_000n },
  ];
  return {
    title: "Calculated fee examples",
    setting: "calculated estimate",
    formula: "fee_ETH = local_gas * example_gas_price_wei / 1e18",
    interpretation:
      "These values are calculated examples using gas from a local contract simulation. They are not production prices or live-network measurements.",
    usdConversion: "not provided because no production fee schedule was documented",
    quantities: quantities.map((quantity) => ({
      label: quantity.label,
      sourceGas: quantity.gas.toString(),
      scenarios: gasPrices.map((price) => ({
        exampleGasPriceGwei: price.gwei,
        feeEth: formatEthFromWei(quantity.gas * price.wei),
      })),
    })),
  };
}

function formatInteger(value: number | string): string {
  return BigInt(value).toLocaleString("en-US");
}

export function renderScaleMarkdown(scale: ReturnType<typeof buildScaleEvidence>): string {
  const lines = [
    "# Scale results",
    "",
    "One public-weight 100-SNP calculation completed on **Sepolia** using the **Classic method (stored",
    "inputs)**. The remaining rows used the **Streaming method** in a **local contract simulation**.",
    "These local results do not measure live network time or production cost.",
    "",
    "The contracts process larger models in repeated groups and do not impose a fixed 100-variant",
    "model limit. The Streaming calculations at all four sizes were evaluated only in the local",
    "simulation. The table therefore contains no Sepolia Streaming row.",
    "",
    "The transaction count includes model publication, sample registration, and one score calculation;",
    "contract deployment is excluded. The Sepolia row stores inputs before calculation, while the",
    "local rows combine input upload and calculation. Each data set also contains one leading constant",
    "used in the calculation; it is not an additional variant. The maximum evaluated model contains",
    "5,000 variants.",
    "",
    "| Setting | Method | Model | Variants | Transactions | Timing and cost |",
    "|---|---|---|---:|---:|---|",
  ];
  for (const row of scale.results) {
    const availability =
      row.setting === "Sepolia"
        ? "Sepolia time and gas; no production fee"
        : row.timingNote.startsWith("Time was measured")
        ? "local time and gas; no production fee"
        : "local gas only; no Sepolia time or production fee";
    const setting = row.setting === "Sepolia" ? "Public Sepolia" : "Local simulation";
    const method = row.setting === "Sepolia"
      ? "Classic method (stored inputs)"
      : "Streaming method";
    const model = row.weightVisibility === "private" ? "Private-weight" : "Public-weight";
    lines.push(
      `| ${setting} | ${method} | ${model} | ${formatInteger(row.variantCount)} | ` +
        `${formatInteger(row.transactionCount)} | ${availability} |`
    );
  }
  lines.push(
    "",
    "The private-weight calculation was evaluated only in local simulation, not on Sepolia. The",
    "table above reports the completed measurements used in the manuscript and response. See the",
    "[Sepolia Streaming calculation status](../sepolia_streaming_2026-08-01/README.md)."
  );
  return lines.join("\n") + "\n";
}

export function renderTransactionUseMarkdown(
  transactionUse: ReturnType<typeof buildTransactionUse>
): string {
  const pub = transactionUse.localCalculations.public;
  const priv = transactionUse.localCalculations.private;
  const sepolia = transactionUse.sepoliaPublicCalculation;
  const lines = [
    "# Transaction use",
    "",
    "The tables separate **public Sepolia** measurements from a **local contract simulation**. The",
    "local results do not measure live network time or production cost. The private-weight",
    "calculation was evaluated only in local simulation, not on Sepolia.",
    "",
    "The contracts can process a larger model through repeated groups, but the Streaming calculations",
    "at all four sizes were evaluated only in the local simulation. This document therefore contains",
    "no Sepolia Streaming gas, time, or score row.",
    "",
    "## Public Sepolia",
    "",
    "| Operation | Model | Transactions | Gas | Sepolia ETH fee | Time or result |",
    "|---|---|---:|---:|---:|---|",
    `| Four-contract deployment | Shared | ${transactionUse.sepoliaDeployment.transactionCount} | ${formatInteger(transactionUse.sepoliaDeployment.gas)} | ${transactionUse.sepoliaDeployment.feePaidEth} ETH | completed |`,
    `| Classic method (stored inputs), full 100-SNP calculation | Public-weight | ${sepolia.transactionCount} | ${formatInteger(sepolia.gas.total)} | ${sepolia.feePaidEth} ETH | ${(sepolia.timing.submissionToResultMs / 1000).toFixed(1)} s from submission to result; ${(sepolia.timing.decryptionMs / 1000).toFixed(1)} s decryption; decoded ${formatInteger(sepolia.decodedEncodedScore)} |`,
    `| User decryption | Public-weight | 0 on-chain | n/a | included above | ${(sepolia.timing.decryptionMs / 1000).toFixed(1)} s |`,
    "",
    "Sepolia ETH has no production-price interpretation. The same public-weight calculation, using",
    `the Classic method and the same ${sepolia.transactionCount}-transaction arrangement in local simulation, used ${formatInteger(transactionUse.matchedLocalPublicCalculation.gas.total)}`,
    `gas. The Sepolia total was ${transactionUse.sepoliaAndMatchedLocalComparison.sepoliaOverLocalPercent}% higher in this comparison, which does not provide a general`,
    "conversion between local and Sepolia gas.",
    "",
    "## Local simulation",
    "",
    "The local calculations below used the **Streaming method**.",
    "",
    "| Operation | Model | Transactions | Local gas | Note |",
    "|---|---|---:|---:|---|",
    `| Four-contract deployment | Shared | ${transactionUse.localDeployment.transactionCount} | ${formatInteger(transactionUse.localDeployment.gas)} | local measurement |`,
    `| Model publication | Public-weight | ${pub.transactionBreakdown.modelPublication} | ${formatInteger(pub.gas.modelPublication)} | includes the model record |`,
    `| Model publication | Private-weight | ${priv.transactionBreakdown.modelPublication} | ${formatInteger(priv.gas.modelPublication)} | includes records stating who may calculate and receive the result |`,
    `| Sample registration | Public-weight / private-weight | 1 | ~${formatInteger(Math.round(Number(pub.gas.sampleRegistration) / 1000) * 1000)} | encrypted-data total rounded |`,
    `| Calculation creation | Public-weight | 1 | ${formatInteger(pub.gas.calculationCreation)} | local measurement |`,
    `| Calculation creation | Private-weight | 1 | ${formatInteger(priv.gas.calculationCreation)} | local measurement |`,
    `| Streaming method: upload and calculation | Public-weight | ${pub.transactionBreakdown.inputUploadAndCalculation} | ${(Number(pub.gas.inputUploadAndCalculation) / 1e6).toFixed(3)} M | encrypted-data total rounded |`,
    `| Streaming method: upload and calculation | Private-weight | ${priv.transactionBreakdown.inputUploadAndCalculation} | ${(Number(priv.gas.inputUploadAndCalculation) / 1e6).toFixed(3)} M | encrypted-data total rounded |`,
    `| Return raw score | Raw result | 1 | ${formatInteger(pub.gas.resultFinalization)} | local measurement |`,
    `| Return category with random addition | Category | 1 | ${formatInteger(transactionUse.resultOptions.categoryWithRandomAddition.gas)} | used instead of returning a raw score |`,
    `| **Streaming method, full 100-SNP calculation** | **Public-weight** | **${pub.transactionCount}** | **${(Number(pub.gas.totalExcludingDeployment) / 1e6).toFixed(3)} M** | deployment excluded |`,
    `| **Streaming method, full 100-SNP calculation** | **Private-weight** | **${priv.transactionCount}** | **${(Number(priv.gas.totalExcludingDeployment) / 1e6).toFixed(3)} M** | deployment excluded |`,
    "",
    `Storing the result categories uses one transaction and ${formatInteger(transactionUse.resultOptions.categorySetup.gas)} gas in local simulation. It is not`,
    "included in the raw-score totals above.",
    "",
    "The [calculated fee examples](fee_sensitivity.md) use the local gas values reported above. The",
    "[Sepolia Streaming calculation status](../sepolia_streaming_2026-08-01/README.md) records why no",
    "new live result is included."
  ];
  return lines.join("\n") + "\n";
}

export function renderFeeSensitivityMarkdown(
  fee: ReturnType<typeof buildFeeSensitivity>
): string {
  const prices = fee.quantities[0].scenarios.map(
    (scenario: any) => scenario.exampleGasPriceGwei
  );
  const lines = [
    "# Calculated fee examples",
    "",
    "Each **calculated fee example** multiplies measured gas from local simulation by a stated gas",
    "price. It is not an observed network cost. No USD conversion is provided because there is no",
    "documented production fee schedule.",
    "",
    `| Quantity | Source gas | ${prices.map((price: string) => `${price} gwei`).join(" | ")} |`,
    `|---|---:|${prices.map(() => "---:").join("|")}|`,
  ];
  for (const [index, quantity] of fee.quantities.entries()) {
    const displayLabel = index === 0
      ? "Four-contract deployment"
      : index === 1
      ? "Streaming method, public-weight 100-SNP calculation, excluding deployment"
      : "Streaming method, private-weight 100-SNP calculation, excluding deployment";
    lines.push(
      `| ${displayLabel} | ${formatInteger(quantity.sourceGas)} | ` +
        `${quantity.scenarios.map((scenario: any) => scenario.feeEth).join(" | ")} |`
    );
  }
  lines.push(
    "",
    "All table values are ETH and use `fee = measured gas × stated gas price`. They are not observed",
    "network costs, production prices, or evidence of affordability."
  );
  return lines.join("\n") + "\n";
}

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function main() {
  const outDir = process.env.PHASE8_OUT_DIR
    ? path.resolve(process.env.PHASE8_OUT_DIR)
    : DEFAULT_OUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  const profilePath = path.join(outDir, "heprs_profile.json");
  const preflightPath = path.join(REPO_ROOT, "evidence", "phase7", "live_preflight.json");
  const policyPath = path.join(REPO_ROOT, "evidence", "phase2", "release_policy_gas.txt");
  const liveDir = path.join(REPO_ROOT, "evidence", "phase7", "live_2026-07-31");
  const liveDeploymentPath = path.join(liveDir, "deployment.json");
  const livePublicPath = path.join(liveDir, "public_success.json");
  const matchedPublicMockPath = path.join(liveDir, "public_matched_mock.json");
  const liveVerificationPath = path.join(liveDir, "onchain_verification.json");
  const sourcePaths = [
    profilePath,
    preflightPath,
    policyPath,
    liveDeploymentPath,
    livePublicPath,
    matchedPublicMockPath,
    liveVerificationPath,
  ];
  for (const sourcePath of sourcePaths) {
    requireCondition(fs.existsSync(sourcePath), `missing source artifact ${sourcePath}`);
    assertProvenanceHash(hashFile(sourcePath).hash, path.basename(sourcePath));
  }

  const profiles = JSON.parse(fs.readFileSync(profilePath, "utf8")) as FixtureProfile[];
  const preflight = JSON.parse(fs.readFileSync(preflightPath, "utf8"));
  const policyGas = parseReleasePolicyGas(fs.readFileSync(policyPath, "utf8"));
  const liveDeployment = JSON.parse(fs.readFileSync(liveDeploymentPath, "utf8"));
  const livePublic = JSON.parse(fs.readFileSync(livePublicPath, "utf8"));
  const matchedPublicMock = JSON.parse(fs.readFileSync(matchedPublicMockPath, "utf8"));
  const liveVerification = JSON.parse(fs.readFileSync(liveVerificationPath, "utf8"));
  const scale = buildScaleEvidence(profiles, preflight, livePublic);
  const transactionUse = buildTransactionUse(
    preflight,
    policyGas,
    liveDeployment,
    livePublic,
    matchedPublicMock,
    liveVerification
  );
  const fee = buildFeeSensitivity(transactionUse);

  writeJson(path.join(outDir, "scale_evidence.json"), scale);
  fs.writeFileSync(path.join(outDir, "scale_evidence.md"), renderScaleMarkdown(scale));
  writeJson(path.join(outDir, "measured_transaction_use.json"), transactionUse);
  fs.writeFileSync(
    path.join(outDir, "measured_transaction_use.md"),
    renderTransactionUseMarkdown(transactionUse)
  );
  writeJson(path.join(outDir, "fee_sensitivity.json"), fee);
  fs.writeFileSync(path.join(outDir, "fee_sensitivity.md"), renderFeeSensitivityMarkdown(fee));

  console.log("Evidence summary complete");
  console.log(`  scale rows            : ${scale.results.length}, including one Sepolia row`);
  console.log(`  Sepolia public 100-SNP: ${transactionUse.sepoliaPublicCalculation.transactionCount} tx`);
  console.log(`  local public/private  : ${transactionUse.localCalculations.public.transactionCount}/${transactionUse.localCalculations.private.transactionCount} tx`);
  console.log(`  output directory      : ${outDir}`);
}

if (require.main === module) {
  main();
}
