# Phase 0 baseline capture

Pre-revision state of the repository, recorded before any Stage A action modified code.
Every Stage A phase exit gate compares against these numbers.

- Evidence class: **Hardhat mock** (no live network was contacted)
- Branch: `rtr-revision`
- Baseline commit: `b935d5f` (all contract and test code identical to the submitted snapshot `2d6f21d`)
- Captured: 28 July 2026
- Runtime: **node v22.23.1**, npm 10.9.8, via nvm 0.40.6 — matches the `.nvmrc` pin of 22

## Results

| Capture | Command | Result | File |
|---|---|---|---|
| Dependency install | `npm ci` | exit 0 | `npm_ci.txt` |
| Clean compile | `npx hardhat clean && npm run build` | exit 0 — 11 Solidity files, evm target `cancun`, 56 typings | `compile.txt` |
| Test suite | `npm run test` | exit 0 — **137 passing**, 0 failing, 13s | `tests.txt` |
| 100-SNP mock validation | `npm run validate:mock` | exit 0 — 1 passing, score decrypted end-to-end on chainId 31337 | `validate_mock_100snp.txt` |
| Environment | — | see file | `environment.txt` |

The 137-passing figure confirms the plan's stated baseline. The compile was run after
`hardhat clean`, so the artifacts and typings in this capture were produced entirely under
node 22 rather than inherited from a cache.

## Runtime provenance

The first capture attempt ran on the system node (v25.5.0, homebrew), for which Hardhat 2.22
emits `WARNING: You are currently using Node.js v25.5.0, which is not supported by Hardhat.`
All checks passed, but quoting a measurement taken on an unsupported runtime in a manuscript
under review for evidence quality is not defensible. nvm was therefore installed and node 22
pinned, and the entire baseline was re-captured from a fresh `npm ci`. The warning is absent
from `compile.txt`. This closes `CD-002` in `../claim_deltas.md`.

To reproduce, from the repository root:

```sh
nvm use          # reads .nvmrc -> node 22
npm ci
npx hardhat clean && npm run build
npm run test
npm run validate:mock
```

## Remaining caveat

**Zero manifest hashes.** The baseline evaluation path writes `ethers.ZeroHash` for
experimental manifests. This is the gap action `R2.4-E1` closes in Phase 4; see `CD-001` for
the corrected file scope, which is wider than the plan originally stated.
