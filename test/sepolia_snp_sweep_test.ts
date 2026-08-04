import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

import {
  expectedSweepTransactionLabels,
  expectedTransactionTarget,
  fundingCheckMode,
  limitPlanToCurrentBatch,
  parseCalculationGroupSize,
  parseSnpCount,
  streamingTransactionGeometry,
  validateSweepFixture,
  verifyCompletedTransactionCoverage,
  verifyRecordedTransaction,
} from "../scripts/sepolia_snp_sweep";

const SIGNER = "0x1111111111111111111111111111111111111111";
const CONTRACTS = {
  GenomicRegistry: "0x2222222222222222222222222222222222222222",
  ModelMarketplace: "0x3333333333333333333333333333333333333333",
  PRSComputeEngine: "0x4444444444444444444444444444444444444444",
};
const HASH = `0x${"ab".repeat(32)}`;
const BLOCK_HASH = `0x${"cd".repeat(32)}`;

function validReceiptInputs() {
  const record = {
    label: "job.finalize",
    hash: HASH,
    nonce: 17,
    blockNumber: 123,
    blockTimestamp: 1_800_000_000,
    gasUsed: "250000",
    effectiveGasPrice: "2000000000",
    feePaidWei: "500000000000000",
    status: 1,
  };
  return {
    record,
    transaction: {
      hash: HASH,
      from: SIGNER,
      to: CONTRACTS.PRSComputeEngine,
      nonce: 17,
      blockNumber: 123,
      blockHash: BLOCK_HASH,
    },
    receipt: {
      hash: HASH,
      from: SIGNER,
      to: CONTRACTS.PRSComputeEngine,
      blockNumber: 123,
      blockHash: BLOCK_HASH,
      gasUsed: 250000n,
      gasPrice: 2000000000n,
      status: 1,
    },
    block: {
      number: 123,
      hash: BLOCK_HASH,
      timestamp: 1_800_000_000,
    },
  };
}

