# Individual PRS agreement

## What was evaluated

Fifty individuals were scored at each of 100, 500, 1,000, and a maximum of 5,000 variants. Every
local contract score was compared with an independent calculation of Equation 1. Each data set
also contains one leading constant used in the calculation; it is not an additional variant.

Category agreement was evaluated for the 100-SNP data. A random integer from 0 through `B-1` is
added before the score is compared with the category thresholds. For `B=128`, the added value is
chosen uniformly from 0 to 127, so its exact mean is 63.5; the contract uses 64 as the integer
threshold correction.

## Results

| Variants | Individuals | Exact score matches | Maximum absolute error |
|---:|---:|---:|---:|
| 100 | 50 | 50/50 | 0 |
| 500 | 50 | 50/50 | 0 |
| 1,000 | 50 | 50/50 | 0 |
| 5,000 | 50 | 50/50 | 0 |
| **Total** | **200** | **200/200** | **0** |

For categories, 48 individuals were outside the range where random addition could cross a
threshold, and all 48 matched the expected category. Two individuals were inside that range
and are reported separately; one changed category in this calculation.

## What the results mean

The results show exact agreement across input preparation, conversion of decimal weights to
integers, local contract calculation, and decoding for these data. Because all source weights
contain no more than six decimal places, the chosen scale represents them exactly. The zero error
therefore does not establish precision for weights with more decimal places.

Local elapsed times are not live FHE or network measurements.

## Supporting data

The 200 individual comparisons and the 50 category results are retained with the study materials.
The tables above give the results used in the manuscript and reviewer response.
