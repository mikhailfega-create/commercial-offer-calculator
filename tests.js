(function runTests(globalScope) {
  "use strict";

  const isNode = typeof module !== "undefined" && module.exports;
  let core = globalScope.KPCore;
  let storageApi = globalScope.KPStorage;

  if (isNode && !core) {
    try {
      core = require("./domain.js");
    } catch (_error) {
      core = undefined;
    }
  }

  if (isNode && !storageApi) {
    try {
      storageApi = require("./storage.js");
    } catch (_error) {
      storageApi = undefined;
    }
  }

  const tests = [];
  const results = [];

  function test(name, fn) {
    tests.push({ name, fn });
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || "Условие не выполнено");
  }

  function assertEqual(actual, expected, message) {
    if (!Object.is(actual, expected)) {
      throw new Error(message || `Ожидалось ${String(expected)}, получено ${String(actual)}`);
    }
  }

  function assertIncludes(actual, expected, message) {
    if (!String(actual).includes(expected)) {
      throw new Error(message || `Строка не содержит «${expected}»`);
    }
  }

  function makeDraft(items) {
    const draft = core.createDefaultDraft(() => "default-id");
    draft.title = "Поставка оборудования";
    draft.items = items;
    return draft;
  }

  function fakeStorage(initialValues) {
    const values = new Map(Object.entries(initialValues || {}));
    return {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        values.set(key, String(value));
      },
      removeItem(key) {
        values.delete(key);
      }
    };
  }

  test("ядро приложения доступно", () => {
    assert(core, "KPCore не реализован");
  });

  test("разбирает дробное число с запятой", () => {
    assertEqual(core.parseDecimal("1,5"), 1.5);
  });

  test("считает несколько позиций", () => {
    const draft = makeDraft([
      { id: "a", name: "Точка доступа", unit: "шт.", quantity: "2", price: "12500" },
      { id: "b", name: "Кабель", unit: "м", quantity: "10,5", price: "80" }
    ]);
    assertEqual(core.calculateDraft(draft).total, 25840);
  });

  test("округляет денежный итог до копеек", () => {
    const draft = makeDraft([
      { id: "a", name: "Настройка", unit: "ч.", quantity: "1,25", price: "100,11" }
    ]);
    assertEqual(core.calculateDraft(draft).total, 125.14);
  });

  test("отклоняет пустое название позиции", () => {
    const draft = makeDraft([
      { id: "a", name: "   ", unit: "шт.", quantity: "1", price: "100" }
    ]);
    const validation = core.validateDraft(draft);
    assertEqual(validation.isValid, false);
    assert(validation.errors.some((error) => error.itemId === "a" && error.field === "name"));
  });

  test("отклоняет нулевое количество", () => {
    const draft = makeDraft([
      { id: "a", name: "Кабель", unit: "м", quantity: "0", price: "100" }
    ]);
    const validation = core.validateDraft(draft);
    assert(validation.errors.some((error) => error.field === "quantity"));
  });

  test("отклоняет отрицательную цену", () => {
    const draft = makeDraft([
      { id: "a", name: "Кабель", unit: "м", quantity: "1", price: "-1" }
    ]);
    const validation = core.validateDraft(draft);
    assert(validation.errors.some((error) => error.field === "price"));
  });

  test("формирует русский текст с итогом и заполненными условиями", () => {
    const draft = makeDraft([
      { id: "a", name: "Коммутатор", unit: "шт.", quantity: "2", price: "25000" }
    ]);
    draft.paymentTerms = "50% предоплата";
    draft.deliveryTerms = "10 рабочих дней";
    const text = core.generateOfferText(draft);
    assertIncludes(text, "1. Коммутатор — 2 шт. × 25 000 ₽ = 50 000 ₽.");
    assertIncludes(text, "Общая стоимость предложения: 50 000 ₽.");
    assertIncludes(text, "Условия оплаты: 50% предоплата.");
    assertIncludes(text, "Срок поставки: 10 рабочих дней.");
  });

  test("не добавляет пустые условия в текст", () => {
    const draft = makeDraft([
      { id: "a", name: "Коммутатор", unit: "шт.", quantity: "1", price: "25000" }
    ]);
    const text = core.generateOfferText(draft);
    assertEqual(text.includes("Гарантия:"), false);
    assertEqual(text.includes("Срок поставки:"), false);
  });

  test("хранилище приложения доступно", () => {
    assert(storageApi, "KPStorage не реализован");
  });

  test("сохраняет и восстанавливает черновик", () => {
    const storage = storageApi.create(fakeStorage());
    const draft = makeDraft([
      { id: "a", name: "Маршрутизатор", unit: "шт.", quantity: "1", price: "18000" }
    ]);
    assertEqual(storage.saveDraft(draft), true);
    assertEqual(storage.loadDraft().items[0].name, "Маршрутизатор");
  });

  test("повреждённый черновик не ломает загрузку", () => {
    const memory = fakeStorage({ "kp-calculator:draft:v1": "{broken" });
    const storage = storageApi.create(memory);
    assertEqual(storage.loadDraft(), null);
    assertIncludes(storage.consumeWarning(), "повреждены");
  });

  test("сохраняет историю от новых записей к старым", () => {
    const storage = storageApi.create(fakeStorage());
    storage.saveRecord({ id: "old", savedAt: "2026-08-05T10:00:00.000Z" });
    storage.saveRecord({ id: "new", savedAt: "2026-08-05T11:00:00.000Z" });
    assertEqual(storage.loadHistory()[0].id, "new");
  });

  test("обновляет запись с тем же идентификатором без дубля", () => {
    const storage = storageApi.create(fakeStorage());
    storage.saveRecord({ id: "one", title: "Первая", savedAt: "2026-08-05T10:00:00.000Z" });
    storage.saveRecord({ id: "one", title: "Обновлённая", savedAt: "2026-08-05T11:00:00.000Z" });
    const history = storage.loadHistory();
    assertEqual(history.length, 1);
    assertEqual(history[0].title, "Обновлённая");
  });

  test("ограничивает историю пятьюдесятью записями", () => {
    const storage = storageApi.create(fakeStorage());
    for (let index = 0; index < 51; index += 1) {
      storage.saveRecord({
        id: `record-${index}`,
        savedAt: new Date(Date.UTC(2026, 7, 5, 10, index)).toISOString()
      });
    }
    const history = storage.loadHistory();
    assertEqual(history.length, 50);
    assertEqual(history.some((record) => record.id === "record-0"), false);
  });

  test("удаляет запись из истории", () => {
    const storage = storageApi.create(fakeStorage());
    storage.saveRecord({ id: "one", savedAt: "2026-08-05T10:00:00.000Z" });
    storage.deleteRecord("one");
    assertEqual(storage.loadHistory().length, 0);
  });

  for (const entry of tests) {
    try {
      entry.fn();
      results.push({ name: entry.name, passed: true });
    } catch (error) {
      results.push({ name: entry.name, passed: false, message: error.message });
    }
  }

  const failed = results.filter((result) => !result.passed);

  if (typeof document !== "undefined") {
    const summary = document.getElementById("summary");
    const list = document.getElementById("results");
    summary.textContent = `${results.length - failed.length} пройдено, ${failed.length} ошибок`;
    summary.className = failed.length ? "fail" : "pass";
    for (const result of results) {
      const item = document.createElement("li");
      item.className = result.passed ? "pass" : "fail";
      item.textContent = result.passed ? `✓ ${result.name}` : `✗ ${result.name}: ${result.message}`;
      list.appendChild(item);
    }
  }

  if (isNode) {
    for (const result of results) {
      const marker = result.passed ? "PASS" : "FAIL";
      console.log(`${marker} ${result.name}${result.message ? `: ${result.message}` : ""}`);
    }
    console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
    process.exitCode = failed.length ? 1 : 0;
  }
})(typeof window !== "undefined" ? window : globalThis);
