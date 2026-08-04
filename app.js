(function initApplication() {
  "use strict";

  if (!window.KPCore || !window.KPStorage) {
    document.body.innerHTML = "<p style='padding:24px;font:16px system-ui'>Не удалось загрузить приложение. Проверь, что рядом с index.html находятся domain.js и storage.js.</p>";
    return;
  }

  const core = window.KPCore;
  const storage = window.KPStorage.create(getBrowserStorage());
  const fieldIds = {
    title: "quote-title",
    greeting: "quote-greeting",
    paymentTerms: "payment-terms",
    deliveryTerms: "delivery-terms",
    warranty: "warranty",
    validUntil: "valid-until",
    note: "quote-note",
    signature: "quote-signature"
  };

  const elements = {
    nav: document.getElementById("app-nav"),
    form: document.getElementById("quote-form"),
    itemsList: document.getElementById("items-list"),
    itemTemplate: document.getElementById("item-template"),
    historyTemplate: document.getElementById("history-template"),
    editorTotal: document.getElementById("editor-total"),
    formTotal: document.getElementById("form-total"),
    livePreview: document.getElementById("live-preview"),
    resultText: document.getElementById("result-text"),
    resultTotal: document.getElementById("result-total"),
    resultTopic: document.getElementById("result-topic"),
    resultHeading: document.getElementById("result-heading"),
    historyHeading: document.getElementById("history-heading"),
    historyList: document.getElementById("history-list"),
    historyEmpty: document.getElementById("history-empty"),
    historyCount: document.getElementById("history-count"),
    errorSummary: document.getElementById("form-error-summary"),
    saveStatus: document.getElementById("save-status"),
    toast: document.getElementById("toast")
  };

  const state = {
    draft: normalizeDraft(storage.loadDraft()),
    currentView: "editor",
    currentRecordId: null,
    currentResult: null,
    saveTimer: null,
    toastTimer: null
  };

  bindEvents();
  renderEditor();
  renderHistory();
  showView("editor", { focus: false });
  surfaceStorageWarning();

  function getBrowserStorage() {
    try {
      const probe = "kp-calculator:probe";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch (_error) {
      const memory = new Map();
      return {
        getItem(key) {
          return memory.has(key) ? memory.get(key) : null;
        },
        setItem(key, value) {
          memory.set(key, String(value));
        },
        removeItem(key) {
          memory.delete(key);
        }
      };
    }
  }

  function makeId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeDraft(candidate) {
    const fallback = core.createDefaultDraft(() => makeId("item"));
    if (!candidate || typeof candidate !== "object") return fallback;

    const normalized = { ...fallback };
    Object.keys(fieldIds).forEach((key) => {
      normalized[key] = typeof candidate[key] === "string" ? candidate[key] : fallback[key];
    });

    const sourceItems = Array.isArray(candidate.items) && candidate.items.length
      ? candidate.items
      : fallback.items;

    normalized.items = sourceItems.map((item) => ({
      id: item && typeof item.id === "string" && item.id ? item.id : makeId("item"),
      name: item && typeof item.name === "string" ? item.name : "",
      unit: item && typeof item.unit === "string" ? item.unit : "шт.",
      quantity: item && (typeof item.quantity === "string" || typeof item.quantity === "number")
        ? String(item.quantity)
        : "1",
      price: item && (typeof item.price === "string" || typeof item.price === "number")
        ? String(item.price)
        : ""
    }));

    return normalized;
  }

  function bindEvents() {
    document.addEventListener("click", handleDocumentClick);
    elements.form.addEventListener("input", handleFormInput);
    elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      validateAndOpenResult();
    });
    elements.historyList.addEventListener("click", handleHistoryClick);
  }

  function handleDocumentClick(event) {
    const viewButton = event.target.closest("[data-view-target]");
    if (viewButton) {
      const target = viewButton.dataset.viewTarget;
      if (target === "result") {
        if (state.currentResult) showView("result");
        else validateAndOpenResult();
      } else {
        if (target === "history") renderHistory();
        showView(target);
      }
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;

    const itemCard = actionButton.closest("[data-item-id]");
    const itemId = itemCard ? itemCard.dataset.itemId : null;

    switch (actionButton.dataset.action) {
      case "add-item":
        addItem();
        break;
      case "duplicate-item":
        duplicateItem(itemId);
        break;
      case "remove-item":
        removeItem(itemId);
        break;
      case "clear-draft":
        clearDraft();
        break;
      case "open-result":
        validateAndOpenResult();
        break;
      case "copy-result":
        if (state.currentResult) copyText(state.currentResult.text);
        break;
      case "download-result":
        if (state.currentResult) downloadText(state.currentResult.text, state.currentResult.title);
        break;
      case "print-result":
        printResult();
        break;
      case "save-offer":
        saveCurrentOffer();
        break;
      case "back-to-editor":
        showView("editor");
        break;
      default:
        break;
    }
  }

  function handleFormInput(event) {
    const target = event.target;
    const itemCard = target.closest("[data-item-id]");

    if (itemCard && target.dataset.field) {
      const item = state.draft.items.find((entry) => entry.id === itemCard.dataset.itemId);
      if (!item) return;
      item[target.dataset.field] = target.value;
      clearItemError(itemCard, target.dataset.field);
      updateItemLineTotal(itemCard, item);
    } else if (target.name && Object.prototype.hasOwnProperty.call(fieldIds, target.name)) {
      state.draft[target.name] = target.value;
    } else {
      return;
    }

    state.currentResult = null;
    updateCalculatedOutputs();
    scheduleDraftSave();
  }

  function addItem() {
    state.draft.items.push({
      id: makeId("item"),
      name: "",
      unit: "шт.",
      quantity: "1",
      price: ""
    });
    state.currentResult = null;
    renderItems();
    updateCalculatedOutputs();
    scheduleDraftSave();
    const lastInput = elements.itemsList.querySelector("[data-item-id]:last-child [data-field='name']");
    if (lastInput) lastInput.focus();
  }

  function duplicateItem(itemId) {
    const index = state.draft.items.findIndex((item) => item.id === itemId);
    if (index < 0) return;
    const copy = { ...state.draft.items[index], id: makeId("item") };
    state.draft.items.splice(index + 1, 0, copy);
    state.currentResult = null;
    renderItems();
    updateCalculatedOutputs();
    scheduleDraftSave();
    showToast("Позиция продублирована.");
  }

  function removeItem(itemId) {
    if (state.draft.items.length === 1) {
      state.draft.items[0] = {
        id: state.draft.items[0].id,
        name: "",
        unit: "шт.",
        quantity: "1",
        price: ""
      };
      showToast("Последняя позиция очищена — в заказе должна остаться хотя бы одна строка.");
    } else {
      state.draft.items = state.draft.items.filter((item) => item.id !== itemId);
      showToast("Позиция удалена.");
    }
    state.currentResult = null;
    renderItems();
    updateCalculatedOutputs();
    scheduleDraftSave();
  }

  function clearDraft() {
    if (!window.confirm("Очистить весь расчёт и начать заново?")) return;
    state.draft = core.createDefaultDraft(() => makeId("item"));
    state.currentRecordId = null;
    state.currentResult = null;
    storage.clearDraft();
    renderEditor();
    showView("editor");
    showToast("Расчёт очищен.");
  }

  function renderEditor() {
    Object.entries(fieldIds).forEach(([key, id]) => {
      const input = document.getElementById(id);
      if (input) input.value = state.draft[key] || "";
    });
    renderItems();
    clearValidationErrors();
    updateCalculatedOutputs();
  }

  function renderItems() {
    elements.itemsList.textContent = "";
    const calculated = core.calculateDraft(state.draft);

    state.draft.items.forEach((item, index) => {
      const fragment = elements.itemTemplate.content.cloneNode(true);
      const card = fragment.querySelector("[data-item-id]");
      card.dataset.itemId = item.id;
      card.querySelector(".item-index").textContent = String(index + 1);

      card.querySelectorAll("[data-field]").forEach((input) => {
        const field = input.dataset.field;
        const inputId = `item-${item.id}-${field}`;
        input.id = inputId;
        input.value = item[field] || "";
        input.closest(".field-group").querySelector("label").htmlFor = inputId;
        const error = card.querySelector(`[data-error-for="${field}"]`);
        if (error) {
          error.id = `${inputId}-error`;
          input.setAttribute("aria-describedby", error.id);
        }
      });

      const calculatedItem = calculated.items[index];
      card.querySelector("[data-line-total]").textContent = core.formatMoney(calculatedItem.lineTotal);
      elements.itemsList.appendChild(fragment);
    });
  }

  function updateItemLineTotal(card, item) {
    const calculated = core.calculateDraft({ ...state.draft, items: [item] });
    card.querySelector("[data-line-total]").textContent = core.formatMoney(calculated.total);
  }

  function updateCalculatedOutputs() {
    const calculated = core.calculateDraft(state.draft);
    const totalText = core.formatMoney(calculated.total);
    elements.editorTotal.textContent = totalText;
    elements.formTotal.textContent = totalText;
    elements.livePreview.textContent = core.generateOfferText(state.draft);
  }

  function scheduleDraftSave() {
    window.clearTimeout(state.saveTimer);
    elements.saveStatus.textContent = "Сохраняю…";
    state.saveTimer = window.setTimeout(() => {
      const saved = storage.saveDraft(deepClone(state.draft));
      elements.saveStatus.textContent = saved ? "Сохранено в браузере" : "Работает без сохранения";
      surfaceStorageWarning();
    }, 250);
  }

  function clearItemError(card, field) {
    const input = card.querySelector(`[data-field="${field}"]`);
    const error = card.querySelector(`[data-error-for="${field}"]`);
    if (input) input.removeAttribute("aria-invalid");
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
  }

  function clearValidationErrors() {
    elements.errorSummary.hidden = true;
    elements.errorSummary.textContent = "";
    elements.itemsList.querySelectorAll("[aria-invalid='true']").forEach((input) => {
      input.removeAttribute("aria-invalid");
    });
    elements.itemsList.querySelectorAll("[data-error-for]").forEach((error) => {
      error.hidden = true;
      error.textContent = "";
    });
  }

  function validateAndOpenResult() {
    clearValidationErrors();
    const validation = core.validateDraft(state.draft);

    if (!validation.isValid) {
      elements.errorSummary.textContent = `Проверь позиции: найдено ошибок — ${validation.errors.length}.`;
      elements.errorSummary.hidden = false;
      let firstInvalid = null;

      validation.errors.forEach((error) => {
        if (!error.itemId) return;
        const card = Array.from(elements.itemsList.querySelectorAll("[data-item-id]"))
          .find((entry) => entry.dataset.itemId === error.itemId);
        if (!card) return;
        const input = card.querySelector(`[data-field="${error.field}"]`);
        const errorElement = card.querySelector(`[data-error-for="${error.field}"]`);
        if (input) {
          input.setAttribute("aria-invalid", "true");
          if (!firstInvalid) firstInvalid = input;
        }
        if (errorElement) {
          errorElement.textContent = error.message;
          errorElement.hidden = false;
        }
      });

      elements.errorSummary.scrollIntoView({ behavior: "smooth", block: "center" });
      if (firstInvalid) firstInvalid.focus({ preventScroll: true });
      showToast("Заполни обязательные поля позиций.", { error: true });
      return false;
    }

    const calculated = core.calculateDraft(state.draft);
    state.currentResult = {
      draft: deepClone(state.draft),
      title: state.draft.title.trim() || "Коммерческое предложение",
      text: core.generateOfferText(state.draft),
      total: calculated.total,
      recordId: state.currentRecordId
    };
    renderResult(state.currentResult);
    storage.saveDraft(deepClone(state.draft));
    showView("result");
    return true;
  }

  function renderResult(result) {
    elements.resultText.textContent = result.text;
    elements.resultTotal.textContent = core.formatMoney(result.total);
    elements.resultTopic.textContent = result.title;
  }

  function showView(viewName, options) {
    const view = document.querySelector(`[data-view="${viewName}"]`);
    if (!view) return;
    document.querySelectorAll("[data-view]").forEach((entry) => {
      entry.hidden = entry !== view;
    });
    document.querySelectorAll("#app-nav [data-view-target]").forEach((button) => {
      const active = button.dataset.viewTarget === viewName;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    state.currentView = viewName;
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (options && options.focus === false) return;
    if (viewName === "result") elements.resultHeading.focus({ preventScroll: true });
    if (viewName === "history") elements.historyHeading.focus({ preventScroll: true });
  }

  async function copyText(text) {
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (_error) {
      copied = false;
    }

    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        copied = document.execCommand("copy");
      } catch (_error) {
        copied = false;
      }
      textarea.remove();
    }

    showToast(
      copied ? "Текст предложения скопирован." : "Не удалось скопировать автоматически. Выдели текст и скопируй его вручную.",
      { error: !copied }
    );
    return copied;
  }

  function safeFilename(title) {
    const clean = String(title || "коммерческое-предложение")
      .trim()
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return clean || "коммерческое-предложение";
  }

  function downloadText(text, title) {
    try {
      const blob = new Blob(["\uFEFF", text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFilename(title)}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      showToast("Текстовый файл скачан.");
    } catch (_error) {
      showToast("Браузер не смог скачать файл. Скопируй текст вручную.", { error: true });
    }
  }

  function printResult() {
    if (!state.currentResult) return;
    const oldTitle = document.title;
    document.title = state.currentResult.title;
    const restoreTitle = () => {
      document.title = oldTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };
    window.addEventListener("afterprint", restoreTitle);
    window.print();
    window.setTimeout(restoreTitle, 1000);
  }

  function saveCurrentOffer() {
    if (!state.currentResult) {
      validateAndOpenResult();
      if (!state.currentResult) return;
    }

    const now = new Date().toISOString();
    const existing = state.currentRecordId
      ? storage.loadHistory().find((record) => record.id === state.currentRecordId)
      : null;
    const id = state.currentRecordId || makeId("offer");
    const record = {
      id,
      title: state.currentResult.title,
      createdAt: existing && existing.createdAt ? existing.createdAt : now,
      savedAt: now,
      itemsCount: state.currentResult.draft.items.length,
      total: state.currentResult.total,
      text: state.currentResult.text,
      draft: deepClone(state.currentResult.draft)
    };

    if (storage.saveRecord(record)) {
      state.currentRecordId = id;
      state.currentResult.recordId = id;
      renderHistory();
      showToast(existing ? "Сохранённое предложение обновлено." : "Предложение сохранено в браузере.");
    } else {
      surfaceStorageWarning();
    }
  }

  function renderHistory() {
    const history = storage.loadHistory();
    elements.historyList.textContent = "";
    elements.historyEmpty.hidden = history.length > 0;
    elements.historyCount.textContent = String(history.length);
    elements.historyCount.setAttribute("aria-label", `${history.length} сохранённых`);

    history.forEach((record) => {
      const fragment = elements.historyTemplate.content.cloneNode(true);
      const card = fragment.querySelector("[data-history-id]");
      card.dataset.historyId = record.id;
      card.querySelector("[data-history-title]").textContent = record.title || "Без названия";
      card.querySelector("[data-history-date]").textContent = formatSavedDate(record.savedAt);
      card.querySelector("[data-history-date]").dateTime = record.savedAt || "";
      card.querySelector("[data-history-items]").textContent = formatItemCount(record.itemsCount || 0);
      card.querySelector("[data-history-total]").textContent = core.formatMoney(Number(record.total) || 0);
      elements.historyList.appendChild(fragment);
    });
    surfaceStorageWarning();
  }

  function formatSavedDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Дата не указана";
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date).replace(/[\u00a0\u202f]/g, " ");
  }

  function formatItemCount(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    let word = "позиций";
    if (mod10 === 1 && mod100 !== 11) word = "позиция";
    else if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) word = "позиции";
    return `${count} ${word}`;
  }

  function handleHistoryClick(event) {
    const button = event.target.closest("[data-history-action]");
    if (!button) return;
    const card = button.closest("[data-history-id]");
    if (!card) return;
    const recordId = card.dataset.historyId;
    const action = button.dataset.historyAction;

    if (action === "view") viewHistoryRecord(recordId);
    if (action === "edit") editHistoryRecord(recordId);
    if (action === "copy") copyHistoryRecord(recordId);
    if (action === "duplicate") duplicateHistoryRecord(recordId);
    if (action === "delete") deleteHistoryRecord(recordId);
  }

  function findRecord(recordId) {
    return storage.loadHistory().find((record) => record.id === recordId) || null;
  }

  function viewHistoryRecord(recordId) {
    const record = findRecord(recordId);
    if (!record) return showToast("Предложение не найдено.", { error: true });
    const draft = normalizeDraft(record.draft);
    state.currentRecordId = record.id;
    state.currentResult = {
      draft,
      title: record.title || "Коммерческое предложение",
      text: record.text || core.generateOfferText(draft),
      total: Number(record.total) || core.calculateDraft(draft).total,
      recordId: record.id
    };
    renderResult(state.currentResult);
    showView("result");
  }

  function editHistoryRecord(recordId) {
    const record = findRecord(recordId);
    if (!record) return showToast("Предложение не найдено.", { error: true });
    state.draft = normalizeDraft(deepClone(record.draft));
    state.currentRecordId = record.id;
    state.currentResult = null;
    storage.saveDraft(deepClone(state.draft));
    renderEditor();
    showView("editor");
    showToast("Предложение открыто для редактирования.");
  }

  function copyHistoryRecord(recordId) {
    const record = findRecord(recordId);
    if (!record) return showToast("Предложение не найдено.", { error: true });
    return copyText(record.text || core.generateOfferText(normalizeDraft(record.draft)));
  }

  function duplicateHistoryRecord(recordId) {
    const record = findRecord(recordId);
    if (!record) return showToast("Предложение не найдено.", { error: true });
    const now = new Date().toISOString();
    const draft = normalizeDraft(deepClone(record.draft));
    draft.title = `Копия — ${draft.title || "Без названия"}`;
    draft.items = draft.items.map((item) => ({ ...item, id: makeId("item") }));
    const copy = {
      ...record,
      id: makeId("offer"),
      title: draft.title,
      createdAt: now,
      savedAt: now,
      total: core.calculateDraft(draft).total,
      text: core.generateOfferText(draft),
      draft
    };
    if (storage.saveRecord(copy)) {
      renderHistory();
      showToast("Создана копия предложения.");
    } else {
      surfaceStorageWarning();
    }
  }

  function deleteHistoryRecord(recordId) {
    const record = findRecord(recordId);
    if (!record) return showToast("Предложение не найдено.", { error: true });
    if (!window.confirm(`Удалить предложение «${record.title || "Без названия"}»?`)) return;
    if (storage.deleteRecord(recordId)) {
      if (state.currentRecordId === recordId) state.currentRecordId = null;
      renderHistory();
      showToast("Предложение удалено.");
    } else {
      surfaceStorageWarning();
    }
  }

  function showToast(message, options) {
    window.clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("is-error", Boolean(options && options.error));
    elements.toast.hidden = false;
    state.toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 3600);
  }

  function surfaceStorageWarning() {
    const warning = storage.consumeWarning();
    if (warning) showToast(warning, { error: true });
  }
})();
