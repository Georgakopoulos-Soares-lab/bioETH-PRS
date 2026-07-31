import { ethers, fhevm } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { debugDecryptUint64, debugDecryptUint8 } from "../test/utils/fhevm-helpers";
import {
  loadHeprsFixture,
  quantizeHeprsWeightsWithRecommendation,
  toBigIntVector,
  HeprsFixtureSize,
} from "../test/utils/heprs";
import { decodeExactRational, decimalStringsEqual } from "./utils/exact";
import {
  fixtureModelProvenance,
  buildProvenance,
  contractIdentity,
  heprsManifestPath,
  heprsWeightsPath,
  heprsGenotypePath,
  heprsReferencePath,
} from "./utils/provenance";

/**
 * Individual-level Equation 1 comparison (RTR action R2.7-E1).
 *
 * Reviewer 2, comment 7: "In the Empirical Evaluation section, I was expecting to see
 * that the individual PRS calculated by bioETH-PRS is consistent with the PRS
 * calculated from Equation 1."
 *
 * The analysis compares all 50 individuals at each of four sizes, one calculation per individual,
 * for 200 comparisons in total.
 *
 * WHAT THIS VALIDATES, AND WHAT IT DOES NOT (CD-006).
 * The quantisation round-trip error on these fixtures is zero, not merely
 * small, because every fixture weight carries at most six decimal places and the
 * advisor's recommended scale makes the quantisation lossless by construction. So this
 * comparison does not measure arithmetic precision. It checks that preprocessing,
 * effect-allele alignment, encoding, local contract execution, permitted decryption, and
 * decoding agree with an independently calculated reference.
 *
 * INTERCEPT COLUMN. Each fixture carries a leading constant column (weight 0, dosage 1
 * for every individual), so the encoded vector length is nominal + 1 — 101 positions
 * for the "100 SNP" fixture. Reported explicitly per R2.7-E1.
 *
 * Output is written in the shape consumed by `independent_prs_reference.py compare`.
 *
 * Usage:
 *   npm run validate:individual-level
 *   FIXTURE_SIZES=100,500 npm run validate:individual-level     # subset
 *   INDIVIDUAL_LIMIT=5 npm run validate:individual-level        # smoke test
 */

const ALL_SIZES: HeprsFixtureSize[] = [100, 500, 1000, 5000];
const UPLOAD_CHUNK_SIZE = 32; // model publication batches
const COMPUTE_CHUNK_SIZE = 20; // HCU ceiling on the mock; streaming chunks by this

const OUT_DIR = process.env.INDIVIDUAL_OUT_DIR
  ?? path.join(__dirname, "..", "evidence", "phase5");

// Classification noise bound for the category-agreement sub-study.
const NOISE_BOUND = 128n;

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

interface ReferenceIndividual {
  individual: number;
  status: string;
  equation1PRS?: string;
  encodedScore?: number;
  decodedPRS?: string;
  genoSum?: number;
}

function loadReference(size: number) {
  const p = heprsReferencePath(size);
  if (!fs.existsSync(p)) {
    throw new Error(
      `missing independent reference for ${size} SNPs at ${p}. Create it first with: ` +
        `python3 validation/independent_prs_reference.py score ...`
    );
  }
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  return {
    doc,
    scale: Number(doc.manifest.scale),
    weightZeroPoint: Number(doc.encoding.weightZeroPoint),
    scoreOffset: Number(doc.encoding.scoreOffset),
    individuals: doc.individuals as ReferenceIndividual[],
  };
}

