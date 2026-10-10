import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "mobile", width: 320, height: 640 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`${viewport.name}: quick contact stays visible and supports keyboard dismissal`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/gioi-thieu");

    const trigger = page.getByRole("button", { name: "Liên hệ", exact: true });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    const initialBox = await trigger.boundingBox();
    expect(initialBox?.height).toBeGreaterThanOrEqual(44);
    expect(initialBox?.y).toBeGreaterThan(viewport.height / 2);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await trigger.boundingBox()).toEqual(initialBox);
    await trigger.focus();
    await page.keyboard.press("Enter");

    const panel = page.getByRole("dialog", { name: "Liên hệ leafshoes" });
    await expect(panel).toBeVisible();
    const phone = panel.getByRole("link", { name: /Điện thoại/ });
    await expect(phone).toHaveAttribute("href", "tel:0395069089");
    await expect(phone).toBeFocused();
    const facebook = panel.getByRole("link", { name: /Facebook fanpage/ });
    await expect(facebook).toHaveAttribute("href", "https://www.facebook.com/leafshoesvietnam/");
    await expect(facebook).toHaveAttribute("target", "_blank");

    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(panel).toBeVisible();
    await page.mouse.click(8, 100);
    await expect(panel).toBeHidden();
  });
}
