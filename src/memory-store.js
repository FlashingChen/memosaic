const DB_NAME = "cross-ai-memory";
const DB_VERSION = 1;
const STORE_NAME = "documents";
const STATE_KEY = "user-memory";
const MAX_HISTORY = 50;
const MAX_MEMORY_CHARS = 100_000;
const MAX_OPERATION_CHARS = 10_000;

const DEFAULT_MEMORY = `# User

## Identity

## Preferences

## Projects

## Goals

## Other
`;

let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local memory storage."));
    request.onblocked = () => reject(new Error("Memory storage upgrade is blocked by another extension page."));
  });

  return databasePromise;
}

function emptyState() {
  return { id: STATE_KEY, memory: DEFAULT_MEMORY, revision: 0, history: [] };
}

function runTransaction(mode, onState) {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(STATE_KEY);
    let result;

    request.onsuccess = () => {
      const missing = !request.result;
      const current = request.result || emptyState();
      try {
        const outcome = onState(current, { missing });
        result = outcome.result;
        if (outcome.state) store.put(outcome.state);
      } catch (error) {
        try { transaction.abort(); } catch { /* The transaction may already be inactive. */ }
        reject(error);
      }
    };
    request.onerror = () => {
      try { transaction.abort(); } catch { /* The transaction may already be inactive. */ }
      reject(request.error || new Error("Could not read local memory."));
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error("Memory transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Memory transaction was aborted."));
  }));
}

function publicState(state) {
  return {
    memory: state.memory,
    revision: state.revision,
    history: Array.isArray(state.history) ? state.history.slice(0, MAX_HISTORY) : []
  };
}

function addHistory(state, { provider, operation, previousRevision, change }) {
  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    provider,
    operation,
    previousRevision,
    newRevision: state.revision,
    change: String(change).slice(0, 1600)
  };
  state.history = [entry, ...(state.history || [])].slice(0, MAX_HISTORY);
}

function requireRevision(actual, requested) {
  if (!Number.isSafeInteger(requested) || requested < 0) {
    throw new Error("INVALID_REVISION: base_revision must be a non-negative integer.");
  }
  if (requested !== actual) {
    throw new Error(`REVISION_CONFLICT: memory is now at revision ${actual}. Read memory again before editing.`);
  }
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`INVALID_TOOL_CALL: ${label} must be an object.`);
  }
}

function requireOnlyKeys(value, allowed, label) {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) throw new Error(`INVALID_TOOL_CALL: unsupported field "${unexpected}" in ${label}.`);
}

