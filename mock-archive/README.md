# Mock Archive

These are the original transparent-plaintext FHE mock files used for fast local
testing before the project migrated to `@fhevm/hardhat-plugin`.

They perform plain arithmetic (`euint64 is uint64`) with no coprocessor, ACL, or
ciphertext handles — useful only as a reference for how the business logic was
validated before the protocol-level mock was in place.

The current fast local testing mode uses `@fhevm/hardhat-plugin`'s mock
coprocessor, which validates the full fhEVM protocol flow (handles, ACL, proofs)
while still running plaintext arithmetic behind the scenes.

## Files

| File | Original location |
|---|---|
| `FHE.mock.sol` | `contracts/fhevm/FHE.sol` |
| `EncryptedTypes.mock.sol` | `contracts/fhevm/EncryptedTypes.sol` |
| `TFHE.mock.sol` | `contracts/TFHE.sol` |
