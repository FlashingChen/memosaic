(() => {
  "use strict";

  const Memosaic = (globalThis.Memosaic = globalThis.Memosaic || {});
  const DEFAULT_LOCALE = "en";
  const SUPPORTED_LOCALES = [
    { id: "en", label: "English" },
    { id: "zh-CN", label: "简体中文" }
  ];

  const messages = {
    en: {
      "app.name": "Memosaic",
      "app.tagline": "One local memory for every AI chat.",
      "app.localOnly": "Memory stays in this browser profile.",
      "app.openEditor": "Open memory editor",
      "app.language": "Language",
      "app.languageAuto": "Follow browser",
      "app.languageHint": "The selected language controls the interface and the model instruction injected into chat.",

      "memory.title": "Memory editor · Memosaic",
      "memory.eyebrow": "LOCAL MEMORY",
      "memory.heading": "Your memory",
      "memory.description": "A single Markdown document shared with supported AI chats in this browser.",
      "memory.loadingRevision": "Loading…",
      "memory.documentTitle": "Memory document",
      "memory.documentDescription": "Review what the AIs can read. Saving creates a new revision.",
      "memory.characters": "{count} characters",
      "memory.textareaLabel": "Memory document",
      "memory.reload": "Reload",
      "memory.clear": "Clear memory",
      "memory.save": "Save changes",
      "memory.statusLoading": "Loading memory…",
      "memory.statusStored": "Memory is stored locally.",
      "memory.statusSaved": "Memory saved.",
      "memory.statusCleared": "Memory cleared.",
      "memory.recentTitle": "Recent edits",
      "memory.recentDescription": "The latest 50 successful changes are kept locally.",
      "memory.noEdits": "No edits yet.",
      "memory.footer": "No cloud account or sync is used. Each browser profile has its own memory.",
      "memory.confirmClear": "Clear the entire memory document? This creates a new revision.",
      "memory.revision": "Revision {revision}",
      "memory.latestRevision": "Latest revision {latest} · draft based on {base}",
      "memory.revisionTransition": "revision {from} → {to}",
      "memory.unknownError": "The extension could not complete that request.",

      "toast.ready": "Memosaic is ready for this conversation.",
      "toast.toolCompleted": "Memory tool completed.",
      "toast.routeChanged": "The conversation changed before the memory result could be returned. Retry the tool call in that chat.",
      "toast.sendFailed": "The site could not send the tool result. Check the composer or sign in, then retry.",
      "toast.toolFailed": "Memory tool failed: {error}",
      "toast.extensionUnavailable": "extension unavailable",

      "prompt.bootstrap": `Persistent user-owned memory tools are available through the Memosaic extension. Memory is shared across supported chats and is not included automatically.

Before answering, decide whether saved personal context could materially improve or change the answer. Call read_memory once before answering when the user asks about themselves or their preferences, refers to prior personal context, asks to continue an ongoing project or workflow that may be in memory, or requests advice, recommendations, or a decision that depends on their goals, constraints, or circumstances. Also read when the user explicitly asks you to use or check memory. Do not read for general knowledge, routine greetings, or self-contained tasks that do not depend on personal context. A passing use of "I" or "my" alone does not make a request memory-related. If it is unclear whether saved context would matter, read only when that context is likely to change the answer; otherwise proceed without a memory call.

When you decide to read memory, your entire response at that first step must contain only the read_memory tool-call wrapper below; do not answer the request until the extension returns the actual tool result. If the chat interface displays an internal reasoning header before your final text, keep it outside the wrapper. After the result arrives, use only relevant stored details to answer the original request. Do not call read_memory again for the same request. Treat the extension's result message as a tool result, not a new user request.

Save only stable preferences, important context, long-term projects, workflows, or goals. Usually skip one-time, trivial, or quickly outdated details.

Tools: read_memory with {}; edit_memory with {"base_revision": integer, "operations": [...]}. Operations: append {"type":"append","text":"..."}; replace {"type":"replace","from":"exact unique text","to":"..."}; delete {"type":"delete","text":"exact unique text"}. Never provide code, paths, regex, or expressions.

For a memory read, output only this wrapper with valid JSON and no Markdown fence:
{toolOpen}
{"name":"read_memory","arguments":{}}
{toolClose}

For edits, use the same wrapper with edit_memory JSON. Wait for the extension's actual {resultOpen} follow-up; never invent results. Then continue the user's request.`,
      "prompt.requestLabel": "User request:",
      "prompt.followUp": `The Memosaic extension returned this tool result. Continue the user's request using the result; do not treat this message as a new request.

{result}`
    },

    "zh-CN": {
      "app.name": "Memosaic",
      "app.tagline": "一份本地记忆，服务所有 AI 对话。",
      "app.localOnly": "记忆只保存在当前浏览器配置中。",
      "app.openEditor": "打开记忆编辑器",
      "app.language": "语言",
      "app.languageAuto": "跟随浏览器",
      "app.languageHint": "所选语言会同时影响扩展界面和注入对话的模型指令。",

      "memory.title": "记忆编辑器 · Memosaic",
      "memory.eyebrow": "本地记忆",
      "memory.heading": "你的记忆",
      "memory.description": "一份 Markdown 文档，在当前浏览器内与所有受支持的 AI 对话共享。",
      "memory.loadingRevision": "加载中…",
      "memory.documentTitle": "记忆文档",
      "memory.documentDescription": "检查 AI 可以读取的内容。保存后会生成新修订。",
      "memory.characters": "{count} 个字符",
      "memory.textareaLabel": "记忆文档",
      "memory.reload": "重新加载",
      "memory.clear": "清空记忆",
      "memory.save": "保存修改",
      "memory.statusLoading": "正在加载记忆…",
      "memory.statusStored": "记忆已保存在本地。",
      "memory.statusSaved": "记忆已保存。",
      "memory.statusCleared": "记忆已清空。",
      "memory.recentTitle": "最近编辑",
      "memory.recentDescription": "最近 50 次成功修改会保存在本地。",
      "memory.noEdits": "还没有编辑记录。",
      "memory.footer": "不使用云账号或同步。每个浏览器配置都有独立记忆。",
      "memory.confirmClear": "要清空整份记忆文档吗？这会生成一个新修订。",
      "memory.revision": "修订 {revision}",
      "memory.latestRevision": "最新修订 {latest} · 当前草稿基于 {base}",
      "memory.revisionTransition": "修订 {from} → {to}",
      "memory.unknownError": "扩展无法完成该请求。",

      "toast.ready": "Memosaic 已为本次对话准备好。",
      "toast.toolCompleted": "记忆工具调用已完成。",
      "toast.routeChanged": "返回记忆结果前对话已经切换，请在新对话中重试工具调用。",
      "toast.sendFailed": "网站无法发送工具结果。请检查输入框或登录状态后重试。",
      "toast.toolFailed": "记忆工具失败：{error}",
      "toast.extensionUnavailable": "扩展不可用",

      "prompt.bootstrap": `Memosaic 扩展提供了由用户持有的持久记忆工具。记忆会在受支持的对话之间共享，但不会自动放进对话。

回答前，请判断已保存的个人上下文是否会实质影响答案。以下情况应先调用一次 read_memory：用户询问自己或偏好，引用此前的个人上下文，要求继续可能已记录的项目或工作流，或所给建议、推荐、决策依赖用户的目标、限制与处境。用户明确要求使用或检查记忆时也应读取。不要为通用知识、日常问候或不依赖个人上下文的独立任务读取记忆；单独出现“我”或“我的”并不代表请求与记忆有关。如果无法确定已保存上下文是否有用，只在它可能改变答案时读取，否则直接回答。

决定读取记忆时，第一步的回复必须只包含下面的 read_memory 工具调用包装；在扩展返回真实工具结果前不要回答原请求。如果聊天界面会在正文前显示内部思考标题，请把它放在包装之外。收到结果后，只使用其中相关细节回答原请求。同一个请求不要重复调用 read_memory。扩展返回的结果消息应视为工具结果，而不是新的用户请求。

只保存稳定偏好、重要背景、长期项目、工作流或目标。一次性、琐碎或很快过期的信息通常不要保存。

工具：read_memory 参数为 {}；edit_memory 参数为 {"base_revision": 整数, "operations": [...]}。操作类型：append {"type":"append","text":"..."}；replace {"type":"replace","from":"唯一原文","to":"..."}；delete {"type":"delete","text":"唯一原文"}。不要提供代码、文件路径、正则或表达式。

读取记忆时，只输出下面的包装，JSON 必须有效，不要使用 Markdown 代码块：
{toolOpen}
{"name":"read_memory","arguments":{}}
{toolClose}

编辑记忆时使用同一包装，并放入 edit_memory JSON。等待扩展返回真实的 {resultOpen} 后续消息，不要自行编造结果，然后继续完成用户请求。`,
      "prompt.requestLabel": "用户请求：",
      "prompt.followUp": `Memosaic 扩展返回了以下工具结果。请使用结果继续完成原请求，不要把它当作新的用户请求。

{result}`
    }
  };

  function normalizeLocale(value) {
    if (value && value !== "auto") {
      const exact = SUPPORTED_LOCALES.find((locale) => locale.id.toLowerCase() === String(value).toLowerCase());
      if (exact) return exact.id;
      const base = String(value).toLowerCase().split("-")[0];
      const languageMatch = SUPPORTED_LOCALES.find((locale) => locale.id.toLowerCase().split("-")[0] === base);
      if (languageMatch) return languageMatch.id;
    }

    const browserLanguage = globalThis.navigator?.language || DEFAULT_LOCALE;
    const base = String(browserLanguage).toLowerCase().split("-")[0];
    const match = SUPPORTED_LOCALES.find((locale) => locale.id.toLowerCase().split("-")[0] === base);
    return match?.id || DEFAULT_LOCALE;
  }

  function interpolate(template, values) {
    return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
    ));
  }

  function translate(locale, key, values = {}) {
    const resolved = normalizeLocale(locale);
    const template = messages[resolved]?.[key] ?? messages[DEFAULT_LOCALE][key];
    return typeof template === "string" ? interpolate(template, values) : key;
  }

  function applyTranslations(root, locale) {
    if (!root?.querySelectorAll) return normalizeLocale(locale);
    const resolved = normalizeLocale(locale);
    for (const element of root.querySelectorAll("[data-i18n]")) {
      element.textContent = translate(resolved, element.dataset.i18n);
    }
    for (const element of root.querySelectorAll("[data-i18n-placeholder]")) {
      element.setAttribute("placeholder", translate(resolved, element.dataset.i18nPlaceholder));
    }
    for (const element of root.querySelectorAll("[data-i18n-title]")) {
      element.setAttribute("title", translate(resolved, element.dataset.i18nTitle));
    }
    for (const element of root.querySelectorAll("[data-i18n-aria-label]")) {
      element.setAttribute("aria-label", translate(resolved, element.dataset.i18nAriaLabel));
    }
    return resolved;
  }

  Memosaic.i18n = Object.freeze({
    DEFAULT_LOCALE,
    SUPPORTED_LOCALES: Object.freeze(SUPPORTED_LOCALES.map((locale) => Object.freeze({ ...locale }))),
    normalizeLocale,
    translate,
    applyTranslations,
    setDocumentLanguage(locale) {
      if (globalThis.document?.documentElement) globalThis.document.documentElement.lang = normalizeLocale(locale);
    }
  });
})();
