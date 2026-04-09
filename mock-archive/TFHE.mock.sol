// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "./fhevm/FHE.sol";

/// @notice Zama FHEVM helpers wired to the official FHE library.
library TFHE {
    function asEuint64(uint64 value) internal pure returns (euint64) {
        return FHE.asEuint64(value);
    }

    function asEuint8(uint8 value) internal pure returns (euint8) {
        return FHE.asEuint8(value);
    }

    function add(euint64 a, euint64 b) internal pure returns (euint64) {
        return FHE.add(a, b);
    }

    function mul(euint64 a, euint64 b) internal pure returns (euint64) {
        return FHE.mul(a, b);
    }

    function mulPlain(euint64 a, uint64 b) internal pure returns (euint64) {
        return FHE.mul(a, b);
    }

    function sub(euint64 a, euint64 b) internal pure returns (euint64) {
        return FHE.sub(a, b);
    }

    function addPlain(euint64 a, uint64 b) internal pure returns (euint64) {
        return FHE.addPlain(a, b);
    }

    function allow(
        euint64 value,
        address account
    ) internal pure returns (euint64) {
        return FHE.allow(value, account);
    }

    function makePubliclyDecryptable(
        euint64 value
    ) internal pure returns (euint64) {
        return FHE.makePubliclyDecryptable(value);
    }
}
