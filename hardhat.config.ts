import { HardhatUserConfig } from "hardhat/config";
import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-toolbox";

// Disable Hardhat telemetry prompt
process.env.HARDHAT_DISABLE_TELEMETRY_PROMPT = "true";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    hardhat: {
      // The local mock-FHE tests now exercise HEPRS fixtures up to 5000 SNPs.
      // Give Hardhat enough headroom to validate math/flow at that size without
      // implying that the same transaction shape is acceptable on a real chain.
      blockGasLimit: 120_000_000
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};

export default config;
