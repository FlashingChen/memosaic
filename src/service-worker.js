import "./shared/namespace.js";
import "./shared/i18n.js";
import "./shared/protocol.js";
import "./shared/providers.js";
import { clearMemory, editMemory, getState, readMemory, saveManualMemory } from "./memory-store.js";

const { protocol, providers } = globalThis.Memosaic;

function providerFromSender(sender) {
  try {
    const host = new URL(sender?.url || sender?.tab?.url || "").hostname;
    return providers.fromHost(host);
  } catch {
    return null;
  }
}

function isExtensionPage(sender) {
  return typeof sender?.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));
}

function errorText(error) {
  const message = error instanceof Error ? error.message : "Memory operation failed.";
  return message.slice(0, 800);
}

async function handleToolCall(message, sender) {
  const provider = providerFromSender(sender);
  if (!provider) {
    throw new Error("UNSUPPORTED_PROVIDER: memory tools are only available on supported AI websites.");
  }

  const call = message.call;
  if (!call || typeof call !== "object" || Array.isArray(call) || typeof call.name !== "string") {
    throw new Error("INVALID_TOOL_CALL: expected an object with a tool name and arguments.");
  }
  const args = call.arguments ?? {};

  if (call.name === "read_memory") {
    if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).length !== 0) {
      throw new Error("INVALID_TOOL_CALL: read_memory takes an empty arguments object.");
    }
    const state = await readMemory();
    return protocol.createToolResult(state.revision, state.memory);
  }

  if (call.name === "edit_memory") {
    const state = await editMemory(args, provider.name);
    return `EDIT_OK\nrevision: ${state.revision}`;
  }

  throw new Error(`TOOL_NOT_FOUND: ${call.name}`);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return undefined;

  if (message.type === "TOOL_CALL") {
    handleToolCall(message, sender)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: errorText(error) }));
    return true;
  }

  if (!isExtensionPage(sender)) {
    sendResponse({ ok: false, error: "This action is only available from the extension's memory page." });
    return undefined;
  }

  const work = message.type === "GET_STATE"
    ? getState()
    : message.type === "SAVE_MEMORY"
      ? saveManualMemory({ memory: message.memory, baseRevision: message.baseRevision })
      : message.type === "CLEAR_MEMORY"
        ? clearMemory({ baseRevision: message.baseRevision })
        : null;

  if (!work) {
    sendResponse({ ok: false, error: "Unknown extension message." });
    return undefined;
  }

  work.then((state) => sendResponse({ ok: true, state }))
    .catch((error) => sendResponse({ ok: false, error: errorText(error) }));
  return true;
});
