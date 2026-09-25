const { i18n } = globalThis.Memosaic;
const editor = document.getElementById("memory");
const revisionLabel = document.getElementById("revision");
const statusLabel = document.getElementById("status");
const countLabel = document.getElementById("char-count");
const historyList = document.getElementById("history");
const emptyHistory = document.getElementById("empty-history");
const languageSelect = document.getElementById("language");
let baseRevision = 0;
let loadedMemory = "";
let currentLocale = i18n.normalizeLocale("auto");
let lastState = null;

function t(key, values) {
  return i18n.translate(currentLocale, key, values);
}

function setStatus(message, kind = "") {
  statusLabel.textContent = message;
  statusLabel.dataset.kind = kind;
}

function updateCount() {
  countLabel.textContent = t("memory.characters", { count: editor.value.length.toLocaleString(currentLocale) });
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(currentLocale);
}

function renderHistory(entries) {
  historyList.replaceChildren();
  emptyHistory.hidden = entries.length !== 0;

  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = "history-item";

    const header = document.createElement("div");
    header.className = "history-topline";
    const provider = document.createElement("strong");
    provider.textContent = entry.provider;
    const revisions = document.createElement("span");
    revisions.textContent = t("memory.revisionTransition", {
      from: entry.previousRevision,
      to: entry.newRevision
    });
    header.append(provider, revisions);

    const details = document.createElement("div");
    details.className = "history-details";
    const operation = document.createElement("span");
    operation.className = "operation-tag";
    operation.textContent = entry.operation;
    const time = document.createElement("time");
    time.dateTime = entry.timestamp;
    time.textContent = formatTimestamp(entry.timestamp);
    details.append(operation, time);

    const change = document.createElement("pre");
    change.className = "history-change";
    change.textContent = entry.change;
    item.append(header, details, change);
    historyList.append(item);
  }
}

function renderRevision(state, draftBase = null) {
  revisionLabel.textContent = draftBase === null
    ? t("memory.revision", { revision: state.revision })
    : t("memory.latestRevision", { latest: state.revision, base: draftBase });
}

function applyState(state) {
  lastState = state;
  baseRevision = state.revision;
  loadedMemory = state.memory;
  editor.value = state.memory;
  renderRevision(state);
  updateCount();
  renderHistory(state.history || []);
}

async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || t("memory.unknownError"));
  return response.state;
}

async function loadMemory({ replaceEditor = true } = {}) {
  try {
    const state = await request({ type: "GET_STATE" });
    lastState = state;
    if (replaceEditor || editor.value === loadedMemory) applyState(state);
    else {
      renderRevision(state, baseRevision);
      renderHistory(state.history || []);
    }
    setStatus(t("memory.statusStored"));
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function applyLocale(locale) {
  currentLocale = i18n.applyTranslations(document, locale);
  i18n.setDocumentLanguage(currentLocale);
  document.title = t("memory.title");
  updateCount();
  if (lastState) {
    renderRevision(lastState);
    renderHistory(lastState.history || []);
  }
}

editor.addEventListener("input", updateCount);

document.getElementById("save").addEventListener("click", async () => {
  try {
    const state = await request({ type: "SAVE_MEMORY", memory: editor.value, baseRevision });
    applyState(state);
    setStatus(t("memory.statusSaved"), "success");
  } catch (error) {
    if (error.message.includes("REVISION_CONFLICT")) {
      await loadMemory({ replaceEditor: false });
    }
    setStatus(error.message, "error");
  }
});

document.getElementById("refresh").addEventListener("click", () => loadMemory());

document.getElementById("clear").addEventListener("click", async () => {
  if (!window.confirm(t("memory.confirmClear"))) return;
  try {
    const state = await request({ type: "CLEAR_MEMORY", baseRevision });
    applyState(state);
    setStatus(t("memory.statusCleared"), "success");
  } catch (error) {
    if (error.message.includes("REVISION_CONFLICT")) {
      await loadMemory({ replaceEditor: false });
    }
    setStatus(error.message, "error");
  }
});

languageSelect.addEventListener("change", async () => {
  const language = languageSelect.value;
  await chrome.storage.local.set({ language });
  applyLocale(language);
});

async function initialize() {
  const { language = "auto" } = await chrome.storage.local.get("language");
  languageSelect.value = language === "auto" ? "auto" : i18n.normalizeLocale(language);
  applyLocale(language);
  await loadMemory();
}

initialize();
