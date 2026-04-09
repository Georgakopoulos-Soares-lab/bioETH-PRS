import { expect } from "chai";

import { computeScaleCeilings } from "../scripts/scale_ceiling_reference";

describe("Scale ceiling reference", function () {
  it("computes the documented quick-screen ceilings", function () {
    const rows = computeScaleCeilings();

    const scale1e8 = rows.find((row) => row.scale === (10n ** 8n));
    const scale1e12 = rows.find((row) => row.scale === (10n ** 12n));

    expect(scale1e8).to.not.equal(undefined);
    expect(scale1e12).to.not.equal(undefined);

    expect(scale1e8!.accumulationAt5000Snps).to.equal(1_000_000_000_000n);
    expect(scale1e8!.safeSnpCeiling).to.equal(92_233_720_368n);

    expect(scale1e12!.accumulationAt5000Snps).to.equal(10_000_000_000_000_000n);
    expect(scale1e12!.safeSnpCeiling).to.equal(9_223_372n);
  });
});
