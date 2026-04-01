import { createInstance, FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

let instancePromise: Promise<FhevmInstance> | null = null;

const getEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

export const getFhevmInstance = async (): Promise<FhevmInstance> => {
  if (!instancePromise) {
    instancePromise = createInstance({
      networkUrl: getEnv("FHEVM_NETWORK_URL"),
      gatewayUrl: getEnv("FHEVM_GATEWAY_URL"),
      aclContractAddress: getEnv("FHEVM_ACL_ADDRESS"),
      kmsContractAddress: getEnv("FHEVM_KMS_ADDRESS"),
      chainId: Number(getEnv("FHEVM_CHAIN_ID"))
    });
  }
  return instancePromise;
};

export const encrypt64Array = async (
  instance: FhevmInstance,
  contractAddress: string,
  userAddress: string,
  values: Array<number | bigint>
): Promise<{ handles: string[]; inputProof: string }> => {
  const input = instance.createEncryptedInput(contractAddress, userAddress);
  values.forEach((value) => input.add64(value));
  const { handles, inputProof } = await input.encrypt();

  return {
    handles: handles.map((handle: Uint8Array) => ethers.hexlify(handle)),
    inputProof: ethers.hexlify(inputProof)
  };
};
