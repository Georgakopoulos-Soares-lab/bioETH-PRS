// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EncryptedTypes.sol";

/// @notice Local mock FHE library for Hardhat simulations.
/// @dev Replace via remapping to Zama's FHEVM library for real deployments.
library FHE {
    function asEuint64(uint64 value) internal pure returns (euint64) {
        return euint64.wrap(value);
    }

    function asEuint8(uint8 value) internal pure returns (euint8) {
        return euint8.wrap(value);
    }

    function add(euint64 a, euint64 b) internal pure returns (euint64) {
        return euint64.wrap(euint64.unwrap(a) + euint64.unwrap(b));
    }

    function mul(euint64 a, euint64 b) internal pure returns (euint64) {
        return euint64.wrap(euint64.unwrap(a) * euint64.unwrap(b));
    }

    function mul(euint64 a, uint64 b) internal pure returns (euint64) {
        return euint64.wrap(euint64.unwrap(a) * b);
    }

    function lt(euint64 a, euint64 b) internal pure returns (ebool) {
        return ebool.wrap(euint64.unwrap(a) < euint64.unwrap(b));
    }

    function and(ebool a, ebool b) internal pure returns (ebool) {
        return ebool.wrap(ebool.unwrap(a) && ebool.unwrap(b));
    }

    function not(ebool a) internal pure returns (ebool) {
        return ebool.wrap(!ebool.unwrap(a));
    }

    function select(ebool control, euint8 a, euint8 b) internal pure returns (euint8) {
        return ebool.unwrap(control) ? a : b;
    }

    function makePubliclyDecryptable(euint8 value) internal pure returns (euint8) {
        return value;
    }

    function makePubliclyDecryptable(euint64 value) internal pure returns (euint64) {
        return value;
    }

    function allow(euint64 value, address) internal pure returns (euint64) {
        return value;
    }
}