describe("Individual-level Equation 1 comparison (R2.7-E1)", function () {
  this.timeout(3_600_000);

  const sizes: HeprsFixtureSize[] = process.env.FIXTURE_SIZES
    ? (process.env.FIXTURE_SIZES.split(",").map((s) => Number(s.trim())) as HeprsFixtureSize[])
    : ALL_SIZES;
  const limit = process.env.INDIVIDUAL_LIMIT
    ? Number(process.env.INDIVIDUAL_LIMIT)
    : Infinity;

  const allRows: any[] = [];

  before(function () {
    fs.mkdirSync(path.join(OUT_DIR, "contract"), { recursive: true });
  });

  for (const size of sizes) {
    it(`scores every individual at ${size} SNPs and compares to Equation 1`, async function () {
      const [signer] = await ethers.getSigners();
      const reference = loadReference(size);

      const { genotypes, betas } = loadHeprsFixture(size);
      const quantized = quantizeHeprsWeightsWithRecommendation(size, betas);
      const encodedPositions = quantized.weights.length;

      // The reference and the contract path must agree on the model parameters, or the
      // comparison is meaningless rather than informative. CD-010 is exactly this
      // failure: a scale mismatch produced a uniform 3x disagreement that looked like
      // an encoding bug. Fail loudly and early instead.
      if (reference.scale !== quantized.scale) {
        throw new Error(
          `scale mismatch at ${size} SNPs: reference manifest says ${reference.scale}, ` +
            `advisor recommendation says ${quantized.scale}. See CD-010. Regenerate the ` +
            `manifest with validation/independent_prs_reference.py fixture-manifest.`
        );
      }
      if (reference.weightZeroPoint !== Number(quantized.weightZeroPoint)) {
        throw new Error(
          `weightZeroPoint mismatch at ${size}: reference ${reference.weightZeroPoint}, ` +
            `contract arm ${quantized.weightZeroPoint}`
        );
      }
      if (reference.scoreOffset !== Number(quantized.scoreOffset)) {
        throw new Error(
          `scoreOffset mismatch at ${size}: reference ${reference.scoreOffset}, ` +
            `contract arm ${quantized.scoreOffset}`
        );
      }

      const prov = fixtureModelProvenance({
        manifestPath: heprsManifestPath(size),
        weightsPath: heprsWeightsPath(size),
        genotypePath: heprsGenotypePath(size),
        extra: {
          nominalSnpCount: size,
          encodedPositions,
          encodedPositionsNote:
            "nominal + 1: leading intercept column, weight 0 and dosage 1",
          scale: quantized.scale,
          individualsRequested: Number.isFinite(limit) ? limit : genotypes.length,
        },
      });

      // ── one model per size, reused across every individual ──────────────────
      const Marketplace = await ethers.getContractFactory("ModelMarketplace");
      const marketplace = await Marketplace.deploy();
      const shell = [
        false,
        BigInt(encodedPositions),
        BigInt(UPLOAD_CHUNK_SIZE),
        BigInt(COMPUTE_CHUNK_SIZE),
        `ipfs://heprs/${size}/individual-level`,
        prov.manifestHash,
        prov.sourceModelHash,
        quantized.weightZeroPoint,
        quantized.scoreOffset,
      ] as const;
      const modelId = await marketplace.createModelShell.staticCall(...shell);
      await marketplace.createModelShell(...shell);
      for (const c of chunk(quantized.weights, UPLOAD_CHUNK_SIZE)) {
        await marketplace.appendPublicModelChunk(modelId, c);
      }
      await marketplace.finalizeModel(modelId);

      const Registry = await ethers.getContractFactory("GenomicRegistry");
      const registry = await Registry.deploy();
      const sampleId = await registry.registerSampleWithManifest.staticCall(
        `ipfs://heprs/${size}/cohort`,
        prov.genotypeManifestHash
      );
      await registry.registerSampleWithManifest(
        `ipfs://heprs/${size}/cohort`,
        prov.genotypeManifestHash
      );

      const Engine = await ethers.getContractFactory("PRSComputeEngine");
      const engine = await Engine.deploy(
        await marketplace.getAddress(),
        await registry.getAddress()
      );
      const engineAddr = await engine.getAddress();

      const count = Math.min(genotypes.length, limit);
      const contractIndividuals: any[] = [];
      let agree = 0;
      let disagree = 0;
      const t0 = Date.now();

      for (let idx = 0; idx < count; idx++) {
        const snps = toBigIntVector(genotypes[idx]);
        if (snps.length !== encodedPositions) {
          throw new Error(
            `individual ${idx} at ${size} SNPs has ${snps.length} positions, ` +
              `expected ${encodedPositions}`
          );
        }

        const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
        await engine.createPRSJob(modelId, sampleId);

        // Streaming path: upload and compute per chunk, no SNP handle storage.
        for (const c of chunk(snps, COMPUTE_CHUNK_SIZE)) {
          const input = fhevm.createEncryptedInput(engineAddr, signer.address);
          for (const v of c) input.add64(v);
          const { handles, inputProof } = await input.encrypt();
          await engine.appendAndComputeChunk(jobId, handles, inputProof);
        }

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

        // Exact integer decode: PRS = (e - z_s) / s.
        const decoded = decodeExactRational(
          encodedScore - quantized.scoreOffset,
          BigInt(quantized.scale)
        );

        const ref = reference.individuals[idx];
        const refEncoded = BigInt(ref.encodedScore ?? -1);
        const encodedAgrees = refEncoded === encodedScore;
        const decodedAgrees = decimalStringsEqual(decoded, ref.equation1PRS ?? "NaN");
        if (encodedAgrees && decodedAgrees) agree++;
        else disagree++;

        contractIndividuals.push({
          individual: idx,
          status: "scored",
          encodedScore: encodedScore.toString(),
          decodedPRS: decoded,
        });

        allRows.push({
          nominalSnpCount: size,
          encodedPositions,
          individual: idx,
          scale: quantized.scale,
          weightZeroPoint: quantized.weightZeroPoint.toString(),
          scoreOffset: quantized.scoreOffset.toString(),
          equation1PRS: ref.equation1PRS,
          decodedBioethPRS: decoded,
          absoluteError: decimalStringsEqual(decoded, ref.equation1PRS ?? "NaN")
            ? "0"
            : "NONZERO_SEE_JSON",
          referenceEncodedScore: (ref.encodedScore ?? "").toString(),
          contractEncodedScore: encodedScore.toString(),
          encodedAgrees,
          decodedAgrees,
        });
      }

      const elapsed = Date.now() - t0;
      console.log(
        `  ${size} SNPs (${encodedPositions} encoded positions): ${count} individuals, ` +
          `${agree} agree, ${disagree} disagree, ${(elapsed / count).toFixed(0)}ms/individual`
      );

      const out = {
        tool: "individual_level_validation.ts",
        arm: "TypeScript calculation in a local contract simulation",
        evidenceClass: "local simulation",
        nominalSnpCount: size,
        encodedPositions,
        encodedPositionsNote:
          "nominal + 1: each fixture carries a leading intercept column (weight 0, dosage 1)",
        individualsScored: count,
        encoding: {
          weightZeroPoint: Number(quantized.weightZeroPoint),
          scoreOffset: Number(quantized.scoreOffset),
          scale: quantized.scale,
        },
        individuals: contractIndividuals,
        provenance: await buildProvenance({
          model: prov,
          contracts: [
            await contractIdentity("ModelMarketplace", marketplace),
            await contractIdentity("GenomicRegistry", registry),
            await contractIdentity("PRSComputeEngine", engine),
          ],
          referenceOutputPath: heprsReferencePath(size),
        }),
      };
      fs.writeFileSync(
        path.join(OUT_DIR, "contract", `heprs_${size}snp_contract.json`),
        JSON.stringify(out, null, 2) + "\n"
      );

      if (disagree > 0) {
        throw new Error(
          `${disagree} of ${count} individuals at ${size} SNPs disagree with the ` +
            `independent reference. See ${OUT_DIR}/contract/heprs_${size}snp_contract.json`
        );
      }
    });
  }

  // ── category agreement sub-study ────────────────────────────────────────────
  //
  // R2.7-E1 asks for category agreement "if categories remain". Categories are
  // produced by ResultOracle, which consumes a single encoded score plus two
  // thresholds. That path is entirely independent of variant count, so one fixture
  // size is fully representative and running all four would add time without adding
  // information. 100 SNPs is used.
  //
  // A random value from 0 through B-1 is added before the score is compared with the
  // thresholds. A score within B below a threshold can therefore move to the next category.
  // Report agreement outside this range and count the individuals inside it separately.
  it("measures category agreement and the width of the ambiguous band (100 SNPs)", async function () {
    const size: HeprsFixtureSize = 100;
    const [signer] = await ethers.getSigners();
    const reference = loadReference(size);
    const { genotypes, betas } = loadHeprsFixture(size);
    const quantized = quantizeHeprsWeightsWithRecommendation(size, betas);
    const encodedPositions = quantized.weights.length;
    const count = Math.min(genotypes.length, Number.isFinite(limit) ? limit : 50);

    // Thresholds from the reference score distribution: tertiles of the encoded scores,
    // then lifted by the integer correction B/2. The exact mean of uniform integer noise
    // on {0,...,B-1} is (B-1)/2, which is 63.5 when B=128; the contract guidance uses 64.
    const encodedScores = reference.individuals
      .slice(0, count)
      .map((i) => BigInt(i.encodedScore ?? 0))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const bias = NOISE_BOUND / 2n;
    let low = encodedScores[Math.floor(encodedScores.length / 3)] + bias;
    let high = encodedScores[Math.floor((2 * encodedScores.length) / 3)] + bias;
    if (high - low < NOISE_BOUND) high = low + NOISE_BOUND; // policy minimum gap

    const prov = fixtureModelProvenance({
      manifestPath: heprsManifestPath(size),
      weightsPath: heprsWeightsPath(size),
      genotypePath: heprsGenotypePath(size),
      extra: {
        nominalSnpCount: size,
        purpose: "category_agreement",
        noiseUpperBound: Number(NOISE_BOUND),
        lowThreshold: low.toString(),
        highThreshold: high.toString(),
      },
    });

    const Oracle = await ethers.getContractFactory("ResultOracle");
    const oracle = await Oracle.deploy(NOISE_BOUND);
    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    const marketplace = await Marketplace.deploy();
    const shell = [
      false,
      BigInt(encodedPositions),
      BigInt(UPLOAD_CHUNK_SIZE),
      BigInt(COMPUTE_CHUNK_SIZE),
      `ipfs://heprs/${size}/category`,
      prov.manifestHash,
      prov.sourceModelHash,
      quantized.weightZeroPoint,
      quantized.scoreOffset,
    ] as const;
    const modelId = await marketplace.createModelShell.staticCall(...shell);
    await marketplace.createModelShell(...shell);
    for (const c of chunk(quantized.weights, UPLOAD_CHUNK_SIZE)) {
      await marketplace.appendPublicModelChunk(modelId, c);
    }
    // Release policy must be fixed while the model is a draft (R1.4-C1).
    await marketplace.setReleasePolicy(
      modelId, await oracle.getAddress(), low, high, true
    );
    await marketplace.finalizeModel(modelId);

    const Registry = await ethers.getContractFactory("GenomicRegistry");
    const registry = await Registry.deploy();
    const sampleId = await registry.registerSampleWithManifest.staticCall(
      `ipfs://heprs/${size}/category`, prov.genotypeManifestHash
    );
    await registry.registerSampleWithManifest(
      `ipfs://heprs/${size}/category`, prov.genotypeManifestHash
    );

    const Engine = await ethers.getContractFactory("PRSComputeEngine");
    const engine = await Engine.deploy(
      await marketplace.getAddress(), await registry.getAddress()
    );
    const engineAddr = await engine.getAddress();

    const rows: any[] = [];
    let unambiguous = 0;
    let unambiguousAgree = 0;
    let ambiguous = 0;

    for (let idx = 0; idx < count; idx++) {
      const encoded = BigInt(reference.individuals[idx].encodedScore ?? 0);

      // Plaintext category under the same thresholds, ignoring noise.
      const plaintextCategory = encoded < low ? 0n : encoded < high ? 1n : 2n;
      // Noise is uniform on [0, B). A score within B below a threshold can cross it.
      const nearLow = encoded < low && low - encoded <= NOISE_BOUND;
      const nearHigh = encoded < high && high - encoded <= NOISE_BOUND;
      const isAmbiguous = nearLow || nearHigh;

      const snps = toBigIntVector(genotypes[idx]);
      const jobId = await engine.createPRSJob.staticCall(modelId, sampleId);
      await engine.createPRSJob(modelId, sampleId);
      for (const c of chunk(snps, COMPUTE_CHUNK_SIZE)) {
        const input = fhevm.createEncryptedInput(engineAddr, signer.address);
        for (const v of c) input.add64(v);
        const { handles, inputProof } = await input.encrypt();
        await engine.appendAndComputeChunk(jobId, handles, inputProof);
      }

      const tx = await engine.finalizeAndClassify(jobId);
      const receipt = await tx.wait();
      const evt = receipt!.logs.find((log: any) => {
        try {
          return oracle.interface.parseLog(log)?.name === "ResultClassified";
        } catch {
          return false;
        }
      });
      const catHandle = oracle.interface.parseLog(evt as any)!.args.category;
      const onchainCategory = await debugDecryptUint8(catHandle);

      const agrees = onchainCategory === plaintextCategory;
      if (isAmbiguous) ambiguous++;
      else {
        unambiguous++;
        if (agrees) unambiguousAgree++;
      }

      rows.push({
        individual: idx,
        encodedScore: encoded.toString(),
        categoryWithoutRandomAddition: Number(plaintextCategory),
        contractCategory: Number(onchainCategory),
        agrees,
        withinNoiseRangeOfThreshold: isAmbiguous,
      });
    }

    const changedWithinRange = rows.filter(
      (row) => row.withinNoiseRangeOfThreshold && !row.agrees
    ).length;

    console.log(
      `  category agreement (100 SNPs, B=${NOISE_BOUND}): ` +
        `${unambiguousAgree}/${unambiguous} outside the ambiguous band, ` +
        `${ambiguous}/${count} within B of a threshold, ` +
        `${changedWithinRange} changed category`
    );

    fs.writeFileSync(
      path.join(OUT_DIR, "category_agreement_100snp.json"),
      JSON.stringify(
        {
          title: "Category agreement for 100 variants",
          setting: "local simulation",
          method:
            "A random integer is chosen with equal probability from 0 through B-1 and " +
            "added before the score is compared with " +
            "the category thresholds. A score within B below a threshold can therefore " +
            "move into the next category. We report agreement for scores outside this " +
            "range and count the scores inside it separately. Category assignment uses " +
            "one final score, so it was evaluated with the 100-SNP data. The exact mean " +
            "random addition is (B-1)/2, or 63.5 when B=128. The integer threshold " +
            "correction uses B/2, or 64 when B=128.",
          nominalSnpCount: size,
          noiseUpperBound: Number(NOISE_BOUND),
          lowThreshold: low.toString(),
          highThreshold: high.toString(),
          thresholdSource:
            "tertiles of the reference encoded-score distribution plus the integer " +
            "threshold correction B/2 (64 when B=128); the exact noise mean is " +
            "(B-1)/2 (63.5 when B=128)",
          individualsScored: count,
          outsideBand: unambiguous,
          outsideBandAgreeing: unambiguousAgree,
          withinBand: ambiguous,
          rows,
          interpretation:
            `${unambiguousAgree} of ${unambiguous} individuals outside the noise range ` +
            `agreed with the category calculated without random addition. ${ambiguous} of ` +
            `${count} individuals were close enough to a threshold for the random addition ` +
            `to change the category; ${changedWithinRange} of these ${ambiguous} individuals ` +
            "changed category in this calculation.",
        },
        null,
        2
      ) + "\n"
    );

    if (unambiguousAgree !== unambiguous) {
      throw new Error(
        `${unambiguous - unambiguousAgree} individuals outside the ambiguous band ` +
          `classified differently from the expected category.`
      );
    }
  });

  after(function () {
    if (allRows.length === 0) return;
    // Machine-readable comparison file required by R2.7-E1's completion criterion.
    const header = Object.keys(allRows[0]).join(",");
    const body = allRows.map((r) => Object.values(r).join(",")).join("\n");
    const csvPath = path.join(OUT_DIR, "individual_level_comparison.csv");
    fs.writeFileSync(csvPath, `${header}\n${body}\n`);
    console.log(
      `\n  ${allRows.length}-row comparison written to ${path.relative(process.cwd(), csvPath)}`
    );
  });
});
