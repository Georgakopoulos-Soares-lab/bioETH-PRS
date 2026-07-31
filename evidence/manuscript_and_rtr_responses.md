# Common scientific summary

bioETH-PRS was evaluated for score accuracy, category reporting, attempts to recover private
weights, scale, and transaction use. The statements below summarize what was evaluated and what
the results show.

## Trust and auditability

bioETH-PRS uses public smart contracts to control the calculation instead of a designated
evaluator. Contract operations can be audited on chain, but the system still depends on the fhEVM
services, contract code, decryption service, which requesters may use private weights, and
network availability. It is therefore not described as trustless.

## Genotype preparation

The contracts calculate a score from the encrypted inputs they receive. They do not prove that
those inputs came from the registered biological sample. The evaluated setting assumes that a
trusted local process, laboratory, or data provider checks the genotypes, genome build, variant
order, effect alleles, and missing-data rule before encryption.

## Converting decimal weights to integers and checking individual scores

The same value is added to every weight when needed to make the smallest weight zero; this shift
is `max(0, -min(q))`. Halfway values are rounded away from zero. All 200 evaluated individual
scores matched the independent Equation 1 calculation exactly. The source weights have no more
than six decimal places, so the selected scales represent them exactly; the result does not
establish precision for weights with more decimal places.

## Randomized categories

A random integer from 0 through `B-1` is added before the score is compared with fixed category
thresholds. For `B=128`, the added value is chosen uniformly from 0 to 127, so its exact mean is
63.5; the contract uses 64 as the integer threshold correction. This does not provide
differential privacy. Scores within `B` below a threshold can move into the next category. Among
the 50 individuals, all 48 outside that range matched the expected category; the two inside it
are reported separately.

## Adversarial analysis

A stronger adversarial analysis evaluated queries chosen after earlier results or chosen in
advance, thresholds chosen by the requester or fixed by the model provider, correlated inputs,
multiple wallets, and multiple registered samples. When the requester changed the threshold after
each result, 19 of 20 weights were recovered within the noise range after 200 queries and all 20
were first recovered after 260. When all requester-selected queries were chosen in advance, none
was recovered within that range after 320 queries (`r = 0.6689`). With thresholds fixed by the
model provider, none was recovered within that range after 320 queries, although the estimated
and true weights remained correlated (`r = 0.9388`). The local analysis used a fixed sequence of
random additions so it can be repeated; another sequence may give different exact counts. These
observations do not completely hide the private weights and are not a security proof.

When probes used the same dosage within five-variant blocks, the correlation between estimated
and true weights fell to `0.0223`. Requesters are not required to submit correlated values, so
this result does not protect against freely chosen inputs.

The three-calculation limit applied to one registered sample across wallets. Different
registered samples had separate limits. The model provider also decided which requesters could
use the private weights. At three calculations per 1,000 blocks, 260 total queries correspond to
calculated times of 288.9 hours with 12-second blocks or 48.1 hours with 2-second blocks. These are
calculated examples, not measured network times.

## Sepolia, scale, and cost

Four contracts and one public-weight 100-SNP calculation completed on Sepolia. The decoded score
was 758,685, exactly matching the independent reference. Submission to result took 269,320 ms and
user decryption took 8,081 ms. The private-weight calculation was evaluated only in local
simulation.

Public-weight calculations with 100, 500, 1,000, and a maximum of 5,000 variants completed in
local simulation. These results check contract behavior; they do not measure live FHE speed,
network time, or production cost. A **calculated fee example** is measured local gas multiplied
by a stated gas price; it is not an observed network cost.

## Main numerical sources

- [Individual scores and categories](phase5/README.md)
- [Adversarial analysis](phase6/README.md)
- [Public Sepolia result and transaction summary](phase7/live_2026-07-31/README.md)
- [Scale, transaction, and calculated fee summaries](phase8/README.md)
