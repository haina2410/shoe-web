import { describe, expect, it, vi } from "vitest";
import {
  createZaloBotClient,
  type ZaloBotClient,
  type ZaloUpdate,
} from "@/lib/zalo-bot";
import { respondToGreeting, runPolling } from "./index";

const greetingUpdate: ZaloUpdate = {
  eventName: "message.text.received",
  from: { id: "sender-1", displayName: "Ted" },
  chat: { id: "6ede9afa66b88fe6d6a9" },
  text: "hi",
};

describe("respondToGreeting", () => {
  it.each([" hi ", "HELLO"])(
    "replies to the exact trimmed greeting %j without case sensitivity",
    async (text) => {
      const sendMessage = vi.fn().mockResolvedValue(undefined);

      await expect(
        respondToGreeting({ sendMessage }, { ...greetingUpdate, text }),
      ).resolves.toBe(true);
      expect(sendMessage).toHaveBeenCalledWith({
        chatId: "6ede9afa66b88fe6d6a9",
        text: "Hello Ted, chat id is 6ede9afa66b88fe6d6a9",
        parseMode: "markdown",
      });
    },
  );

  it.each<ZaloUpdate>([
    { ...greetingUpdate, text: "hello there" },
    { ...greetingUpdate, eventName: "message.image.received" },
  ])("does not reply to unrelated or non-text updates", async (update) => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await expect(respondToGreeting({ sendMessage }, update)).resolves.toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("runPolling", () => {
  it("aborts an active native fetch and exits promptly without logging", async () => {
    const controller = new AbortController();
    let markFetchStarted: (() => void) | undefined;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    let fetchWasAborted = false;
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        markFetchStarted?.();
        init?.signal?.addEventListener(
          "abort",
          () => {
            fetchWasAborted = true;
            reject(new DOMException("The operation was aborted", "AbortError"));
          },
          { once: true },
        );
      });
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const polling = runPolling(createZaloBotClient("secret-token", fetchImpl), controller.signal);
    let pollingExited = false;
    void polling.then(() => {
      pollingExited = true;
    });

    await fetchStarted;
    controller.abort();
    await vi.waitFor(() => {
      expect(fetchWasAborted).toBe(true);
      expect(pollingExited).toBe(true);
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("requests another update after an ignored message", async () => {
    const controller = new AbortController();
    const getUpdates = vi
      .fn<ZaloBotClient["getUpdates"]>()
      .mockResolvedValueOnce({ ...greetingUpdate, text: "not a greeting" })
      .mockImplementationOnce(async () => {
        controller.abort();
        return null;
      });
    const client: ZaloBotClient = {
      getUpdates,
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };

    await runPolling(client, controller.signal);

    expect(getUpdates).toHaveBeenCalledTimes(2);
  });

  it("waits one second before retrying a transient poll error", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const getUpdates = vi
      .fn<ZaloBotClient["getUpdates"]>()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockImplementationOnce(async () => {
        controller.abort();
        return null;
      });
    const client: ZaloBotClient = {
      getUpdates,
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };

    const polling = runPolling(client, controller.signal);
    await vi.advanceTimersByTimeAsync(999);
    expect(getUpdates).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await polling;
    expect(getUpdates).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("reports a mixed failure streak once without exposing error details", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const sensitiveError =
      "https://bot-api.zaloplatforms.com/botsecret-token provider-body";
    const getUpdates = vi
      .fn<ZaloBotClient["getUpdates"]>()
      .mockRejectedValueOnce(new Error(sensitiveError))
      .mockResolvedValueOnce(greetingUpdate)
      .mockImplementationOnce(async () => {
        controller.abort();
        return null;
      });
    const client: ZaloBotClient = {
      getUpdates,
      sendMessage: vi.fn().mockRejectedValue(new Error(sensitiveError)),
    };
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const polling = runPolling(client, controller.signal);
    await vi.advanceTimersByTimeAsync(2_000);
    await polling;

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Zalo Bot polling failed; retrying");
    expect(consoleErrorSpy.mock.calls.flat().join(" ")).not.toContain(sensitiveError);
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });

  it("reports a new failure after a successful polling iteration", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const getUpdates = vi
      .fn<ZaloBotClient["getUpdates"]>()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("second failure"))
      .mockImplementationOnce(async () => {
        controller.abort();
        return null;
      });
    const client: ZaloBotClient = {
      getUpdates,
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const polling = runPolling(client, controller.signal);
    await vi.advanceTimersByTimeAsync(2_000);
    await polling;

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });

  it("exits without polling when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const client: ZaloBotClient = {
      getUpdates: vi.fn().mockResolvedValue(null),
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };

    await runPolling(client, controller.signal);

    expect(client.getUpdates).not.toHaveBeenCalled();
  });
});
