const statusEl = document.getElementById('status');
const openOptions = document.getElementById('openOptions');
const btnProductEntry = document.getElementById('btnProductEntry');
let aliasList = [];

function escapeRegexLiteral(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Formatter controls
const inputArea = document.getElementById('inputArea');
const outputTable = document.getElementById('outputTable');
const outputTbody = outputTable ? outputTable.querySelector('tbody') : null;
const btnProcess = document.getElementById('btnProcess');
const btnClear = document.getElementById('btnClear');
const btnCopy = document.getElementById('btnCopy');
const btnFill = document.getElementById('btnFill');
const btnContinue = document.getElementById('btnContinue');

function setStatus(text) {
  statusEl.textContent = text;
}

function getTargetTabIdFromUrl() {
  try {
    const params = new URLSearchParams(location.search || '');
    const raw = params.get('targetTabId');
    const num = raw ? Number(raw) : NaN;
    return Number.isInteger(num) ? num : null;
  } catch {
    return null;
  }
}

async function getActiveTab() {
  const targetId = getTargetTabIdFromUrl();
  if (targetId != null) {
    return { id: targetId };
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

function extractItems(text) {
  if (!text || typeof text !== 'string') return [];

  let s = text
    .replace(/[\u00D7\u2715]/g, 'x')
    .replace(/[;,|\t\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove page markers like "Pag"/"Pg" followed by a number and a separator before a code,
  // so the page number isn't misinterpreted as quantity (e.g., "Pag 32-49361").
  s = s.replace(/\bP(?:ag|g)\.?\s*\d+\s*[-:\/]\s*/gi, ' ');

  const codeToQuantity = new Map();
  const codeFirstIndex = new Map();
  const usedRanges = [];
  const addRange = (start, end) => usedRanges.push({ start, end });
  const overlaps = (start, end) => usedRanges.some(r => !(end <= r.start || start >= r.end));
  const addQty = (code, qty, idxStart, idxEnd) => {
    if (!/^\d{5}$/.test(code)) return;
    const quantity = Math.max(1, Number(qty) || 1);
    codeToQuantity.set(code, (codeToQuantity.get(code) || 0) + quantity);
    if (!codeFirstIndex.has(code)) codeFirstIndex.set(code, idxStart);
    addRange(idxStart, idxEnd);
  };

  // Aliases: map phrases like "pungi" to a 5-digit code, with adjacent numeric quantity
  if (Array.isArray(aliasList) && aliasList.length) {
    for (const { phrase, code } of aliasList) {
      if (!phrase || !/^\d{5}$/.test(code)) continue;
      const p = escapeRegexLiteral(phrase.trim());
      let reAlias = new RegExp(`\\b(\\d{1,2})\\s*${p}\\b`, 'gi');
      for (let m; (m = reAlias.exec(s)); ) {
        const [full, qty] = m;
        if (!overlaps(m.index, m.index + full.length)) {
          addQty(code, qty, m.index, m.index + full.length);
        }
      }
      reAlias = new RegExp(`\\b${p}\\s*(\\d{1,2})\\b`, 'gi');
      for (let m; (m = reAlias.exec(s)); ) {
        const [full, qty] = m;
        if (!overlaps(m.index, m.index + full.length)) {
          addQty(code, qty, m.index, m.index + full.length);
        }
      }
    }
  }

  // Quantity markers like "2 buc", "2 bucăți", "2 bucati" near a code
  let re = /\b(\d{5})\b[\s\S]{0,80}?\b(\d{1,2})\s*(?:buc(?:a(?:ti|ți|ţi)|ă(?:ti|ți|ţi))?|buc\.?|bucati|bucăți|bucăţi)\b/gi;
  for (let m; (m = re.exec(s)); ) {
    const [full, code, qty] = m;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }
  // Also support the reversed order: "2 buc" ... then the 5-digit code
  re = /\b(\d{1,2})\s*(?:buc(?:a(?:ti|ți|ţi)|ă(?:ti|ți|ţi))?|buc\.?|bucati|bucăți|bucăţi)\b[\s\S]{0,80}?\b(\d{5})\b/gi;
  for (let m; (m = re.exec(s)); ) {
    const [full, qty, code] = m;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }

  re = /(\d+)\s*[xX*]\s*(\d{5})/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, qty, code] = m;
    addQty(code, qty, m.index, m.index + full.length);
  }
  re = /(\d{5})\s*[xX*]\s*(\d+)/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, code, qty] = m;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }
  re = /(\d{5})\s*(?:[-:\/]|[\(\[]\s*)(\d+)\s*(?:[\)\]])?/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, code, qty] = m;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }
  re = /(\d+)\s*(?:[-:\/]|[\(\[]\s*)(\d{5})\s*(?:[\)\]])?/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, qty, code] = m;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }
  re = /\b(\d{5})\b/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, code] = m;
    const start = m.index;
    const end = start + full.length;
    if (!overlaps(start, end)) {
      addQty(code, 1, start, end);
    }
  }

  const codes = Array.from(codeToQuantity.keys());
  codes.sort((a, b) => (codeFirstIndex.get(a) ?? 0) - (codeFirstIndex.get(b) ?? 0));
  return codes.map(code => ({ code, qty: codeToQuantity.get(code) || 1 }));
}

