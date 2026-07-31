# Phase 7 live Sepolia execution — public live, private mock-only fallback

- Date: 31 July 2026
- Network: Sepolia, chain ID `11155111`
- Deployer: `0xB5c0E173d018dbFCc8763997F51cDf88203dB9e3`
- Evidence class: **Live fhEVM**
- Current status: deployment and public validation complete; private validation not executed and
  the plan's explicit mock-only fallback accepted

## Deployment

All four deployments mined successfully in blocks 11388858–11388861. The original process was
interrupted after the transactions mined but before its final local write, so `deployment.json`
was reconstructed from immutable receipts and runtime bytecode. All four receipts have status 1,
the gas values sum to **5,892,559**, and all four saved bytecode hashes were re-read and verified
against Sepolia. The report records the recovery method rather than presenting it as an
uninterrupted capture.

## Public attempt 1 — failed, not accepted as validation

Nine transactions mined successfully: sample registration; model shell, four public chunks, and
model finalization; job creation; and the first of four SNP uploads. When preparing the second SNP
input proof, `@zama-fhe/relayer-sdk@0.4.1` received a closed TLS socket from the official v2 input-
proof endpoint. The SDK reported `RelayerV2FetchError` with `retryCount: 0`.

This attempt consumed **5,010,757 gas / 0.005677982261669478 Sepolia ETH**. It produced no
`JobFinalized` event, score handle, decryption, or pass result and therefore does **not** satisfy
`R1.1-E1`. `public_attempt1_failed.json` reconciles every confirmed receipt and preserves the
failure explicitly; the complete console transcript is `public_attempt1_failed.txt`.

The failed attempt revealed two harness gaps. The follow-up change:

1. prepares every relayer-backed input proof before the first paid workflow transaction;
2. retries only transport and timeout failures, never semantic proof rejection;
3. checkpoints every confirmed receipt and writes the terminal error on failure.

Targeted safeguards pass (21 tests total with readiness and provenance guards), and both public
and private mock workflows still pass with 20/22 transactions and encoded score **758,685**.

## Public attempt 2 — successful and independently re-verified

The hardened runner prepared all four SNP input proofs before its first workflow transaction.
The first proof POST failed once with `RelayerV2FetchError`; bounded retry succeeded without any
test-ETH spend. The run then confirmed **25/25** workflow receipts, including 11 real compute
chunks and finalization. Gateway/KMS user decryption returned **758,685**, exactly equal to the
independent reference.

| Quantity | Live Sepolia observation |
|---|---:|
| Workflow transactions | 25 |
| Workflow gas | 20,710,271 |
| Actual test-ETH fee | 0.025274764801306197 ETH |
| Input-proof preparation | 66,101 ms |
| Submission to result | 269,320 ms |
| End-to-end validation | 464,253 ms |
| Gateway/KMS decryption | 8,081 ms |

`onchain_verification.json` records a second read of every receipt, the three runtime-bytecode
identities, the exact runner hash at commit `4fa7c9f`, and the decoded/reference equality.

## Geometry-matched mock comparison

The old public mock readiness report used compute chunks of 20, while the conservative live run
used 10. A new public mock with the same 32-SNP upload chunks, 10-SNP compute chunks, classic
workflow, and **25 transactions** used **18,755,864 gas**. The live total was **1,954,407 gas /
10.42% higher** at this one point. This matched pair does not establish a general live/mock
conversion factor. The live end-to-end time was 464,253 ms versus 362 ms in-process mock time;
the latter is not real-FHE or network latency.

## Private fallback

The wallet balance after the successful public run is **0.012769081524632462 Sepolia ETH**.
That is not safe for the 100-SNP private workflow, whose default mock uses about 29.8 M gas. No
private transaction was attempted. The revision therefore reports private execution as
mock-validated only. A future top-up could still support the deferred command:

```sh
MODEL_VISIBILITY=private npm run validate:sepolia
```

## File integrity

| File | SHA-256 |
|---|---|
| `deployment.json` | `522aa5d65b3e8d4f379ac84bc54af29397a4b6d65ecd1822a46436329d482087` |
| `public_attempt1_failed.txt` | `0b3ce0a4d0d448d42a7aaf7c3e157475c1b4c2d76bc3716e533dbe4a9979c09a` |
| `public_success.json` | `322ae4bc7c5113d3d97aebe1a3589e0a718469f8f4a7bc819891ccd95c7e8027` |
| `public_success_checkpoint.json` | `d0f5ae70fd62ca4c04494e002ebf4faf1bbfb49a61513e31f9de45640e66abe2` |
| `public_success.txt` | `f682198a70409383ca2f246d44f052dc398a9e3a3b72eee5722c439397510833` |
| `public_matched_mock.json` | `481ceab7966f0040b348185c7ebaa7b794c8d85091fb45fdaca83e08240d5656` |
| `public_matched_mock_checkpoint.json` | `5756bfbbaeb634d4323e3114f4c9b9747383b7eb665fa7ad071a08910f841d92` |
| `ZamaConfig.sepolia.sol` | `4fbb1f61609af594acfbe2c14f800d4f97ff6dd6c3075319fc5fe457cbf7fe82` |

Machine-readable receipts and effective gas prices are in `public_attempt1_failed.json`.
