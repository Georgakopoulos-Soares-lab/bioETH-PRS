# Sepolia Validation Status

**Date:** 28 April 2026

## Attempted Commands

```bash
npm run deploy:sepolia
```

## Result

The first attempt failed because the old default Sepolia RPC fallback
(`rpc.ankr.com`) now requires an API key. `hardhat.config.ts` now supports
`SEPOLIA_RPC_URL` and falls back to PublicNode:

```text
https://ethereum-sepolia-rpc.publicnode.com
```

After the RPC fallback was updated, the deploy script reached Sepolia but used
the public Hardhat test mnemonic deployer:

```text
0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

That address had only `0.00000010451450605` Sepolia ETH, and deployment failed
before `GenomicRegistry` was deployed:

```text
ProviderError: insufficient funds for gas * price + value
```

## Current Blocker

Live fhEVM measurements are blocked until a funded non-default Sepolia mnemonic
is configured:

```bash
npx hardhat vars set MNEMONIC
# optional, otherwise PublicNode is used
npx hardhat vars set SEPOLIA_RPC_URL

npm run deploy:sepolia
npm run validate:sepolia
npm run probe:hcu
```

The Sepolia scripts now fail early if the public Hardhat test mnemonic is used
on chain ID `11155111`.
