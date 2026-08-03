# Current scientific conclusions

## What was evaluated

The study evaluated what the system still depends on, genotype preparation, conversion of decimal weights to
integers, individual PRS agreement, categories with random addition, attempts to recover private
weights, scale, and transaction use.

## Results and interpretation

1. **Trust.** Smart contracts make the sequence of operations public and auditable. Correctness
   and confidentiality still depend on the fhEVM services, contract code, decryption service,
   which requesters may use private weights, and network availability.

2. **Genotype inputs.** The contracts calculate a score from the encrypted values they receive.
   They do not prove that those values are valid genotypes from the registered sample. The
   evaluated setting assumes trusted genotype preparation before encryption.

3. **Alleles and missing data.** Dosage is counted for the model's effect allele. Invalid hard
   calls, genome-build mismatches, duplicate variants, and unresolved palindromic SNPs are
   rejected. Missing variants follow the rule recorded with the model.

4. **Converting decimal weights to integers.** The same value is added to every weight when
   needed to make the smallest weight zero; this shift is `max(0, -min(q))`. Halfway values are
   rounded away from zero. All evaluated weights have no more than six decimal places, so the
   chosen scales represent them exactly.

5. **Individual scores.** All 200 local contract scores matched the independent Equation 1
   calculation exactly for 100, 500, 1,000, and a maximum of 5,000 variants.

6. **Categories with random addition.** A random integer from 0 through `B-1` is added before
   comparing the score with fixed thresholds. For `B=128`, the added value is chosen uniformly
   from 0 to 127, so its exact mean is 63.5; the contract uses 64 as the integer threshold
   correction. This is not differential privacy. Among 50 individuals, 48 were outside the
   threshold-crossing range and all 48 matched the expected category; two were inside that range
   and are listed separately.

7. **Attempts to recover private weights.** Raw scores revealed all 20 evaluated weights in 20
   queries. When the requester changed the threshold after each result, 19 of 20 weights were
   recovered within the noise range after 200 queries and all 20 were first recovered after 260.
   When all requester-selected queries were chosen in advance, none was recovered within that
   range after 320 queries (`r = 0.6689`). With thresholds fixed by the model provider, none was
   recovered within that range after 320 queries, although the estimated and true weights remained
   correlated (`r = 0.9388`). The local analysis used a fixed sequence of random additions so it
   can be repeated; another sequence may give different exact counts. These results are not a
   security proof.

8. **Correlated inputs.** When each five-variant block shared one dosage, the correlation between
   estimated and true weights fell to `0.0223`. Requesters are not required to submit correlated
   values, so this result does not protect against freely chosen inputs.

9. **Calculation limits.** A three-calculation limit applied to one registered sample across
   wallets. Different registered samples had separate limits. The model provider also decided
   which requesters could use the private weights.

10. **Public Sepolia.** Four contracts and one public-weight 100-SNP calculation completed on
    Sepolia. The score was 758,685, exactly matching the independent reference. The private-weight
    calculation was evaluated only in local simulation.

11. **Scale.** Public-weight calculations with 100, 500, 1,000, and a maximum of 5,000 variants
    completed in local simulation. These local results do not measure live FHE speed, live network
    time, or production cost. The contracts process larger models in repeated groups and do not
    impose a fixed 100-variant model limit. The Streaming calculations at all four sizes were
    evaluated only in the local simulation; no Sepolia Streaming result is reported.

12. **Cost.** Sepolia gas and Sepolia ETH are reported only for the public-weight 100-SNP
    calculation and deployment. Other gas values are local measurements. A **calculated fee
    example** is measured gas multiplied by a stated gas price; it is not an observed network cost.

## Supporting data

The numerical sources are the [individual comparison summary](phase5/README.md),
[adversarial analysis](phase6/README.md), [public Sepolia summary](phase7/live_2026-07-31/README.md),
[scale, transaction, and calculated fee summaries](phase8/README.md), and the
[Sepolia Streaming calculation status](sepolia_streaming_2026-08-01/README.md).
