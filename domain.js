(function initKPCore(root, factory) {
  "use strict";

  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.KPCore = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function createKPCore() {
  "use strict";

  const MAX_VALUE = 999999999;

  function fallbackId() {
    return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createDefaultDraft(idFactory) {
    const makeId = typeof idFactory === "function" ? idFactory : fallbackId;

    return {
      title: "Поставка оборудования",
      greeting: "Добрый день!",
      items: [
        {
          id: makeId(),
          name: "",
          unit: "шт.",
          quantity: "1",
          price: ""
        }
      ],
      paymentTerms: "",
      deliveryTerms: "",
      warranty: "",
      validUntil: "",
      note: "",
      signature: ""
    };
  }

  function parseDecimal(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
    if (typeof value !== "string") return Number.NaN;

    const normalized = value
      .trim()
      .replace(/[\s\u00a0\u202f]/g, "")
      .replace(",", ".");

    if (!normalized || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
      return Number.NaN;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function calculateDraft(draft) {
    const items = Array.isArray(draft && draft.items) ? draft.items : [];
    const calculatedItems = items.map((item) => {
      const quantityValue = parseDecimal(item.quantity);
      const priceValue = parseDecimal(item.price);
      const canCalculate = Number.isFinite(quantityValue) && Number.isFinite(priceValue);
      const lineTotal = canCalculate ? roundMoney(quantityValue * priceValue) : 0;

      return {
        ...item,
        quantityValue,
        priceValue,
        lineTotal
      };
    });

    const total = roundMoney(
      calculatedItems.reduce((sum, item) => sum + item.lineTotal, 0)
    );

    return {
      ...draft,
      items: calculatedItems,
      total
    };
  }

  function validateDraft(draft) {
    const items = Array.isArray(draft && draft.items) ? draft.items : [];
    const errors = [];

    if (items.length === 0) {
      errors.push({ field: "items", itemId: null, message: "Добавь хотя бы одну позицию." });
    }

    items.forEach((item, index) => {
      const itemId = item && item.id ? item.id : String(index);
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const quantity = parseDecimal(item.quantity);
      const price = parseDecimal(item.price);

      if (!name) {
        errors.push({ field: "name", itemId, message: "Укажи наименование позиции." });
      }

      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_VALUE) {
        errors.push({
          field: "quantity",
          itemId,
          message: `Количество должно быть больше нуля и не больше ${formatQuantity(MAX_VALUE)}.`
        });
      }

      if (!Number.isFinite(price) || price < 0 || price > MAX_VALUE) {
        errors.push({
          field: "price",
          itemId,
          message: `Цена должна быть от 0 до ${formatQuantity(MAX_VALUE)}.`
        });
      }
    });

    return { isValid: errors.length === 0, errors };
  }

  function normalizeSpaces(value) {
    return value.replace(/[\u00a0\u202f]/g, " ");
  }

  function formatNumber(value, maximumFractionDigits) {
    const safeValue = Number.isFinite(value) ? value : 0;
    return normalizeSpaces(
      new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: 0,
        maximumFractionDigits
      }).format(safeValue)
    );
  }

  function formatMoney(value) {
    return `${formatNumber(roundMoney(value), 2)} ₽`;
  }

  function formatQuantity(value) {
    return formatNumber(value, 3);
  }

  function textValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function withFinalPunctuation(value) {
    const clean = textValue(value);
    if (!clean) return "";
    return /[.!?…]$/.test(clean) ? clean : `${clean}.`;
  }

  function generateOfferText(draft) {
    const calculated = calculateDraft(draft || createDefaultDraft());
    const greeting = textValue(calculated.greeting) || "Добрый день!";
    const title = textValue(calculated.title);
    const lines = [withFinalPunctuation(greeting), ""];

    if (title) {
      lines.push(`Предлагаем рассмотреть коммерческое предложение по теме «${title}».`);
    } else {
      lines.push("Предлагаем рассмотреть наше коммерческое предложение.");
    }

    lines.push("");

    calculated.items.forEach((item, index) => {
      const name = textValue(item.name) || "Позиция без названия";
      const unit = textValue(item.unit) || "ед.";
      const quantity = Number.isFinite(item.quantityValue) ? item.quantityValue : 0;
      const price = Number.isFinite(item.priceValue) ? item.priceValue : 0;
      lines.push(
        `${index + 1}. ${name} — ${formatQuantity(quantity)} ${unit} × ${formatMoney(price)} = ${formatMoney(item.lineTotal)}.`
      );
    });

    lines.push("", `Общая стоимость предложения: ${formatMoney(calculated.total)}.`);

    const conditions = [
      ["Условия оплаты", calculated.paymentTerms],
      ["Срок поставки", calculated.deliveryTerms],
      ["Гарантия", calculated.warranty],
      ["Предложение действительно до", calculated.validUntil]
    ].filter((entry) => textValue(entry[1]));

    if (conditions.length) {
      lines.push("");
      conditions.forEach(([label, value]) => {
        lines.push(`${label}: ${withFinalPunctuation(value)}`);
      });
    }

    const note = textValue(calculated.note);
    if (note) lines.push("", withFinalPunctuation(note));

    const signature = textValue(calculated.signature);
    if (signature) lines.push("", signature);

    return lines.join("\n");
  }

  return Object.freeze({
    MAX_VALUE,
    createDefaultDraft,
    parseDecimal,
    calculateDraft,
    validateDraft,
    formatMoney,
    formatQuantity,
    generateOfferText
  });
});
