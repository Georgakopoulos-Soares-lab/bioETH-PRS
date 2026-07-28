import { ethers } from "hardhat";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Evidence provenance (RTR action R2.4-E1).
 *
 * Every number reported in the manuscript must be traceable to exact inputs, exact
 * code, and an exact deployment. Before this module the evaluation scripts passed
 * `ethers.ZeroHash` for both `manifestHash` and `sourceModelHash`, so a published
 * figure could not be tied back to the fixture that produced it.
 *
 * Scope note (CD-001): the plan named three files. A repository-wide search found
 * `ethers.ZeroHash` in ten, of which five are evidence-producing evaluation code and
 * are covered here. `test/rate_limit_randomized_release_test.ts` was originally listed
 * as evidence-producing but is behavioural — it asserts contract logic and reports no
 * measurement — so it keeps unit-fixture hashes. See CD-009.
 *
 * DETERMINISM. The provenance block deliberately contains no timestamp. Two runs of
 * the same script at the same commit over the same inputs must produce a
 * byte-identical provenance block, so that a reader can verify it rather than merely
 * read it. Wall-clock capture time, where useful, belongs in the enclosing report.
 */

export const PROVENANCE_SCHEMA = "bioeth-prs/provenance/1";

export interface HashedInput {
  role: string;
  path: string;
  hash: string;
  bytes: number;
}

export interface ContractIdentity {
  name: string;
  address: string;
  bytecodeHash: string;
  bytecodeBytes: number;
}

export interface ProvenanceBlock {
  schema: string;
  repository: {
    commit: string;
    shortCommit: string;
    branch: string;
    dirty: boolean;
    dirtyFiles?: string[];
  };
  runtime: { node: string; platform: string };
  network: { name: string; chainId: string };
  inputs: HashedInput[];
  model: {
    manifestHash: string;
    sourceModelHash: string;
    genotypeManifestHash: string;
    descriptor: unknown;
  };
  contracts: ContractIdentity[];
  referenceOutput?: { path: string; hash: string };
}

const REPO_ROOT = path.join(__dirname, "..", "..");

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

export function gitInfo() {
  const commit = git(["rev-parse", "HEAD"]) || "unknown";
  const status = git(["status", "--porcelain"]);
  const dirtyFiles = status
    ? status.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];
  return {
    commit,
    shortCommit: commit.slice(0, 7),
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown",
    dirty: dirtyFiles.length > 0,
    ...(dirtyFiles.length > 0 ? { dirtyFiles: dirtyFiles.slice(0, 50) } : {}),
  };
}

/** keccak256 over a file's exact bytes. */
export function hashFile(filePath: string): { hash: string; bytes: number } {
  const buf = fs.readFileSync(filePath);
  return { hash: ethers.keccak256(buf), bytes: buf.length };
}

export function hashedInput(role: string, filePath: string): HashedInput {
  const { hash, bytes } = hashFile(filePath);
  return { role, path: path.relative(REPO_ROOT, filePath), hash, bytes };
}

/**
 * keccak256 over a canonically serialised object: keys sorted at every level, so the
 * digest depends on content rather than on key insertion order.
 */
export function hashCanonicalJson(value: unknown): string {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalise(value)));
}

