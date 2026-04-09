import { expect } from "chai";
import { ethers } from "hardhat";
import { encryptUint64Array, debugDecryptUint64 } from "./utils/fhevm-helpers";

describe("ModelMarketplace — chunked publication v1", function () {
  async function deployMarketplace() {
    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    return Marketplace.deploy();
  }

  async function createPublicShell(
    weightCount = 5n,
    uploadChunkSize = 2n,
    computeChunkSize = 2n,
    manifestURI = "ipfs://public-manifest"
  ) {
    const marketplace = await deployMarketplace();
    const modelId = await marketplace.createModelShell.staticCall(
      false,
      weightCount,
      uploadChunkSize,
      computeChunkSize,
      manifestURI,
      ethers.ZeroHash,
      ethers.keccak256(ethers.toUtf8Bytes("public-source")),
      0n,
      0n
    );
    await marketplace.createModelShell(
      false,
      weightCount,
      uploadChunkSize,
      computeChunkSize,
      manifestURI,
      ethers.ZeroHash,
      ethers.keccak256(ethers.toUtf8Bytes("public-source")),
      0n,
      0n
    );

    return { marketplace, modelId };
  }

  async function createPrivateShell(
    weightCount = 5n,
    uploadChunkSize = 2n,
    computeChunkSize = 2n,
    manifestURI = "ipfs://private-manifest"
  ) {
    const marketplace = await deployMarketplace();
    const modelId = await marketplace.createModelShell.staticCall(
      true,
      weightCount,
      uploadChunkSize,
      computeChunkSize,
      manifestURI,
      ethers.ZeroHash,
      ethers.keccak256(ethers.toUtf8Bytes("private-source")),
      0n,
      0n
    );
    await marketplace.createModelShell(
      true,
      weightCount,
      uploadChunkSize,
      computeChunkSize,
      manifestURI,
      ethers.ZeroHash,
      ethers.keccak256(ethers.toUtf8Bytes("private-source")),
      0n,
      0n
    );

    return { marketplace, modelId };
  }

  describe("shell creation", function () {
    it("creates a public shell with the expected geometry and metadata", async function () {
      const { marketplace, modelId } = await createPublicShell(5n, 2n, 2n, "ipfs://manifest");

      expect(modelId).to.equal(0n);
      expect(await marketplace.modelCount()).to.equal(1n);

      const [
        owner,
        isPrivate,
        finalized,
        weightCount,
        uploadChunkSize,
        computeChunkSize,
        chunkCount,
        uploadedWeightCount,
        manifestURI,
        manifestHash,
        sourceModelHash
      ] = await marketplace.getModelHeader(modelId);

      expect(owner).to.not.equal(ethers.ZeroAddress);
      expect(isPrivate).to.equal(false);
      expect(finalized).to.equal(false);
      expect(weightCount).to.equal(5n);
      expect(uploadChunkSize).to.equal(2n);
      expect(computeChunkSize).to.equal(2n);
      expect(chunkCount).to.equal(3n);
      expect(uploadedWeightCount).to.equal(0n);
      expect(manifestURI).to.equal("ipfs://manifest");
      expect(manifestHash).to.equal(ethers.ZeroHash);
      expect(sourceModelHash).to.equal(
        ethers.keccak256(ethers.toUtf8Bytes("public-source"))
      );

      const [
        configIsPrivate,
        configFinalized,
        configWeightCount,
        configUploadChunkSize,
        configComputeChunkSize,
        configChunkCount
      ] = await marketplace.getModelConfig(modelId);
      expect(configIsPrivate).to.equal(false);
      expect(configFinalized).to.equal(false);
      expect(configWeightCount).to.equal(5n);
      expect(configUploadChunkSize).to.equal(2n);
      expect(configComputeChunkSize).to.equal(2n);
      expect(configChunkCount).to.equal(3n);
      expect(await marketplace.canReadPrivateModel(modelId, owner)).to.equal(false);
    });

    it("creates a private shell and auto-authorizes the owner as a private reader", async function () {
      const [owner, stranger] = await ethers.getSigners();
      const { marketplace, modelId } = await createPrivateShell(4n, 3n, 3n);

      expect(await marketplace.canReadPrivateModel(modelId, owner.address)).to.equal(true);
      expect(await marketplace.canReadPrivateModel(modelId, stranger.address)).to.equal(false);
    });

    it("rejects zero weightCount, zero uploadChunkSize, and zero computeChunkSize", async function () {
      const marketplace = await deployMarketplace();

      await expect(
        marketplace.createModelShell(false, 0n, 2n, 2n, "ipfs://manifest", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n)
      ).to.be.revertedWith("Weight count must be > 0");

      await expect(
        marketplace.createModelShell(false, 1n, 0n, 2n, "ipfs://manifest", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n)
      ).to.be.revertedWith("Upload chunk size must be > 0");

      await expect(
        marketplace.createModelShell(false, 1n, 2n, 0n, "ipfs://manifest", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n)
      ).to.be.revertedWith("Compute chunk size must be > 0");

      // Private models: upload chunk must not exceed 32 (fhEVM proof budget)
      await expect(
        marketplace.createModelShell(true, 1n, 33n, 2n, "ipfs://manifest", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n)
      ).to.be.revertedWith("Private model upload chunk must not exceed 32 (fhEVM proof budget)");

      // Public models: upload chunk above 32 is fine
      await expect(
        marketplace.createModelShell(false, 1n, 100n, 2n, "ipfs://manifest", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n)
      ).to.not.be.reverted;
    });

    it("chunkCount is based on computeChunkSize, not uploadChunkSize", async function () {
      // uploadChunkSize=4, computeChunkSize=2: 5 weights → chunkCount=3 (ceil(5/2))
      const { marketplace, modelId } = await createPublicShell(5n, 4n, 2n);
      const [, , , , , computeChunkSize, chunkCount] = await marketplace.getModelHeader(modelId);
      expect(computeChunkSize).to.equal(2n);
      expect(chunkCount).to.equal(3n); // ceil(5/2), not ceil(5/4)=2
    });

    it("emits ModelShellCreated with both chunk sizes", async function () {
      const marketplace = await deployMarketplace();
      const [owner] = await ethers.getSigners();

      await expect(
        marketplace.createModelShell(false, 5n, 4n, 2n, "ipfs://manifest", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n)
      ).to.emit(marketplace, "ModelShellCreated")
        .withArgs(0n, owner.address, false, 5n, 4n, 2n);
    });
  });

  describe("public chunk publication", function () {
    it("appends public chunks sequentially, updates progress, and stores chunk payloads", async function () {
      const { marketplace, modelId } = await createPublicShell(5n, 2n, 2n);

      await marketplace.appendPublicModelChunk(modelId, [10n, 20n]);
      expect((await marketplace.getModelHeader(modelId))[7]).to.equal(2n); // uploadedWeightCount at index 7
      expect(await marketplace.getPublicWeightChunk(modelId, 0n))
        .to.deep.equal([10n, 20n]);

      await marketplace.appendPublicModelChunk(modelId, [30n, 40n]);
      expect((await marketplace.getModelHeader(modelId))[7]).to.equal(4n);
      expect(await marketplace.getPublicWeightChunk(modelId, 1n))
        .to.deep.equal([30n, 40n]);

      await marketplace.appendPublicModelChunk(modelId, [50n]);
      expect((await marketplace.getModelHeader(modelId))[7]).to.equal(5n);
      expect(await marketplace.getPublicWeightChunk(modelId, 2n))
        .to.deep.equal([50n]);
    });

    it("decoupled: upload in large batches, retrieve in compute-chunk slices", async function () {
      // uploadChunkSize=4, computeChunkSize=2: upload [10,20,30,40] then [50]
      // compute chunks: [0]=[10,20], [1]=[30,40], [2]=[50]
      const { marketplace, modelId } = await createPublicShell(5n, 4n, 2n);

      await marketplace.appendPublicModelChunk(modelId, [10n, 20n, 30n, 40n]);
      await marketplace.appendPublicModelChunk(modelId, [50n]);

      expect(await marketplace.getPublicWeightChunk(modelId, 0n)).to.deep.equal([10n, 20n]);
      expect(await marketplace.getPublicWeightChunk(modelId, 1n)).to.deep.equal([30n, 40n]);
      expect(await marketplace.getPublicWeightChunk(modelId, 2n)).to.deep.equal([50n]);
    });

    it("rejects public chunk append by non-owner", async function () {
      const [owner, stranger] = await ethers.getSigners();
      const marketplace = await deployMarketplace();

      await marketplace.connect(owner).createModelShell(
        false, 5n, 2n, 2n, "ipfs://manifest", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
      );

      await expect(
        marketplace.connect(stranger).appendPublicModelChunk(0n, [1n, 2n])
      ).to.be.revertedWith("Not owner");
    });

    it("rejects public chunk append on an invalid model id", async function () {
      const marketplace = await deployMarketplace();

      await expect(
        marketplace.appendPublicModelChunk(999n, [1n, 2n])
      ).to.be.revertedWith("Invalid model");
    });

    it("rejects public chunk append to a private model", async function () {
      const { marketplace, modelId } = await createPrivateShell(3n, 2n, 2n);

      await expect(
        marketplace.appendPublicModelChunk(modelId, [1n, 2n])
      ).to.be.revertedWith("Model is private");
    });

    it("rejects invalid public chunk lengths for intermediate and final chunks", async function () {
      const { marketplace, modelId } = await createPublicShell(5n, 2n, 2n);

      await expect(
        marketplace.appendPublicModelChunk(modelId, [1n])
      ).to.be.revertedWith("Invalid chunk length");

      await marketplace.appendPublicModelChunk(modelId, [1n, 2n]);
      await marketplace.appendPublicModelChunk(modelId, [3n, 4n]);

      await expect(
        marketplace.appendPublicModelChunk(modelId, [5n, 6n])
      ).to.be.revertedWith("Invalid chunk length");
    });

    it("rejects appends once all public chunks are uploaded but before finalize", async function () {
      const { marketplace, modelId } = await createPublicShell(3n, 2n, 2n);

      await marketplace.appendPublicModelChunk(modelId, [1n, 2n]);
      await marketplace.appendPublicModelChunk(modelId, [3n]);

      await expect(
        marketplace.appendPublicModelChunk(modelId, [4n])
      ).to.be.revertedWith("All chunks uploaded");
    });

    it("emits PublicModelChunkAppended with the derived chunk index", async function () {
      const { marketplace, modelId } = await createPublicShell(3n, 2n, 2n);

      await expect(
        marketplace.appendPublicModelChunk(modelId, [10n, 20n])
      ).to.emit(marketplace, "PublicModelChunkAppended")
        .withArgs(modelId, 0n, 2n);
    });
  });

  describe("private chunk publication", function () {
    it("appends encrypted chunks sequentially and stores the encrypted payloads", async function () {
      const { marketplace, modelId } = await createPrivateShell(5n, 2n, 2n);
      const addr = await marketplace.getAddress();
      const [signer] = await ethers.getSigners();

      const enc1 = await encryptUint64Array(addr, signer.address, [7n, 8n]);
      await marketplace.appendEncryptedModelChunk(modelId, enc1.handles, enc1.inputProof);

      const enc2 = await encryptUint64Array(addr, signer.address, [9n, 10n]);
      await marketplace.appendEncryptedModelChunk(modelId, enc2.handles, enc2.inputProof);

      const enc3 = await encryptUint64Array(addr, signer.address, [11n]);
      await marketplace.appendEncryptedModelChunk(modelId, enc3.handles, enc3.inputProof);

      // Verify stored encrypted values via debug decrypt
      const chunk0 = await marketplace.getEncryptedWeightChunkHandles(modelId, 0n);
      expect(await debugDecryptUint64(chunk0[0])).to.equal(7n);
      expect(await debugDecryptUint64(chunk0[1])).to.equal(8n);

      const chunk1 = await marketplace.getEncryptedWeightChunkHandles(modelId, 1n);
      expect(await debugDecryptUint64(chunk1[0])).to.equal(9n);
      expect(await debugDecryptUint64(chunk1[1])).to.equal(10n);

      const chunk2 = await marketplace.getEncryptedWeightChunkHandles(modelId, 2n);
      expect(await debugDecryptUint64(chunk2[0])).to.equal(11n);
    });

    it("rejects encrypted chunk append by non-owner", async function () {
      const [owner, stranger] = await ethers.getSigners();
      const marketplace = await deployMarketplace();

      await marketplace.connect(owner).createModelShell(
        true, 5n, 2n, 2n, "ipfs://manifest", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
      );

      const enc = await encryptUint64Array(
        await marketplace.getAddress(), stranger.address, [1n, 2n]
      );
      await expect(
        marketplace.connect(stranger).appendEncryptedModelChunk(0n, enc.handles, enc.inputProof)
      ).to.be.revertedWith("Not owner");
    });

    it("rejects encrypted chunk append on an invalid model id", async function () {
      const marketplace = await deployMarketplace();
      const [signer] = await ethers.getSigners();

      const enc = await encryptUint64Array(
        await marketplace.getAddress(), signer.address, [1n, 2n]
      );
      await expect(
        marketplace.appendEncryptedModelChunk(999n, enc.handles, enc.inputProof)
      ).to.be.revertedWith("Invalid model");
    });

    it("rejects encrypted chunk append to a public model", async function () {
      const { marketplace, modelId } = await createPublicShell(3n, 2n, 2n);
      const [signer] = await ethers.getSigners();

      const enc = await encryptUint64Array(
        await marketplace.getAddress(), signer.address, [1n, 2n]
      );
      await expect(
        marketplace.appendEncryptedModelChunk(modelId, enc.handles, enc.inputProof)
      ).to.be.revertedWith("Model is public");
    });

    it("rejects invalid encrypted chunk lengths and extra encrypted appends after completion", async function () {
      const { marketplace, modelId } = await createPrivateShell(3n, 2n, 2n);
      const addr = await marketplace.getAddress();
      const [signer] = await ethers.getSigners();

      const enc1 = await encryptUint64Array(addr, signer.address, [1n]);
      await expect(
        marketplace.appendEncryptedModelChunk(modelId, enc1.handles, enc1.inputProof)
      ).to.be.revertedWith("Invalid chunk length");

      const enc2 = await encryptUint64Array(addr, signer.address, [1n, 2n]);
      await marketplace.appendEncryptedModelChunk(modelId, enc2.handles, enc2.inputProof);

      const enc3 = await encryptUint64Array(addr, signer.address, [3n]);
      await marketplace.appendEncryptedModelChunk(modelId, enc3.handles, enc3.inputProof);

      const enc4 = await encryptUint64Array(addr, signer.address, [4n]);
      await expect(
        marketplace.appendEncryptedModelChunk(modelId, enc4.handles, enc4.inputProof)
      ).to.be.revertedWith("All chunks uploaded");
    });

    it("emits EncryptedModelChunkAppended with the derived chunk index", async function () {
      const { marketplace, modelId } = await createPrivateShell(3n, 2n, 2n);
      const [signer] = await ethers.getSigners();

      const enc = await encryptUint64Array(
        await marketplace.getAddress(), signer.address, [10n, 20n]
      );
      await expect(
        marketplace.appendEncryptedModelChunk(modelId, enc.handles, enc.inputProof)
      ).to.emit(marketplace, "EncryptedModelChunkAppended")
        .withArgs(modelId, 0n, 2n);
    });
  });

  describe("finalization", function () {
    it("finalizes a complete public model and blocks further mutation", async function () {
      const { marketplace, modelId } = await createPublicShell(3n, 2n, 2n);

      await marketplace.appendPublicModelChunk(modelId, [1n, 2n]);
      await marketplace.appendPublicModelChunk(modelId, [3n]);

      await expect(marketplace.finalizeModel(modelId))
        .to.emit(marketplace, "ModelFinalized")
        .withArgs(modelId, (await ethers.getSigners())[0].address);

      expect((await marketplace.getModelHeader(modelId))[2]).to.equal(true);

      await expect(
        marketplace.appendPublicModelChunk(modelId, [4n])
      ).to.be.revertedWith("Model already finalized");

      await expect(
        marketplace.finalizeModel(modelId)
      ).to.be.revertedWith("Model already finalized");
    });

    it("rejects finalize on invalid model, incomplete model, and non-owner finalize", async function () {
      const [owner, stranger] = await ethers.getSigners();
      const marketplace = await deployMarketplace();

      await expect(marketplace.finalizeModel(0n))
        .to.be.revertedWith("Invalid model");

      await marketplace.connect(owner).createModelShell(
        false, 3n, 2n, 2n, "ipfs://manifest", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
      );

      await expect(marketplace.connect(stranger).finalizeModel(0n))
        .to.be.revertedWith("Not owner");

      await expect(marketplace.connect(owner).finalizeModel(0n))
        .to.be.revertedWith("Model incomplete");
    });
  });

  describe("private reader management", function () {
    it("allows the owner to grant and revoke private readers", async function () {
      const [owner, reader] = await ethers.getSigners();
      const marketplace = await deployMarketplace();

      await marketplace.connect(owner).createModelShell(
        true, 3n, 2n, 2n, "ipfs://private-manifest", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
      );

      expect(await marketplace.canReadPrivateModel(0n, reader.address)).to.equal(false);

      await expect(
        marketplace.connect(owner).setPrivateModelReader(0n, reader.address, true)
      ).to.emit(marketplace, "PrivateModelReaderSet")
        .withArgs(0n, reader.address, true);

      expect(await marketplace.canReadPrivateModel(0n, reader.address)).to.equal(true);

      await marketplace.connect(owner).setPrivateModelReader(0n, reader.address, false);
      expect(await marketplace.canReadPrivateModel(0n, reader.address)).to.equal(false);
    });

    it("rejects private reader changes on public models, invalid models, and by non-owners", async function () {
      const [owner, stranger] = await ethers.getSigners();
      const marketplace = await deployMarketplace();

      await expect(
        marketplace.setPrivateModelReader(0n, stranger.address, true)
      ).to.be.revertedWith("Invalid model");

      await marketplace.connect(owner).createModelShell(
        false, 3n, 2n, 2n, "ipfs://public-manifest", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
      );

      await expect(
        marketplace.connect(stranger).setPrivateModelReader(0n, stranger.address, true)
      ).to.be.revertedWith("Model is public");

      const privateModelId = await marketplace.createModelShell.staticCall(
        true, 3n, 2n, 2n, "ipfs://private-manifest", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
      );
      await marketplace.connect(owner).createModelShell(
        true, 3n, 2n, 2n, "ipfs://private-manifest", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
      );

      await expect(
        marketplace.connect(stranger).setPrivateModelReader(privateModelId, stranger.address, true)
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("getters and read-path guards", function () {
    it("rejects invalid or missing public chunk reads and private-model public reads", async function () {
      const { marketplace, modelId } = await createPublicShell(5n, 2n, 2n);

      await expect(
        marketplace.getPublicWeightChunk(999n, 0n)
      ).to.be.revertedWith("Invalid model");

      await expect(
        marketplace.getPublicWeightChunk(modelId, 0n)
      ).to.be.revertedWith("Chunk not uploaded");

      await marketplace.appendPublicModelChunk(modelId, [1n, 2n]);

      await expect(
        marketplace.getPublicWeightChunk(modelId, 9n)
      ).to.be.revertedWith("Invalid chunk");

      const privateShell = await createPrivateShell(3n, 2n, 2n);
      await expect(
        privateShell.marketplace.getPublicWeightChunk(privateShell.modelId, 0n)
      ).to.be.revertedWith("Model is private");
    });

    it("rejects invalid, unauthorized, or missing private chunk reads and public-model private reads", async function () {
      const [owner, stranger, reader] = await ethers.getSigners();
      const marketplace = await deployMarketplace();

      await expect(
        marketplace.getEncryptedWeightChunkHandles(999n, 0n)
      ).to.be.revertedWith("Invalid model");

      await marketplace.connect(owner).createModelShell(
        true, 3n, 2n, 2n, "ipfs://private-manifest", ethers.ZeroHash, ethers.ZeroHash, 0n, 0n
      );

      await expect(
        marketplace.connect(stranger).getEncryptedWeightChunkHandles(0n, 0n)
      ).to.be.revertedWith("Reader not authorized");

      await expect(
        marketplace.connect(owner).getEncryptedWeightChunkHandles(0n, 0n)
      ).to.be.revertedWith("Chunk not uploaded");

      const enc = await encryptUint64Array(
        await marketplace.getAddress(), owner.address, [7n, 8n]
      );
      await marketplace.connect(owner).appendEncryptedModelChunk(0n, enc.handles, enc.inputProof);

      await expect(
        marketplace.connect(owner).getEncryptedWeightChunkHandles(0n, 9n)
      ).to.be.revertedWith("Invalid chunk");

      await marketplace.connect(owner).setPrivateModelReader(0n, reader.address, true);
      const chunk = await marketplace.connect(reader).getEncryptedWeightChunkHandles(0n, 0n);
      expect(await debugDecryptUint64(chunk[0])).to.equal(7n);
      expect(await debugDecryptUint64(chunk[1])).to.equal(8n);

      const publicShell = await createPublicShell(3n, 2n, 2n);
      await expect(
        publicShell.marketplace.getEncryptedWeightChunkHandles(publicShell.modelId, 0n)
      ).to.be.revertedWith("Model is public");
    });
  });
});
