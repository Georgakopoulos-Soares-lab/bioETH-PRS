// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "encrypted-types/EncryptedTypes.sol";
import "../vendor/fhevm/library-solidity/lib/FHE.sol";

/// @title ResultOracle - Applies DP noise and returns categorical PRS risk.
contract ResultOracle {
    using FHE for euint64;
    using FHE for euint8;
    using FHE for ebool;

    enum RiskCategory {
        Low,
        Medium,
        High
    }

    event ResultClassified(address indexed requester, euint64 noisyScore, euint8 category);

    function classify(
        euint64 encryptedScore,
        euint64 encryptedNoise,
        uint64 lowThreshold,
        uint64 highThreshold
    ) external returns (euint8) {
        euint64 noisy = FHE.add(encryptedScore, encryptedNoise);
        euint64 lowHandle = FHE.asEuint64(lowThreshold);
        euint64 highHandle = FHE.asEuint64(highThreshold);

        ebool isLow = FHE.lt(noisy, lowHandle);
        ebool belowHigh = FHE.lt(noisy, highHandle);
        ebool isMedium = FHE.and(FHE.not(isLow), belowHigh);

        euint8 lowCat = FHE.asEuint8(uint8(RiskCategory.Low));
        euint8 mediumCat = FHE.asEuint8(uint8(RiskCategory.Medium));
        euint8 highCat = FHE.asEuint8(uint8(RiskCategory.High));

        euint8 category = FHE.select(isLow, lowCat, FHE.select(isMedium, mediumCat, highCat));
        category = FHE.makePubliclyDecryptable(category);

        emit ResultClassified(msg.sender, noisy, category);
        return category;
    }
}
