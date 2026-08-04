"use strict";

const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(__dirname, "index.html")).href);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("#quote-title").fill("Поставка Wi-Fi оборудования");
  await page.locator('[data-field="name"]').fill("Точка доступа Wi-Fi 6");
  await page.locator('[data-field="quantity"]').fill("5");
  await page.locator('[data-field="price"]').fill("25000");
  await page.locator("#payment-terms").fill("50% предоплата, остаток перед отгрузкой");
  await page.locator("#delivery-terms").fill("10 рабочих дней");
  await page.locator("#warranty").fill("12 месяцев");

  const desktopPath = path.join(os.tmpdir(), "kp-calculator-desktop.png");
  const mobilePath = path.join(os.tmpdir(), "kp-calculator-mobile.png");
  await page.screenshot({ path: desktopPath, fullPage: true });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('[data-action="open-result"]').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: mobilePath, fullPage: false });
  console.log(desktopPath);
  console.log(mobilePath);
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
