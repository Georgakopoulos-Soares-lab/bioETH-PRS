// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "./ModelMarketplace.sol";
import "./GenomicRegistry.sol";

/// @title PRSComputeEngine - Chunked PRS dot-product against chunk-published models.
///
/// SNP upload and compute chunk sizes are independent:
///   uploadChunkSize  — inherited from the model; governs how many encrypted SNPs are
///                      accepted per appendSnpChunk call (≤ 32 for fhEVM input-proof budget).
///   computeChunkSize — inherited from the model; governs how many SNP×weight pairs are
///                      processed per computeChunk call (HCU-constrained).
///                      Mock ceiling: 20. Sepolia ceiling: TBD (run `npm run probe:hcu`).
///
/// SNPs are stored flat (one contiguous array per job) and sliced by computeChunkSize during compute.
contract PRSComputeEngine is ZamaEthereumConfig {
    struct Job {
        uint256 modelId;
        uint256 sampleId;
        uint256 weightCount;
        uint256 uploadChunkSize;   // for SNP upload validation
        uint256 computeChunkSize;  // for compute slicing (HCU-constrained)
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
    }

    ModelMarketplace public marketplace;
    GenomicRegistry public registry;
    Job[] private jobs;
    // Flat per-job SNP storage — indexed by absolute SNP position.
    mapping(uint256 => euint64[]) private snpData;

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
    event SnpUploadFinalized(
        uint256 indexed jobId,
        address indexed requester
    );
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

    constructor(address marketplaceAddress, address registryAddress) {
        marketplace = ModelMarketplace(marketplaceAddress);
        registry = GenomicRegistry(registryAddress);
    }

    function createPRSJob(uint256 modelId, uint256 sampleId) external returns (uint256) {
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
            scoreOffset: scoreOffset
        });

        jobs.push(job);
        uint256 jobId = jobs.length - 1;
        emit JobCreated(jobId, modelId, msg.sender, weightCount, computeChunkSize, sampleId);
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
        require(job.uploadedSnpCount == job.weightCount, "SNP upload incomplete");

        job.snpsFinalized = true;
        emit SnpUploadFinalized(jobId, msg.sender);
    }

    function computeChunk(uint256 jobId) external {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
        require(job.snpsFinalized, "SNP upload not finalized");
        require(!job.complete, "Job already complete");

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
            require(
                encryptedWeights.length == chunkLen,
                "Invalid model chunk"
            );
            for (uint256 i = 0; i < encryptedWeights.length; i++) {
                acc = FHE.add(acc, FHE.mul(encryptedWeights[i], snps[i]));
                genoAcc = FHE.add(genoAcc, snps[i]);
            }
        } else {
            uint64[] memory publicWeights = marketplace.getPublicWeightChunk(
                job.modelId,
                chunkIndex
            );
            require(
                publicWeights.length == chunkLen,
                "Invalid model chunk"
            );
            for (uint256 i = 0; i < publicWeights.length; i++) {
                acc = FHE.add(acc, FHE.mul(snps[i], FHE.asEuint64(publicWeights[i])));
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

        emit ChunkComputed(
            jobId,
            chunkIndex,
            processedWeights,
            job.complete
        );
    }

    function readPartial(uint256 jobId) external returns (euint64) {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
        require(job.requester == msg.sender, "Not requester");
        job.partialSum = FHE.allow(job.partialSum, msg.sender);
        return job.partialSum;
    }

    /// @notice Returns the quantization-corrected encrypted PRS score for a completed job.
    ///
    /// @dev    The raw encoded score is ACL-granted directly to the requester.  The
    ///         ResultOracle (classify()) is therefore optional post-processing: the
    ///         requester can decrypt the raw score without going through the oracle.
    ///         This means the DP noise layer does not prevent the job requester from
    ///         learning the exact score.  The oracle's privacy guarantee holds only
    ///         against third parties who observe the classified output, not against
    ///         the requester themselves.  Keep this in mind when reasoning about
    ///         model-weight-extraction attacks via adaptive probing.
    function finalize(uint256 jobId) external returns (euint64) {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
        require(job.complete, "Job not complete");
        require(job.requester == msg.sender, "Not requester");

        // V1 quantization correction (avoids negative intermediate):
        //   encoded_score = (weighted_sum + score_offset) - (weight_zero_point * geno_sum)
        // Rearranged so the subtraction never underflows: weighted_sum + score_offset
        // is guaranteed >= weight_zero_point * geno_sum when score_offset = -raw_min.
        euint64 withOffset = FHE.add(job.partialSum, FHE.asEuint64(job.scoreOffset));
        euint64 correction = FHE.mul(job.genoSum, FHE.asEuint64(job.weightZeroPoint));
        euint64 encodedScore = FHE.sub(withOffset, correction);
        FHE.allowThis(encodedScore);
        encodedScore = FHE.allow(encodedScore, msg.sender);

        emit JobFinalized(jobId, msg.sender, encodedScore);
        return encodedScore;
    }

    /// @notice View getter for the current partial sum handle (for debug/test decrypt).
    function getPartialSum(uint256 jobId) external view returns (euint64) {
        require(jobId < jobs.length, "Invalid job");
        return jobs[jobId].partialSum;
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
        require(!job.snpsFinalized, "SNP upload finalized");
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
        return remaining > job.uploadChunkSize ? job.uploadChunkSize : remaining;
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
}
