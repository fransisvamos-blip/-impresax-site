import { test, expect } from "@playwright/test";
import fs from "node:fs";

const liveUrl = "https://studiodentisticogiardinelli.impresax.org/";
const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "1440", width: 1440, height: 900 }
];

for (const vp of viewports) {
  test(`LIVE Pilot 001 renders cleanly at ${vp.name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const requestFailures = [];
    const consoleErrors = [];

    page.on("requestfailed", r => requestFailures.push(r.url()));
    page.on("console", m => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });

    const response = await page.goto(liveUrl, { waitUntil: "networkidle", timeout: 30000 });
    expect(response).not.toBeNull();
    expect(response.status()).toBe(200);
    expect(response.headers()["x-impresax-tenant"]).toBe("studiodentisticogiardinelli");
    expect(response.headers()["x-impresax-factory-version"]).toBe("pilot-001-reference-v4");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");

    await expect(page).toHaveTitle(/Giardinelli/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByText("Anteprima non ufficiale realizzata da ImpresaX.")).toBeVisible();

    const primaryPhone = vp.width <= 760
      ? page.locator('.mobile-cta a[href="tel:+393932227446"]')
      : page.locator('.hero-actions a[href="tel:+393932227446"]');
    await expect(primaryPhone).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    const images = await page.locator('img').evaluateAll(imgs =>
      imgs.map(img => ({ complete: img.complete, width: img.naturalWidth, src: img.currentSrc || img.src }))
    );
    expect(images.every(x => x.complete && x.width > 0)).toBeTruthy();
    expect(requestFailures).toEqual([]);
    expect(consoleErrors).toEqual([]);

    fs.mkdirSync("test-results/live-screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/live-screenshots/pilot-001-live-${vp.name}.png`,
      fullPage: true
    });
    await context.close();
  });
}
