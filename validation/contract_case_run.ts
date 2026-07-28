import { expect } from "chai";
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { encryptUint64Array, debugDecryptUint64 } from "../test/utils/fhevm-helpers";
import { quantizeSignedWeightsToUint64 } from "../test/utils/heprs";

/**
 * Contract-side arm of the cross-language known-answer validation (R2.6-T1).
 *
 * This runs the *TypeScript + contract* path over the immutable case files in
 * validation/cases/ and writes JSON that
 * `validation/independent_prs_reference.py compare` consumes.
 *
 * Deliberately uses the repository's own `quantizeSignedWeightsToUint64` rather than
 * reimplementing quantisation. That is the point: this arm is the existing TypeScript
 * implementation plus real on-chain FHE arithmetic, and the Python reference is a
 * separate derivation from the manuscript. Agreement between them is only evidence
 * because neither consulted the other.
 *
 * Manifest hashes are real keccak256 digests of the case file contents, not
 * ethers.ZeroHash — see CD-001 and action R2.4-E1.
 */

const CASES_DIR = path.join(__dirname, "cases");
const OUT_DIR = process.env.CONTRACT_OUT_DIR
  ?? path.join(__dirname, "..", "evidence", "phase3", "contract");

const COMPLEMENT: Record<string, string> = { A: "T", T: "A", C: "G", G: "C" };
const PALINDROMES = new Set(["AT", "TA", "CG", "GC"]);

/**
 * Effect-allele harmonisation, implemented here independently of the Python.
 *
 * The input dosage counts ALT. Returns the dosage of the model's effect allele, or
 * null when the variant cannot be aligned. Same decision rules as R2.3-C1:
 * palindromic pairs are unresolvable from allele labels alone and are rejected;
 * a complement match on a non-palindromic pair is a strand flip.
 */
function harmonize(
  variant: { ref: string; alt: string; effect_allele: string },
  dosage: number
): number | null {
  const ref = variant.ref.toUpperCase();
  const alt = variant.alt.toUpperCase();
  let effect = variant.effect_allele.toUpperCase();

  if (ref.length !== 1 || alt.length !== 1) return null;      // not a simple SNP
  if (PALINDROMES.has(ref + alt)) return null;                // strand ambiguous

  if (effect !== alt && effect !== ref) {
    const comp = COMPLEMENT[effect];
    if (comp === undefined || (comp !== alt && comp !== ref)) return null;
    effect = comp;                                            // strand flip
  }
  return effect === alt ? dosage : 2 - dosage;
}

describe("Cross-language known-answer validation — contract path", function () {
  const caseFiles = fs
    .readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  before(function () {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  for (const file of caseFiles) {
    const caseName = file.replace(/\.json$/, "");

    it(`runs the contract path for case: ${caseName}`, async function () {
      const raw = fs.readFileSync(path.join(CASES_DIR, file), "utf8");
      const spec = JSON.parse(raw);
      const [signer] = await ethers.getSigners();

      // Real provenance hashes (R2.4-E1): keccak256 over the exact case bytes.
      const manifestHash = ethers.keccak256(ethers.toUtf8Bytes(raw));
      const sourceModelHash = ethers.keccak256(
        ethers.toUtf8Bytes(JSON.stringify(spec.weights))
      );

      const betas: number[] = spec.weights.map((w: string) => Number(w));
      const q = quantizeSignedWeightsToUint64(betas, spec.scale);
      const n = betas.length;

      const Marketplace = await ethers.getContractFactory("ModelMarketplace");
      const marketplace = await Marketplace.deploy();
      const shellArgs = [
        false,
        BigInt(n),
        BigInt(n),
        BigInt(n),
        `case://${caseName}`,
        manifestHash,
        sourceModelHash,
        q.weightZeroPoint,
        q.scoreOffset,
      ] as const;
      const modelId = await marketplace.createModelShell.staticCall(...shellArgs);
      await marketplace.createModelShell(...shellArgs);
      await marketplace.appendPublicModelChunk(modelId, q.weights);
      await marketplace.finalizeModel(modelId);

      const Registry = await ethers.getContractFactory("GenomicRegistry");
      const registry = await Registry.deploy();
      const sampleId = await registry.registerSample.staticCall(`case://${caseName}`);
      await registry.registerSample(`case://${caseName}`);

      const Engine = await ethers.getContractFactory("PRSComputeEngine");
      const engine = await Engine.deploy(
        await marketplace.getAddress(),
        await registry.getAddress()
      );
      const engineAddr = await engine.getAddress();

      const individuals: any[] = [];

      for (let idx = 0; idx < spec.genotypes.length; idx++) {
        const inputDosages: number[] = spec.genotypes[idx];
        const effectDosages = inputDosages.map((d, i) =>
          harmonize(spec.variants[i], d)
        );

        if (effectDosages.some((d) => d === null)) {
          individuals.push({ individual: idx, status: "rejected" });
          continue;
        }

        const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
        await engine.createPRSJob(modelId, sampleId);

        const enc = await encryptUint64Array(
          engineAddr,
          signer.address,
          effectDosages.map((d) => BigInt(d as number))
        );
        await engine.appendAndComputeChunk(jobId, enc.handles, enc.inputProof);

        const tx = await engine.finalize(jobId);
        const receipt = await tx.wait();
        const evt = receipt!.logs.find((log: any) => {
          try {
            return engine.interface.parseLog(log)?.name === "JobFinalized";
          } catch {
            return false;
          }
        });
        const handle = engine.interface.parseLog(evt as any)!.args.encodedScore;
        const encodedScore = await debugDecryptUint64(handle);

        // Decode exactly, in integer arithmetic, to avoid introducing float error
        // into the value being compared: PRS = (e - z_s) / s.
        const numerator = encodedScore - q.scoreOffset;
        const decoded = decodeExact(numerator, BigInt(spec.scale));

        individuals.push({
          individual: idx,
          status: "scored",
          inputDosages,
          effectAlleleDosages: effectDosages,
          encodedScore: encodedScore.toString(),
          decodedPRS: decoded,
        });
      }

      const out = {
        tool: "contract_case_run.ts",
        arm: "typescript + fhevm mock coprocessor",
        case: caseName,
        network: (await ethers.provider.getNetwork()).chainId.toString(),
        provenance: {
          manifestHash,
          sourceModelHash,
          caseFile: `validation/cases/${file}`,
        },
        encoding: {
          weightZeroPoint: Number(q.weightZeroPoint),
          scoreOffset: Number(q.scoreOffset),
          quantizedWeights: q.weights.map((w) => (w - q.weightZeroPoint).toString()),
        },
        individuals,
      };

      const outPath = path.join(OUT_DIR, `case_${caseName}.json`);
      fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
      console.log(
        `  ${caseName}: ${individuals.filter((i) => i.status === "scored").length}` +
          ` scored -> ${path.relative(process.cwd(), outPath)}`
      );

      expect(individuals.length).to.equal(spec.genotypes.length);
    });
  }
});

/**
 * Exact decimal string for numerator/scale, where scale is a power of ten.
 * Avoids Number division so the comparison is not polluted by float error.
 */
function decodeExact(numerator: bigint, scale: bigint): string {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const whole = abs / scale;
  const frac = abs % scale;
  const digits = scale.toString().length - 1;
  const fracStr = frac.toString().padStart(digits, "0");
  const sign = negative && (whole !== 0n || frac !== 0n) ? "-" : "";
  return digits > 0 ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`;
}
