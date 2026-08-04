# Hardhat Test Patterns

When writing or modifying Hardhat tests, test utilities, or TypeScript test files for the bioETH PRS contracts.

## Framework

- Hardhat + ethers v6 + chai (from `@nomicfoundation/hardhat-toolbox`)
- TypeScript with ts-node + SWC transpiler
- `@fhevm/hardhat-plugin` mock coprocessor — validates handles, ACL, and proofs while performing plaintext arithmetic. No Docker node needed.
- `fhevmjs` for client-side ciphertext creation

## Mock vs Real FHE

All current tests run against the **`@fhevm/hardhat-plugin` mock coprocessor**. In mock mode, FHE ops perform plaintext arithmetic — `euint64` values are tracked as handles but can be read with `debugDecryptEuint64`. Assert exact numeric results.

Tests for real FHE require Sepolia testnet access. The same contract code runs on both — no Docker local node exists.

## Encrypting Values (mock and Sepolia)

Use the helpers in `test/utils/fhevm-helpers.ts`:

```typescript
import { encryptUint64Array, debugDecryptUint64, decryptUint64 } from "./utils/fhevm-helpers";

// Create encrypted inputs (works on mock and Sepolia)
const { handles, inputProof } = await encryptUint64Array(contractAddress, signerAddress, [4n, 5n, 6n]);
// handles — Uint8Array[] of ciphertext handles (cast to externalEuint64)
// inputProof — Uint8Array proof covering all handles in the batch

// Mock-only: bypass KMS for test assertions
const value = await debugDecryptUint64(handle);

// Sepolia: proper KMS re-encryption round-trip
const value = await decryptUint64(handle, contractAddress, signer);
```

Required env vars for Sepolia: set via `npx hardhat vars set MNEMONIC` and `npx hardhat vars set INFURA_API_KEY`.

## Getting Return Values

Solidity functions that modify state and return values require `staticCall` to read the return value, then a separate transaction:

```typescript
const returnValue = await contract.someFunction.staticCall(args);
await contract.someFunction(args);
```

## Contract Deployment Pattern

```typescript
const Factory = await ethers.getContractFactory("ContractName");
const instance = (await Factory.deploy(constructorArgs)) as any;
const address = await instance.getAddress();
```

## Typical Integration Test Flow (Classic Path)

1. Deploy GenomicRegistry, ModelMarketplace, PRSComputeEngine (with marketplace address), ResultOracle
2. Register sample in registry, grant access
3. Publish model: `createModelShell` → `appendPublicModelChunk` × N → `setReleasePolicy` → `finalizeModel`. The policy must be set **before** `finalizeModel`, and the oracle must therefore be deployed first.
4. Create job: `createPRSJob(modelId, sampleId)`
5. Encrypt SNP values with `encryptUint64Array`, call `appendSnpChunk` × N, then `finalizeSnpUpload`
6. Relay compute: `computeChunk` × N (permissionless; anyone can call)
7. Finalize: `finalizeAndClassify(jobId)` — oracle and thresholds come from the model policy
8. Assert results with `debugDecryptUint64` (mock) or `decryptUint64` (Sepolia)

## Typical Integration Test Flow (Streaming Path)

Steps 1-4 same as classic. Then:

1. Encrypt SNP chunk and call `appendAndComputeChunk` × N (each call is both upload + compute)
2. Finalize: `finalizeAndClassify(jobId)`

No `finalizeSnpUpload` or separate `computeChunk` calls needed.

## Noise Bias in Oracle Tests

ResultOracle adds `[0, noiseUpperBound)` uniform noise. Call `oracle.expectedNoiseBias()` to get `noiseUpperBound/2` and add it to thresholds. Thresholds must satisfy the minimum gap: `highThreshold - lowThreshold >= noiseUpperBound`, which `setReleasePolicy` now enforces at configuration time.

Thresholds are chosen once, in the policy, while the model is still a draft:

```typescript
const bias = await oracle.expectedNoiseBias();
const low = intendedLow + bias;
const high = low + BigInt(noiseUpperBound); // minimum gap = noiseUpperBound
await marketplace.setReleasePolicy(modelId, oracle.target, low, high, true);
await marketplace.finalizeModel(modelId);
// ... run the job ...
await engine.finalizeAndClassify(jobId);
```

## Rate Limiting in Tests

Models default to unlimited (no rate limit). To test rate-limited flows:

```typescript
// Set rate limit: max 3 jobs per 1000-block window
await marketplace.setRateLimit(modelId, 3n, 1000n);

// Mine blocks to expire window
await network.provider.send("hardhat_mine", ["0x3E8"]); // 1000 blocks in hex
```

## Oracle-Required Mode in Tests

When testing `oracleRequired` models, `finalize()` and `finalizeTo()` will revert. Use `finalizeAndClassify(jobId)` instead.

The release policy carries the oracle, both thresholds, and the `oracleRequired` flag, and is settable **only while the model is a draft**. Deploy the oracle and set the policy *before* `finalizeModel`, or the policy is unreachable:

```typescript
const oracle = await (await ethers.getContractFactory("ResultOracle")).deploy(128n);
// ... createModelShell + appendPublicModelChunk ...
await marketplace.setReleasePolicy(
  modelId, await oracle.getAddress(), lowThreshold, highThreshold, /* requireOracle */ true
);
await marketplace.finalizeModel(modelId);   // policy is immutable from here

// finalize(jobId) → reverts with "Model requires oracle finalization"
// finalizeAndClassify(jobId) → works; thresholds come from the policy
```

`finalizeAndClassify` takes only a job id. A test that passes thresholds to it is testing an interface that no longer exists. A model with no policy reverts with "Model has no release policy".