function itemsToLines(items) {
  return items.map(it => `${it.code} x ${it.qty}`).join('\n');
}

let currentItems = [];
let lastProcessedIndex = -1;

function renderTable(items, activeIndex = null) {
  if (!outputTbody) return;
  outputTbody.innerHTML = '';
  items.forEach((it, i) => {
    const tr = document.createElement('tr');
    if (i <= lastProcessedIndex) tr.classList.add('completed-row');
    if (activeIndex !== null && i === activeIndex) tr.classList.add('active-row');
    const tdIdx = document.createElement('td');
    tdIdx.textContent = String(i + 1);
    const tdCode = document.createElement('td');
    tdCode.textContent = it.code;
    const tdQty = document.createElement('td');
    tdQty.textContent = String(it.qty);
    tr.appendChild(tdIdx);
    tr.appendChild(tdCode);
    tr.appendChild(tdQty);
    outputTbody.appendChild(tr);
  });
}

function handleProcess() {
  const input = inputArea.value;
  currentItems = extractItems(input);
  renderTable(currentItems, null);
  setStatus(currentItems.length ? chrome.i18n.getMessage('statusFormatted') : chrome.i18n.getMessage('statusNoCodes'));
}

btnProcess?.addEventListener('click', handleProcess);
btnClear?.addEventListener('click', () => {
  inputArea.value = '';
  outputArea.value = '';
  setStatus(chrome.i18n.getMessage('statusCleared'));
  try { chrome.storage?.local?.remove?.('lastInput'); } catch {}
});
btnCopy?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(itemsToLines(currentItems));
    setStatus(chrome.i18n.getMessage('statusCopied'));
  } catch {
    setStatus(chrome.i18n.getMessage('statusCopyFailed'));
  }
});

// Auto-process on paste
inputArea?.addEventListener('paste', () => {
  setTimeout(handleProcess, 0);
});

// Persist last input (debounced) and restore on load
let saveInputDebounceTimerId = null;
function saveLastInputDebounced() {
  if (!inputArea) return;
  const value = inputArea.value;
  if (saveInputDebounceTimerId) clearTimeout(saveInputDebounceTimerId);
  saveInputDebounceTimerId = setTimeout(() => {
    chrome.storage?.local?.set({ lastInput: value }).catch?.(() => {});
  }, 300);
}

