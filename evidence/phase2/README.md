# Fixed result thresholds

## What was evaluated

Category reporting was evaluated with thresholds chosen when the model is prepared. The
requester cannot change these thresholds for each score request. The minimum distance between
thresholds is checked against the random-addition range.

## Results

- The contract uses the category thresholds stored with the model.
- After the model is published, those thresholds cannot be changed.
- A model without stored category thresholds cannot return a category.
- Storing the thresholds used **77,314 gas** in the local simulation.
- Returning a category used **432,230 gas** in that same local simulation.

## What the results mean

Fixing thresholds prevents a requester from moving them between queries and repeatedly narrowing
the possible encrypted score. The [adversarial results](../phase6/README.md) show how much
information remained in the evaluated settings.

Local gas measurements check contract behavior only; they are not production prices.

## Supporting data

See the [local gas measurements](gas_delta.md).