function canonicalise(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalise(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

/**
 * Reject a zero hash at the point of use.
 *
 * This is the guard that makes the fix stick: a future edit that reintroduces
 * `ethers.ZeroHash` into an evaluation path fails loudly here instead of silently
 * publishing an untraceable number.
 */
export function assertProvenanceHash(hash: string, label: string): string {
  if (hash === ethers.ZeroHash || /^0x0{64}$/.test(hash)) {
    throw new Error(
      `provenance: ${label} is the zero hash. Evaluation code must commit to its ` +
        `real inputs (R2.4-E1); a zero hash makes the reported number untraceable.`
    );
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error(`provenance: ${label} is not a bytes32 hex string: ${hash}`);
  }
  return hash;
}

export async function contractIdentity(
  name: string,
  contract: { getAddress(): Promise<string> }
): Promise<ContractIdentity> {
  const address = await contract.getAddress();
  const code = await ethers.provider.getCode(address);
  return {
    name,
    address,
    bytecodeHash: ethers.keccak256(code),
    bytecodeBytes: (code.length - 2) / 2,
  };
}

/**
 * Provenance for a run backed by real fixture files on disk.
 *
 * `manifestHash` commits to the *model manifest* — the same manifest the independent
 * Python reference consumes, so a reader can confirm both arms used one description
 * of genome build, variant order, effect alleles, and missing-data policy.
 * `sourceModelHash` commits to the weight file. `genotypeManifestHash` commits to the
 * genotype file and is what the registry stores for the sample.
 *
 * These are provenance commitments, not proofs: they bind a reported number to the
 * bytes that produced it. They do NOT bind a ciphertext to a sample. See R1.5-M2.
 */
export function fixtureModelProvenance(opts: {
  manifestPath: string;
  weightsPath: string;
  genotypePath: string;
  extra?: Record<string, unknown>;
}) {
  const manifest = hashedInput("model_manifest", opts.manifestPath);
  const weights = hashedInput("model_weights", opts.weightsPath);
  const genotypes = hashedInput("genotypes", opts.genotypePath);
  return {
    inputs: [manifest, weights, genotypes],
    manifestHash: assertProvenanceHash(manifest.hash, "manifestHash"),
    sourceModelHash: assertProvenanceHash(weights.hash, "sourceModelHash"),
    genotypeManifestHash: assertProvenanceHash(
      genotypes.hash,
      "genotypeManifestHash"
    ),
    descriptor: {
      kind: "heprs_fixture",
      manifest: manifest.path,
      weights: weights.path,
      genotypes: genotypes.path,
      ...(opts.extra ?? {}),
    },
  };
}

/**
 * Provenance for a run over synthetic inputs, which have no file to hash.
 *
 * `scripts/gas_profile.ts` and `scripts/probe_hcu_ceiling.ts` generate their weights
 * and dosages programmatically, so the thing to commit to is the *generation spec*.
 * Hashing a canonical description of it makes the run reproducible in the only sense
 * available: anyone can regenerate identical inputs from the recorded descriptor.
 * Recording it also stops these figures being mistaken for fixture-backed results.
 */
export function syntheticModelProvenance(opts: {
  purpose: string;
  spec: Record<string, unknown>;
}) {
  const modelSpec = { kind: "synthetic", purpose: opts.purpose, ...opts.spec };
  const manifestHash = hashCanonicalJson({ role: "model_manifest", ...modelSpec });
  const sourceModelHash = hashCanonicalJson({ role: "model_weights", ...modelSpec });
  const genotypeManifestHash = hashCanonicalJson({ role: "genotypes", ...modelSpec });
  return {
    inputs: [] as HashedInput[],
    manifestHash: assertProvenanceHash(manifestHash, "manifestHash"),
    sourceModelHash: assertProvenanceHash(sourceModelHash, "sourceModelHash"),
    genotypeManifestHash: assertProvenanceHash(
      genotypeManifestHash,
      "genotypeManifestHash"
    ),
    descriptor: modelSpec,
  };
}

export async function buildProvenance(opts: {
  model: {
    inputs: HashedInput[];
    manifestHash: string;
    sourceModelHash: string;
    genotypeManifestHash: string;
    descriptor: unknown;
  };
  contracts?: ContractIdentity[];
  referenceOutputPath?: string;
}): Promise<ProvenanceBlock> {
  const net = await ethers.provider.getNetwork();
  let referenceOutput: ProvenanceBlock["referenceOutput"];
  if (opts.referenceOutputPath && fs.existsSync(opts.referenceOutputPath)) {
    const { hash } = hashFile(opts.referenceOutputPath);
    referenceOutput = {
      path: path.relative(REPO_ROOT, opts.referenceOutputPath),
      hash,
    };
  }
  return {
    schema: PROVENANCE_SCHEMA,
    repository: gitInfo(),
    runtime: { node: process.version, platform: process.platform },
    network: { name: net.name, chainId: net.chainId.toString() },
    inputs: opts.model.inputs,
    model: {
      manifestHash: opts.model.manifestHash,
      sourceModelHash: opts.model.sourceModelHash,
      genotypeManifestHash: opts.model.genotypeManifestHash,
      descriptor: opts.model.descriptor,
    },
    contracts: opts.contracts ?? [],
    ...(referenceOutput ? { referenceOutput } : {}),
  };
}

/** Absolute path to a HEPRS manifest produced by the independent reference. */
export function heprsManifestPath(nominal: number): string {
  return path.join(REPO_ROOT, "validation", "manifests", `heprs_${nominal}snp.json`);
}

export function heprsWeightsPath(nominal: number): string {
  return path.join(
    REPO_ROOT, "test", "fixtures", "heprs", `beta_${nominal}SNP_phenotype0.csv`
  );
}

export function heprsGenotypePath(nominal: number): string {
  return path.join(
    REPO_ROOT, "test", "fixtures", "heprs",
    `genotype_${nominal}SNP_50individual.csv`
  );
}

export function heprsReferencePath(nominal: number): string {
  return path.join(
    REPO_ROOT, "evidence", "phase3", "reference",
    `heprs_${nominal}snp_reference.json`
  );
}