inputArea?.addEventListener('input', saveLastInputDebounced);

  (async () => {
    try {
      // Load aliases (sync) and last input (local)
      const [{ aliases = [] } = {}, { lastInput = '' } = {}] = await Promise.all([
        chrome.storage?.sync?.get?.(['aliases']) || {},
        chrome.storage?.local?.get?.(['lastInput']) || {}
      ]);
      aliasList = Array.isArray(aliases) ? aliases : [];
      if (lastInput && inputArea) {
        inputArea.value = lastInput;
        handleProcess();
      }
    } catch {}
  })();

  // React to alias updates from Options without reopening the popup
  try {
    chrome.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes?.aliases) {
        aliasList = Array.isArray(changes.aliases.newValue) ? changes.aliases.newValue : [];
      }
    });
  } catch {}

// Send to active tab for automated filling
btnFill?.addEventListener('click', async () => {
  const tab = await getActiveTab();
  const items = currentItems;
  if (!items.length) {
    setStatus(chrome.i18n.getMessage('statusNothingToFill'));
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'AVON_FILL_PRODUCTS',
      items
    });
    setStatus(response?.ok
      ? (chrome.i18n.getMessage('statusQueuedStarting', String(items.length)) || `Queued ${items.length}`)
      : (response?.error || chrome.i18n.getMessage('statusFillFailed')));
    if (response?.ok) {
      btnContinue.style.display = 'none';
    }
  } catch (err) {
    setStatus(chrome.i18n.getMessage('statusUnableToCommunicate'));
  }
});

// Listen for progress notifications to highlight current row
chrome.runtime.onMessage.addListener((message) => {
  if (!message || !Array.isArray(currentItems) || !currentItems.length) return;
  if (message.type === 'AVON_FILL_PROGRESS') {
    const index = typeof message.index === 'number' ? message.index : null;
    if (index !== null) {
      lastProcessedIndex = Math.max(lastProcessedIndex, index);
      renderTable(currentItems, index);
      setStatus(chrome.i18n.getMessage('statusApplyingRow', [String(index + 1), String(currentItems.length)]) || `Applying row ${index + 1} / ${currentItems.length}`);
    }
  }
  if (message.type === 'AVON_FILL_DONE') {
    renderTable(currentItems, null);
    setStatus(chrome.i18n.getMessage('statusFillComplete'));
    btnContinue.style.display = 'none';
  }
  if (message.type === 'AVON_FILL_PAUSED') {
    const { nextIndex, total, remaining, batchSize } = message;
    lastProcessedIndex = nextIndex - 1;
    renderTable(currentItems, null);
    setStatus(chrome.i18n.getMessage('statusPausedAfter', [String(Math.min(nextIndex, batchSize)), String(remaining)])
      || `Paused after ${Math.min(nextIndex, batchSize)} items. ${remaining} remaining.`);
    btnContinue.style.display = 'inline-block';
  }
});

btnContinue?.addEventListener('click', async () => {
  const tab = await getActiveTab();
  try {
    btnContinue.style.display = 'none';
    setStatus(chrome.i18n.getMessage('statusContinuingNextBatch'));
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'AVON_FILL_CONTINUE' });
    if (response?.done) {
      setStatus(chrome.i18n.getMessage('statusAllItemsCompleted'));
      btnContinue.style.display = 'none';
    }
  } catch (e) {
    setStatus(chrome.i18n.getMessage('statusUnableToContinue'));
    btnContinue.style.display = 'inline-block';
  }
});


openOptions.addEventListener('click', async (e) => {
  e.preventDefault();
  await chrome.runtime.openOptionsPage();
});

btnProductEntry.addEventListener('click', async () => {
  const url = 'https://www2.avoncosmetics.ro/ro-home/orders/product-entry';
  try {
    await chrome.tabs.create({ url });
    setStatus(chrome.i18n.getMessage('statusOpenedProductEntry'));
  } catch (err) {
    setStatus(chrome.i18n.getMessage('statusUnableToOpenProductEntry'));
  }
});


