---
description: "Use when writing or modifying Solidity contracts, especially with FHE encrypted types, TFHE operations, homomorphic computation, access control, or chunked computation patterns."
applyTo: "**/*.sol"
---
# Solidity + fhEVM Patterns

## Encrypted Types

- `euint64` — primary type for SNP values and weights (user-defined value type wrapping `uint64`)
- `euint8` — used for categorical outputs (risk category)
- `ebool` — encrypted boolean for comparisons
- All defined in `encrypted-types/EncryptedTypes.sol` (from npm package)

## Import Patterns

```solidity
// For contracts using the TFHE wrapper (GenomicRegistry, PRSComputeEngine, BioETHPRS):
import "./TFHE.sol";

// For contracts using FHE directly (ResultOracle):
import "../vendor/fhevm/library-solidity/lib/FHE.sol";

// For encrypted types:
import "encrypted-types/EncryptedTypes.sol";
```

## TFHE Library Operations

The `TFHE.sol` wrapper exposes:
- `TFHE.asEuint64(uint64)` — encrypt a plaintext into `euint64`
- `TFHE.add(euint64, euint64)` — homomorphic addition
- `TFHE.mul(euint64, euint64)` — ciphertext × ciphertext (expensive)
- `TFHE.mulPlain(euint64, uint64)` — ciphertext × plaintext (~60% cheaper)
- `TFHE.allow(euint64, address)` — grant ACL decrypt permission
- `TFHE.makePubliclyDecryptable(euint64)` — allow anyone to decrypt via gateway

For `FHE.sol` directly (used in ResultOracle): `FHE.lt()`, `FHE.select()`, `FHE.and()`, `FHE.not()`, `FHE.asEuint8()`, `FHE.makePubliclyDecryptable()`.

## Multiplication Strategy

- **Private model** (weights as `euint64[]`): use `TFHE.mul(weight, snp)` — C×C multiplication
- **Public model** (weights as `uint64[]`): use `TFHE.mulPlain(snp, weight)` — C×P multiplication, preferred when IP protection is not needed

## Chunked Computation Pattern

FHE operations are gas-heavy. Use the MapReduce pattern:
1. `startPRS()` initializes a `Job` struct with `partialSum = TFHE.asEuint64(0)`, `nextIndex = 0`
2. `computeChunk()` processes `chunkSize` elements per transaction, accumulating into `partialSum`
3. `finalize()` returns the completed encrypted result with ACL grant

## Integer Overflow Risk

Scaling factor × max SNP dosage (2) × N SNPs must fit in `uint64` (max ~1.8×10^19). For scaling factor 10^8 and 5000 SNPs: max accumulation = 5000 × 2 × 10^8 = 10^12, which is safe. Document safe SNP ceiling for each scaling factor.

## Access Control

- `FHE.allow(handle, address)` — grants specific address decrypt rights (use for raw scores)
- `FHE.makePubliclyDecryptable(handle)` — marks for public gateway decryption (use only for coarse categorical outputs)
- Never make raw PRS scores publicly decryptable — only risk categories

## Mock vs Production

The local `contracts/fhevm/FHE.sol` performs plaintext arithmetic for Hardhat testing. Tests passing on mock may fail on real fhEVM due to: different gas costs, ciphertext expansion, ACL enforcement, gateway decryption flow. Always confirm on a Docker fhEVM node.
