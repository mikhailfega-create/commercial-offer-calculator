(function initKPStorage(root, factory) {
  "use strict";

  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.KPStorage = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function createKPStorageApi() {
  "use strict";

  const DRAFT_KEY = "kp-calculator:draft:v1";
  const HISTORY_KEY = "kp-calculator:history:v1";
  const VERSION = 1;
  const HISTORY_LIMIT = 50;

  function create(storageLike) {
    let warning = "";

    function setWarning(message) {
      warning = message;
    }

    function consumeWarning() {
      const current = warning;
      warning = "";
      return current || null;
    }

    function readJson(key) {
      try {
        const raw = storageLike.getItem(key);
        if (raw === null) return null;
        return JSON.parse(raw);
      } catch (_error) {
        setWarning("Сохранённые данные повреждены или недоступны. Открыты безопасные значения.");
        return null;
      }
    }

    function writeJson(key, value) {
      try {
        storageLike.setItem(key, JSON.stringify(value));
        return true;
      } catch (_error) {
        setWarning("Браузер запретил локальное сохранение. Расчёт продолжит работать в этой вкладке.");
        return false;
      }
    }

    function remove(key) {
      try {
        storageLike.removeItem(key);
        return true;
      } catch (_error) {
        setWarning("Не удалось удалить локальные данные браузера.");
        return false;
      }
    }

    function loadDraft() {
      const payload = readJson(DRAFT_KEY);
      if (payload === null) return null;
      if (payload.version !== VERSION || !payload.draft || typeof payload.draft !== "object") {
        setWarning("Сохранённые данные повреждены или имеют неизвестный формат.");
        return null;
      }
      return payload.draft;
    }

    function saveDraft(draft) {
      return writeJson(DRAFT_KEY, { version: VERSION, draft });
    }

    function clearDraft() {
      return remove(DRAFT_KEY);
    }

    function loadHistory() {
      const payload = readJson(HISTORY_KEY);
      if (payload === null) return [];
      if (payload.version !== VERSION || !Array.isArray(payload.records)) {
        setWarning("История предложений повреждена или имеет неизвестный формат.");
        return [];
      }
      return payload.records.filter((record) => record && typeof record === "object");
    }

    function replaceHistory(records) {
      const safeRecords = Array.isArray(records) ? records.slice(0, HISTORY_LIMIT) : [];
      return writeJson(HISTORY_KEY, { version: VERSION, records: safeRecords });
    }

    function saveRecord(record) {
      if (!record || typeof record !== "object" || !record.id) return false;

      const records = loadHistory().filter((entry) => entry.id !== record.id);
      records.push(record);
      records.sort((left, right) => {
        const leftTime = Date.parse(left.savedAt || left.updatedAt || 0) || 0;
        const rightTime = Date.parse(right.savedAt || right.updatedAt || 0) || 0;
        return rightTime - leftTime;
      });

      return replaceHistory(records.slice(0, HISTORY_LIMIT));
    }

    function deleteRecord(id) {
      const records = loadHistory().filter((record) => record.id !== id);
      return replaceHistory(records);
    }

    return Object.freeze({
      loadDraft,
      saveDraft,
      clearDraft,
      loadHistory,
      saveRecord,
      deleteRecord,
      replaceHistory,
      consumeWarning
    });
  }

  return Object.freeze({
    DRAFT_KEY,
    HISTORY_KEY,
    VERSION,
    HISTORY_LIMIT,
    create
  });
});
