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

    await expect(page).toHaveTitle(/Francesco Giardinelli/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('a[href="tel:+393932227446"]').first()).toBeVisible();
    await expect(page.getByText("Anteprima non ufficiale realizzata da ImpresaX.")).toBeVisible();

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
