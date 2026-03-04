// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "encrypted-types/EncryptedTypes.sol";
import "./TFHE.sol";

/// @title BioETHPRS - bioETH PRS Homomorphic Encryption Polygenic Risk Scoring (Zama FHEVM)
/// @notice Prototype contract (our bioETH PRS implementation) with chunked PRS computation.
contract BioETHPRS {
    using TFHE for euint64;

    struct Model {
        euint64[] weights;
        address owner;
        bool isPrivate;
    }

    struct Job {
        uint256 modelId;
        euint64[] snps;
        uint256 nextIndex;
        uint256 chunkSize;
        euint64 partialSum;
        address requester;
        bool complete;
    }

    Model[] private models;
    Job[] private jobs;

    event ModelUploaded(uint256 indexed modelId, address indexed owner, bool isPrivate);
    event JobCreated(uint256 indexed jobId, uint256 indexed modelId, address indexed requester);
    event ChunkComputed(uint256 indexed jobId, uint256 newNextIndex, bool complete);

    function uploadModel(euint64[] calldata encryptedWeights, bool isPrivate) external returns (uint256) {
        models.push(Model({ weights: encryptedWeights, owner: msg.sender, isPrivate: isPrivate }));
        uint256 modelId = models.length - 1;
        emit ModelUploaded(modelId, msg.sender, isPrivate);
        return modelId;
    }

    function modelCount() external view returns (uint256) {
        return models.length;
    }

    function jobCount() external view returns (uint256) {
        return jobs.length;
    }

    /// @notice Initialize a chunked PRS computation job.
    function startPRS(
        uint256 modelId,
        euint64[] calldata encryptedSnps,
        uint256 chunkSize
    ) external returns (uint256) {
        require(modelId < models.length, "Invalid model");
        require(chunkSize > 0, "Chunk size must be > 0");

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

    /// @notice Compute the next chunk of the dot product.
    function computeChunk(uint256 jobId) external {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
        require(!job.complete, "Job already complete");

        Model storage model = models[job.modelId];
        require(model.weights.length == job.snps.length, "Length mismatch");

        uint256 start = job.nextIndex;
        uint256 end = start + job.chunkSize;
        if (end > job.snps.length) {
            end = job.snps.length;
        }

        euint64 acc = job.partialSum;
        for (uint256 i = start; i < end; i++) {
            euint64 term = model.weights[i].mul(job.snps[i]);
            acc = acc.add(term);
        }

        job.partialSum = acc;
        job.nextIndex = end;
        if (end == job.snps.length) {
            job.complete = true;
        }

        emit ChunkComputed(jobId, end, job.complete);
    }

    /// @notice Read the current partial sum handle (allowed for requester).
    function readPartial(uint256 jobId) external returns (euint64) {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
        job.partialSum = TFHE.allow(job.partialSum, msg.sender);
        return job.partialSum;
    }

    /// @notice Finalize a completed job and return the encrypted PRS handle.
    function finalize(uint256 jobId) external returns (euint64) {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
        require(job.complete, "Job not complete");
        require(job.requester == msg.sender, "Not requester");
        job.partialSum = TFHE.allow(job.partialSum, msg.sender);
        return job.partialSum;
    }
}
