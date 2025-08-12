const languageSelect = document.getElementById('language');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save');

function setStatus(text) {
  statusEl.textContent = text;
}

async function restore() {
  const { language = 'ro' } = await chrome.storage.sync.get(['language']);
  if (languageSelect) languageSelect.value = language;
}

async function save() {
  const language = languageSelect?.value || 'ro';
  await chrome.storage.sync.set({ language });
  setStatus(chrome.i18n.getMessage('saved'));
}

saveBtn.addEventListener('click', save);
restore();


