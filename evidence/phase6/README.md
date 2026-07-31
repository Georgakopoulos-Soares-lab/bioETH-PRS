# Adversarial analysis of private weights

## What was evaluated

Six ways of trying to recover 20 encrypted private weights were evaluated in a local contract
simulation. They covered raw score output, thresholds chosen by the requester or by the model
provider, queries chosen after seeing earlier results or all chosen in advance, correlated
inputs, multiple wallets, and multiple registered samples.

The analysis used a fixed sequence of random additions from 0 through 127 so that
the results can be repeated exactly. The elapsed-time values are calculated examples based on
the query limit and stated block times; they are not observed network times.

## Results

| Output and query setting | Queries | Pearson r | Sign accuracy | Weights recovered within noise range |
|---|---:|---:|---:|---:|
| Raw score | 20 | 1.0000 | 100% | 20/20 |
| Requester-selected thresholds, queries chosen after earlier results | 200 | 0.9999 | 100% | 19/20 |
| Requester-selected thresholds, first recovery of all weights | 260 | 1.0000 | 100% | 20/20 |
| Requester-selected thresholds, queries chosen in advance | 320 | 0.6689 | 65% | 0/20 |
| Thresholds fixed by model provider, queries chosen after earlier results | 320 | 0.9388 | 70% | 0/20 |
| Thresholds fixed by model provider, correlated inputs | 320 | 0.0223 | 65% | 0/20 |

With requester-selected thresholds and queries chosen after earlier results, 19 of 20 weights
were recovered within the noise range after 200 queries. All 20 were first recovered within that
range after 260 queries. Under a limit of three calculations per 1,000 blocks, 260 total queries
correspond to calculated examples of 288.9 hours at 12 seconds per block or 48.1 hours at
2 seconds per block for one registered sample.

The three-calculation limit applied to one registered sample across wallets: one wallet used all
three calculations and other wallets obtained no additional calculations for that sample.
Different registered samples had separate limits. The model provider also decided who could use
the private weights.

## What the results mean

Raw score output reveals private weights directly. When the model provider chose the category
thresholds, the studied approach did not recover any weight within the noise range, although the
correlation of 0.9388 shows that some structure remained. These results do not show what would
happen for every possible strategy and do not completely hide the private weights.

When probes used the same dosage within five-variant blocks, only block totals could be
estimated. Requesters are not required to submit correlated values, so this result does not
protect against freely chosen inputs.

The table above reports the values used in the manuscript and response. The full numerical record
is retained separately.
