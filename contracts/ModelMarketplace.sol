// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ModelMarketplace - Chunked GWAS model publication for public and private weights.
contract ModelMarketplace is ZamaEthereumConfig {
    struct ModelHeader {
        address owner;
        bool isPrivate;
        bool finalized;
        uint256 weightCount;
        uint256 chunkSize;
        uint256 chunkCount;
        uint256 uploadedWeightCount;
        string manifestURI;
        bytes32 manifestHash;
        bytes32 sourceModelHash;
        uint64 weightZeroPoint;
        uint64 scoreOffset;
    }

    ModelHeader[] private modelHeaders;
    mapping(uint256 => mapping(uint256 => uint64[])) private publicWeightChunks;
    mapping(uint256 => mapping(uint256 => euint64[]))
        private encryptedWeightChunks;
    mapping(uint256 => mapping(address => bool)) private privateChunkReaders;

    event ModelShellCreated(
        uint256 indexed modelId,
        address indexed owner,
        bool isPrivate,
        uint256 weightCount,
        uint256 chunkSize
    );
    event PublicModelChunkAppended(
        uint256 indexed modelId,
        uint256 indexed chunkIndex,
        uint256 chunkLength
    );
    event EncryptedModelChunkAppended(
        uint256 indexed modelId,
        uint256 indexed chunkIndex,
        uint256 chunkLength
    );
    event ModelFinalized(uint256 indexed modelId, address indexed owner);
    event PrivateModelReaderSet(
        uint256 indexed modelId,
        address indexed reader,
        bool allowed
    );

    function createModelShell(
        bool isPrivate,
        uint256 weightCount,
        uint256 chunkSize,
        string calldata manifestURI,
        bytes32 manifestHash,
        bytes32 sourceModelHash,
        uint64 weightZeroPoint,
        uint64 scoreOffset
    ) external returns (uint256) {
        require(weightCount > 0, "Weight count must be > 0");
        require(chunkSize > 0, "Chunk size must be > 0");

        uint256 chunkCount = (weightCount + chunkSize - 1) / chunkSize;
        modelHeaders.push(
            ModelHeader({
                owner: msg.sender,
                isPrivate: isPrivate,
                finalized: false,
                weightCount: weightCount,
                chunkSize: chunkSize,
                chunkCount: chunkCount,
                uploadedWeightCount: 0,
                manifestURI: manifestURI,
                manifestHash: manifestHash,
                sourceModelHash: sourceModelHash,
                weightZeroPoint: weightZeroPoint,
                scoreOffset: scoreOffset
            })
        );

        uint256 modelId = modelHeaders.length - 1;
        if (isPrivate) {
            privateChunkReaders[modelId][msg.sender] = true;
        }

        emit ModelShellCreated(
            modelId,
            msg.sender,
            isPrivate,
            weightCount,
            chunkSize
        );
        return modelId;
    }

    function appendPublicModelChunk(
        uint256 modelId,
        uint64[] calldata weights
    ) external {
        ModelHeader storage model = _requireOwnedDraftModel(modelId);
        require(!model.isPrivate, "Model is private");

        uint256 chunkIndex = _nextChunkIndex(model);
        uint256 expectedLength = _expectedNextChunkLength(model);
        require(expectedLength > 0, "All chunks uploaded");
        require(weights.length == expectedLength, "Invalid chunk length");

        uint64[] storage chunk = publicWeightChunks[modelId][chunkIndex];
        require(chunk.length == 0, "Chunk already uploaded");
        for (uint256 i = 0; i < weights.length; i++) {
            chunk.push(weights[i]);
        }

        model.uploadedWeightCount += weights.length;
        emit PublicModelChunkAppended(modelId, chunkIndex, weights.length);
    }

    function appendEncryptedModelChunk(
        uint256 modelId,
        externalEuint64[] calldata encryptedWeights,
        bytes calldata inputProof
    ) external {
        ModelHeader storage model = _requireOwnedDraftModel(modelId);
        require(model.isPrivate, "Model is public");

        uint256 chunkIndex = _nextChunkIndex(model);
        uint256 expectedLength = _expectedNextChunkLength(model);
        require(expectedLength > 0, "All chunks uploaded");
        require(
            encryptedWeights.length == expectedLength,
            "Invalid chunk length"
        );

        euint64[] storage chunk = encryptedWeightChunks[modelId][chunkIndex];
        require(chunk.length == 0, "Chunk already uploaded");
        for (uint256 i = 0; i < encryptedWeights.length; i++) {
            euint64 w = FHE.fromExternal(encryptedWeights[i], inputProof);
            FHE.allowThis(w);
            chunk.push(w);
        }

        model.uploadedWeightCount += encryptedWeights.length;
        emit EncryptedModelChunkAppended(
            modelId,
            chunkIndex,
            encryptedWeights.length
        );
    }

    function finalizeModel(uint256 modelId) external {
        require(modelId < modelHeaders.length, "Invalid model");
        ModelHeader storage model = modelHeaders[modelId];
        require(model.owner == msg.sender, "Not owner");
        require(!model.finalized, "Model already finalized");
        require(
            model.uploadedWeightCount == model.weightCount,
            "Model incomplete"
        );

        model.finalized = true;
        emit ModelFinalized(modelId, msg.sender);
    }

    function setPrivateModelReader(
        uint256 modelId,
        address reader,
        bool allowed
    ) external {
        require(modelId < modelHeaders.length, "Invalid model");
        ModelHeader storage model = modelHeaders[modelId];
        require(model.isPrivate, "Model is public");
        require(model.owner == msg.sender, "Not owner");

        privateChunkReaders[modelId][reader] = allowed;
        emit PrivateModelReaderSet(modelId, reader, allowed);
    }

    function canReadPrivateModel(
        uint256 modelId,
        address reader
    ) external view returns (bool) {
        require(modelId < modelHeaders.length, "Invalid model");
        ModelHeader storage model = modelHeaders[modelId];
        if (!model.isPrivate) {
            return false;
        }

        return _canReadPrivateModel(modelId, reader);
    }

    function getModelConfig(
        uint256 modelId
    )
        external
        view
        returns (
            bool isPrivate,
            bool finalized,
            uint256 weightCount,
            uint256 chunkSize,
            uint256 chunkCount,
            uint64 weightZeroPoint,
            uint64 scoreOffset
        )
    {
        require(modelId < modelHeaders.length, "Invalid model");
        ModelHeader storage model = modelHeaders[modelId];
        return (
            model.isPrivate,
            model.finalized,
            model.weightCount,
            model.chunkSize,
            model.chunkCount,
            model.weightZeroPoint,
            model.scoreOffset
        );
    }

    function getModelHeader(
        uint256 modelId
    )
        external
        view
        returns (
            address owner,
            bool isPrivate,
            bool finalized,
            uint256 weightCount,
            uint256 chunkSize,
            uint256 chunkCount,
            uint256 uploadedWeightCount,
            string memory manifestURI,
            bytes32 manifestHash,
            bytes32 sourceModelHash,
            uint64 weightZeroPoint,
            uint64 scoreOffset
        )
    {
        require(modelId < modelHeaders.length, "Invalid model");
        ModelHeader storage model = modelHeaders[modelId];
        return (
            model.owner,
            model.isPrivate,
            model.finalized,
            model.weightCount,
            model.chunkSize,
            model.chunkCount,
            model.uploadedWeightCount,
            model.manifestURI,
            model.manifestHash,
            model.sourceModelHash,
            model.weightZeroPoint,
            model.scoreOffset
        );
    }

    function getPublicWeightChunk(
        uint256 modelId,
        uint256 chunkIndex
    ) external view returns (uint64[] memory) {
        require(modelId < modelHeaders.length, "Invalid model");
        ModelHeader storage model = modelHeaders[modelId];
        require(!model.isPrivate, "Model is private");
        require(chunkIndex < model.chunkCount, "Invalid chunk");

        uint64[] storage chunk = publicWeightChunks[modelId][chunkIndex];
        require(chunk.length > 0, "Chunk not uploaded");
        return chunk;
    }

    function getEncryptedWeightChunk(
        uint256 modelId,
        uint256 chunkIndex
    ) external returns (euint64[] memory) {
        require(modelId < modelHeaders.length, "Invalid model");
        ModelHeader storage model = modelHeaders[modelId];
        require(model.isPrivate, "Model is public");
        require(chunkIndex < model.chunkCount, "Invalid chunk");
        require(
            _canReadPrivateModel(modelId, msg.sender),
            "Reader not authorized"
        );

        euint64[] storage chunk = encryptedWeightChunks[modelId][chunkIndex];
        require(chunk.length > 0, "Chunk not uploaded");

        // Grant FHE ACL to the caller so it can use these handles in FHE ops
        for (uint256 i = 0; i < chunk.length; i++) {
            FHE.allow(chunk[i], msg.sender);
        }
        return chunk;
    }

    /// @notice View-only getter for encrypted weight handles (no ACL grant).
    /// Use for debug/test decrypt only — caller won't have FHE permission on returned handles.
    function getEncryptedWeightChunkHandles(
        uint256 modelId,
        uint256 chunkIndex
    ) external view returns (euint64[] memory) {
        require(modelId < modelHeaders.length, "Invalid model");
        ModelHeader storage model = modelHeaders[modelId];
        require(model.isPrivate, "Model is public");
        require(chunkIndex < model.chunkCount, "Invalid chunk");
        require(
            _canReadPrivateModel(modelId, msg.sender),
            "Reader not authorized"
        );

        euint64[] storage chunk = encryptedWeightChunks[modelId][chunkIndex];
        require(chunk.length > 0, "Chunk not uploaded");
        return chunk;
    }

    function modelCount() external view returns (uint256) {
        return modelHeaders.length;
    }

    function _requireOwnedDraftModel(
        uint256 modelId
    ) internal view returns (ModelHeader storage model) {
        require(modelId < modelHeaders.length, "Invalid model");
        model = modelHeaders[modelId];
        require(model.owner == msg.sender, "Not owner");
        require(!model.finalized, "Model already finalized");
    }

    function _nextChunkIndex(
        ModelHeader storage model
    ) internal view returns (uint256) {
        return model.uploadedWeightCount / model.chunkSize;
    }

    function _expectedNextChunkLength(
        ModelHeader storage model
    ) internal view returns (uint256) {
        if (model.uploadedWeightCount >= model.weightCount) {
            return 0;
        }

        uint256 remaining = model.weightCount - model.uploadedWeightCount;
        return remaining > model.chunkSize ? model.chunkSize : remaining;
    }

    function _canReadPrivateModel(
        uint256 modelId,
        address reader
    ) internal view returns (bool) {
        return
            modelHeaders[modelId].owner == reader ||
            privateChunkReaders[modelId][reader];
    }
}
