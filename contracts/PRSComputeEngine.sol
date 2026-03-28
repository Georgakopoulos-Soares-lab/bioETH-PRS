// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TFHE.sol";
import "./ModelMarketplace.sol";

/// @title PRSComputeEngine - Chunked PRS dot-product against chunk-published models.
contract PRSComputeEngine {
    using TFHE for euint64;

    struct Job {
        uint256 modelId;
        euint64[] snps;
        uint256 weightCount;
        uint256 chunkSize;
        uint256 chunkCount;
        uint256 nextChunkIndex;
        uint256 processedWeights;
        euint64 partialSum;
        address requester;
        bool isPrivate;
        bool complete;
    }

    ModelMarketplace public marketplace;
    Job[] private jobs;

    event JobCreated(
        uint256 indexed jobId,
        uint256 indexed modelId,
        address indexed requester
    );
    event ChunkComputed(
        uint256 indexed jobId,
        uint256 indexed chunkIndex,
        uint256 processedWeights,
        bool complete
    );

    constructor(address marketplaceAddress) {
        marketplace = ModelMarketplace(marketplaceAddress);
    }

    function startPRS(
        uint256 modelId,
        euint64[] calldata encryptedSnps
    ) external returns (uint256) {
        (
            bool isPrivate,
            bool finalized,
            uint256 weightCount,
            uint256 chunkSize,
            uint256 chunkCount
        ) = marketplace.getModelConfig(modelId);

        require(finalized, "Model not finalized");
        require(weightCount == encryptedSnps.length, "Length mismatch");
        if (isPrivate) {
            require(
                marketplace.canReadPrivateModel(modelId, address(this)),
                "Engine not authorized"
            );
        }

        Job memory job = Job({
            modelId: modelId,
            snps: encryptedSnps,
            weightCount: weightCount,
            chunkSize: chunkSize,
            chunkCount: chunkCount,
            nextChunkIndex: 0,
            processedWeights: 0,
            partialSum: TFHE.asEuint64(0),
            requester: msg.sender,
            isPrivate: isPrivate,
            complete: false
        });

        jobs.push(job);
        uint256 jobId = jobs.length - 1;
        emit JobCreated(jobId, modelId, msg.sender);
        return jobId;
    }

    function computeChunk(uint256 jobId) external {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
        require(!job.complete, "Job already complete");

        uint256 chunkIndex = job.nextChunkIndex;
        require(chunkIndex < job.chunkCount, "Invalid chunk");

        uint256 expectedLength = _expectedChunkLength(
            job.weightCount,
            job.chunkSize,
            chunkIndex
        );
        uint256 start = job.processedWeights;

        euint64 acc = job.partialSum;
        if (job.isPrivate) {
            euint64[] memory encryptedWeights = marketplace
                .getEncryptedWeightChunk(job.modelId, chunkIndex);
            require(
                encryptedWeights.length == expectedLength,
                "Invalid model chunk"
            );
            for (uint256 i = 0; i < encryptedWeights.length; i++) {
                euint64 term = encryptedWeights[i].mul(job.snps[start + i]);
                acc = acc.add(term);
            }
        } else {
            uint64[] memory publicWeights = marketplace.getPublicWeightChunk(
                job.modelId,
                chunkIndex
            );
            require(
                publicWeights.length == expectedLength,
                "Invalid model chunk"
            );
            for (uint256 i = 0; i < publicWeights.length; i++) {
                euint64 term = job.snps[start + i].mulPlain(publicWeights[i]);
                acc = acc.add(term);
            }
        }

        uint256 processedWeights = start + expectedLength;
        job.partialSum = acc;
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
        job.partialSum = TFHE.allow(job.partialSum, msg.sender);
        return job.partialSum;
    }

    function finalize(uint256 jobId) external returns (euint64) {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
        require(job.complete, "Job not complete");
        require(job.requester == msg.sender, "Not requester");
        job.partialSum = TFHE.allow(job.partialSum, msg.sender);
        return job.partialSum;
    }

    function jobCount() external view returns (uint256) {
        return jobs.length;
    }

    function _expectedChunkLength(
        uint256 weightCount,
        uint256 chunkSize,
        uint256 chunkIndex
    ) internal pure returns (uint256) {
        uint256 start = chunkIndex * chunkSize;
        uint256 remaining = weightCount - start;
        return remaining > chunkSize ? chunkSize : remaining;
    }
}
