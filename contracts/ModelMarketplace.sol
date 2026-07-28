// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @dev Minimal view of ResultOracle used to validate a release policy's threshold gap
///      at configuration time rather than at query time.
interface INoiseBoundedOracle {
    function noiseUpperBound() external view returns (uint64);
}

/// @title ModelMarketplace - Chunked GWAS model publication for public and private weights.
///
/// Chunk sizes are decoupled:
///   uploadChunkSize  — maximum weights per appendPublicModelChunk / appendEncryptedModelChunk call.
///                      For public models this is unconstrained; for private models it is limited
///                      by the fhEVM 2048-bit input-proof budget (max 32 euint64s per call).
///   computeChunkSize — weights per getPublicWeightChunk / getEncryptedWeightChunk call, which maps
///                      1:1 to the PRSComputeEngine computeChunk HCU budget.
///                      Mock ceiling: 20. Sepolia ceiling: TBD (run `npm run probe:hcu`).
///
/// Weights are stored flat (one contiguous array per model) and sliced by computeChunkSize on read.
/// This lets model publishers use large upload batches while compute remains within HCU limits.
contract ModelMarketplace is ZamaEthereumConfig {
    struct ModelHeader {
        address owner;
        bool isPrivate;
        bool finalized;
        uint256 weightCount;
        uint256 uploadChunkSize; // batch size for weight publication
        uint256 computeChunkSize; // slice size for weight retrieval during compute
        uint256 chunkCount; // = ceil(weightCount / computeChunkSize)
        uint256 uploadedWeightCount;
        string manifestURI;
        bytes32 manifestHash;
        bytes32 sourceModelHash;
        uint64 weightZeroPoint;
        uint64 scoreOffset;
    }

    ModelHeader[] private modelHeaders;
    // Flat per-model weight storage — indexed by absolute weight position.
    mapping(uint256 => uint64[]) private publicWeightData;
    mapping(uint256 => euint64[]) private encryptedWeightData;
    mapping(uint256 => mapping(address => bool)) private privateChunkReaders;

    // --- Rate limiting (anti-probing) ---
    struct RateLimitConfig {
        uint256 maxJobsPerWindow; // 0 = unlimited (default)
        uint256 windowBlocks; // window size in blocks
    }
    mapping(uint256 => RateLimitConfig) private rateLimitConfigs;

    // --- Release policy (model-defined output policy) ---
    //
    // The release policy fixes WHERE output goes (the oracle) and WHAT resolution it
    // has (the classification thresholds).  Both are chosen by the model owner before
    // the model is finalized and are immutable afterwards.  Requesters cannot supply
    // or influence either value.
    //
    // Rationale: when a requester could choose lowThreshold/highThreshold per call,
    // repeated queries with shifted thresholds performed a binary search on the
    // encrypted score, which recovers far more information per query than a fixed
    // ternary classification and largely defeats the randomized release.  Fixing the
    // thresholds before any query is possible removes that adaptive channel.
    struct ReleasePolicy {
        address oracle; // approved oracle contract; address(0) when unconfigured
        uint64 lowThreshold; // scores below this (after noise) map to Low
        uint64 highThreshold; // scores at or above this (after noise) map to High
        bool oracleRequired; // when true, only the oracle path may release output
        bool configured; // true once setReleasePolicy has been accepted
    }
    mapping(uint256 => ReleasePolicy) private releasePolicies;

    event ModelShellCreated(
        uint256 indexed modelId,
        address indexed owner,
        bool isPrivate,
        uint256 weightCount,
        uint256 uploadChunkSize,
        uint256 computeChunkSize
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
    event RateLimitSet(
        uint256 indexed modelId,
        uint256 maxJobsPerWindow,
        uint256 windowBlocks
    );
    event ReleasePolicySet(
        uint256 indexed modelId,
        address indexed oracle,
        uint64 lowThreshold,
        uint64 highThreshold,
        bool oracleRequired
    );

    function createModelShell(
        bool isPrivate,
        uint256 weightCount,
        uint256 uploadChunkSize,
        uint256 computeChunkSize,
        string calldata manifestURI,
        bytes32 manifestHash,
        bytes32 sourceModelHash,
        uint64 weightZeroPoint,
        uint64 scoreOffset
    ) external returns (uint256) {
        require(weightCount > 0, "Weight count must be > 0");
        require(uploadChunkSize > 0, "Upload chunk size must be > 0");
        require(computeChunkSize > 0, "Compute chunk size must be > 0");
        // Private-model weights are uploaded as encrypted inputs: the fhEVM coprocessor
        // enforces a 2048-bit input-proof budget, capping each call at 32 euint64 values.
        require(
            !isPrivate || uploadChunkSize <= 32,
            "Private model upload chunk must not exceed 32 (fhEVM proof budget)"
        );

        uint256 chunkCount = (weightCount + computeChunkSize - 1) /
            computeChunkSize;
        modelHeaders.push(
            ModelHeader({
                owner: msg.sender,
                isPrivate: isPrivate,
                finalized: false,
                weightCount: weightCount,
                uploadChunkSize: uploadChunkSize,
                computeChunkSize: computeChunkSize,
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
            uploadChunkSize,
            computeChunkSize
        );
        return modelId;
    }

    function appendPublicModelChunk(
        uint256 modelId,
        uint64[] calldata weights
    ) external {
        ModelHeader storage model = _requireOwnedDraftModel(modelId);
        require(!model.isPrivate, "Model is private");

        uint256 chunkIndex = _nextUploadChunkIndex(model);
        uint256 expectedLength = _expectedNextUploadChunkLength(model);
        require(expectedLength > 0, "All chunks uploaded");
        require(weights.length == expectedLength, "Invalid chunk length");

        uint64[] storage store = publicWeightData[modelId];
        require(
            store.length == chunkIndex * model.uploadChunkSize,
            "Chunk already uploaded"
        );
        for (uint256 i = 0; i < weights.length; i++) {
            store.push(weights[i]);
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

        uint256 chunkIndex = _nextUploadChunkIndex(model);
        uint256 expectedLength = _expectedNextUploadChunkLength(model);
        require(expectedLength > 0, "All chunks uploaded");
        require(
            encryptedWeights.length == expectedLength,
            "Invalid chunk length"
        );

        euint64[] storage store = encryptedWeightData[modelId];
        require(
            store.length == chunkIndex * model.uploadChunkSize,
            "Chunk already uploaded"
        );
        for (uint256 i = 0; i < encryptedWeights.length; i++) {
            euint64 w = FHE.fromExternal(encryptedWeights[i], inputProof);
            FHE.allowThis(w);
            store.push(w);
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
            uint256 uploadChunkSize,
            uint256 computeChunkSize,
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
            model.uploadChunkSize,
            model.computeChunkSize,
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
            uint256 uploadChunkSize,
            uint256 computeChunkSize,
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
            model.uploadChunkSize,
            model.computeChunkSize,
            model.chunkCount,
            model.uploadedWeightCount,
            model.manifestURI,
            model.manifestHash,
            model.sourceModelHash,
            model.weightZeroPoint,
            model.scoreOffset
        );
    }

    /// @notice Returns a compute-chunk-sized slice of public weights at the given compute chunk index.
    function getPublicWeightChunk(
        uint256 modelId,
        uint256 computeChunkIndex
    ) external view returns (uint64[] memory) {
        require(modelId < modelHeaders.length, "Invalid model");
        ModelHeader storage model = modelHeaders[modelId];
        require(!model.isPrivate, "Model is private");
        require(computeChunkIndex < model.chunkCount, "Invalid chunk");

        uint256 start = computeChunkIndex * model.computeChunkSize;
        uint256 chunkLen = _computeChunkLength(
            model.weightCount,
            model.computeChunkSize,
            computeChunkIndex
        );
        require(
            publicWeightData[modelId].length >= start + chunkLen,
            "Chunk not uploaded"
        );

        uint64[] memory result = new uint64[](chunkLen);
        for (uint256 i = 0; i < chunkLen; i++) {
            result[i] = publicWeightData[modelId][start + i];
        }
        return result;
    }

    function getEncryptedWeightChunk(
        uint256 modelId,
        uint256 computeChunkIndex
    ) external returns (euint64[] memory) {
        require(modelId < modelHeaders.length, "Invalid model");
        ModelHeader storage model = modelHeaders[modelId];
        require(model.isPrivate, "Model is public");
        require(computeChunkIndex < model.chunkCount, "Invalid chunk");
        require(
            _canReadPrivateModel(modelId, msg.sender),
            "Reader not authorized"
        );

        uint256 start = computeChunkIndex * model.computeChunkSize;
        uint256 chunkLen = _computeChunkLength(
            model.weightCount,
            model.computeChunkSize,
            computeChunkIndex
        );
        require(
            encryptedWeightData[modelId].length >= start + chunkLen,
            "Chunk not uploaded"
        );

        euint64[] memory result = new euint64[](chunkLen);
        for (uint256 i = 0; i < chunkLen; i++) {
            result[i] = encryptedWeightData[modelId][start + i];
            FHE.allow(result[i], msg.sender);
        }
        return result;
    }

    /// @notice View-only getter for encrypted weight handles (no ACL grant).
    /// Use for debug/test decrypt only — caller won't have FHE permission on returned handles.
    function getEncryptedWeightChunkHandles(
        uint256 modelId,
        uint256 computeChunkIndex
    ) external view returns (euint64[] memory) {
        require(modelId < modelHeaders.length, "Invalid model");
        ModelHeader storage model = modelHeaders[modelId];
        require(model.isPrivate, "Model is public");
        require(computeChunkIndex < model.chunkCount, "Invalid chunk");
        require(
            _canReadPrivateModel(modelId, msg.sender),
            "Reader not authorized"
        );

        uint256 start = computeChunkIndex * model.computeChunkSize;
        uint256 chunkLen = _computeChunkLength(
            model.weightCount,
            model.computeChunkSize,
            computeChunkIndex
        );
        require(
            encryptedWeightData[modelId].length >= start + chunkLen,
            "Chunk not uploaded"
        );

        euint64[] memory result = new euint64[](chunkLen);
        for (uint256 i = 0; i < chunkLen; i++) {
            result[i] = encryptedWeightData[modelId][start + i];
        }
        return result;
    }

    // --- Rate limiting ---

    /// @notice Configure per-wallet and per-sample query limits for a model.
    ///         Model owner can tighten (or loosen) limits at any time, even
    ///         after finalization.
    /// @param maxJobsPerWindow  Maximum jobs any single wallet or registered
    ///                          sample may create within one window. Set to 0
    ///                          to disable rate limiting.
    /// @param windowBlocks      Window size in blocks.  On Sepolia (~12 s/block),
    ///                          1000 blocks ≈ 3.3 hours.
    function setRateLimit(
        uint256 modelId,
        uint256 maxJobsPerWindow,
        uint256 windowBlocks
    ) external {
        require(modelId < modelHeaders.length, "Invalid model");
        require(modelHeaders[modelId].owner == msg.sender, "Not owner");
        if (maxJobsPerWindow > 0) {
            require(windowBlocks > 0, "Window must be > 0 when limit is set");
        }
        rateLimitConfigs[modelId] = RateLimitConfig(
            maxJobsPerWindow,
            windowBlocks
        );
        emit RateLimitSet(modelId, maxJobsPerWindow, windowBlocks);
    }

    function getRateLimitConfig(
        uint256 modelId
    ) external view returns (uint256 maxJobsPerWindow, uint256 windowBlocks) {
        require(modelId < modelHeaders.length, "Invalid model");
        RateLimitConfig storage cfg = rateLimitConfigs[modelId];
        return (cfg.maxJobsPerWindow, cfg.windowBlocks);
    }

    // --- Release policy ---

    /// @notice Fix this model's output release policy: the oracle that performs
    ///         classification, the two classification thresholds, and whether the
    ///         oracle path is the only permitted release path.
    ///
    /// @dev    Callable only by the model owner and only while the model is a draft.
    ///         `_requireOwnedDraftModel` reverts once `finalizeModel` has run, which is
    ///         what makes the policy immutable: a model that can serve jobs can no
    ///         longer have its thresholds or oracle changed.  There is deliberately no
    ///         update or clear function.
    ///
    ///         Requesters never supply these values.  `PRSComputeEngine.finalizeAndClassify`
    ///         loads them from here, so classification resolution is fixed before any
    ///         query is possible and is identical for every requester of the model.
    ///
    ///         The threshold gap is validated against the oracle's own noiseUpperBound at
    ///         configuration time.  ResultOracle re-checks the same condition when it
    ///         classifies, but catching it here means a model cannot be published with a
    ///         policy that would revert on first use.
    ///
    /// @param modelId          Draft model to configure.
    /// @param oracle           Oracle contract; must expose noiseUpperBound().
    /// @param lowThreshold     Scores below this (after noise) map to Low.
    /// @param highThreshold    Scores at or above this (after noise) map to High.
    /// @param requireOracle    When true, finalize() / finalizeTo() / readPartial()
    ///                         revert for this model, forcing every release through the
    ///                         oracle's randomized-release layer.
    function setReleasePolicy(
        uint256 modelId,
        address oracle,
        uint64 lowThreshold,
        uint64 highThreshold,
        bool requireOracle
    ) external {
        // Reverts unless caller is the owner and the model is still a draft.
        _requireOwnedDraftModel(modelId);
        require(oracle != address(0), "Invalid oracle");
        require(
            lowThreshold < highThreshold,
            "lowThreshold must be less than highThreshold"
        );

        uint64 bound = INoiseBoundedOracle(oracle).noiseUpperBound();
        require(
            highThreshold - lowThreshold >= bound,
            "Threshold gap must be >= noise bound"
        );

        releasePolicies[modelId] = ReleasePolicy({
            oracle: oracle,
            lowThreshold: lowThreshold,
            highThreshold: highThreshold,
            oracleRequired: requireOracle,
            configured: true
        });

        emit ReleasePolicySet(
            modelId,
            oracle,
            lowThreshold,
            highThreshold,
            requireOracle
        );
    }

    /// @notice Read this model's immutable release policy.
    ///
    /// @dev    `PRSComputeEngine.finalizeAndClassify` calls this instead of accepting
    ///         thresholds from the requester.  `configured` is false for models whose
    ///         owner never set a policy; those models have no protected classification
    ///         path at all.
    function getReleasePolicy(
        uint256 modelId
    )
        external
        view
        returns (
            address oracle,
            uint64 lowThreshold,
            uint64 highThreshold,
            bool oracleRequired,
            bool configured
        )
    {
        require(modelId < modelHeaders.length, "Invalid model");
        ReleasePolicy storage policy = releasePolicies[modelId];
        return (
            policy.oracle,
            policy.lowThreshold,
            policy.highThreshold,
            policy.oracleRequired,
            policy.configured
        );
    }

    /// @notice True when this model permits release only through the oracle path.
    function isOracleRequired(uint256 modelId) external view returns (bool) {
        require(modelId < modelHeaders.length, "Invalid model");
        return releasePolicies[modelId].oracleRequired;
    }

    /// @notice The oracle fixed by this model's release policy, or address(0) if none.
    ///
    /// @dev    Read-only view over the release policy.  Retained because the oracle
    ///         address is the part of the policy most often inspected on its own.
    ///         There is no corresponding setter — see setReleasePolicy.
    function getApprovedOracle(uint256 modelId) external view returns (address) {
        require(modelId < modelHeaders.length, "Invalid model");
        return releasePolicies[modelId].oracle;
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

    function _nextUploadChunkIndex(
        ModelHeader storage model
    ) internal view returns (uint256) {
        return model.uploadedWeightCount / model.uploadChunkSize;
    }

    function _expectedNextUploadChunkLength(
        ModelHeader storage model
    ) internal view returns (uint256) {
        if (model.uploadedWeightCount >= model.weightCount) {
            return 0;
        }
        uint256 remaining = model.weightCount - model.uploadedWeightCount;
        return
            remaining > model.uploadChunkSize
                ? model.uploadChunkSize
                : remaining;
    }

    /// @dev Returns the number of weights in a given compute chunk.
    function _computeChunkLength(
        uint256 weightCount,
        uint256 computeChunkSize,
        uint256 computeChunkIndex
    ) internal pure returns (uint256) {
        uint256 start = computeChunkIndex * computeChunkSize;
        uint256 remaining = weightCount - start;
        return remaining > computeChunkSize ? computeChunkSize : remaining;
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
