const editor = document.getElementById("memory");
const revisionLabel = document.getElementById("revision");
const statusLabel = document.getElementById("status");
const countLabel = document.getElementById("char-count");
const historyList = document.getElementById("history");
const emptyHistory = document.getElementById("empty-history");
let baseRevision = 0;
let loadedMemory = "";

function setStatus(message, kind = "") {
  statusLabel.textContent = message;
  statusLabel.dataset.kind = kind;
}

function updateCount() {
  countLabel.textContent = `${editor.value.length.toLocaleString()} characters`;
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
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
    revisions.textContent = `revision ${entry.previousRevision} → ${entry.newRevision}`;
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

function applyState(state) {
  baseRevision = state.revision;
  loadedMemory = state.memory;
  editor.value = state.memory;
  revisionLabel.textContent = `Revision ${state.revision}`;
  updateCount();
  renderHistory(state.history || []);
}

async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "The extension could not complete that request.");
  return response.state;
}

async function loadMemory({ replaceEditor = true } = {}) {
  try {
    const state = await request({ type: "GET_STATE" });
    if (replaceEditor || editor.value === loadedMemory) applyState(state);
    else {
      revisionLabel.textContent = `Latest revision ${state.revision} · draft based on ${baseRevision}`;
      renderHistory(state.history || []);
    }
    setStatus("Memory is stored locally.");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

editor.addEventListener("input", updateCount);

document.getElementById("save").addEventListener("click", async () => {
  try {
    const state = await request({ type: "SAVE_MEMORY", memory: editor.value, baseRevision });
    applyState(state);
    setStatus("Memory saved.", "success");
  } catch (error) {
    if (error.message.includes("REVISION_CONFLICT")) {
      await loadMemory({ replaceEditor: false });
    }
    setStatus(error.message, "error");
  }
});

document.getElementById("refresh").addEventListener("click", () => loadMemory());

document.getElementById("clear").addEventListener("click", async () => {
  if (!window.confirm("Clear the entire memory document? This creates a new revision.")) return;
  try {
    const state = await request({ type: "CLEAR_MEMORY", baseRevision });
    applyState(state);
    setStatus("Memory cleared.", "success");
  } catch (error) {
    if (error.message.includes("REVISION_CONFLICT")) {
      await loadMemory({ replaceEditor: false });
    }
    setStatus(error.message, "error");
  }
});

loadMemory();
