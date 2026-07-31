# Phase 7 live Sepolia execution — in progress

- Date: 31 July 2026
- Network: Sepolia, chain ID `11155111`
- Deployer: `0xB5c0E173d018dbFCc8763997F51cDf88203dB9e3`
- Evidence class: **Live fhEVM**
- Current status: deployment complete; first public validation attempt failed before a score
  existed; retry pending with the hardened runner

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

## File integrity

| File | SHA-256 |
|---|---|
| `deployment.json` | `522aa5d65b3e8d4f379ac84bc54af29397a4b6d65ecd1822a46436329d482087` |
| `public_attempt1_failed.txt` | `0b3ce0a4d0d448d42a7aaf7c3e157475c1b4c2d76bc3716e533dbe4a9979c09a` |

Machine-readable receipts and effective gas prices are in `public_attempt1_failed.json`.
