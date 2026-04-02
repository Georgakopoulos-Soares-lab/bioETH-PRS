import { HardhatUserConfig, vars } from "hardhat/config";
import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-toolbox";

// Disable Hardhat telemetry prompt
process.env.HARDHAT_DISABLE_TELEMETRY_PROMPT = "true";

// Credentials are managed via `npx hardhat vars set <KEY>` — never committed.
// See docs/reference/sepolia-deployment.md for setup instructions.
const MNEMONIC = vars.get(
  "MNEMONIC",
  "test test test test test test test test test test test junk"
);
const INFURA_API_KEY = vars.get("INFURA_API_KEY", "");

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
      viaIR: true
    }
  },
  networks: {
    hardhat: {
      // The local mock-FHE tests now exercise HEPRS fixtures up to 5000 SNPs.
      // Give Hardhat enough headroom to validate math/flow at that size without
      // implying that the same transaction shape is acceptable on a real chain.
      blockGasLimit: 120_000_000
    },
    sepolia: {
      // ZamaEthereumConfig auto-configures the fhEVM coprocessor, KMS, and
      // gateway contracts by detecting chainId 11155111 at runtime — no manual
      // gateway addresses required here.
      url: INFURA_API_KEY
        ? `https://sepolia.infura.io/v3/${INFURA_API_KEY}`
        : "https://rpc.ankr.com/eth_sepolia",
      chainId: 11155111,
      accounts: {
        mnemonic: MNEMONIC,
        path: "m/44'/60'/0'/0",
        count: 10
      }
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
