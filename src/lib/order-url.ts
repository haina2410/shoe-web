export function buildOrderLookupUrl(baseUrl: string, orderCode: string) {
  const url = new URL("/orders", baseUrl);
  url.searchParams.set("orderCode", orderCode);
  return url.toString();
}