describe("Sepolia Streaming sweep configuration", function () {
  it("accepts exactly one supported SNP count", function () {
    expect(parseSnpCount("100")).to.equal(100);
    expect(parseSnpCount("500")).to.equal(500);
    expect(parseSnpCount("1000")).to.equal(1000);
    expect(parseSnpCount("5000")).to.equal(5000);
    expect(() => parseSnpCount(undefined)).to.throw("SNP_COUNT is required");
    expect(() => parseSnpCount("101")).to.throw(
      "SNP_COUNT must be exactly one of 100, 500, 1000, or 5000"
    );
  });

  it("defaults to groups of 20 and refuses larger groups", function () {
    expect(parseCalculationGroupSize(undefined)).to.equal(20);
    expect(parseCalculationGroupSize("1")).to.equal(1);
    expect(parseCalculationGroupSize("20")).to.equal(20);
    expect(() => parseCalculationGroupSize("0")).to.throw(
      "GROUP_SIZE must be at least 1"
    );
    expect(() => parseCalculationGroupSize("21")).to.throw(
      "GROUP_SIZE must be at most 20"
    );
  });

  it("matches the local Streaming transaction geometry including the leading constant", function () {
    expect(streamingTransactionGeometry(101, 20)).to.deep.equal({
      modelGroups: 4,
      calculationGroups: 6,
      modelPublication: 6,
      total: 15,
    });
    expect(streamingTransactionGeometry(501, 20).total).to.equal(47);
    expect(streamingTransactionGeometry(1001, 20).total).to.equal(88);
    expect(streamingTransactionGeometry(5001, 20).total).to.equal(413);
  });

  it("requires an explicit positive transaction limit for resumable funding", function () {
    expect(fundingCheckMode(undefined, 10)).to.equal("full-remaining-run");
    expect(fundingCheckMode("NO", 10)).to.equal("full-remaining-run");
    expect(fundingCheckMode("YES", 10)).to.equal("limited-current-batch");
    expect(() => fundingCheckMode("YES", 0)).to.throw(
      "requires MAX_NEW_TRANSACTIONS to be greater than zero"
    );
  });

  it("funds only the ordered transactions allowed in the current batch", function () {
    const fullPlan = {
      modelShellTransactions: 1,
      modelGroupTransactions: 4,
      modelFinalizeTransactions: 1,
      sampleRegistrationTransactions: 1,
      jobCreationTransactions: 1,
      calculationGroupTransactions: 6,
      resultFinalizeTransactions: 1,
      totalTransactions: 15,
      gasUnits: 28_150_000n,
    };
    expect(limitPlanToCurrentBatch(fullPlan, 3)).to.deep.equal({
      modelShellTransactions: 1,
      modelGroupTransactions: 2,
      modelFinalizeTransactions: 0,
      sampleRegistrationTransactions: 0,
      jobCreationTransactions: 0,
      calculationGroupTransactions: 0,
      resultFinalizeTransactions: 0,
      totalTransactions: 3,
      gasUnits: 1_600_000n,
    });
    expect(limitPlanToCurrentBatch(fullPlan, 10)).to.deep.equal({
      modelShellTransactions: 1,
      modelGroupTransactions: 4,
      modelFinalizeTransactions: 1,
      sampleRegistrationTransactions: 1,
      jobCreationTransactions: 1,
      calculationGroupTransactions: 2,
      resultFinalizeTransactions: 0,
      totalTransactions: 10,
      gasUnits: 11_650_000n,
    });
    expect(limitPlanToCurrentBatch(fullPlan, 20)).to.deep.equal(fullPlan);
    expect(() => limitPlanToCurrentBatch(fullPlan, 0)).to.throw("positive integer");
  });

  it("matches the exact independent reference for every supported size", function () {
    // Compares against the independent Python reference output, which is generated
    // rather than committed. Run `npm run validate:cross-language` first.
    const reference = path.join(
      __dirname,
      "..",
      "evidence",
      "phase3",
      "reference",
      "heprs_100snp_reference.json"
    );
    if (!fs.existsSync(reference)) {
      this.skip();
    }

    const expectedScores = new Map([
      [100, "758685"],
      [500, "3858567"],
      [1000, "2414303"],
      [5000, "10821829"],
    ]);
    for (const size of [100, 500, 1000, 5000] as const) {
      const validated = validateSweepFixture(size);
      expect(validated.vectorLength).to.equal(size + 1);
      expect(validated.leadingConstantIncluded).to.equal(true);
      expect(validated.expectedEncodedScore).to.equal(expectedScores.get(size));
      expect(validated.independentReferenceEncodedScore).to.equal(
        validated.expectedEncodedScore
      );
      expect(validated.exactReferenceMatch).to.equal(true);
    }
  });

  it("maps every sweep action to the contract that must receive it", function () {
    expect(expectedTransactionTarget("model.createShell", CONTRACTS)).to.equal(
      CONTRACTS.ModelMarketplace
    );
    expect(expectedTransactionTarget("model.appendPublicGroup.3", CONTRACTS)).to.equal(
      CONTRACTS.ModelMarketplace
    );
    expect(expectedTransactionTarget("sample.register", CONTRACTS)).to.equal(
      CONTRACTS.GenomicRegistry
    );
    expect(expectedTransactionTarget("job.appendAndComputeGroup.5", CONTRACTS)).to.equal(
      CONTRACTS.PRSComputeEngine
    );
    expect(() => expectedTransactionTarget("job.unknown", CONTRACTS)).to.throw(
      "unknown transaction label"
    );
  });

  it("rebuilds a saved transaction only when its Sepolia fields agree", function () {
    const input = validReceiptInputs();
    expect(
      verifyRecordedTransaction(
        input.record,
        input.transaction,
        input.receipt,
        input.block,
        SIGNER,
        CONTRACTS
      )
    ).to.deep.equal(input.record);
  });

  it("rejects changed status, sender, target, block, and gas fields", function () {
    const cases: Array<[string, (input: ReturnType<typeof validReceiptInputs>) => void]> = [
      ["receipt status", (input) => void (input.receipt.status = 0)],
      [
        "transaction sender",
        (input) => void (input.transaction.from = "0x5555555555555555555555555555555555555555"),
      ],
      [
        "receipt target",
        (input) => void (input.receipt.to = "0x6666666666666666666666666666666666666666"),
      ],
      ["block number", (input) => void (input.block.number = 124)],
      ["gas used", (input) => void (input.receipt.gasUsed = 250001n)],
    ];
    for (const [field, mutate] of cases) {
      const input = validReceiptInputs();
      mutate(input);
      expect(() =>
        verifyRecordedTransaction(
          input.record,
          input.transaction,
          input.receipt,
          input.block,
          SIGNER,
          CONTRACTS
        )
      ).to.throw(field);
    }
  });

  it("requires one successful receipt for every expected action", function () {
    const labels = expectedSweepTransactionLabels(101, 20);
    expect(labels).to.have.lengthOf(15);
    const transactions = labels.map((label, index) => ({
      ...validReceiptInputs().record,
      label,
      hash: `0x${index.toString(16).padStart(64, "0")}`,
      nonce: index,
    }));
    expect(() => verifyCompletedTransactionCoverage(transactions, 101, 20)).not.to.throw();
    expect(() =>
      verifyCompletedTransactionCoverage(transactions.slice(1), 101, 20)
    ).to.throw("model.createShell");
  });
});
