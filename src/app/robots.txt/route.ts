export const dynamic = "force-dynamic";

const cacheControl = "public, max-age=300, s-maxage=3600";

export async function GET(): Promise<Response> {
  const directive =
    process.env.CRAWL_POLICY === "allow" ? "Allow" : "Disallow";

  return new Response(`User-agent: *\n${directive}: /\n`, {
    headers: {
      "Cache-Control": cacheControl,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
