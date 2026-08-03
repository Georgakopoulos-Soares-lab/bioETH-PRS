# Sepolia Streaming calculation status — 1 August 2026

## Question

The local study completed public-weight Streaming calculations with 100, 500, 1,000, and
5,000 variants. We checked whether the same four calculations could also be completed on
Sepolia.

## What the contracts support

The contracts do not impose a fixed 100-variant model limit. A larger model is divided into
repeated groups, and the running score is carried from one group to the next. The local study
used groups of 20 values and completed all four model sizes. The completed Sepolia calculation
used the Classic method with groups of 10; it did not test the Streaming method.

## Preflight record (not a study result)

At Sepolia block 11,396,510 (1 August 2026, 12:51:48 UTC), the submitting address
`0xB5c0E173d018dbFCc8763997F51cDf88203dB9e3` held
`0.012769081524632462` Sepolia test ETH. The gas price returned at that time was
`1.060945476` gwei.

The table below is a calculation, not a Sepolia measurement. Transaction counts come from the
completed local Streaming calculations. The gas amounts combine the corresponding local gas
measurements and allow for the difference observed in the earlier matched 100-variant Classic
comparison. That earlier difference may not apply to every Streaming transaction.

| Variants | Local Streaming transactions | Calculated gas | Calculated amount at the checked gas price |
|---:|---:|---:|---:|
| 100 | 15 | 12,908,360 | 0.013695 Sepolia ETH |
| 500 | 47 | 58,760,769 | 0.062342 Sepolia ETH |
| 1,000 | 88 | 116,124,064 | 0.123201 Sepolia ETH |
| 5,000 | 413 | 574,889,919 | 0.609927 Sepolia ETH |
| **All four** | **563** | **762,683,112** | **0.809165 Sepolia ETH** |

No new Streaming transaction was submitted during this preflight. The balance, gas-price reading,
and calculated amounts are retained only as an operational record. They are not study results and
are not used to assign a cause for the absence of a Sepolia Streaming measurement.

## Result reported in the manuscript and response

There are no new Sepolia Streaming gas, time, or score measurements. The Sepolia result remains
the completed public-weight 100-variant Classic calculation. The 100, 500, 1,000, and 5,000
Streaming results remain local measurements until the four Sepolia calculations are completed.

## Related results

- [Completed public-weight Sepolia calculation](../phase7/live_2026-07-31/README.md)
- [Completed local scale calculations](../phase8/README.md)