function applyOperations(original, operations) {
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > 20) {
    throw new Error("INVALID_EDIT: operations must contain between 1 and 20 items.");
  }

  let memory = original;
  const applied = [];

  for (const [index, operation] of operations.entries()) {
    requirePlainObject(operation, `operations[${index}]`);

    if (operation.type === "append") {
      requireOnlyKeys(operation, new Set(["type", "text"]), `operations[${index}]`);
      if (typeof operation.text !== "string" || operation.text.trim().length === 0 || operation.text.length > MAX_OPERATION_CHARS) {
        throw new Error(`INVALID_EDIT: operations[${index}].text must be non-empty text of at most ${MAX_OPERATION_CHARS} characters.`);
      }
      const separator = memory.length > 0 && !memory.endsWith("\n") ? "\n" : "";
      memory += `${separator}${operation.text}`;
      applied.push(`append:\n${operation.text}`);
      continue;
    }

    if (operation.type === "replace") {
      requireOnlyKeys(operation, new Set(["type", "from", "to"]), `operations[${index}]`);
      if (typeof operation.from !== "string" || operation.from.length === 0 || operation.from.length > MAX_OPERATION_CHARS ||
          typeof operation.to !== "string" || operation.to.length > MAX_OPERATION_CHARS) {
        throw new Error(`INVALID_EDIT: operations[${index}] requires non-empty from and text to values of at most ${MAX_OPERATION_CHARS} characters.`);
      }
      const first = memory.indexOf(operation.from);
      if (first < 0) throw new Error(`INVALID_EDIT: exact text for operations[${index}] was not found.`);
      if (memory.indexOf(operation.from, first + 1) >= 0) {
        throw new Error(`INVALID_EDIT: exact text for operations[${index}] occurs more than once; make it unique before replacing.`);
      }
      memory = `${memory.slice(0, first)}${operation.to}${memory.slice(first + operation.from.length)}`;
      applied.push(`replace:\n${operation.from}\n→\n${operation.to}`);
      continue;
    }

    if (operation.type === "delete") {
      requireOnlyKeys(operation, new Set(["type", "text"]), `operations[${index}]`);
      if (typeof operation.text !== "string" || operation.text.length === 0 || operation.text.length > MAX_OPERATION_CHARS) {
        throw new Error(`INVALID_EDIT: operations[${index}].text must be non-empty exact text of at most ${MAX_OPERATION_CHARS} characters.`);
      }
      const first = memory.indexOf(operation.text);
      if (first < 0) throw new Error(`INVALID_EDIT: exact text for operations[${index}] was not found.`);
      if (memory.indexOf(operation.text, first + 1) >= 0) {
        throw new Error(`INVALID_EDIT: exact text for operations[${index}] occurs more than once; make it unique before deleting.`);
      }
      memory = `${memory.slice(0, first)}${memory.slice(first + operation.text.length)}`;
      applied.push(`delete:\n${operation.text}`);
      continue;
    }

    throw new Error(`INVALID_EDIT: unsupported operation type at operations[${index}].`);
  }

  if (memory.length > MAX_MEMORY_CHARS) {
    throw new Error(`INVALID_EDIT: memory cannot exceed ${MAX_MEMORY_CHARS} characters.`);
  }

  return { memory, change: applied.join("\n\n") };
}

export async function getState() {
  return runTransaction("readwrite", (current, { missing }) => ({ state: missing ? current : null, result: publicState(current) }));
}

export async function readMemory() {
  return getState();
}

export async function editMemory(args, provider) {
  requirePlainObject(args, "arguments");
  requireOnlyKeys(args, new Set(["base_revision", "operations"]), "arguments");
  return runTransaction("readwrite", (current) => {
    requireRevision(current.revision, args.base_revision);
    const { memory, change } = applyOperations(current.memory, args.operations);
    const previousRevision = current.revision;
    const next = { ...current, memory, revision: previousRevision + 1 };
    addHistory(next, { provider, operation: args.operations.map((item) => item.type).join(", "), previousRevision, change });
    return { state: next, result: publicState(next) };
  });
}

export async function saveManualMemory({ memory, baseRevision }) {
  if (typeof memory !== "string" || memory.length > MAX_MEMORY_CHARS) {
    throw new Error(`INVALID_MEMORY: memory must be text of at most ${MAX_MEMORY_CHARS} characters.`);
  }
  return runTransaction("readwrite", (current) => {
    requireRevision(current.revision, baseRevision);
    if (current.memory === memory) return { state: null, result: publicState(current) };
    const previousRevision = current.revision;
    const next = { ...current, memory, revision: previousRevision + 1 };
    const change = `Manual edit. Previous text: ${current.memory.slice(0, 500)}\nNew text: ${memory.slice(0, 500)}`;
    addHistory(next, { provider: "Memory editor", operation: "manual replace", previousRevision, change });
    return { state: next, result: publicState(next) };
  });
}

export async function clearMemory({ baseRevision }) {
  return runTransaction("readwrite", (current) => {
    requireRevision(current.revision, baseRevision);
    if (current.memory === "") return { state: null, result: publicState(current) };
    const previousRevision = current.revision;
    const next = { ...current, memory: "", revision: previousRevision + 1 };
    addHistory(next, { provider: "Memory editor", operation: "clear", previousRevision, change: `Cleared ${current.memory.length} characters of memory.` });
    return { state: next, result: publicState(next) };
  });
}
