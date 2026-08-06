import { z } from "zod";

export type ZaloNotificationRecipient = {
  key: string;
  chatId: string;
};

export const ZALO_NOTIFICATION_RECIPIENTS: readonly ZaloNotificationRecipient[] = [];

export type ZaloUpdate = {
  eventName: string;
  from?: {
    id?: string;
    displayName?: string;
  };
  chat?: {
    id?: string;
  };
  text?: string;
};

export type ZaloBotClient = {
  getUpdates(): Promise<ZaloUpdate | null>;
  sendMessage(input: {
    chatId: string;
    text: string;
    parseMode?: "markdown" | "html";
  }): Promise<void>;
};

const apiResponseSchema = z.object({
  ok: z.boolean(),
  result: z.unknown().optional(),
});

const updateSchema = z.object({
  event_name: z.string(),
  message: z
    .object({
      from: z
        .object({
          id: z.string().optional(),
          display_name: z.string().optional(),
        })
        .optional(),
      chat: z.object({ id: z.string().optional() }).optional(),
      text: z.string().optional(),
    })
    .optional(),
});

export function createZaloBotClient(
  token: string,
  fetchImpl: typeof fetch = fetch,
): ZaloBotClient {
  const baseUrl = `https://bot-api.zaloplatforms.com/bot${token}`;

  async function request(path: string, body: Record<string, unknown>): Promise<unknown> {
    let response: Response;

    try {
      response = await fetchImpl(`${baseUrl}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error("Zalo Bot API request failed");
    }

    if (!response.ok) {
      throw new Error(`Zalo Bot API request failed with status ${response.status}`);
    }

    let bodyJson: unknown;
    try {
      bodyJson = await response.json();
    } catch {
      throw new Error("Zalo Bot API returned an invalid response");
    }

    const parsed = apiResponseSchema.safeParse(bodyJson);
    if (!parsed.success) {
      throw new Error("Zalo Bot API returned an invalid response");
    }

    if (!parsed.data.ok) {
      throw new Error("Zalo Bot API returned an error");
    }

    return parsed.data.result;
  }

  return {
    async getUpdates(): Promise<ZaloUpdate | null> {
      const result = await request("getUpdates", { timeout: 30 });
      if (result === undefined || result === null) return null;

      const parsed = updateSchema.safeParse(result);
      if (!parsed.success) {
        throw new Error("Zalo Bot API returned an invalid update");
      }

      return {
        eventName: parsed.data.event_name,
        from: parsed.data.message?.from && {
          id: parsed.data.message.from.id,
          displayName: parsed.data.message.from.display_name,
        },
        chat: parsed.data.message?.chat && { id: parsed.data.message.chat.id },
        text: parsed.data.message?.text,
      };
    },
    async sendMessage(input): Promise<void> {
      await request("sendMessage", {
        chat_id: input.chatId,
        text: input.text,
        ...(input.parseMode === undefined ? {} : { parse_mode: input.parseMode }),
      });
    },
  };
}

export function zaloBotClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): ZaloBotClient {
  const token = env.BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("Missing required BOT_TOKEN");
  }

  return createZaloBotClient(token, fetchImpl);
}
