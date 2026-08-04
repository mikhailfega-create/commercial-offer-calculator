"use strict";

const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Условие не выполнено");
}

test("пользователь проходит путь от расчёта до истории", async ({ page }) => {
  await page.goto(pathToFileURL(path.join(__dirname, "index.html")).href);
  await page.locator("#quote-title").fill("Поставка Wi-Fi оборудования");
  await page.locator('[data-item-id] [data-field="name"]').first().fill("Точка доступа");
  await page.locator('[data-item-id] [data-field="quantity"]').first().fill("2");
  await page.locator('[data-item-id] [data-field="price"]').first().fill("25000");
  await page.locator('[data-action="add-item"]').first().click();
  await page.locator('[data-item-id] [data-field="name"]').nth(1).fill("Коммутатор");
  await page.locator('[data-item-id] [data-field="quantity"]').nth(1).fill("1");
  await page.locator('[data-item-id] [data-field="price"]').nth(1).fill("40000");
  await page.locator("#payment-terms").fill("50% предоплата");
  await page.locator('[data-action="open-result"]').click();

  await page.locator("#result-view:not([hidden])").waitFor();
  const resultText = await page.locator("#result-text").textContent();
  assert(resultText.includes("Общая стоимость предложения: 90 000 ₽."), "Неверный общий итог");
  assert(resultText.includes("Условия оплаты: 50% предоплата."), "Условие оплаты не попало в текст");

  await page.locator('[data-action="save-offer"]').click();
  await page.locator('[data-view-target="history"]').click();
  await page.locator("#history-view:not([hidden])").waitFor();
  assert(await page.locator("[data-history-id]").count() === 1, "Предложение не сохранилось");

  await page.reload();
  await page.locator('[data-view-target="history"]').click();
  assert(await page.locator("[data-history-id]").count() === 1, "История не восстановилась после перезагрузки");
});

test("валидация не открывает результат с пустой позицией", async ({ page }) => {
  await page.goto(pathToFileURL(path.join(__dirname, "index.html")).href);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[data-action="open-result"]').click();
  assert(await page.locator("#editor-view:not([hidden])").count() === 1, "Открылся результат с ошибками");
  assert(await page.locator("[data-error-for]").first().isVisible(), "Ошибка поля не показана");
});

test("история поддерживает просмотр, редактирование, копию и удаление", async ({ page }) => {
  await page.goto(pathToFileURL(path.join(__dirname, "index.html")).href);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[data-field="name"]').fill("Камера");
  await page.locator('[data-field="quantity"]').fill("2");
  await page.locator('[data-field="price"]').fill("10000");
  await page.locator('[data-action="open-result"]').click();
  await page.locator('[data-action="save-offer"]').click();
  await page.locator('[data-view-target="history"]').click();

  await page.locator('[data-history-action="view"]').click();
  await page.locator("#result-view:not([hidden])").waitFor();
  await page.locator('[data-view-target="history"]').click();
  await page.locator('[data-history-action="edit"]').click();
  await page.locator("#editor-view:not([hidden])").waitFor();
  assert((await page.locator('[data-field="name"]').first().inputValue()) === "Камера", "Запись не открылась в редакторе");

  await page.locator('[data-view-target="history"]').click();
  await page.locator('[data-history-action="duplicate"]').click();
  assert(await page.locator("[data-history-id]").count() === 2, "Копия не создана");

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('[data-history-action="delete"]').first().click();
  assert(await page.locator("[data-history-id]").count() === 1, "Запись не удалена");
});

test("черновик восстанавливается, а результат можно копировать, скачать и распечатать", async ({ page }) => {
  await page.goto(pathToFileURL(path.join(__dirname, "index.html")).href);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[data-field="name"]').fill("Проектирование сети");
  await page.locator('[data-field="quantity"]').fill("1,5");
  await page.locator('[data-field="price"]').fill("20000");
  await page.waitForTimeout(350);
  await page.reload();
  assert((await page.locator('[data-field="name"]').inputValue()) === "Проектирование сети", "Черновик не восстановился");

  await page.locator('[data-action="open-result"]').click();
  await page.locator('[data-action="copy-result"]').click();
  await page.locator("#toast:not([hidden])").waitFor();
  assert((await page.locator("#toast").textContent()).includes("скопирован"), "Копирование не подтвердилось");

  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-action="download-result"]').click();
  const download = await downloadPromise;
  assert(download.suggestedFilename().endsWith(".txt"), "Скачивается не текстовый файл");

  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.printCalled = "true";
    };
  });
  await page.locator('[data-action="print-result"]').click();
  assert(await page.locator("html").getAttribute("data-print-called") === "true", "Печать не вызвана");
});

