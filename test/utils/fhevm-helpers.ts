/**
 * fhEVM test helpers — wraps @fhevm/hardhat-plugin for common encrypt/decrypt patterns.
 *
 * In mock mode (local Hardhat), the plugin's mock coprocessor does plaintext
 * arithmetic behind the scenes while validating the full fhEVM protocol
 * (handles, ACL, input proofs).
 */
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { AddressLike, Signer } from "ethers";

// Re-export for convenience
export { FhevmType };

/**
 * Encrypt an array of uint64 values for a specific contract + user pair.
 * Returns handles (externalEuint64[]) and a shared inputProof.
 */
export async function encryptUint64Array(
  contractAddress: string,
  userAddress: string,
  values: Array<number | bigint>
): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> {
  const input = fhevm.createEncryptedInput(contractAddress, userAddress);
  for (const v of values) {
    input.add64(v);
  }
  return input.encrypt();
}

/**
 * Encrypt a single uint64 value. Convenience wrapper.
 */
export async function encryptUint64(
  contractAddress: string,
  userAddress: string,
  value: number | bigint
): Promise<{ handle: Uint8Array; inputProof: Uint8Array }> {
  const { handles, inputProof } = await encryptUint64Array(
    contractAddress,
    userAddress,
    [value]
  );
  return { handle: handles[0], inputProof };
}

/**
 * Decrypt a euint64 handle using user decryption (ACL-checked).
 */
export async function decryptUint64(
  handle: string,
  contractAddress: AddressLike,
  signer: Signer
): Promise<bigint> {
  return fhevm.userDecryptEuint(
    FhevmType.euint64,
    handle,
    contractAddress,
    signer
  );
}

/**
 * Decrypt a euint8 handle using public decryption (for makePubliclyDecryptable values).
 */
export async function publicDecryptUint8(
  handle: string
): Promise<bigint> {
  return fhevm.publicDecryptEuint(FhevmType.euint8, handle);
}

/**
 * Debug-decrypt a euint64 handle (bypasses ACL — mock mode only).
 * Use for test assertions where ACL setup isn't the focus.
 */
export async function debugDecryptUint64(handle: string): Promise<bigint> {
  return fhevm.debugger.decryptEuint(FhevmType.euint64, handle);
}

/**
 * Debug-decrypt a euint8 handle (bypasses ACL — mock mode only).
 */
export async function debugDecryptUint8(handle: string): Promise<bigint> {
  return fhevm.debugger.decryptEuint(FhevmType.euint8, handle);
}

/**
 * Helper to get the address string from a contract or address-like.
 */
export async function resolveAddress(target: AddressLike): Promise<string> {
  if (typeof target === "string") return target;
  return ethers.resolveAddress(target);
}
