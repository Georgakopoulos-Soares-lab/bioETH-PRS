// Minimal type shim for fhevmjs (no official @types package available).
declare module "fhevmjs" {
    export interface EncryptedInput {
        add64(value: number | bigint): this;
        encrypt(): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }>;
    }
    export interface FhevmInstance {
        createEncryptedInput(contractAddress: string, userAddress: string): EncryptedInput;
    }
    export function createInstance(config: {
        networkUrl: string;
        gatewayUrl: string;
        aclContractAddress: string;
        kmsContractAddress: string;
        chainId: number;
    }): Promise<FhevmInstance>;
}
