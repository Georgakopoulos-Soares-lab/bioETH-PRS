// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "./ModelMarketplace.sol";
import "./GenomicRegistry.sol";

interface IResultOracle {
    function classifyPreauthorized(
        externalEuint64 encryptedScoreHandle,
        uint64 lowThreshold,
        uint64 highThreshold
    ) external returns (euint8);
}

/// @title PRSComputeEngine - Chunked PRS dot-product against chunk-published models.
///
/// SNP upload and compute chunk sizes are independent:
///   uploadChunkSize  — inherited from the model; governs how many encrypted SNPs are
///                      accepted per appendSnpChunk call (≤ 32 for fhEVM input-proof budget).
///   computeChunkSize — inherited from the model; governs how many SNP×weight pairs are
///                      processed per computeChunk call (HCU-constrained).
///                      Mock ceiling: 21 (measured, identical for public and private
///                      models — see CD-021). Shipped default is 20, one slot of
///                      headroom. Sepolia ceiling: TBD (run `npm run probe:hcu`).
///
/// SNPs are stored flat (one contiguous array per job) and sliced by computeChunkSize during compute.
/// v1 enforces ACL and chunk geometry on-chain, but SNP provenance and hardcall-range
/// assumptions remain off-chain responsibilities of the caller and manifest workflow.
contract PRSComputeEngine is ZamaEthereumConfig {
    struct Job {
        uint256 modelId;
        uint256 sampleId;
        uint256 weightCount;
        uint256 uploadChunkSize; // for SNP upload validation
        uint256 computeChunkSize; // for compute slicing (HCU-constrained)
        uint256 chunkCount;
        uint256 uploadedSnpCount;
        uint256 nextChunkIndex;
        uint256 processedWeights;
        euint64 partialSum;
        euint64 genoSum;
        address requester;
        bool isPrivate;
        bool snpsFinalized;
        bool complete;
        uint64 weightZeroPoint;
        uint64 scoreOffset;
        bool finalized; // true after any finalize path — prevents double-finalize
        bool cancelled; // true after cancelJob — blocks all further operations
    }

    ModelMarketplace public marketplace;
    GenomicRegistry public registry;
    Job[] private jobs;
    // Flat per-job SNP storage — indexed by absolute SNP position.
    mapping(uint256 => euint64[]) private snpData;

    // --- Rate limiting (anti-probing) ---
    struct RateLimitWindow {
        uint256 windowStart; // block number when current window began
        uint256 jobCount; // jobs created in current window
    }
    mapping(uint256 => mapping(address => RateLimitWindow))
        private requesterWindows;
    mapping(uint256 => mapping(uint256 => RateLimitWindow))
        private sampleWindows;

    event JobCreated(
        uint256 indexed jobId,
        uint256 indexed modelId,
        address indexed requester,
        uint256 weightCount,
        uint256 computeChunkSize,
        uint256 sampleId
    );
    event SnpChunkAppended(
        uint256 indexed jobId,
        uint256 indexed chunkIndex,
        uint256 chunkLength
    );
    event SnpUploadFinalized(uint256 indexed jobId, address indexed requester);
    event ChunkComputed(
        uint256 indexed jobId,
        uint256 indexed chunkIndex,
        uint256 processedWeights,
        bool complete
    );
    event JobFinalized(
        uint256 indexed jobId,
        address indexed requester,
        euint64 encodedScore
    );
    event JobFinalizedFor(
        uint256 indexed jobId,
        address indexed requester,
        address indexed grantee,
        euint64 encodedScore
    );
    event JobCancelled(uint256 indexed jobId, address indexed requester);

    constructor(address marketplaceAddress, address registryAddress) {
        marketplace = ModelMarketplace(marketplaceAddress);
        registry = GenomicRegistry(registryAddress);
    }

    function createPRSJob(
        uint256 modelId,
        uint256 sampleId
    ) external returns (uint256) {
        require(registry.hasAccess(sampleId, msg.sender), "No registry access");

        (
            bool isPrivate,
            bool finalized,
            uint256 weightCount,
            uint256 uploadChunkSize,
            uint256 computeChunkSize,
            uint256 chunkCount,
            uint64 weightZeroPoint,
            uint64 scoreOffset
        ) = marketplace.getModelConfig(modelId);

        require(finalized, "Model not finalized");
        if (isPrivate) {
            require(
                marketplace.canReadPrivateModel(modelId, address(this)),
                "Engine not authorized"
            );
            // Per-requester authorization: model owners must explicitly allow each
            // requester via setPrivateModelReader(modelId, requesterAddr, true).
            // This prevents any user from probing a private model simply because
            // the shared engine contract has been granted reader access.
            require(
                marketplace.canReadPrivateModel(modelId, msg.sender),
                "Requester not authorized for private model"
            );
        }

        // Rate limit enforcement — throttles adaptive probing by wallet and by
        // registered sample. It is not a full Sybil-resistant identity layer.
        _enforceRateLimit(modelId, sampleId, msg.sender);

        euint64 zero = FHE.asEuint64(0);
        FHE.allowThis(zero);

        Job memory job = Job({
            modelId: modelId,
            sampleId: sampleId,
            weightCount: weightCount,
            uploadChunkSize: uploadChunkSize,
            computeChunkSize: computeChunkSize,
            chunkCount: chunkCount,
            uploadedSnpCount: 0,
            nextChunkIndex: 0,
            processedWeights: 0,
            partialSum: zero,
            genoSum: zero,
            requester: msg.sender,
            isPrivate: isPrivate,
            snpsFinalized: false,
            complete: false,
            weightZeroPoint: weightZeroPoint,
            scoreOffset: scoreOffset,
            finalized: false,
            cancelled: false
        });

        jobs.push(job);
        uint256 jobId = jobs.length - 1;
        emit JobCreated(
            jobId,
            modelId,
            msg.sender,
            weightCount,
            computeChunkSize,
            sampleId
        );
        return jobId;
    }

    function appendSnpChunk(
        uint256 jobId,
        externalEuint64[] calldata encryptedSnps,
        bytes calldata inputProof
    ) external {
        Job storage job = _requireOwnedPendingUploadJob(jobId);

        uint256 chunkIndex = _nextSnpUploadChunkIndex(job);
        uint256 expectedLength = _expectedNextSnpUploadChunkLength(job);
        require(expectedLength > 0, "All SNP chunks uploaded");
        require(
            encryptedSnps.length == expectedLength,
            "Invalid SNP chunk length"
        );

        require(
            !(job.nextChunkIndex > 0 && job.uploadedSnpCount == 0),
            "Streaming path in use"
        );

        euint64[] storage store = snpData[jobId];
        for (uint256 i = 0; i < encryptedSnps.length; i++) {
            euint64 snp = FHE.fromExternal(encryptedSnps[i], inputProof);
            FHE.allowThis(snp);
            store.push(snp);
        }

        job.uploadedSnpCount += encryptedSnps.length;
        emit SnpChunkAppended(jobId, chunkIndex, encryptedSnps.length);
    }

    function finalizeSnpUpload(uint256 jobId) external {
        Job storage job = _requireOwnedPendingUploadJob(jobId);
        require(
            job.uploadedSnpCount == job.weightCount,
            "SNP upload incomplete"
        );

        job.snpsFinalized = true;
        emit SnpUploadFinalized(jobId, msg.sender);
    }

    function computeChunk(uint256 jobId) external {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
        require(job.snpsFinalized, "SNP upload not finalized");
        require(!job.complete, "Job already complete");
        require(!job.cancelled, "Job cancelled");

        uint256 chunkIndex = job.nextChunkIndex;
        require(chunkIndex < job.chunkCount, "Invalid chunk");

        uint256 chunkLen = _computeChunkLength(
            job.weightCount,
            job.computeChunkSize,
            chunkIndex
        );

        // Load SNP slice from flat storage into memory for FHE ops
        uint256 start = chunkIndex * job.computeChunkSize;
        euint64[] memory snps = new euint64[](chunkLen);
        for (uint256 i = 0; i < chunkLen; i++) {
            snps[i] = snpData[jobId][start + i];
        }

        euint64 acc = job.partialSum;
        euint64 genoAcc = job.genoSum;
        if (job.isPrivate) {
            euint64[] memory encryptedWeights = marketplace
                .getEncryptedWeightChunk(job.modelId, chunkIndex);
            require(encryptedWeights.length == chunkLen, "Invalid model chunk");
            for (uint256 i = 0; i < encryptedWeights.length; i++) {
                acc = FHE.add(acc, FHE.mul(encryptedWeights[i], snps[i]));
                genoAcc = FHE.add(genoAcc, snps[i]);
            }
        } else {
            uint64[] memory publicWeights = marketplace.getPublicWeightChunk(
                job.modelId,
                chunkIndex
            );
            require(publicWeights.length == chunkLen, "Invalid model chunk");
            for (uint256 i = 0; i < publicWeights.length; i++) {
                acc = FHE.add(
                    acc,
                    FHE.mul(snps[i], FHE.asEuint64(publicWeights[i]))
                );
                genoAcc = FHE.add(genoAcc, snps[i]);
            }
        }

        FHE.allowThis(acc);
        FHE.allowThis(genoAcc);

        uint256 processedWeights = job.processedWeights + chunkLen;
        job.partialSum = acc;
        job.genoSum = genoAcc;
        job.processedWeights = processedWeights;
        job.nextChunkIndex = chunkIndex + 1;
        if (job.nextChunkIndex == job.chunkCount) {
            job.complete = true;
        }

        emit ChunkComputed(jobId, chunkIndex, processedWeights, job.complete);
    }

    /// @notice Streaming variant: upload one compute-chunk of SNPs and immediately
    ///         accumulate their weighted contribution into partialSum/genoSum in the
    ///         same transaction.  No SNP handles are written to contract storage —
    ///         they are consumed by FHE.mul/add and discarded, eliminating all
    ///         per-SNP SSTORE costs that the classic appendSnpChunk path incurs.
    ///
    ///         Chunk size is governed by computeChunkSize (HCU budget) rather than
    ///         uploadChunkSize.  The fhEVM input-proof budget is 32 euint64s per tx;
    ///         this is satisfied so long as computeChunkSize <= 32 (measured mock HCU
    ///         ceiling: 21, for both public and private models).
    ///
    ///         This path is mutually exclusive with the classic appendSnpChunk path.
    ///         Call createPRSJob first, then call this function ceil(N/computeChunkSize)
    ///         times, then call finalize — no finalizeSnpUpload or computeChunk needed.
    function appendAndComputeChunk(
        uint256 jobId,
        externalEuint64[] calldata encryptedSnps,
        bytes calldata inputProof
    ) external {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
        require(job.requester == msg.sender, "Not requester");
        require(!job.complete, "Job already complete");
        require(!job.cancelled, "Job cancelled");
        require(job.uploadedSnpCount == 0, "Classic upload path in use");

        uint256 chunkIndex = job.nextChunkIndex;
        require(chunkIndex < job.chunkCount, "Invalid chunk");

        uint256 chunkLen = _computeChunkLength(
            job.weightCount,
            job.computeChunkSize,
            chunkIndex
        );
        require(encryptedSnps.length == chunkLen, "Invalid SNP chunk length");

        euint64 acc = job.partialSum;
        euint64 genoAcc = job.genoSum;

        if (job.isPrivate) {
            euint64[] memory encryptedWeights = marketplace
                .getEncryptedWeightChunk(job.modelId, chunkIndex);
            require(encryptedWeights.length == chunkLen, "Invalid model chunk");
            for (uint256 i = 0; i < chunkLen; i++) {
                euint64 snp = FHE.fromExternal(encryptedSnps[i], inputProof);
                // No FHE.allowThis(snp) — handle consumed immediately, not stored
                acc = FHE.add(acc, FHE.mul(encryptedWeights[i], snp));
                genoAcc = FHE.add(genoAcc, snp);
            }
        } else {
            uint64[] memory publicWeights = marketplace.getPublicWeightChunk(
                job.modelId,
                chunkIndex
            );
            require(publicWeights.length == chunkLen, "Invalid model chunk");
            for (uint256 i = 0; i < chunkLen; i++) {
                euint64 snp = FHE.fromExternal(encryptedSnps[i], inputProof);
                // No FHE.allowThis(snp) — handle consumed immediately, not stored
                acc = FHE.add(acc, FHE.mul(snp, FHE.asEuint64(publicWeights[i])));
                genoAcc = FHE.add(genoAcc, snp);
            }
        }

        FHE.allowThis(acc);
        FHE.allowThis(genoAcc);

        uint256 processedWeights = job.processedWeights + chunkLen;
        job.partialSum = acc;
        job.genoSum = genoAcc;
        job.processedWeights = processedWeights;
        job.nextChunkIndex = chunkIndex + 1;
        if (job.nextChunkIndex == job.chunkCount) {
            job.complete = true;
        }

        emit ChunkComputed(jobId, chunkIndex, processedWeights, job.complete);
    }

    function readPartial(uint256 jobId) external returns (euint64) {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
        require(job.requester == msg.sender, "Not requester");
        require(!job.cancelled, "Job cancelled");
        require(
            !marketplace.isOracleRequired(job.modelId),
            "Model requires oracle finalization"
        );
        job.partialSum = FHE.allow(job.partialSum, msg.sender);
        return job.partialSum;
    }

    /// @notice Returns the quantization-corrected encrypted PRS score for a completed job.
    ///
    /// @dev    The raw encoded score is ACL-granted directly to the requester.  The
    ///         ResultOracle (classify()) is therefore optional post-processing: the
    ///         requester can decrypt the raw score without going through the oracle.
    ///         This means the noisy categorical release layer does not prevent the
    ///         job requester from learning the exact score.  The oracle path is
    ///         meaningful only when model owners enable oracle-required mode so
    ///         raw-score release is blocked.  Keep this in mind when reasoning
    ///         about model-weight-extraction attacks via adaptive probing.
    function finalize(uint256 jobId) external returns (euint64) {
        Job storage job = _requireOwnedCompleteJob(jobId);
        require(!job.finalized, "Job already finalized");
        require(
            !marketplace.isOracleRequired(job.modelId),
            "Model requires oracle finalization"
        );
        euint64 encodedScore = _encodeFinalScore(job);
        encodedScore = FHE.allow(encodedScore, msg.sender);
        job.finalized = true;

        emit JobFinalized(jobId, msg.sender, encodedScore);
        return encodedScore;
    }

    /// @notice Computes the final encoded score and ACL-grants it to a specific grantee.
    ///
    /// @dev    This is a lower-level additive alternative to finalize(): it grants
    ///         handle access to another address without automatically granting
    ///         requester decryption.  On fhEVM, follow-up use of that handle still
    ///         depends on the transaction sender owning the handle, so EOAs cannot
    ///         complete a `finalizeTo(...)` → `oracle.classifyPreauthorized(...)`
    ///         flow on behalf of the grantee.  Use finalizeAndClassify(...) for an
    ///         atomic oracle-only path that avoids requester-side decrypt / re-encrypt.
    ///         This does not remove the requester's ability to later call
    ///         finalize(jobId) and grant themselves access via the legacy path.
    function finalizeTo(
        uint256 jobId,
        address grantee
    ) external returns (euint64) {
        require(grantee != address(0), "Invalid grantee");
        Job storage job = _requireOwnedCompleteJob(jobId);
        require(!job.finalized, "Job already finalized");
        require(
            !marketplace.isOracleRequired(job.modelId),
            "Model requires oracle finalization"
        );
        euint64 encodedScore = _encodeFinalScore(job);
        encodedScore = FHE.allow(encodedScore, grantee);
        job.finalized = true;

        emit JobFinalizedFor(jobId, msg.sender, grantee, encodedScore);
        return encodedScore;
    }

    /// @notice Computes the final encoded score and routes it into the model's oracle
    ///         under the model's own release policy.
    ///
    /// @dev    The requester supplies only the job id.  The oracle address and both
    ///         classification thresholds are loaded from the model's release policy,
    ///         which its owner fixed before the model was finalized and cannot change
    ///         afterwards.  This is the only protected classification entry point, and
    ///         it accepts no requester-chosen release parameters of any kind.
    ///
    ///         Why: when the requester could pass lowThreshold/highThreshold per call,
    ///         repeated queries with shifted thresholds performed a binary search on the
    ///         encrypted score.  That adaptive channel leaked far more per query than a
    ///         fixed ternary classification and largely defeated the randomized release.
    ///         Reading the thresholds from immutable model state removes it: every
    ///         requester of a model receives the same classification resolution, fixed
    ///         before any query was possible.
    ///
    ///         The engine remains the handle owner during the same transaction, so
    ///         ResultOracle.classifyPreauthorized(...) imports the score without a new
    ///         input proof.
    function finalizeAndClassify(uint256 jobId) external returns (euint8) {
        Job storage job = _requireOwnedCompleteJob(jobId);
        require(!job.finalized, "Job already finalized");

        (
            address oracle,
            uint64 lowThreshold,
            uint64 highThreshold,
            ,
            bool configured
        ) = marketplace.getReleasePolicy(job.modelId);
        require(configured, "Model has no release policy");

        euint64 encodedScore = _encodeFinalScore(job);

        // Grant the oracle contract ACL access so classifyPreauthorized can
        // import the handle via FHE.fromExternal(handle, hex"").
        FHE.allow(encodedScore, oracle);
        job.finalized = true;

        emit JobFinalizedFor(jobId, msg.sender, oracle, encodedScore);
        return
            IResultOracle(oracle).classifyPreauthorized(
                externalEuint64.wrap(euint64.unwrap(encodedScore)),
                lowThreshold,
                highThreshold
            );
    }

    /// @notice View getter for the current partial sum handle (for debug/test decrypt).
    function getPartialSum(uint256 jobId) external view returns (euint64) {
        require(jobId < jobs.length, "Invalid job");
        return jobs[jobId].partialSum;
    }

    /// @notice Cancel an incomplete job, reclaim SNP storage, and refund the rate
    ///         limit slot if the current window is still active.
    ///
    /// @dev    Cancellation is permanent — all subsequent operations on the job revert.
    ///         Complete jobs cannot be cancelled; the requester may simply not call
    ///         finalize if they want to abandon a completed job.
    ///
    ///         SNP storage (`snpData[jobId]`) is deleted to reclaim gas on classic-path
    ///         jobs.  The rate limit slot consumed at creation is refunded if the block
    ///         window has not yet expired, allowing an immediate replacement job.
    function cancelJob(uint256 jobId) external {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
        require(job.requester == msg.sender, "Not requester");
        require(!job.complete, "Job already complete");
        require(!job.cancelled, "Already cancelled");

        job.cancelled = true;
        delete snpData[jobId];

        // Refund the wallet and sample rate limit slots if their windows are
        // still open.
        (uint256 maxJobs, uint256 windowBlocks) = marketplace.getRateLimitConfig(
            job.modelId
        );
        if (maxJobs > 0) {
            _refundRateLimitWindow(
                requesterWindows[job.modelId][msg.sender],
                windowBlocks
            );
            _refundRateLimitWindow(
                sampleWindows[job.modelId][job.sampleId],
                windowBlocks
            );
        }

        emit JobCancelled(jobId, msg.sender);
    }

    function isJobFinalized(uint256 jobId) external view returns (bool) {
        require(jobId < jobs.length, "Invalid job");
        return jobs[jobId].finalized;
    }

    function isJobCancelled(uint256 jobId) external view returns (bool) {
        require(jobId < jobs.length, "Invalid job");
        return jobs[jobId].cancelled;
    }

    function jobCount() external view returns (uint256) {
        return jobs.length;
    }

    function getJobState(
        uint256 jobId
    )
        external
        view
        returns (
            uint256 modelId,
            address requester,
            uint256 weightCount,
            uint256 uploadChunkSize,
            uint256 computeChunkSize,
            uint256 chunkCount,
            uint256 uploadedSnpCount,
            bool snpsFinalized,
            uint256 nextChunkIndex,
            uint256 processedWeights,
            bool isPrivate,
            bool complete,
            uint256 sampleId
        )
    {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
        return (
            job.modelId,
            job.requester,
            job.weightCount,
            job.uploadChunkSize,
            job.computeChunkSize,
            job.chunkCount,
            job.uploadedSnpCount,
            job.snpsFinalized,
            job.nextChunkIndex,
            job.processedWeights,
            job.isPrivate,
            job.complete,
            job.sampleId
        );
    }

    function _requireOwnedPendingUploadJob(
        uint256 jobId
    ) internal view returns (Job storage job) {
        require(jobId < jobs.length, "Invalid job");
        job = jobs[jobId];
        require(job.requester == msg.sender, "Not requester");
        require(!job.cancelled, "Job cancelled");
        require(!job.snpsFinalized, "SNP upload finalized");
    }

    function _requireOwnedCompleteJob(
        uint256 jobId
    ) internal view returns (Job storage job) {
        require(jobId < jobs.length, "Invalid job");
        job = jobs[jobId];
        require(job.complete, "Job not complete");
        require(job.requester == msg.sender, "Not requester");
    }

    function _nextSnpUploadChunkIndex(
        Job storage job
    ) internal view returns (uint256) {
        return job.uploadedSnpCount / job.uploadChunkSize;
    }

    function _expectedNextSnpUploadChunkLength(
        Job storage job
    ) internal view returns (uint256) {
        uint256 remaining = job.weightCount - job.uploadedSnpCount;
        return
            remaining > job.uploadChunkSize ? job.uploadChunkSize : remaining;
    }

    function _enforceRateLimit(
        uint256 modelId,
        uint256 sampleId,
        address requester
    ) internal {
        (uint256 maxJobs, uint256 windowBlocks) = marketplace
            .getRateLimitConfig(modelId);
        if (maxJobs == 0) return; // unlimited

        _consumeRateLimitWindow(
            requesterWindows[modelId][requester],
            maxJobs,
            windowBlocks
        );
        _consumeRateLimitWindow(
            sampleWindows[modelId][sampleId],
            maxJobs,
            windowBlocks
        );
    }

    function _consumeRateLimitWindow(
        RateLimitWindow storage w,
        uint256 maxJobs,
        uint256 windowBlocks
    ) internal {
        if (block.number >= w.windowStart + windowBlocks) {
            // Window expired — reset
            w.windowStart = block.number;
            w.jobCount = 1;
        } else {
            require(w.jobCount < maxJobs, "Rate limit exceeded");
            w.jobCount += 1;
        }
    }

    function _refundRateLimitWindow(
        RateLimitWindow storage w,
        uint256 windowBlocks
    ) internal {
        if (block.number < w.windowStart + windowBlocks && w.jobCount > 0) {
            w.jobCount -= 1;
        }
    }

    function _computeChunkLength(
        uint256 weightCount,
        uint256 computeChunkSize,
        uint256 chunkIndex
    ) internal pure returns (uint256) {
        uint256 start = chunkIndex * computeChunkSize;
        uint256 remaining = weightCount - start;
        return remaining > computeChunkSize ? computeChunkSize : remaining;
    }

    function _encodeFinalScore(
        Job storage job
    ) internal returns (euint64 encodedScore) {
        // V1 quantization correction (avoids negative intermediate):
        //   encoded_score = (weighted_sum + score_offset) - (weight_zero_point * geno_sum)
        // Rearranged so the subtraction never underflows: weighted_sum + score_offset
        // is guaranteed >= weight_zero_point * geno_sum when score_offset = -raw_min.
        euint64 withOffset = FHE.add(
            job.partialSum,
            FHE.asEuint64(job.scoreOffset)
        );
        euint64 correction = FHE.mul(
            job.genoSum,
            FHE.asEuint64(job.weightZeroPoint)
        );
        encodedScore = FHE.sub(withOffset, correction);
        FHE.allowThis(encodedScore);
    }
}
