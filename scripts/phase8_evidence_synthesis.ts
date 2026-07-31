import * as fs from "fs";
import * as path from "path";

import { gitInfo, hashedInput } from "./utils/provenance";

const REPO_ROOT = path.join(__dirname, "..");
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, "evidence", "phase8");
const UPLOAD_CHUNK_SIZE = 32;
const COMPUTE_CHUNK_SIZE = 20;
const PROJECTED_NOMINAL_VARIANTS = [10_000, 100_000, 1_000_000];

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

interface SynthesisProvenance {
  schema: string;
  repository: ReturnType<typeof gitInfo>;
  runtime: { node: string; platform: string };
  sourceArtifacts: ReturnType<typeof hashedInput>[];
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Phase 8 synthesis: ${message}`);
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
  const readerAuthorizations = visibility === "private" ? 2 : 0;
  const modelPublication = 1 + modelUploadChunks + readerAuthorizations + 1;
  const sampleRegistration = 1;
  const jobCreation = 1;
  const resultFinalization = 1;
  return {
    modelPublication,
    modelUploadChunks,
    readerAuthorizations,
    sampleRegistration,
    jobCreation,
    uploadAndCompute,
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
  requireCondition(policy, "setReleasePolicy gas is missing from the Phase 2 artifact");
  requireCondition(classify, "finalizeAndClassify gas is missing from the Phase 2 artifact");
  return {
    setReleasePolicy: policy[1],
    finalizeAndClassify: classify[1],
  };
}

function sourceProvenance(sourcePaths: string[]): SynthesisProvenance {
  return {
    schema: "bioeth-prs/evidence-synthesis/1",
    repository: gitInfo(),
    runtime: { node: process.version, platform: process.platform },
    sourceArtifacts: sourcePaths.map((sourcePath) =>
      hashedInput("source_evidence", sourcePath)
    ),
  };
}

export function buildScaleEvidence(
  profiles: FixtureProfile[],
  preflight: any,
  provenance: SynthesisProvenance
) {
  const expectedSizes = [100, 500, 1_000, 5_000];
  requireCondition(
    JSON.stringify(profiles.map((profile) => profile.fixtureSize)) === JSON.stringify(expectedSizes),
    `fixture profiles must be ordered ${expectedSizes.join(", ")}`
  );

  const rows: any[] = [];
  for (const profile of profiles) {
    requireCondition(profile.evidenceClass === "Hardhat mock", "fixture profile is not labelled Hardhat mock");
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
      evidenceClass: "Hardhat mock",
      executionStatus: "executed",
      nominalVariants: profile.fixtureSize,
      encodedPositions: profile.vectorLength,
      modelVisibility: "public",
      workflow:
        "fresh public model + registered sample + one streaming job; contract deployments excluded",
      transactionCount: expected.total,
      transactionBreakdown: expected,
      latencyAvailability: {
        available: true,
        kind: "Hardhat in-process host timing only; not TFHE or network latency",
        source: "evidence/phase8/heprs_profile.json",
      },
      costAvailability: {
        mockHostGasAvailable: true,
        productionFeeAvailable: false,
        source: "evidence/phase8/heprs_profile.json",
      },
    });
  }

  const privateJob = preflight.jobs.find((job: any) => job.visibility === "private");
  requireCondition(privateJob, "Phase 7 private-weight pre-flight row is missing");
  const privateExpected = streamingTransactionGeometry(privateJob.encodedPositions, "private");
  requireCondition(
    privateExpected.total === privateJob.transactionCount,
    "Phase 7 private transaction count does not reconcile"
  );
  rows.splice(1, 0, {
    evidenceClass: "Hardhat mock",
    executionStatus: "executed",
    nominalVariants: 100,
    encodedPositions: privateJob.encodedPositions,
    modelVisibility: "private",
    workflow:
      "fresh private model + two reader authorizations + registered sample + one streaming job; deployments excluded",
    transactionCount: privateExpected.total,
    transactionBreakdown: privateExpected,
    latencyAvailability: {
      available: false,
      reason: "the Phase 7 pre-flight measured transaction geometry and gas, not elapsed time",
    },
    costAvailability: {
      mockHostGasAvailable: true,
      productionFeeAvailable: false,
      source: "evidence/phase7/live_preflight.json",
    },
  });

  for (const nominalVariants of PROJECTED_NOMINAL_VARIANTS) {
    const encodedPositions = nominalVariants + 1;
    for (const visibility of ["public", "private"] as const) {
      const geometry = streamingTransactionGeometry(encodedPositions, visibility);
      rows.push({
        evidenceClass: "Analytic projection",
        executionStatus: "unexecuted",
        nominalVariants,
        encodedPositions,
        modelVisibility: visibility,
        workflow:
          "same chunk geometry as the measured streaming workflow; contract deployments excluded",
        transactionCount: geometry.total,
        transactionBreakdown: geometry,
        latencyAvailability: {
          available: false,
          reason: "unexecuted projection",
        },
        costAvailability: {
          mockHostGasAvailable: false,
          productionFeeAvailable: false,
          reason: "transaction geometry only; no gas or fee extrapolation",
        },
      });
    }
  }

  return {
    action: "R1.6-E1",
    title: "Three-class scale evidence",
    evidenceClasses: ["Live fhEVM", "Hardhat mock", "Analytic projection"],
    liveFhevm: {
      executionStatus: "blocked",
      successfulRows: [],
      reason:
        "No funded Sepolia wallet is configured. No live transaction was made and no live scale result is inferred.",
      source: "evidence/phase7/README.md",
    },
    measuredRangeConclusion:
      "The evidence supports linear host-contract transaction growth over the measured 100-5,000-variant Hardhat-mock range. It does not establish real-TFHE latency, production fees, or genome-wide feasibility.",
    rows,
    provenance,
  };
}

export function buildTransactionUse(
  preflight: any,
  policyGas: ReturnType<typeof parseReleasePolicyGas>,
  provenance: SynthesisProvenance
) {
  requireCondition(preflight.evidenceClass === "Hardhat mock", "pre-flight evidence class changed");
  const jobs = Object.fromEntries(
    preflight.jobs.map((job: any) => [job.visibility, job])
  ) as Record<Visibility, any>;

  for (const visibility of ["public", "private"] as const) {
    const job = jobs[visibility];
    requireCondition(job, `${visibility} pre-flight job is missing`);
    const componentSum = [
      "modelPublication",
      "sampleRegistration",
      "jobCreation",
      "streamingUploadCompute",
      "finalize",
    ].reduce((sum, key) => sum + BigInt(job.gas[key]), 0n);
    requireCondition(
      componentSum === BigInt(job.gas.totalExcludingDeployment),
      `${visibility} pre-flight gas components do not sum to the recorded total`
    );
    requireCondition(
      streamingTransactionGeometry(job.encodedPositions, visibility).total ===
        job.transactionCount,
      `${visibility} transaction count does not reconcile`
    );
  }

  const publicJob = jobs.public;
  const privateJob = jobs.private;
  return {
    action: "R1.8-E1",
    title: "Measured transaction use",
    evidenceClass: "Hardhat mock",
    liveNetworkQuantitiesAvailable: false,
    liveNetworkReason:
      "Phase 7 is blocked on a funded wallet. These figures validate contract transaction geometry and mock host gas only.",
    deployment: {
      transactionCount: preflight.deployment.contracts.length,
      gas: preflight.deployment.totalDeploymentGas,
      contracts: preflight.deployment.contracts,
    },
    jobs: {
      public: {
        modelVisibility: "public",
        transactionCount: publicJob.transactionCount,
        gas: publicJob.gas,
        transactionBreakdown: streamingTransactionGeometry(
          publicJob.encodedPositions,
          "public"
        ),
      },
      private: {
        modelVisibility: "private",
        transactionCount: privateJob.transactionCount,
        gas: privateJob.gas,
        transactionBreakdown: streamingTransactionGeometry(
          privateJob.encodedPositions,
          "private"
        ),
      },
    },
    releasePolicyAndResultPaths: {
      setReleasePolicy: {
        evidenceClass: "Hardhat mock",
        transactionCount: 1,
        gas: policyGas.setReleasePolicy,
        scope: "one-time per model; additional to Phase 7 model-publication figures",
      },
      rawScoreFinalization: {
        evidenceClass: "Hardhat mock",
        transactionCount: 1,
        gas: publicJob.gas.finalize,
        scope: "Phase 7 100-SNP workflow",
      },
      randomizedCategoryFinalization: {
        evidenceClass: "Hardhat mock",
        transactionCount: 1,
        gas: policyGas.finalizeAndClassify,
        scope:
          "separate Phase 2 synthetic measurement; an alternative to raw-score finalization, not an additive transaction",
      },
      decryption: {
        onChainTransactionCount: 0,
        hostGas: null,
        liveLatency: null,
        note:
          "The mock debugger and live Gateway/KMS user-decryption calls are off-chain from Ethereum's perspective. The live path remains unmeasured.",
      },
    },
    reportingPrecision: {
      rule:
        "Preserve raw observations in JSON, but round SNP-upload and total-gas values in manuscript tables because encrypted calldata changes zero/non-zero byte counts.",
      phase7ProseVsJson: {
        public: {
          proseGas: "11690033",
          machineGas: publicJob.gas.totalExcludingDeployment,
          proseMinusMachineGas: (
            11690033n - BigInt(publicJob.gas.totalExcludingDeployment)
          ).toString(),
        },
        private: {
          proseGas: "23507892",
          machineGas: privateJob.gas.totalExcludingDeployment,
          proseMinusMachineGas: (
            23507892n - BigInt(privateJob.gas.totalExcludingDeployment)
          ).toString(),
        },
        interpretation:
          "Both differences are 12 gas and disappear at the required reporting precision. Machine-readable component sums are authoritative.",
      },
    },
    productionUsdCost: {
      available: false,
      reason:
        "No documented current production fee schedule or production deployment measurement exists.",
    },
    provenance,
  };
}

function formatEthFromWei(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function buildFeeSensitivity(
  transactionUse: ReturnType<typeof buildTransactionUse>,
  provenance: SynthesisProvenance
) {
  const quantities = [
    {
      label: "four-contract deployment",
      gas: BigInt(transactionUse.deployment.gas),
    },
    {
      label: "public 100-SNP job, excluding deployment",
      gas: BigInt(transactionUse.jobs.public.gas.totalExcludingDeployment),
    },
    {
      label: "private 100-SNP job, excluding deployment",
      gas: BigInt(transactionUse.jobs.private.gas.totalExcludingDeployment),
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
    action: "R1.8-E1",
    title: "Fee sensitivity, separate from measured transaction use",
    evidenceClass: "Analytic projection",
    executionStatus: "unexecuted",
    formula: "fee_ETH = mock_observed_gas * hypothetical_gas_price_wei / 1e18",
    caveat:
      "This is arithmetic sensitivity only. It is not a production price, affordability result, or claim that mock gas equals live-network gas.",
    usdConversion: null,
    quantities: quantities.map((quantity) => ({
      label: quantity.label,
      sourceGas: quantity.gas.toString(),
      scenarios: gasPrices.map((price) => ({
        hypotheticalGasPriceGwei: price.gwei,
        feeEth: formatEthFromWei(quantity.gas * price.wei),
      })),
    })),
    provenance,
  };
}

function formatInteger(value: number | string): string {
  return BigInt(value).toLocaleString("en-US");
}

export function renderScaleMarkdown(scale: ReturnType<typeof buildScaleEvidence>): string {
  const lines = [
    "# Phase 8 scale evidence table",
    "",
    "- Action: `R1.6-E1`",
    "- Live status: **blocked** — no funded wallet, so there are no `Live fhEVM` rows.",
    "- Transaction scope: fresh model publication + sample registration + one streaming job;",
    "  contract deployment is excluded.",
    "",
    "| Evidence class | Status | Nominal variants | Encoded positions | Visibility | Transactions | Latency / cost availability |",
    "|---|---|---:|---:|---|---:|---|",
    "| Live fhEVM | blocked | — | — | — | — | unavailable; no live result inferred |",
  ];
  for (const row of scale.rows) {
    const availability =
      row.evidenceClass === "Hardhat mock"
        ? row.latencyAvailability.available
          ? "mock host timing + mock gas; no production fee"
          : "mock gas only; no live latency or production fee"
        : "unexecuted transaction geometry only";
    lines.push(
      `| ${row.evidenceClass} | ${row.executionStatus} | ${formatInteger(row.nominalVariants)} | ` +
        `${formatInteger(row.encodedPositions)} | ${row.modelVisibility} | ` +
        `${formatInteger(row.transactionCount)} | ${availability} |`
    );
  }
  lines.push(
    "",
    scale.measuredRangeConclusion,
    "",
    "Machine-readable source: `scale_evidence.json`."
  );
  return lines.join("\n") + "\n";
}

export function renderTransactionUseMarkdown(
  transactionUse: ReturnType<typeof buildTransactionUse>
): string {
  const pub = transactionUse.jobs.public;
  const priv = transactionUse.jobs.private;
  const lines = [
    "# Phase 8 measured transaction use",
    "",
    "- Action: `R1.8-E1`",
    "- Evidence class: **Hardhat mock**",
    "- Live-network gas, latency, HCU availability, production fees, and USD cost: **unavailable**.",
    "",
    "| Operation | Visibility / path | Transactions | Observed host gas | Reporting note |",
    "|---|---|---:|---:|---|",
    `| Four-contract deployment | shared | ${transactionUse.deployment.transactionCount} | ${formatInteger(transactionUse.deployment.gas)} | exact mock observation |`,
    `| Model publication | public | ${pub.transactionBreakdown.modelPublication} | ${formatInteger(pub.gas.modelPublication)} | includes real provenance hashes |`,
    `| Model publication | private | ${priv.transactionBreakdown.modelPublication} | ${formatInteger(priv.gas.modelPublication)} | includes two reader-authorisation transactions |`,
    `| Sample registration | public / private | 1 | ~${formatInteger(Math.round(Number(pub.gas.sampleRegistration) / 1000) * 1000)} | encrypted/calldata totals are rounded |`,
    `| Job creation | public | 1 | ${formatInteger(pub.gas.jobCreation)} | mock observation |`,
    `| Job creation | private | 1 | ${formatInteger(priv.gas.jobCreation)} | mock observation |`,
    `| Streaming upload + compute | public | ${pub.transactionBreakdown.uploadAndCompute} | ${(Number(pub.gas.streamingUploadCompute) / 1e6).toFixed(3)} M | encrypted calldata; rounded |`,
    `| Streaming upload + compute | private | ${priv.transactionBreakdown.uploadAndCompute} | ${(Number(priv.gas.streamingUploadCompute) / 1e6).toFixed(3)} M | encrypted calldata; rounded |`,
    `| Raw-score finalization | raw result | 1 | ${formatInteger(pub.gas.finalize)} | Phase 7 workflow |`,
    `| Randomized-category finalization | categorical result | 1 | ${formatInteger(transactionUse.releasePolicyAndResultPaths.randomizedCategoryFinalization.gas)} | separate Phase 2 measurement; replaces raw finalization |`,
    `| User decryption | mock debugger / live Gateway-KMS | 0 on-chain | n/a | live latency unmeasured |`,
    `| **Full 100-SNP job** | **public** | **${pub.transactionCount}** | **${(Number(pub.gas.totalExcludingDeployment) / 1e6).toFixed(3)} M** | deployment excluded |`,
    `| **Full 100-SNP job** | **private** | **${priv.transactionCount}** | **${(Number(priv.gas.totalExcludingDeployment) / 1e6).toFixed(3)} M** | deployment excluded |`,
    "",
    `A release-policy configuration adds one transaction and ${formatInteger(transactionUse.releasePolicyAndResultPaths.setReleasePolicy.gas)} mock gas per model. It is not included in the Phase 7 raw-score totals above.`,
    "",
    "The Phase 7 prose totals differ from the authoritative JSON component sums by 12 gas for",
    "each visibility. The discrepancy vanishes at the required precision and is recorded as",
    "`CD-025`; no exact total-gas claim should be copied from prose.",
    "",
    "Machine-readable source: `measured_transaction_use.json`. Fee arithmetic is deliberately",
    "separate in `fee_sensitivity.json` / `fee_sensitivity.md`."
  ];
  return lines.join("\n") + "\n";
}

export function renderFeeSensitivityMarkdown(
  fee: ReturnType<typeof buildFeeSensitivity>
): string {
  const prices = fee.quantities[0].scenarios.map(
    (scenario: any) => scenario.hypotheticalGasPriceGwei
  );
  const lines = [
    "# Phase 8 fee sensitivity",
    "",
    "- Action: `R1.8-E1`",
    "- Evidence class: **Analytic projection**",
    "- Status: **unexecuted arithmetic**",
    "- USD conversion: **not provided** — no current production fee schedule was documented.",
    "",
    `| Quantity | Source gas | ${prices.map((price: string) => `${price} gwei`).join(" | ")} |`,
    `|---|---:|${prices.map(() => "---:").join("|")}|`,
  ];
  for (const quantity of fee.quantities) {
    lines.push(
      `| ${quantity.label} | ${formatInteger(quantity.sourceGas)} | ` +
        `${quantity.scenarios.map((scenario: any) => scenario.feeEth).join(" | ")} |`
    );
  }
  lines.push(
    "",
    "All scenario cells are ETH and use `fee = gas × hypothetical gas price`. They are sensitivity",
    "calculations from Hardhat-mock gas, not production prices or evidence of affordability."
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
  const producerPaths = [
    path.join(REPO_ROOT, "scripts", "phase8_evidence_synthesis.ts"),
    path.join(REPO_ROOT, "scripts", "heprs_fixture_profile.ts"),
    path.join(REPO_ROOT, "scripts", "live_preflight.ts"),
    path.join(REPO_ROOT, "scripts", "release_policy_gas.ts"),
  ];
  for (const sourcePath of [profilePath, preflightPath, policyPath, ...producerPaths]) {
    requireCondition(fs.existsSync(sourcePath), `missing source artifact ${sourcePath}`);
  }

  const profiles = JSON.parse(fs.readFileSync(profilePath, "utf8")) as FixtureProfile[];
  const preflight = JSON.parse(fs.readFileSync(preflightPath, "utf8"));
  const policyGas = parseReleasePolicyGas(fs.readFileSync(policyPath, "utf8"));
  // Hash both the evidence inputs and the code that produced or synthesised them.
  // The runs are captured before their commit exists, so a dirty-file name alone is
  // insufficient to identify exact code; source hashes close that provenance gap.
  const provenance = sourceProvenance([
    profilePath,
    preflightPath,
    policyPath,
    ...producerPaths,
  ]);

  const scale = buildScaleEvidence(profiles, preflight, provenance);
  const transactionUse = buildTransactionUse(preflight, policyGas, provenance);
  const fee = buildFeeSensitivity(transactionUse, provenance);

  writeJson(path.join(outDir, "scale_evidence.json"), scale);
  fs.writeFileSync(path.join(outDir, "scale_evidence.md"), renderScaleMarkdown(scale));
  writeJson(path.join(outDir, "measured_transaction_use.json"), transactionUse);
  fs.writeFileSync(
    path.join(outDir, "measured_transaction_use.md"),
    renderTransactionUseMarkdown(transactionUse)
  );
  writeJson(path.join(outDir, "fee_sensitivity.json"), fee);
  fs.writeFileSync(path.join(outDir, "fee_sensitivity.md"), renderFeeSensitivityMarkdown(fee));

  console.log("Phase 8 evidence synthesis complete");
  console.log(`  scale rows            : ${scale.rows.length} + blocked live row`);
  console.log(`  public/private 100-SNP: ${transactionUse.jobs.public.transactionCount}/${transactionUse.jobs.private.transactionCount} tx`);
  console.log(`  output directory      : ${outDir}`);
}

if (require.main === module) {
  main();
}
