const input = document.getElementById('favoriteColor');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save');

function setStatus(text) {
  statusEl.textContent = text;
}

async function restore() {
  const { favoriteColor = '' } = await chrome.storage.sync.get('favoriteColor');
  input.value = favoriteColor;
}

async function save() {
  const favoriteColor = input.value.trim();
  await chrome.storage.sync.set({ favoriteColor });
  setStatus('Saved.');
}

saveBtn.addEventListener('click', save);
restore();


