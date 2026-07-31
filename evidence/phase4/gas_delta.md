# Local gas measurements with model input records

## What was evaluated

Models were published with recorded identifiers for the model source and input data. Measurements
used the **Classic method (stored inputs)** in the local simulation.

## Results

| Variants | Model publication | Calculation creation | Upload | Calculation | Return result | Total |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 1,125,534 | 301,270 | 10,287,781 | 5,626,326 | 186,998 | 17,527,909 |
| 300 | 2,687,308 | 301,270 | 30,556,294 | 16,808,466 | 186,998 | 50,540,336 |
| 600 | 5,029,939 | 301,270 | 61,097,265 | 33,581,676 | 186,998 | 100,197,148 |

Three repeated 100-variant measurements gave upload values from 10,287,721 to 10,287,997 gas.
Model publication and calculation values were unchanged across those repeats.

## What the results mean

Model publication and calculation gas were stable in these local measurements. Upload gas varied
slightly, so upload and total values are rounded in the manuscript. These values are not Sepolia
fees or production prices.

## Supporting data

See the [model, input, and contract summary](README.md).
