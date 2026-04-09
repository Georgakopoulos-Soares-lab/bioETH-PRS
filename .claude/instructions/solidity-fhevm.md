# Solidity + fhEVM Patterns

When writing or modifying Solidity contracts, especially with FHE encrypted types, TFHE operations, homomorphic computation, access control, or chunked computation patterns.

## Import Paths

All production contracts import from the official Zama package — never from local mock files:

```solidity
import {FHE, euint64, euint8, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
```

Contracts inherit `ZamaEthereumConfig` to auto-wire coprocessor, KMS, and ACL addresses on both Hardhat mock and Sepolia.

Old mock files in `mock-archive/` (TFHE.mock.sol, FHE.mock.sol, EncryptedTypes.mock.sol) must never be imported.

## Encrypted Types

- `euint64` — primary type for SNP values and model weights
- `euint8` — categorical outputs (risk category: 0=Low, 1=Medium, 2=High)
- `ebool` — encrypted boolean for comparisons (`FHE.lt`, `FHE.and`, `FHE.not`)
- `externalEuint64` — user-supplied ciphertext handle; must be verified with `FHE.fromExternal`

## Core FHE Operations

```solidity
// Encrypt a plaintext (trivial encryption — coprocessor can optimize C×P)
euint64 h = FHE.asEuint64(uint64Value);

// Arithmetic
euint64 sum  = FHE.add(a, b);
euint64 diff = FHE.sub(a, b);   // reverts if result would underflow
euint64 prod = FHE.mul(a, b);   // C×C (expensive)

// Public-weight optimization (C×P via trivial encryption — ~60% cheaper than C×C)
euint64 prod = FHE.mul(snp, FHE.asEuint64(publicWeight));

// Comparisons / selects
ebool  lt     = FHE.lt(a, b);
euint8 result = FHE.select(condition, trueVal, falseVal);

// Random encrypted value (must be power-of-two bound)
euint64 noise = FHE.randEuint64(uint64 noiseUpperBound);

// Type casts
euint8 cat = FHE.asEuint8(uint8Value);
```

There is no `mulPlain` or `TFHE.mul`. Use `FHE.mul(snp, FHE.asEuint64(weight))` for public-weight (C×P) multiplications.

## User-Supplied Ciphertext Inputs

```solidity
function example(externalEuint64 encInput, bytes calldata inputProof) external {
    euint64 handle = FHE.fromExternal(encInput, inputProof);  // validates proof
    FHE.allowThis(handle);   // contract can use handle in future txs
    _store(handle);
}
```

## ACL Discipline — Non-Negotiable

Every handle that is:
- **Stored in contract storage** → call `FHE.allowThis(handle)` immediately after creation
- **Returned to a user** → call `FHE.allow(handle, userAddress)` before returning
- **Made public** → call `FHE.makePubliclyDecryptable(handle)` — **only for `euint8` risk categories, never for `euint64` scores**

```solidity
// Correct pattern
euint64 score = FHE.add(a, b);
FHE.allowThis(score);          // store it
FHE.allow(score, requester);   // grant requester decrypt rights
return score;
```

**Streaming path exception:** In `appendAndComputeChunk`, intermediate SNP handles are consumed immediately and never stored — skip `FHE.allowThis` on them. Only call `FHE.allowThis` on the accumulated `partialSum` and `genoSum`.

## Multiplication Strategy

| Model type | Weight storage | Operation | Gas |
|---|---|---|---|
| Public | `uint64[]` | `FHE.mul(snp, FHE.asEuint64(weight))` | ~60% cheaper (C×P) |
| Private | `euint64[]` | `FHE.mul(encryptedWeight, snp)` | Full C×C cost |

## Chunked Computation Pattern

FHE operations have a per-transaction HCU (Homomorphic Compute Unit) budget. Each SNP requires 3 ops (trivial encrypt + mul + add). Mock ceiling: 20 SNPs/tx.

**Classic path** (SNPs stored between transactions):
```
createPRSJob(modelId, sampleId)
appendSnpChunk(jobId, externalEuint64[], inputProof)   ← repeat, max 32/call
finalizeSnpUpload(jobId)
computeChunk(jobId)                                    ← repeat, max 20/call (mock)
finalizeAndClassify(jobId, oracle, low, high)
```

**Streaming path** (no SNP storage, ~37% cheaper):
```
createPRSJob(modelId, sampleId)
appendAndComputeChunk(jobId, externalEuint64[], inputProof)  ← repeat, max 20/call
finalizeAndClassify(jobId, oracle, low, high)
```

State machine: `PENDING → UPLOADING → READY → COMPUTING → DONE`

## Overflow Safety

For `euint64` accumulators: `scale × 2 × N_snps ≤ 2^64 (~1.8×10^19)`.
At scale `10^8` and 5,000 SNPs: max = `10^12` ✓. Run `npm run advisor:quantization` before publishing any model.

## Mock vs Sepolia

`@fhevm/hardhat-plugin` deploys a mock coprocessor at the same addresses as Sepolia. In mock mode, FHE ops perform plaintext arithmetic. Tests pass in mock does not prove real-FHE correctness — confirm on Sepolia.
