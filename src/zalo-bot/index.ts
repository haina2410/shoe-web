import "dotenv/config";
import { pathToFileURL } from "node:url";
import {
  zaloBotClientFromEnv,
  type ZaloBotClient,
  type ZaloUpdate,
} from "@/lib/zalo-bot";

export async function respondToGreeting(
  client: Pick<ZaloBotClient, "sendMessage">,
  update: ZaloUpdate,
): Promise<boolean> {
  const greeting = update.text?.trim().toLowerCase();
  const displayName = update.from?.displayName;
  const chatId = update.chat?.id;

  if (
    update.eventName !== "message.text.received" ||
    (greeting !== "hi" && greeting !== "hello") ||
    !displayName ||
    !chatId
  ) {
    return false;
  }

  await client.sendMessage({
    chatId,
    text: `Hello ${displayName}, chat id is ${chatId}`,
    parseMode: "markdown",
  });
  return true;
}

function waitForRetry(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timeout = setTimeout(finish, 1_000);
    signal?.addEventListener("abort", finish, { once: true });

    function finish(): void {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
  });
}

export async function runPolling(
  client: ZaloBotClient,
  signal?: AbortSignal,
): Promise<void> {
  let failureReported = false;

  while (!signal?.aborted) {
    try {
      const update = await client.getUpdates(signal);
      if (signal?.aborted) return;
      if (update) await respondToGreeting(client, update);
      failureReported = false;
    } catch {
      if (signal?.aborted) return;
      if (!failureReported) {
        console.error("Zalo Bot polling failed; retrying");
        failureReported = true;
      }
      await waitForRetry(signal);
    }
  }
}

async function main(): Promise<void> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);

  try {
    await runPolling(zaloBotClientFromEnv(), controller.signal);
  } finally {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
  }
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch(() => {
    console.error("Zalo Bot polling failed");
    process.exitCode = 1;
  });
}
