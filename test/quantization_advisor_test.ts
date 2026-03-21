import { expect } from "chai";
import {
  adviseQuantization,
  summarizeReport
} from "../scripts/quantization_advisor";
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
});
