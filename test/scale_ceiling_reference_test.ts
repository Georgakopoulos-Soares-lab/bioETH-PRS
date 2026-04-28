import { expect } from "chai";

import { computeScaleCeilings } from "../scripts/scale_ceiling_reference";

describe("Scale ceiling reference", function () {
  it("computes the documented quick-screen ceilings", function () {
    const rows = computeScaleCeilings();

    const scale1e8 = rows.find((row) => row.scale === (10n ** 8n));
    const scale1e12 = rows.find((row) => row.scale === (10n ** 12n));

    expect(scale1e8).to.not.equal(undefined);
    expect(scale1e12).to.not.equal(undefined);

    expect(scale1e8!.maxIntermediateAt5000Snps).to.equal(2_000_000_000_000n);
    expect(scale1e8!.safeSnpCeiling).to.equal(46_116_860_184n);

    expect(scale1e12!.maxIntermediateAt5000Snps).to.equal(20_000_000_000_000_000n);
    expect(scale1e12!.safeSnpCeiling).to.equal(4_611_686n);
  });
});