test("мобильный сценарий работает без горизонтальной прокрутки", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(pathToFileURL(path.join(__dirname, "index.html")).href);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[data-field="name"]').fill("Монтажный комплект");
  await page.locator('[data-field="quantity"]').fill("3");
  await page.locator('[data-field="price"]').fill("1500");
  await page.locator('[data-action="open-result"]').click();
  await page.locator('[data-action="save-offer"]').click();
  await page.locator('[data-view-target="history"]').click();
  assert(await page.locator("[data-history-id]").count() === 1, "Мобильный сценарий не сохранил предложение");
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert(!hasOverflow, "На ширине 375px появилась горизонтальная прокрутка");

  await page.setViewportSize({ width: 320, height: 700 });
  const hasOverflowAt320 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert(!hasOverflowAt320, "На ширине 320px появилась горизонтальная прокрутка");
});

test("повреждённые локальные данные не ломают приложение", async ({ page }) => {
  await page.goto(pathToFileURL(path.join(__dirname, "index.html")).href);
  await page.evaluate(() => {
    localStorage.setItem("kp-calculator:draft:v1", "{broken");
    localStorage.setItem("kp-calculator:history:v1", "{broken");
  });
  await page.reload();
  await page.locator("#editor-view:not([hidden])").waitFor();
  assert(await page.locator('[data-item-id]').count() === 1, "Безопасный черновик не создан");
  assert((await page.locator("#toast").textContent()).includes("повреждены"), "Нет предупреждения о повреждённых данных");
});

test("приложение не обращается к внешним ресурсам", async ({ page }) => {
  const requestUrls = [];
  page.on("request", (request) => requestUrls.push(request.url()));
  await page.goto(pathToFileURL(path.join(__dirname, "index.html")).href);
  assert(requestUrls.length >= 4, "Не удалось наблюдать загрузку локальных файлов");
  assert(requestUrls.every((url) => url.startsWith("file:")), `Найден внешний запрос: ${requestUrls.join(", ")}`);
});

test("сохранение открытой копии не перезаписывает исходное предложение", async ({ page }) => {
  await page.goto(pathToFileURL(path.join(__dirname, "index.html")).href);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("#quote-title").fill("Исходное предложение");
  await page.locator('[data-field="name"]').fill("Оборудование");
  await page.locator('[data-field="quantity"]').fill("1");
  await page.locator('[data-field="price"]').fill("1000");
  await page.locator('[data-action="open-result"]').click();
  await page.locator('[data-action="save-offer"]').click();
  await page.locator('[data-view-target="history"]').click();
  await page.locator('[data-history-action="duplicate"]').click();
  await page.locator("[data-history-id]").first().locator('[data-history-action="view"]').click();
  await page.locator('[data-action="save-offer"]').click();
  await page.locator('[data-view-target="history"]').click();

  const titles = await page.locator("[data-history-title]").allTextContents();
  assert(titles.includes("Исходное предложение"), "Исходная запись была перезаписана");
  assert(titles.includes("Копия — Исходное предложение"), "Копия не сохранилась отдельно");
});

test("дополнительные кнопки редактора и истории выполняют свои действия", async ({ page }) => {
  await page.goto(pathToFileURL(path.join(__dirname, "index.html")).href);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[data-field="name"]').fill("Рабочая позиция");
  await page.locator('[data-field="quantity"]').fill("1");
  await page.locator('[data-field="price"]').fill("5000");

  await page.locator('[data-action="duplicate-item"]').click();
  assert(await page.locator("[data-item-id]").count() === 2, "Дублирование позиции не работает");
  await page.locator('[data-action="remove-item"]').last().click();
  assert(await page.locator("[data-item-id]").count() === 1, "Удаление позиции не работает");

  await page.locator('[data-action="open-result"]').click();
  await page.locator('[data-action="back-to-editor"]').click();
  assert(await page.locator("#editor-view:not([hidden])").count() === 1, "Возврат в редактор не работает");
  await page.locator('[data-action="open-result"]').click();
  await page.locator('[data-action="save-offer"]').click();
  await page.locator('[data-view-target="history"]').click();
  await page.locator('[data-history-action="copy"]').click();
  await page.waitForFunction(() => document.getElementById("toast").textContent.includes("скопирован"));
  assert((await page.locator("#toast").textContent()).includes("скопирован"), "Копирование из истории не работает");

  await page.locator('[data-view-target="editor"]').first().click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('[data-action="clear-draft"]').click();
  assert((await page.locator('[data-field="name"]').inputValue()) === "", "Очистка редактора не работает");
});

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });
  let failed = 0;

  try {
    for (const entry of tests) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));

      try {
        await entry.fn({ page });
        assert(errors.length === 0, `Ошибки страницы: ${errors.join("; ")}`);
        console.log(`PASS ${entry.name}`);
      } catch (error) {
        failed += 1;
        console.error(`FAIL ${entry.name}: ${error.message}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
