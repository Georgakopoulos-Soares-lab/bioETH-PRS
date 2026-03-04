// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "encrypted-types/EncryptedTypes.sol";
import "../vendor/fhevm/library-solidity/lib/FHE.sol";

/// @notice Zama FHEVM helpers wired to the official FHE library.
library TFHE {
    function asEuint64(uint64 value) internal returns (euint64) {
        return FHE.asEuint64(value);
    }

    function asEuint8(uint8 value) internal returns (euint8) {
        return FHE.asEuint8(value);
    }

    function add(euint64 a, euint64 b) internal returns (euint64) {
        return FHE.add(a, b);
    }

    function mul(euint64 a, euint64 b) internal returns (euint64) {
        return FHE.mul(a, b);
    }

    function mulPlain(euint64 a, uint64 b) internal returns (euint64) {
        return FHE.mul(a, b);
    }

    function allow(euint64 value, address account) internal returns (euint64) {
        return FHE.allow(value, account);
    }

    function makePubliclyDecryptable(euint64 value) internal returns (euint64) {
        return FHE.makePubliclyDecryptable(value);
    }
}
