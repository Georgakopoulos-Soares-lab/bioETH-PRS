/**
 * scripts/deploy.ts
 *
 * Deploys all four bioETH PRS contracts in dependency order and saves the
 * addresses to deployments/{network}.json for use by validation scripts.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network sepolia
 *   npx hardhat run scripts/deploy.ts --network hardhat   # local mock (quick sanity check)
 *
 * See docs/reference.md for the full pre-flight checklist.
 */

import fs from "fs";
import path from "path";

import { ethers } from "hardhat";

const DEFAULT_HARDHAT_DEPLOYER =
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;

  console.log(`Deployer : ${deployer.address}`);
  console.log(`Network  : ${network.name} (chainId=${chainId})`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance  : ${ethers.formatEther(balance)} ETH`);
  if (
    chainId === 11155111n &&
    deployer.address.toLowerCase() === DEFAULT_HARDHAT_DEPLOYER
  ) {
    throw new Error(
      "Refusing Sepolia deployment with the public Hardhat test mnemonic. " +
        "Set a funded private mnemonic with `npx hardhat vars set MNEMONIC`."
    );
  }
  if (chainId === 11155111n && balance < ethers.parseEther("0.05")) {
    console.warn("WARNING: balance is low — consider topping up via the Sepolia faucet");
  }
  console.log("");

  // 1. GenomicRegistry — no constructor arguments
  process.stdout.write("Deploying GenomicRegistry ... ");
  const Registry = await ethers.getContractFactory("GenomicRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(registryAddress);

  // 2. ModelMarketplace — inherits ZamaEthereumConfig, auto-selects Sepolia config
  process.stdout.write("Deploying ModelMarketplace  ... ");
  const Marketplace = await ethers.getContractFactory("ModelMarketplace");
  const marketplace = await Marketplace.deploy();
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(marketplaceAddress);

  // 3. PRSComputeEngine — requires both addresses above
  process.stdout.write("Deploying PRSComputeEngine  ... ");
  const Engine = await ethers.getContractFactory("PRSComputeEngine");
  const engine = await Engine.deploy(marketplaceAddress, registryAddress);
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();
  console.log(engineAddress);

  // 4. ResultOracle — noiseUpperBound sets the noisy-release scale.
  //    Noise drawn on-chain from [0, noiseUpperBound) per classify() call.
  //    Must be a power of two (fhEVM randBounded requirement).
  //    2^20 = 1_048_576 ≈ 0.35 on the decoded float scale at scale=3,000,000 (100-SNP models).
  //    Adjust per model after measuring real score distributions.
  const NOISE_UPPER_BOUND: bigint = 1_048_576n; // 2^20
  process.stdout.write("Deploying ResultOracle      ... ");
  const Oracle = await ethers.getContractFactory("ResultOracle");
  const oracle = await Oracle.deploy(NOISE_UPPER_BOUND);
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log(oracleAddress);

  const networkKey =
    chainId === 11155111n ? "sepolia"
    : chainId === 1n ? "mainnet"
    : `chain-${chainId}`;

  const deployment = {
    network: networkKey,
    chainId: chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      GenomicRegistry: registryAddress,
      ModelMarketplace: marketplaceAddress,
      PRSComputeEngine: engineAddress,
      ResultOracle: oracleAddress
    }
  };

  const deploymentsDir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const outPath = path.join(deploymentsDir, `${networkKey}.json`);
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));

  console.log(`\nSaved to ${outPath}`);
  console.log("\nNext steps:");
  console.log(`  npm run validate:sepolia   # full 100-SNP end-to-end test`);
  console.log(`  npm run probe:hcu          # find real HCU ceiling on Sepolia`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
