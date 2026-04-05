import { expect } from "chai";
import {
  adviseQuantization,
  buildQuantizationManifest,
  summarizeReport
} from "../scripts/quantization_advisor";
import { validateQuantizationManifest } from "../scripts/quantization_advisor";
import { HEPRS_FIXTURE_SIZES, loadHeprsFixture } from "./utils/heprs";

describe("Quantization advisor", function () {
  for (const fixtureSize of HEPRS_FIXTURE_SIZES) {
    it(`produces ranked recommendations for the HEPRS ${fixtureSize}-SNP fixture`, function () {
      const { betas, genotypes } = loadHeprsFixture(fixtureSize);

      const report = adviseQuantization({
        weights: betas,
        validationGenotypes: genotypes,
        candidateScales: [1e2, 1e3, 1e4, 1e5, 1e6, 3e6, 1e7],
        genotypeMax: 2,
        safetyMarginRatio: 0.10
      });

      expect(report.validCandidates.length).to.be.greaterThan(0);
      expect(report.recommendations.baseline).to.not.equal(undefined);
      expect(report.recommendations.balanced).to.not.equal(undefined);
      expect(report.recommendations.max_precision).to.not.equal(undefined);

      const baseline = report.recommendations.baseline!;
      const balanced = report.recommendations.balanced!;
      const maxPrecision = report.recommendations.max_precision!;

      expect(baseline.scale).to.be.at.most(balanced.scale);
      expect(balanced.scale).to.be.at.most(maxPrecision.scale);

      expect(baseline.requiredAccumulatorBits).to.be.oneOf([8, 16, 32, 64, 128, 256]);
      expect(maxPrecision.requiredAccumulatorBits).to.be.oneOf([8, 16, 32, 64, 128, 256]);

      expect(baseline.worstCaseErrorBound).to.be.greaterThan(
        maxPrecision.worstCaseErrorBound
      );

      expect(baseline.validation).to.not.equal(undefined);
      expect(maxPrecision.validation).to.not.equal(undefined);
      expect(maxPrecision.validation!.maxAbsoluteError).to.be.at.most(
        baseline.validation!.maxAbsoluteError
      );
    });
  }

  it("renders a concise summary for CLI-friendly output", function () {
    const { betas, genotypes } = loadHeprsFixture(100);
    const report = adviseQuantization({
      weights: betas,
      validationGenotypes: genotypes,
      candidateScales: [1e2, 1e4, 1e6]
    });

    const summary = summarizeReport(report);
    expect(summary).to.contain("Quantization advisor summary");
    expect(summary).to.contain("baseline:");
    expect(summary).to.contain("balanced:");
    expect(summary).to.contain("max_precision:");
    expect(summary).to.contain("scale=");
  });

  it("builds and validates a hardcall manifest for a recommended candidate", function () {
    const { betas, genotypes } = loadHeprsFixture(100);
    const report = adviseQuantization({
      weights: betas,
      validationGenotypes: genotypes,
      candidateScales: [1e2, 1e4, 1e6, 3e6]
    });
    const candidate = report.recommendations.balanced!;

    expect(candidate.encodedRange).to.be.greaterThan(0n);

    const manifest = buildQuantizationManifest(
      candidate,
      `0x${"11".repeat(32)}`,
      { low: 0n, high: candidate.encodedRange }
    );

    expect(() => validateQuantizationManifest(manifest)).to.not.throw();
    expect(manifest.genotypeMode).to.equal("hardcall_0_1_2");
    expect(manifest.accumulatorBits).to.equal(candidate.requiredAccumulatorBits);
  });

  it("rejects invalid genotype modes and threshold domains in manifests", function () {
    const { betas, genotypes } = loadHeprsFixture(100);
    const report = adviseQuantization({
      weights: betas,
      validationGenotypes: genotypes,
      candidateScales: [1e2, 1e4, 1e6, 3e6]
    });
    const candidate = report.recommendations.balanced!;
    const manifest = buildQuantizationManifest(
      candidate,
      `0x${"22".repeat(32)}`,
      { low: 0n, high: candidate.encodedRange }
    );

    expect(() => validateQuantizationManifest({
      ...manifest,
      genotypeMode: "dosage_decimal" as any
    })).to.throw("V1 manifests must declare genotypeMode=hardcall_0_1_2");

    expect(() => validateQuantizationManifest({
      ...manifest,
      thresholdsEncoded: {
        low: candidate.encodedRange,
        high: candidate.encodedRange + 1n
      }
    })).to.throw("Encoded thresholds must satisfy 0 <= low < high <= encodedRange");
  });
});
