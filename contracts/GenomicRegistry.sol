// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GenomicRegistry - Data layer for encrypted SNP vector pointers.
///
/// @dev    Sample URIs are stored in contract storage and are therefore observable
///         on-chain regardless of the Solidity `private` modifier.  The `getSample()`
///         ACL gates only the Solidity read path — any node operator or observer can
///         inspect storage directly via eth_getStorageAt.  Treat sample URIs as
///         metadata whose *existence* and *hash* are public, not as private data.
///         For true URI confidentiality, store an encrypted or hashed pointer here
///         and resolve it off-chain under a separate access-control layer.
///
///         `manifestHash` anchors off-chain sample provenance metadata such as
///         source file hash, lab signature, genome build, model SNP order, and
///         genotype encoding rules.  It does not by itself prove that uploaded
///         encrypted SNP handles match that manifest; callers must enforce that
///         through an off-chain attestation or future ZK provenance flow.
contract GenomicRegistry {
    struct Sample {
        string uri;
        bytes32 manifestHash;
        address owner;
    }

    Sample[] private samples;
    mapping(uint256 => mapping(address => bool)) private access;

    event SampleRegistered(uint256 indexed sampleId, address indexed owner);
    event SampleManifestHashSet(
        uint256 indexed sampleId,
        bytes32 indexed manifestHash
    );
    event AccessGranted(uint256 indexed sampleId, address indexed grantee);
    event AccessRevoked(uint256 indexed sampleId, address indexed grantee);

    function registerSample(string calldata uri) external returns (uint256) {
        return _registerSample(uri, bytes32(0));
    }

    function registerSampleWithManifest(
        string calldata uri,
        bytes32 manifestHash
    ) external returns (uint256) {
        require(manifestHash != bytes32(0), "Manifest hash required");
        return _registerSample(uri, manifestHash);
    }

    function _registerSample(
        string calldata uri,
        bytes32 manifestHash
    ) internal returns (uint256) {
        samples.push(
            Sample({
                uri: uri,
                manifestHash: manifestHash,
                owner: msg.sender
            })
        );
        uint256 sampleId = samples.length - 1;
        emit SampleRegistered(sampleId, msg.sender);
        if (manifestHash != bytes32(0)) {
            emit SampleManifestHashSet(sampleId, manifestHash);
        }
        return sampleId;
    }

    function grantAccess(uint256 sampleId, address grantee) external {
        require(sampleId < samples.length, "Invalid sample");
        require(samples[sampleId].owner == msg.sender, "Not owner");
        access[sampleId][grantee] = true;
        emit AccessGranted(sampleId, grantee);
    }

    function revokeAccess(uint256 sampleId, address grantee) external {
        require(sampleId < samples.length, "Invalid sample");
        require(samples[sampleId].owner == msg.sender, "Not owner");
        access[sampleId][grantee] = false;
        emit AccessRevoked(sampleId, grantee);
    }

    function getSample(uint256 sampleId) external view returns (string memory uri, address owner) {
        require(sampleId < samples.length, "Invalid sample");
        require(
            samples[sampleId].owner == msg.sender || access[sampleId][msg.sender],
            "Access denied"
        );
        Sample storage sample = samples[sampleId];
        return (sample.uri, sample.owner);
    }

    function getSampleManifestHash(
        uint256 sampleId
    ) external view returns (bytes32) {
        require(sampleId < samples.length, "Invalid sample");
        return samples[sampleId].manifestHash;
    }

    function hasAccess(uint256 sampleId, address caller) external view returns (bool) {
        require(sampleId < samples.length, "Invalid sample");
        return samples[sampleId].owner == caller || access[sampleId][caller];
    }

    function sampleCount() external view returns (uint256) {
        return samples.length;
    }
}
