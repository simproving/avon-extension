const languageSelect = document.getElementById('language');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save');
const aliasesTbody = document.getElementById('aliasesTbody');
const addAliasBtn = document.getElementById('addAlias');

function setStatus(text) {
  statusEl.textContent = text;
}

function createAliasRow(alias) {
  const tr = document.createElement('tr');
  tr.className = 'alias-row';
  const tdPhrase = document.createElement('td');
  const phraseInput = document.createElement('input');
  phraseInput.type = 'text';
  phraseInput.placeholder = chrome.i18n.getMessage('aliasPhrase') || 'Phrase';
  phraseInput.value = alias?.phrase || '';
  tdPhrase.appendChild(phraseInput);

  const tdCode = document.createElement('td');
  const codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.placeholder = chrome.i18n.getMessage('aliasCode') || 'Code';
  codeInput.value = alias?.code || '';
  codeInput.pattern = '\\d{5}';
  codeInput.size = 6;
  tdCode.appendChild(codeInput);

  const tdActions = document.createElement('td');
  const removeBtn = document.createElement('button');
  removeBtn.textContent = chrome.i18n.getMessage('remove') || 'Remove';
  removeBtn.addEventListener('click', () => {
    tr.remove();
  });
  tdActions.appendChild(removeBtn);

  tr.appendChild(tdPhrase);
  tr.appendChild(tdCode);
  tr.appendChild(tdActions);
  return tr;
}

function renderAliases(aliases) {
  if (!aliasesTbody) return;
  aliasesTbody.innerHTML = '';
  (aliases || []).forEach(a => {
    aliasesTbody.appendChild(createAliasRow(a));
  });
}

async function restore() {
  const { language = 'ro', aliases = [] } = await chrome.storage.sync.get(['language', 'aliases']);
  if (languageSelect) languageSelect.value = language;
  renderAliases(Array.isArray(aliases) ? aliases : []);
}

async function save() {
  const language = languageSelect?.value || 'ro';
  const aliases = [];
  if (aliasesTbody) {
    aliasesTbody.querySelectorAll('tr.alias-row').forEach(tr => {
      const [phraseInput, codeInput] = tr.querySelectorAll('input');
      const phrase = phraseInput?.value?.trim() || '';
      const code = codeInput?.value?.trim() || '';
      if (phrase && /^\d{5}$/.test(code)) {
        aliases.push({ phrase, code });
      }
    });
  }
  await chrome.storage.sync.set({ language, aliases });
  setStatus(chrome.i18n.getMessage('saved'));
}

saveBtn.addEventListener('click', save);
addAliasBtn?.addEventListener('click', () => {
  if (!aliasesTbody) return;
  aliasesTbody.appendChild(createAliasRow({ phrase: '', code: '' }));
});
restore();


