/** Read-only verification of the saved Sepolia RTR evidence. No transaction is submitted. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ethers } from "hardhat";

const ROOT = path.join(__dirname, "..");
const LIVE = path.join(ROOT, "evidence", "phase7", "live_2026-07-31");

function readJson(name: string): any {
  return JSON.parse(fs.readFileSync(path.join(LIVE, name), "utf8"));
}

async function verifyTransactions(label: string, transactions: any[], expectedGas: string) {
  let total = 0n;
  for (const saved of transactions) {
    const receipt = await ethers.provider.getTransactionReceipt(saved.hash);
    assert(receipt, `${label}: missing receipt ${saved.hash}`);
    assert.equal(receipt.status, 1, `${label}: failed receipt ${saved.hash}`);
    assert.equal(receipt.blockNumber, saved.blockNumber, `${label}: block mismatch ${saved.hash}`);
    assert.equal(receipt.gasUsed.toString(), saved.gasUsed, `${label}: gas mismatch ${saved.hash}`);
    total += receipt.gasUsed;
  }
  assert.equal(total.toString(), expectedGas, `${label}: total gas mismatch`);
  return total;
}

async function verifyBytecode(contracts: any[]) {
  for (const saved of contracts) {
    const code = await ethers.provider.getCode(saved.address);
    assert.notEqual(code, "0x", `${saved.name}: no runtime bytecode`);
    assert.equal(ethers.keccak256(code), saved.bytecodeHash, `${saved.name}: bytecode hash mismatch`);
    assert.equal((code.length - 2) / 2, saved.bytecodeBytes, `${saved.name}: bytecode length mismatch`);
  }
}

async function main() {
  const deployment = readJson("deployment.json");
  const publicRun = readJson("public_success.json");
  const network = await ethers.provider.getNetwork();
  assert.equal(network.chainId.toString(), "11155111", "unexpected chain ID");

  const deploymentGas = await verifyTransactions(
    "deployment",
    deployment.transactions,
    deployment.totalDeploymentGas,
  );
  const publicGas = await verifyTransactions(
    "public workflow",
    publicRun.transactions,
    publicRun.gas.total,
  );
  await verifyBytecode(deployment.provenance.contracts);

  const runner = fs.readFileSync(path.join(ROOT, publicRun.runnerSource.path));
  assert.equal(ethers.keccak256(runner), publicRun.runnerSource.hash, "runner source hash mismatch");
  assert.equal(runner.length, publicRun.runnerSource.bytes, "runner source length mismatch");
  assert.equal(publicRun.decodedEncodedScore, publicRun.expectedEncodedScore, "score mismatch");
  assert.equal(publicRun.passed, true, "saved public workflow is not marked passing");

  console.log(
    `verified Sepolia evidence: 4 deployments (${deploymentGas} gas), ` +
      `25 public-workflow receipts (${publicGas} gas), 4 runtime bytecodes, score ` +
      `${publicRun.decodedEncodedScore}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
