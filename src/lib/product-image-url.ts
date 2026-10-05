const managedImagePattern =
  /^\/api\/uploads\/products\/(?:catalog-)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(?:jpe?g|png|webp)$/;

export function isManagedProductImageUrl(url: string): boolean {
  return managedImagePattern.test(url);
}
