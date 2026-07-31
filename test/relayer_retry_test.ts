import { expect } from "chai";

import {
  isTransientRelayerError,
  retryTransientRelayerOperation,
} from "../scripts/utils/relayer_retry";

function namedError(name: string, message = "failure"): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe("Transient relayer retry", function () {
  it("recognises transport failures but not proof rejection", function () {
    expect(isTransientRelayerError(namedError("RelayerV2FetchError"))).to.equal(true);
    expect(isTransientRelayerError(namedError("RelayerV2TimeoutError"))).to.equal(true);
    expect(isTransientRelayerError(namedError("TypeError", "fetch failed"))).to.equal(true);
    expect(
      isTransientRelayerError(namedError("RelayerV2ResponseInputProofRejectedError"))
    ).to.equal(false);
  });

  it("retries a transient POST failure and returns the eventual value", async function () {
    let calls = 0;
    const delays: number[] = [];
    const notices: number[] = [];
    const result = await retryTransientRelayerOperation(
      "input proof",
      async () => {
        calls += 1;
        if (calls < 3) throw namedError("RelayerV2FetchError", "socket closed");
        return "ok";
      },
      {
        maxAttempts: 4,
        initialDelayMs: 10,
        sleep: async (delayMs) => { delays.push(delayMs); },
        onRetry: ({ attempt }) => { notices.push(attempt); },
      }
    );

    expect(result).to.equal("ok");
    expect(calls).to.equal(3);
    expect(delays).to.deep.equal([10, 20]);
    expect(notices).to.deep.equal([1, 2]);
  });

  it("does not retry semantic failures", async function () {
    let calls = 0;
    let caught: unknown;
    try {
      await retryTransientRelayerOperation("input proof", async () => {
        calls += 1;
        throw namedError("RelayerV2ResponseInputProofRejectedError");
      }, { sleep: async () => undefined });
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).name).to.equal("RelayerV2ResponseInputProofRejectedError");
    expect(calls).to.equal(1);
  });

  it("stops after the configured attempt limit", async function () {
    let calls = 0;
    let caught: unknown;
    try {
      await retryTransientRelayerOperation("input proof", async () => {
        calls += 1;
        throw namedError("RelayerV2FetchError");
      }, { maxAttempts: 3, sleep: async () => undefined });
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).name).to.equal("RelayerV2FetchError");
    expect(calls).to.equal(3);
  });

  it("rejects invalid retry configuration before invoking the operation", async function () {
    let called = false;
    let caught: unknown;
    try {
      await retryTransientRelayerOperation("input proof", async () => {
        called = true;
        return "unused";
      }, { maxAttempts: 0 });
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).to.match(/positive integer/);
    expect(called).to.equal(false);
  });
});
