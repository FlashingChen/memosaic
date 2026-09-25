const { i18n } = globalThis.Memosaic;
const languageSelect = document.getElementById("language");

function applyLocale(locale) {
  const resolved = i18n.applyTranslations(document, locale);
  i18n.setDocumentLanguage(resolved);
  document.title = i18n.translate(resolved, "app.name");
}

async function loadLanguage() {
  const { language = "auto" } = await chrome.storage.local.get("language");
  languageSelect.value = language === "auto" ? "auto" : i18n.normalizeLocale(language);
  applyLocale(language);
}

languageSelect.addEventListener("change", async () => {
  const language = languageSelect.value;
  await chrome.storage.local.set({ language });
  applyLocale(language);
});

document.getElementById("open-memory").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

loadLanguage();
