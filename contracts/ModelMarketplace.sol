// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./fhevm/EncryptedTypes.sol";

/// @title ModelMarketplace - Stores GWAS model weights (encrypted or plaintext).
contract ModelMarketplace {
    struct Model {
        uint64[] publicWeights;
        euint64[] encryptedWeights;
        address owner;
        bool isPrivate;
    }

    Model[] private models;

    event ModelListed(
        uint256 indexed modelId,
        address indexed owner,
        bool isPrivate
    );

    function listPublicModel(
        uint64[] calldata weights
    ) external returns (uint256) {
        models.push(
            Model({
                publicWeights: weights,
                encryptedWeights: new euint64[](0),
                owner: msg.sender,
                isPrivate: false
            })
        );
        uint256 modelId = models.length - 1;
        emit ModelListed(modelId, msg.sender, false);
        return modelId;
    }

    function listEncryptedModel(
        euint64[] calldata encryptedWeights
    ) external returns (uint256) {
        models.push(
            Model({
                publicWeights: new uint64[](0),
                encryptedWeights: encryptedWeights,
                owner: msg.sender,
                isPrivate: true
            })
        );
        uint256 modelId = models.length - 1;
        emit ModelListed(modelId, msg.sender, true);
        return modelId;
    }

    function getModel(
        uint256 modelId
    )
        external
        view
        returns (
            uint64[] memory publicWeights,
            euint64[] memory encryptedWeights,
            bool isPrivate,
            address owner
        )
    {
        require(modelId < models.length, "Invalid model");
        Model storage model = models[modelId];
        return (
            model.publicWeights,
            model.encryptedWeights,
            model.isPrivate,
            model.owner
        );
    }

    function modelCount() external view returns (uint256) {
        return models.length;
    }
}
