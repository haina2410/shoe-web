import { describe, expect, it, vi } from "vitest";
import type { ZaloBotClient, ZaloUpdate } from "@/lib/zalo-bot";
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
      });
    },
  );

  it.each<ZaloUpdate>([
    { ...greetingUpdate, text: "hello there" },
    { eventName: "message.image.received" },
  ])("does not reply to unrelated or non-text updates", async (update) => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await expect(respondToGreeting({ sendMessage }, update)).resolves.toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("runPolling", () => {
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
