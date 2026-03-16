// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TFHE.sol";
import "./ModelMarketplace.sol";

/// @title PRSComputeEngine - Chunked PRS dot-product against a model marketplace.
contract PRSComputeEngine {
    using TFHE for euint64;

    struct Job {
        uint256 modelId;
        euint64[] snps;
        uint256 nextIndex;
        uint256 chunkSize;
        euint64 partialSum;
        address requester;
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
        uint256 newNextIndex,
        bool complete
    );

    constructor(address marketplaceAddress) {
        marketplace = ModelMarketplace(marketplaceAddress);
    }

    function startPRS(
        uint256 modelId,
        euint64[] calldata encryptedSnps,
        uint256 chunkSize
    ) external returns (uint256) {
        require(chunkSize > 0, "Chunk size must be > 0");
        require(modelId < marketplace.modelCount(), "Invalid model");

        Job memory job = Job({
            modelId: modelId,
            snps: encryptedSnps,
            nextIndex: 0,
            chunkSize: chunkSize,
            partialSum: TFHE.asEuint64(0),
            requester: msg.sender,
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

        (
            uint64[] memory publicWeights,
            euint64[] memory encryptedWeights,
            bool isPrivate,

        ) = marketplace.getModel(job.modelId);
        if (isPrivate) {
            require(
                encryptedWeights.length == job.snps.length,
                "Length mismatch"
            );
        } else {
            require(publicWeights.length == job.snps.length, "Length mismatch");
        }

        uint256 start = job.nextIndex;
        uint256 end = start + job.chunkSize;
        if (end > job.snps.length) {
            end = job.snps.length;
        }

        euint64 acc = job.partialSum;
        for (uint256 i = start; i < end; i++) {
            if (isPrivate) {
                euint64 term = encryptedWeights[i].mul(job.snps[i]);
                acc = acc.add(term);
            } else {
                euint64 term = job.snps[i].mulPlain(publicWeights[i]);
                acc = acc.add(term);
            }
        }

        job.partialSum = acc;
        job.nextIndex = end;
        if (end == job.snps.length) {
            job.complete = true;
        }

        emit ChunkComputed(jobId, end, job.complete);
    }

    function readPartial(uint256 jobId) external returns (euint64) {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
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
}
