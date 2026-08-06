import { describe, expect, it, vi } from "vitest";
import {
  createZaloBotClient,
  zaloBotClientFromEnv,
} from "@/lib/zalo-bot";

const token = "test-bot-token";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ZaloBotClient", () => {
  it("requests and maps an official text-message update", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        result: {
          event_name: "message.text.received",
          message: {
            from: { id: "sender-1", display_name: "Ted" },
            chat: { id: "6ede9afa66b88fe6d6a9" },
            text: "hello",
          },
        },
      }),
    );
    const client = createZaloBotClient(token, fetchImpl);

    await expect(client.getUpdates()).resolves.toEqual({
      eventName: "message.text.received",
      from: { id: "sender-1", displayName: "Ted" },
      chat: { id: "6ede9afa66b88fe6d6a9" },
      text: "hello",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://bot-api.zaloplatforms.com/bottest-bot-token/getUpdates",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeout: 30 }),
      },
    );
  });

  it("returns null when the API has no update result", async () => {
    const client = createZaloBotClient(
      token,
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true })),
    );

    await expect(client.getUpdates()).resolves.toBeNull();
  });

  it("sends camel-case message inputs as the documented payload", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ ok: true, result: {} }),
    );
    const client = createZaloBotClient(token, fetchImpl);

    await client.sendMessage({
      chatId: "6ede9afa66b88fe6d6a9",
      text: "Hello Ted",
      parseMode: "markdown",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://bot-api.zaloplatforms.com/bottest-bot-token/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: "6ede9afa66b88fe6d6a9",
          text: "Hello Ted",
          parse_mode: "markdown",
        }),
      },
    );
  });

  it.each([
    jsonResponse({ ok: true }, 500),
    jsonResponse({ ok: false, error: "not permitted" }),
  ])("rejects failed API responses without revealing the token", async (response) => {
    const client = createZaloBotClient(
      token,
      vi.fn<typeof fetch>().mockResolvedValue(response),
    );

    await expect(client.getUpdates()).rejects.not.toThrow(token);
  });
});

describe("zaloBotClientFromEnv", () => {
  it.each([undefined, "", "   "])(
    "rejects a missing or blank BOT_TOKEN without revealing its value",
    (botToken) => {
      const env = { BOT_TOKEN: botToken } as NodeJS.ProcessEnv;

      expect(() => zaloBotClientFromEnv(env)).toThrow(
        "BOT_TOKEN",
      );
      expect(() => zaloBotClientFromEnv(env)).not.toThrow(botToken ?? "not-present");
    },
  );
});
