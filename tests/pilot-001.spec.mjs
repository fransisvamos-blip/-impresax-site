import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";

const url = "http://127.0.0.1:4173/tenants/studiodentisticogiardinelli/index.html";
let server;

test.beforeAll(async () => {
  server = spawn(process.execPath, ["tests/serve-static.mjs"], { stdio: "inherit" });
  await new Promise((resolve, reject) => {
    const start = Date.now();
    const ping = async () => {
      try {
        const r = await fetch(url);
        if (r.ok) return resolve();
      } catch {}
      if (Date.now() - start > 10000) return reject(new Error("QA server timeout"));
      setTimeout(ping, 250);
    };
    ping();
  });
});

test.afterAll(() => {
  if (server) server.kill("SIGTERM");
});

const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "1440", width: 1440, height: 900 }
];

for (const vp of viewports) {
  test(`Pilot 001 renders cleanly at ${vp.name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const failures = [];
    page.on("requestfailed", r => failures.push(r.url()));
    await page.goto(url, { waitUntil: "networkidle" });

    await expect(page).toHaveTitle(/Studio Dentistico Giardinelli/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const primaryPhone = vp.width <= 700
      ? page.locator('.mobile-actionbar a[href="tel:+393932227446"]')
      : page.locator('.nav-cta[href="tel:+393932227446"]');
    await expect(primaryPhone).toBeVisible();
    await expect(page.getByText("Anteprima non ufficiale realizzata da ImpresaX.")).toBeVisible();
    await expect(page.locator('.hero h1')).toContainText("Un sorriso");
    await expect(page.locator('.studio-section h2')).toContainText("Uno spazio pensato");
    await expect(page.locator('#trattamenti')).toBeAttached();
    await expect(page.locator('#studio')).toBeAttached();
    await expect(page.locator('#dottore')).toBeAttached();
    await expect(page.locator('#contatti')).toBeAttached();
    await expect(page.locator('a[href="mailto:studiodentisticogiardinelli@gmail.com"]').first()).toBeAttached();

    const imageLoadState = await page.locator('img').evaluateAll(imgs =>
      imgs.map(img => ({ complete: img.complete, width: img.naturalWidth, src: img.currentSrc || img.src }))
    );
    expect(imageLoadState.every(x => x.complete && x.width > 0)).toBeTruthy();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(failures).toEqual([]);

    fs.mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/screenshots/pilot-001-${vp.name}.png`,
      fullPage: true
    });
    await context.close();
  });
}
