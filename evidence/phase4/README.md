# Model, input, and contract records

## What was evaluated

Each scientific result was linked to the model, genotype data, independent reference calculation,
and contract version used to produce it.

## Results

- The records identify the model, weights, genotypes, independent reference, network, and
  contracts used for each result.
- The 100-SNP local contract score is **758,685**, matching the independent reference exactly.
- Recording identifiers for the model source and input data used 40,568 additional gas per model
  in the local simulation.
- Three repeated 100-variant uploads varied by about 276 gas, so upload and total gas should be
  rounded rather than reported to the individual gas unit.

## What the results mean

The records let a reader identify the inputs and contracts behind a result. They do not prove
that the encrypted inputs came from the registered biological sample. That link still requires
a signed laboratory record or another independent method that verifies the sample.

## Supporting data

- [Local gas summary](gas_delta.md)
