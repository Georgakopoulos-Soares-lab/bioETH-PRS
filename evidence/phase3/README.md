# Independent PRS calculation

## What was evaluated

An independent Python calculation was compared with the local contract calculation. The
comparison covered positive weights, mixed signed weights, allele reversal, and 50 individuals
at each of 100, 500, 1,000, and a maximum of 5,000 variants.

The genotype checks require valid diploid dosages, a stated missing-data rule, matching genome
build and variant order, and dosage of the model's effect allele. Ambiguous palindromic SNPs are
rejected unless their strand is resolved.

## Results

| Comparison | Individuals or cases | Integer-score mismatches | Decoded-score mismatches | Maximum absolute error |
|---|---:|---:|---:|---:|
| Positive weights | 3 | 0 | 0 | 0 |
| Mixed signed weights | 3 | 0 | 0 | 0 |
| Allele reversal | 3 | 0 | 0 | 0 |
| HEPRS data | 200 | 0 | 0 | 0 |

The manuscript example was reproduced exactly: integer score `105` and decoded PRS `0.45`.
Each HEPRS data set includes one leading intercept position used in the calculation; it is not an
additional variant.

## What the results mean

The two calculations agree exactly for the evaluated inputs. Converting the decimal weights to
integers is exact at the chosen scales because the source weights contain no more than six
decimal places. This supports agreement of input preparation, conversion, calculation, and
decoding for these data; it does not establish precision for weights with more decimal places.

The same value is added to every weight when needed to make the smallest weight zero; this shift
is `max(0, -min(q))`. Halfway values are rounded away from zero.

## Supporting data

The detailed comparison values are retained with the study materials. The table above gives the
results used in the manuscript and reviewer response.
