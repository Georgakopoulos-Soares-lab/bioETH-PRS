import { expect } from "chai";
import { ethers } from "hardhat";

describe("ModelMarketplace — chunked publication v1", function () {
  async function deployMarketplace() {
    const Marketplace = await ethers.getContractFactory("ModelMarketplace");
    return Marketplace.deploy();
  }

  async function createPublicShell(
    weightCount = 5n,
    chunkSize = 2n,
    manifestURI = "ipfs://public-manifest"
  ) {
    const marketplace = await deployMarketplace();
    const modelId = await marketplace.createModelShell.staticCall(
      false,
      weightCount,
      chunkSize,
      manifestURI,
      ethers.ZeroHash,
      ethers.keccak256(ethers.toUtf8Bytes("public-source"))
    );
    await marketplace.createModelShell(
      false,
      weightCount,
      chunkSize,
      manifestURI,
      ethers.ZeroHash,
      ethers.keccak256(ethers.toUtf8Bytes("public-source"))
    );

    return { marketplace, modelId };
  }

  async function createPrivateShell(
    weightCount = 5n,
    chunkSize = 2n,
    manifestURI = "ipfs://private-manifest"
  ) {
    const marketplace = await deployMarketplace();
    const modelId = await marketplace.createModelShell.staticCall(
      true,
      weightCount,
      chunkSize,
      manifestURI,
      ethers.ZeroHash,
      ethers.keccak256(ethers.toUtf8Bytes("private-source"))
    );
    await marketplace.createModelShell(
      true,
      weightCount,
      chunkSize,
      manifestURI,
      ethers.ZeroHash,
      ethers.keccak256(ethers.toUtf8Bytes("private-source"))
    );

    return { marketplace, modelId };
  }

  describe("shell creation", function () {
    it("creates a public shell with the expected geometry and metadata", async function () {
      const { marketplace, modelId } = await createPublicShell(5n, 2n, "ipfs://manifest");

      expect(modelId).to.equal(0n);
      expect(await marketplace.modelCount()).to.equal(1n);

      const [
        owner,
        isPrivate,
        finalized,
        weightCount,
        chunkSize,
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
      expect(chunkSize).to.equal(2n);
      expect(chunkCount).to.equal(3n);
      expect(uploadedWeightCount).to.equal(0n);
      expect(manifestURI).to.equal("ipfs://manifest");
      expect(manifestHash).to.equal(ethers.ZeroHash);
      expect(sourceModelHash).to.equal(
        ethers.keccak256(ethers.toUtf8Bytes("public-source"))
      );

      const [configIsPrivate, configFinalized, configWeightCount, configChunkSize, configChunkCount] =
        await marketplace.getModelConfig(modelId);
      expect(configIsPrivate).to.equal(false);
      expect(configFinalized).to.equal(false);
      expect(configWeightCount).to.equal(5n);
      expect(configChunkSize).to.equal(2n);
      expect(configChunkCount).to.equal(3n);
      expect(await marketplace.canReadPrivateModel(modelId, owner)).to.equal(false);
    });

    it("creates a private shell and auto-authorizes the owner as a private reader", async function () {
      const [owner, stranger] = await ethers.getSigners();
      const { marketplace, modelId } = await createPrivateShell(4n, 3n);

      expect(await marketplace.canReadPrivateModel(modelId, owner.address)).to.equal(true);
      expect(await marketplace.canReadPrivateModel(modelId, stranger.address)).to.equal(false);
    });

    it("rejects zero weightCount and zero chunkSize", async function () {
      const marketplace = await deployMarketplace();

      await expect(
        marketplace.createModelShell(
          false,
          0n,
          2n,
          "ipfs://manifest",
          ethers.ZeroHash,
          ethers.ZeroHash
        )
      ).to.be.revertedWith("Weight count must be > 0");

      await expect(
        marketplace.createModelShell(
          false,
          1n,
          0n,
          "ipfs://manifest",
          ethers.ZeroHash,
          ethers.ZeroHash
        )
      ).to.be.revertedWith("Chunk size must be > 0");
    });

    it("emits ModelShellCreated with the published geometry", async function () {
      const marketplace = await deployMarketplace();
      const [owner] = await ethers.getSigners();

      await expect(
        marketplace.createModelShell(
          false,
          5n,
          2n,
          "ipfs://manifest",
          ethers.ZeroHash,
          ethers.ZeroHash
        )
      ).to.emit(marketplace, "ModelShellCreated")
        .withArgs(0n, owner.address, false, 5n, 2n);
    });
  });

  describe("public chunk publication", function () {
    it("appends public chunks sequentially, updates progress, and stores chunk payloads", async function () {
      const { marketplace, modelId } = await createPublicShell(5n, 2n);

      await marketplace.appendPublicModelChunk(modelId, [10n, 20n]);
      expect((await marketplace.getModelHeader(modelId))[6]).to.equal(2n);
      expect(await marketplace.getPublicWeightChunk(modelId, 0n))
        .to.deep.equal([10n, 20n]);

      await marketplace.appendPublicModelChunk(modelId, [30n, 40n]);
      expect((await marketplace.getModelHeader(modelId))[6]).to.equal(4n);
      expect(await marketplace.getPublicWeightChunk(modelId, 1n))
        .to.deep.equal([30n, 40n]);

      await marketplace.appendPublicModelChunk(modelId, [50n]);
      expect((await marketplace.getModelHeader(modelId))[6]).to.equal(5n);
      expect(await marketplace.getPublicWeightChunk(modelId, 2n))
        .to.deep.equal([50n]);
    });

    it("rejects public chunk append by non-owner", async function () {
      const [owner, stranger] = await ethers.getSigners();
      const marketplace = await deployMarketplace();

      await marketplace.connect(owner).createModelShell(
        false,
        5n,
        2n,
        "ipfs://manifest",
        ethers.ZeroHash,
        ethers.ZeroHash
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
      const { marketplace, modelId } = await createPrivateShell(3n, 2n);

      await expect(
        marketplace.appendPublicModelChunk(modelId, [1n, 2n])
      ).to.be.revertedWith("Model is private");
    });

    it("rejects invalid public chunk lengths for intermediate and final chunks", async function () {
      const { marketplace, modelId } = await createPublicShell(5n, 2n);

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
      const { marketplace, modelId } = await createPublicShell(3n, 2n);

      await marketplace.appendPublicModelChunk(modelId, [1n, 2n]);
      await marketplace.appendPublicModelChunk(modelId, [3n]);

      await expect(
        marketplace.appendPublicModelChunk(modelId, [4n])
      ).to.be.revertedWith("All chunks uploaded");
    });

    it("emits PublicModelChunkAppended with the derived chunk index", async function () {
      const { marketplace, modelId } = await createPublicShell(3n, 2n);

      await expect(
        marketplace.appendPublicModelChunk(modelId, [10n, 20n])
      ).to.emit(marketplace, "PublicModelChunkAppended")
        .withArgs(modelId, 0n, 2n);
    });
  });

  describe("private chunk publication", function () {
    it("appends encrypted chunks sequentially and stores the encrypted payloads", async function () {
      const { marketplace, modelId } = await createPrivateShell(5n, 2n);

      await marketplace.appendEncryptedModelChunk(modelId, [7n, 8n]);
      await marketplace.appendEncryptedModelChunk(modelId, [9n, 10n]);
      await marketplace.appendEncryptedModelChunk(modelId, [11n]);

      expect(await marketplace.getEncryptedWeightChunk(modelId, 0n))
        .to.deep.equal([7n, 8n]);
      expect(await marketplace.getEncryptedWeightChunk(modelId, 1n))
        .to.deep.equal([9n, 10n]);
      expect(await marketplace.getEncryptedWeightChunk(modelId, 2n))
        .to.deep.equal([11n]);
    });

    it("rejects encrypted chunk append by non-owner", async function () {
      const [owner, stranger] = await ethers.getSigners();
      const marketplace = await deployMarketplace();

      await marketplace.connect(owner).createModelShell(
        true,
        5n,
        2n,
        "ipfs://manifest",
        ethers.ZeroHash,
        ethers.ZeroHash
      );

      await expect(
        marketplace.connect(stranger).appendEncryptedModelChunk(0n, [1n, 2n])
      ).to.be.revertedWith("Not owner");
    });

    it("rejects encrypted chunk append on an invalid model id", async function () {
      const marketplace = await deployMarketplace();

      await expect(
        marketplace.appendEncryptedModelChunk(999n, [1n, 2n])
      ).to.be.revertedWith("Invalid model");
    });

    it("rejects encrypted chunk append to a public model", async function () {
      const { marketplace, modelId } = await createPublicShell(3n, 2n);

      await expect(
        marketplace.appendEncryptedModelChunk(modelId, [1n, 2n])
      ).to.be.revertedWith("Model is public");
    });

    it("rejects invalid encrypted chunk lengths and extra encrypted appends after completion", async function () {
      const { marketplace, modelId } = await createPrivateShell(3n, 2n);

      await expect(
        marketplace.appendEncryptedModelChunk(modelId, [1n])
      ).to.be.revertedWith("Invalid chunk length");

      await marketplace.appendEncryptedModelChunk(modelId, [1n, 2n]);
      await marketplace.appendEncryptedModelChunk(modelId, [3n]);

      await expect(
        marketplace.appendEncryptedModelChunk(modelId, [4n])
      ).to.be.revertedWith("All chunks uploaded");
    });

    it("emits EncryptedModelChunkAppended with the derived chunk index", async function () {
      const { marketplace, modelId } = await createPrivateShell(3n, 2n);

      await expect(
        marketplace.appendEncryptedModelChunk(modelId, [10n, 20n])
      ).to.emit(marketplace, "EncryptedModelChunkAppended")
        .withArgs(modelId, 0n, 2n);
    });
  });

  describe("finalization", function () {
    it("finalizes a complete public model and blocks further mutation", async function () {
      const { marketplace, modelId } = await createPublicShell(3n, 2n);

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
        false,
        3n,
        2n,
        "ipfs://manifest",
        ethers.ZeroHash,
        ethers.ZeroHash
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
        true,
        3n,
        2n,
        "ipfs://private-manifest",
        ethers.ZeroHash,
        ethers.ZeroHash
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
        false,
        3n,
        2n,
        "ipfs://public-manifest",
        ethers.ZeroHash,
        ethers.ZeroHash
      );

      await expect(
        marketplace.connect(stranger).setPrivateModelReader(0n, stranger.address, true)
      ).to.be.revertedWith("Model is public");

      const privateModelId = await marketplace.createModelShell.staticCall(
        true,
        3n,
        2n,
        "ipfs://private-manifest",
        ethers.ZeroHash,
        ethers.ZeroHash
      );
      await marketplace.connect(owner).createModelShell(
        true,
        3n,
        2n,
        "ipfs://private-manifest",
        ethers.ZeroHash,
        ethers.ZeroHash
      );

      await expect(
        marketplace.connect(stranger).setPrivateModelReader(privateModelId, stranger.address, true)
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("getters and read-path guards", function () {
    it("rejects invalid or missing public chunk reads and private-model public reads", async function () {
      const { marketplace, modelId } = await createPublicShell(5n, 2n);

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

      const privateShell = await createPrivateShell(3n, 2n);
      await expect(
        privateShell.marketplace.getPublicWeightChunk(privateShell.modelId, 0n)
      ).to.be.revertedWith("Model is private");
    });

    it("rejects invalid, unauthorized, or missing private chunk reads and public-model private reads", async function () {
      const [owner, stranger, reader] = await ethers.getSigners();
      const marketplace = await deployMarketplace();

      await expect(
        marketplace.getEncryptedWeightChunk(999n, 0n)
      ).to.be.revertedWith("Invalid model");

      await marketplace.connect(owner).createModelShell(
        true,
        3n,
        2n,
        "ipfs://private-manifest",
        ethers.ZeroHash,
        ethers.ZeroHash
      );

      await expect(
        marketplace.connect(stranger).getEncryptedWeightChunk(0n, 0n)
      ).to.be.revertedWith("Reader not authorized");

      await expect(
        marketplace.connect(owner).getEncryptedWeightChunk(0n, 0n)
      ).to.be.revertedWith("Chunk not uploaded");

      await marketplace.connect(owner).appendEncryptedModelChunk(0n, [7n, 8n]);

      await expect(
        marketplace.connect(owner).getEncryptedWeightChunk(0n, 9n)
      ).to.be.revertedWith("Invalid chunk");

      await marketplace.connect(owner).setPrivateModelReader(0n, reader.address, true);
      expect(await marketplace.connect(reader).getEncryptedWeightChunk(0n, 0n))
        .to.deep.equal([7n, 8n]);

      const publicShell = await createPublicShell(3n, 2n);
      await expect(
        publicShell.marketplace.getEncryptedWeightChunk(publicShell.modelId, 0n)
      ).to.be.revertedWith("Model is public");
    });
  });
});
