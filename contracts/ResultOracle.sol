// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, euint8, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ResultOracle - Applies on-chain DP noise and returns categorical PRS risk.
///
/// @notice Noise is generated entirely on-chain via FHE.randEuint64(noiseUpperBound).
///         The caller supplies the encrypted score but has no influence over the noise
///         value — eliminating the zero-noise bypass present in previous designs where
///         the caller provided both score and noise ciphertexts.
///
/// @dev    noiseUpperBound is set at construction and is immutable.  It defines the
///         exclusive upper bound for the uniform random noise: noise ∈ [0, noiseUpperBound).
///         Callers choose a bound appropriate for their model's score range to preserve
///         clinical utility while preventing weight extraction via repeated queries.
///         A bound of zero is rejected at construction time.
contract ResultOracle is ZamaEthereumConfig {
    enum RiskCategory {
        Low,
        Medium,
        High
    }

    /// @notice Upper bound (exclusive) for the on-chain DP noise applied to every
    ///         classify() call.  Noise is drawn from [0, noiseUpperBound) uniformly.
    uint64 public immutable noiseUpperBound;

    event ResultClassified(
        address indexed requester,
        euint64 noisyScore,
        euint8 category
    );

    /// @param _noiseUpperBound Exclusive upper bound for uniform DP noise.
    ///                         Must be a positive power of two — required by the
    ///                         fhEVM coprocessor's randBounded precompile.
    ///                         Examples: 128 (2^7), 1048576 (2^20), 4294967296 (2^32).
    constructor(uint64 _noiseUpperBound) {
        require(
            _noiseUpperBound > 0 &&
                (_noiseUpperBound & (_noiseUpperBound - 1)) == 0,
            "Noise bound must be a positive power of two"
        );
        noiseUpperBound = _noiseUpperBound;
    }

    /// @notice Expected upward bias introduced by the uniform noise mechanism.
    ///
    /// @dev    Noise is drawn from [0, noiseUpperBound) uniformly, so E[noise] = noiseUpperBound/2.
    ///         Callers should add this value to each classification threshold so that the
    ///         noisy comparison aligns with the intended plaintext boundary:
    ///
    ///             adjustedThreshold = intendedThreshold + expectedNoiseBias()
    ///
    ///         This is a deterministic, correctable bias — not a source of unpredictability.
    ///         The privacy guarantee comes from the noise variance, not its mean.
    function expectedNoiseBias() external view returns (uint64) {
        return noiseUpperBound / 2;
    }

    /// @notice Adds on-chain random noise to the encrypted score and classifies the
    ///         result into Low / Medium / High risk.
    ///
    /// @param encryptedScore  Caller's encrypted PRS score (externalEuint64 handle).
    /// @param inputProof      fhevmjs input proof covering encryptedScore.
    /// @param lowThreshold    Scores below this (after noise) map to Low.
    /// @param highThreshold   Scores at or above this (after noise) map to High.
    ///
    /// @dev    Noise is uniform on [0, noiseUpperBound), which introduces an upward bias
    ///         of noiseUpperBound/2 on average.  For a scientifically unbiased mechanism,
    ///         adjust thresholds upward by noiseUpperBound/2 or use centered noise once
    ///         fhEVM supports signed arithmetic.
    ///
    /// @return category  Encrypted risk category (euint8: 0=Low, 1=Medium, 2=High).
    ///                   Made publicly decryptable via FHE.makePubliclyDecryptable.
    function classify(
        externalEuint64 encryptedScore,
        bytes calldata inputProof,
        uint64 lowThreshold,
        uint64 highThreshold
    ) external returns (euint8) {
        euint64 score = FHE.fromExternal(encryptedScore, inputProof);
        return _classifyScore(score, lowThreshold, highThreshold);
    }

    /// @notice Classifies a score handle that has already been ACL-granted to this oracle.
    ///
    /// @dev    This is a lower-level import path for contract-controlled handoffs.
    ///         With empty-proof `FHE.fromExternal`, the transaction sender must
    ///         already own the handle.  In practice, EOAs cannot complete a
    ///         `finalizeTo(...)` → `classifyPreauthorized(...)` handoff on behalf of
    ///         another grantee.  `PRSComputeEngine.finalizeAndClassify(...)` provides
    ///         the additive oracle-only flow for ordinary requesters.
    function classifyPreauthorized(
        externalEuint64 encryptedScoreHandle,
        uint64 lowThreshold,
        uint64 highThreshold
    ) external returns (euint8) {
        euint64 score = FHE.fromExternal(encryptedScoreHandle, hex"");
        return _classifyScore(score, lowThreshold, highThreshold);
    }

    function _classifyScore(
        euint64 score,
        uint64 lowThreshold,
        uint64 highThreshold
    ) internal returns (euint8) {
        require(
            lowThreshold < highThreshold,
            "lowThreshold must be less than highThreshold"
        );
        FHE.allowThis(score);

        // Generate noise entirely on-chain — caller cannot control or predict this value.
        euint64 noise = FHE.randEuint64(noiseUpperBound);
        FHE.allowThis(noise);
        euint64 noisy = FHE.add(score, noise);
        FHE.allowThis(noisy);

        euint64 lowHandle = FHE.asEuint64(lowThreshold);
        euint64 highHandle = FHE.asEuint64(highThreshold);

        ebool isLow = FHE.lt(noisy, lowHandle);
        ebool belowHigh = FHE.lt(noisy, highHandle);
        ebool isMedium = FHE.and(FHE.not(isLow), belowHigh);

        euint8 lowCat = FHE.asEuint8(uint8(RiskCategory.Low));
        euint8 mediumCat = FHE.asEuint8(uint8(RiskCategory.Medium));
        euint8 highCat = FHE.asEuint8(uint8(RiskCategory.High));

        euint8 category = FHE.select(
            isLow,
            lowCat,
            FHE.select(isMedium, mediumCat, highCat)
        );
        category = FHE.makePubliclyDecryptable(category);

        emit ResultClassified(msg.sender, noisy, category);
        return category;
    }
}
