// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GenomicRegistry - Data layer for encrypted SNP vector pointers.
contract GenomicRegistry {
    struct Sample {
        string uri;
        address owner;
    }

    Sample[] private samples;
    mapping(uint256 => mapping(address => bool)) private access;

    event SampleRegistered(uint256 indexed sampleId, address indexed owner, string uri);
    event AccessGranted(uint256 indexed sampleId, address indexed grantee);
    event AccessRevoked(uint256 indexed sampleId, address indexed grantee);

    function registerSample(string calldata uri) external returns (uint256) {
        samples.push(Sample({ uri: uri, owner: msg.sender }));
        uint256 sampleId = samples.length - 1;
        emit SampleRegistered(sampleId, msg.sender, uri);
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

    function hasAccess(uint256 sampleId, address caller) external view returns (bool) {
        require(sampleId < samples.length, "Invalid sample");
        return samples[sampleId].owner == caller || access[sampleId][caller];
    }

    function sampleCount() external view returns (uint256) {
        return samples.length;
    }
}
