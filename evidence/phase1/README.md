# Randomized categories and input limits

## What was evaluated

The result contract adds a random integer from 0 through `B-1` before comparing a score with two
category thresholds. For `B=128`, the added value is chosen uniformly from 0 to 127, so its exact
mean is 63.5; the contract uses 64 as the integer threshold correction. The calculation contract
was also evaluated with values outside the valid diploid dosage set `{0,1,2}`.

## Results

- The random addition is one-sided, is not calibrated to score sensitivity, and does not track
  repeated releases. It is therefore not differential privacy.
- The contracts accept encrypted values without proving that they are valid dosages from the
  registered biological sample.
- The stored sample record describes how the input was prepared, but it does not prove that the
  uploaded encrypted values came from that sample.

## What the results mean

The random addition changes only how the category is reported and does not provide a formal
differential-privacy guarantee. Valid genotype preparation remains an assumption unless a signed
laboratory record or another independent method verifies the sample.

## Supporting data

See the [individual score and category summary](../phase5/README.md).
