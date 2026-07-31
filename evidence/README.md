# Scientific evidence summary

## What was evaluated

The evidence covers how PRS is calculated, how genotypes and alleles are handled, how score
categories are reported, attempts to recover private weights, transaction use, and one
public-weight 100-SNP calculation on Sepolia.

Results use three clear labels:

- **Public Sepolia**: measured on the Sepolia network with live FHE services.
- **Local simulation**: measured in a local contract simulation. This checks contract
  behavior but does not measure live FHE speed, live network time, or production cost.
- **Calculated fee example**: measured local gas multiplied by a stated gas price. It is not an
  observed network cost.

## Results

- A public-weight 100-SNP calculation completed on Sepolia and decoded to **758,685**, matching
  the independent reference exactly.
- The private-weight calculation was evaluated only in the local simulation, not on Sepolia.
- Public-weight calculations with 100, 500, 1,000, and a maximum of 5,000 variants completed in
  the local simulation.
- All 200 individual scores matched Equation 1 exactly across the four evaluated data sizes.
- With thresholds fixed by the model provider, none of 20 private weights was recovered within
  the noise range after 320 queries chosen after earlier results (`r = 0.9388`). When the requester
  changed the threshold after each result, 19 of 20 weights were recovered after 200 queries and
  all 20 were first recovered after 260. The local analysis used a fixed sequence of random
  additions so it can be repeated; another sequence may give different exact counts.

## What the results mean

The public Sepolia result supports the public-weight 100-SNP calculation. Local-simulation results
support the contract logic and score calculations, but they are not live performance or cost
measurements. The private-weight calculation is supported only by local simulation.

## Supporting data

- [Independent score calculations](phase3/README.md)
- [Individual comparisons and category results](phase5/README.md)
- [Adversarial analysis](phase6/README.md)
- [Public Sepolia result](phase7/live_2026-07-31/README.md)
- [Scale, transaction, and fee results](phase8/README.md)
- [Concise scientific conclusions](claim_deltas.md)
- [Common scientific summary](manuscript_and_rtr_responses.md)
