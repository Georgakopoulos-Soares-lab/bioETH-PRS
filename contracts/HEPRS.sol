// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title BioETHPRS - bioETH PRS Homomorphic Encryption Polygenic Risk Scoring (Zama FHEVM)
/// @notice Prototype contract (our bioETH PRS implementation) with chunked PRS computation.
contract BioETHPRS is ZamaEthereumConfig {
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

    event ModelUploaded(
        uint256 indexed modelId,
        address indexed owner,
        bool isPrivate
    );
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

    function uploadModel(
        externalEuint64[] calldata encryptedWeights,
        bytes calldata inputProof,
        bool isPrivate
    ) external returns (uint256) {
        Model storage model = models.push();
        model.owner = msg.sender;
        model.isPrivate = isPrivate;
        for (uint256 i = 0; i < encryptedWeights.length; i++) {
            euint64 w = FHE.fromExternal(encryptedWeights[i], inputProof);
            FHE.allowThis(w);
            model.weights.push(w);
        }
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
        externalEuint64[] calldata encryptedSnps,
        bytes calldata inputProof,
        uint256 chunkSize
    ) external returns (uint256) {
        require(modelId < models.length, "Invalid model");
        require(chunkSize > 0, "Chunk size must be > 0");

        euint64 zero = FHE.asEuint64(0);
        FHE.allowThis(zero);

        Job storage job = jobs.push();
        job.modelId = modelId;
        job.nextIndex = 0;
        job.chunkSize = chunkSize;
        job.partialSum = zero;
        job.requester = msg.sender;
        job.complete = false;
        for (uint256 i = 0; i < encryptedSnps.length; i++) {
            euint64 snp = FHE.fromExternal(encryptedSnps[i], inputProof);
            FHE.allowThis(snp);
            job.snps.push(snp);
        }

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
            euint64 term = FHE.mul(model.weights[i], job.snps[i]);
            acc = FHE.add(acc, term);
        }

        FHE.allowThis(acc);
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
        require(job.requester == msg.sender, "Not requester");
        FHE.allow(job.partialSum, msg.sender);
        return job.partialSum;
    }

    /// @notice Finalize a completed job and return the encrypted PRS handle.
    function finalize(uint256 jobId) external returns (euint64) {
        require(jobId < jobs.length, "Invalid job");
        Job storage job = jobs[jobId];
        require(job.complete, "Job not complete");
        require(job.requester == msg.sender, "Not requester");
        FHE.allow(job.partialSum, msg.sender);
        return job.partialSum;
    }

    /// @notice View getter for the current partial sum handle (for debug/test decrypt).
    function getPartialSum(uint256 jobId) external view returns (euint64) {
        require(jobId < jobs.length, "Invalid job");
        return jobs[jobId].partialSum;
    }
}
