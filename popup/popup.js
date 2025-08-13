const statusEl = document.getElementById('status');
const countsEl = document.getElementById('counts');
const openOptions = document.getElementById('openOptions');
const btnProductEntry = document.getElementById('btnProductEntry');
let aliasList = [];

// Login Manager controls
const loginNameEl = document.getElementById('loginName');
const loginUsernameEl = document.getElementById('loginUsername');
const loginPasswordEl = document.getElementById('loginPassword');
const btnSaveLoginEl = document.getElementById('btnSaveLogin');
const loginSelectEl = document.getElementById('loginSelect');
const btnSendLoginEl = document.getElementById('btnSendLogin');
const btnDeleteLoginEl = document.getElementById('btnDeleteLogin');
const btnTogglePasswordEl = document.getElementById('btnTogglePassword');

function readSavedLogins() {
  try {
    const raw = localStorage.getItem('savedLogins');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeSavedLogins(logins) {
  try {
    localStorage.setItem('savedLogins', JSON.stringify(Array.isArray(logins) ? logins : []));
  } catch {}
}

function readSelectedLoginIndex() {
  const raw = localStorage.getItem('savedLoginsSelected');
  const idx = raw != null ? Number(raw) : NaN;
  return Number.isInteger(idx) ? idx : -1;
}

function writeSelectedLoginIndex(index) {
  try { localStorage.setItem('savedLoginsSelected', String(index)); } catch {}
}

function renderLoginSelect() {
  if (!loginSelectEl) return;
  const logins = readSavedLogins();
  loginSelectEl.innerHTML = '';
  if (!logins.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = t('loginSelectEmpty') || 'No saved logins';
    loginSelectEl.appendChild(opt);
    loginSelectEl.disabled = true;
    return;
  }
  loginSelectEl.disabled = false;
  logins.forEach((login, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    const name = (login?.name || '').trim();
    const user = (login?.username || '').trim();
    const label = name && user
      ? `${name} (${user})`
      : (name || user || (t('loginDefaultLabel', [String(i + 1)]) || `Login ${i + 1}`));
    opt.textContent = label;
    opt.title = label;
    loginSelectEl.appendChild(opt);
  });
  const sel = readSelectedLoginIndex();
  if (sel >= 0 && sel < logins.length) {
    loginSelectEl.value = String(sel);
  }
}

function getSelectedOrTypedLogin() {
  const typedUsername = loginUsernameEl?.value?.trim() || '';
  const typedPassword = loginPasswordEl?.value || '';
  const typedName = loginNameEl?.value?.trim() || '';
  const logins = readSavedLogins();
  const selectIdx = loginSelectEl && loginSelectEl.disabled === false ? Number(loginSelectEl.value) : NaN;
  if (Number.isInteger(selectIdx) && selectIdx >= 0 && selectIdx < logins.length) {
    writeSelectedLoginIndex(selectIdx);
    return logins[selectIdx];
  }
  if (typedUsername || typedPassword) {
    return { name: typedName, username: typedUsername, password: typedPassword };
  }
  return null;
}

btnSaveLoginEl?.addEventListener('click', () => {
  const name = loginNameEl?.value?.trim() || '';
  const username = loginUsernameEl?.value?.trim() || '';
  const password = loginPasswordEl?.value || '';
  if (!username) {
    setStatus(t('loginPleaseEnterUsername') || 'Please enter a username to save.');
    return;
  }
  const labeledName = name || username;
  const current = readSavedLogins();
  // Prefer updating by username; if not found, try by name; otherwise append
  let existingIndex = current.findIndex(l => l && l.username === username);
  if (existingIndex < 0 && labeledName) {
    existingIndex = current.findIndex(l => l && (l.name || '').trim() === labeledName);
  }
  if (existingIndex >= 0) {
    current[existingIndex] = { name: labeledName, username, password };
    writeSelectedLoginIndex(existingIndex);
  } else {
    current.push({ name: labeledName, username, password });
    writeSelectedLoginIndex(current.length - 1);
  }
  writeSavedLogins(current);
  renderLoginSelect();
  setStatus(t('loginSaved') || 'Login saved locally.');
});

loginSelectEl?.addEventListener('change', () => {
  const idx = Number(loginSelectEl.value);
  if (!Number.isInteger(idx)) return;
  writeSelectedLoginIndex(idx);
  const logins = readSavedLogins();
  const selected = logins[idx];
  if (selected) {
    if (loginNameEl) loginNameEl.value = selected.name || '';
    if (loginUsernameEl) loginUsernameEl.value = selected.username || '';
    if (loginPasswordEl) loginPasswordEl.value = selected.password || '';
  }
});

btnDeleteLoginEl?.addEventListener('click', () => {
  const logins = readSavedLogins();
  const idx = Number(loginSelectEl?.value);
  if (!Number.isInteger(idx) || idx < 0 || idx >= logins.length) {
    setStatus(t('loginNoneSelected') || 'No saved login selected.');
    return;
  }
  logins.splice(idx, 1);
  writeSavedLogins(logins);
  // Adjust selected index
  const newIdx = Math.min(idx, Math.max(0, logins.length - 1));
  writeSelectedLoginIndex(logins.length ? newIdx : -1);
  renderLoginSelect();
  setStatus(t('loginDeleted') || 'Login deleted.');
});

btnSendLoginEl?.addEventListener('click', async () => {
  const creds = getSelectedOrTypedLogin();
  if (!creds || !creds.username) {
    setStatus(t('loginNothingToSend') || 'Nothing to send.');
    return;
  }
  try {
    const tab = await getActiveTab();
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'AVON_LOGIN_FILL',
      username: creds.username,
      password: creds.password || ''
    });
    if (response?.ok) {
      setStatus(t('loginSentOk') || 'Credentials sent to page.');
    } else {
      setStatus(response?.error || t('loginUnableToSend') || 'Unable to send credentials.');
    }
  } catch (e) {
    setStatus(t('statusUnableToCommunicate') || 'Unable to communicate with page.');
  }
});

// Initialize login select on load
renderLoginSelect();
// Populate fields with selected on load, if any
(() => {
  const idx = readSelectedLoginIndex();
  const list = readSavedLogins();
  if (idx >= 0 && idx < list.length) {
    const s = list[idx];
    if (loginNameEl) loginNameEl.value = s.name || '';
    if (loginUsernameEl) loginUsernameEl.value = s.username || '';
    if (loginPasswordEl) loginPasswordEl.value = s.password || '';
  }
})();

// Toggle password visibility
btnTogglePasswordEl?.addEventListener('click', () => {
  if (!loginPasswordEl) return;
  const isHidden = loginPasswordEl.type === 'password';
  loginPasswordEl.type = isHidden ? 'text' : 'password';
  if (btnTogglePasswordEl) {
    btnTogglePasswordEl.setAttribute('aria-label', isHidden ? (t('loginToggleHide') || 'Hide password') : (t('loginToggleShow') || 'Show password'));
    btnTogglePasswordEl.title = isHidden ? (t('loginToggleHide') || 'Hide password') : (t('loginToggleShow') || 'Show password');
    btnTogglePasswordEl.textContent = isHidden ? '🙈' : '👁';
  }
});

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
const btnLoadExample = document.getElementById('btnLoadExample');

function setStatus(text) {
  statusEl.textContent = text;
}

// Translation helper that respects selected language via i18n.js
function t(key, substitutions) {
  try {
    if (typeof window !== 'undefined' && typeof window.i18nGet === 'function') {
      const v = window.i18nGet(key, substitutions);
      if (v) return v;
    }
  } catch {}
  try {
    const v = chrome.i18n.getMessage(key, substitutions);
    if (v) return v;
  } catch {}
  return '';
}

function setCounts(text) {
  if (countsEl) countsEl.textContent = text;
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
    // Normalize separators but preserve line breaks to keep per-line context
    .replace(/[;,|]+/g, ' ')
    .replace(/\t+/g, ' ')
    // Collapse spaces around newlines and keep a single newline
    .replace(/[ ]*\r?\n[ ]*/g, '\n')
    // Collapse multiple spaces (not including newlines)
    .replace(/[ ]{2,}/g, ' ')
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

  // Quantity markers like "2 buc", "2 bucăți", "2 bucati", and also "2 set", "2 seturi" near a code.
  // Guard against crossing another 5-digit code between the code and the quantity.
  const unitPattern = '(?:buc(?:a(?:ti|ți|ţi)|ă(?:ti|ți|ţi))?|buc\\.?|bucati|bucăți|bucăţi|set(?:uri)?|set-uri)';
  let re = new RegExp(`\\b(\\d{5})\\b([^\\n\\r]{0,80}?)\\b(\\d{1,2})\\s*${unitPattern}(?=\\W|$)`, 'gi');
  for (let m; (m = re.exec(s)); ) {
    const [full, code, between, qty] = m;
    // Skip if another 5-digit code appears in-between; that qty likely belongs to a later code
    if (/\b\d{5}\b/.test(between)) continue;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }
  // Also support the reversed order: "2 buc"/"2 seturi" ... then the 5-digit code, with the same guard
  re = new RegExp(`\\b(\\d{1,2})\\s*${unitPattern}(?=\\W|$)([^\\n\\r]{0,80}?)\\b(\\d{5})\\b`, 'gi');
  for (let m; (m = re.exec(s)); ) {
    const [full, qty, between, code] = m;
    if (/\b\d{5}\b/.test(between)) continue;
    // If there's a code immediately before this quantity with a dash/sep (e.g., "28605-2buc"),
    // then the quantity belongs to the previous code, not the next one. Skip this reverse match.
    const pre = s.slice(Math.max(0, m.index - 16), m.index);
    if (/\d{5}\s*(?:[-:\/]|[\(\[]\s*)\s*$/.test(pre)) continue;
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
  // Plain forms without unit or explicit separator, e.g., "28605 2", "28605. 2", or "2 28605"
  // Forward: code then qty
  re = /\b(\d{5})\b[ \t]*[\.,]?[ \t]*(\d{1,2})(?=\W|$)/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, code, qty] = m;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }
  // Reverse: qty then code; avoid cases where qty belongs to a previous code joined by a separator (e.g., "28605-2")
  re = /\b(\d{1,2})\b[ \t]*[\.,]?[ \t]*(\d{5})\b/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, qty, code] = m;
    const pre = s.slice(Math.max(0, m.index - 16), m.index);
    if (/\d{5}\s*(?:[-:\/]|[\(\[]\s*)\s*$/.test(pre)) continue;
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
const logsSection = document.getElementById('logsSection');
const logsTbody = document.getElementById('logsTbody');

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

async function renderLogs() {
  try {
    console.log('renderLogs called');
    const { fillHistory = [] } = await (chrome.storage?.local?.get?.(['fillHistory']) || {});
    console.log('fillHistory from storage:', fillHistory);
    const entries = Array.isArray(fillHistory) ? fillHistory.slice() : [];
    // Sort newest first by date ISO string
    entries.sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')));
    console.log('sorted entries:', entries);
    if (logsTbody) {
      logsTbody.innerHTML = '';
      console.log('cleared logsTbody');
    } else {
      console.log('logsTbody not found');
    }
    for (const e of entries) {
      const tr = document.createElement('tr');
      tr.classList.add('log-entry');
      tr.dataset.entryIndex = entries.indexOf(e);
      
      const tdDate = document.createElement('td');
      const tdName = document.createElement('td');
      const tdUser = document.createElement('td');
      const tdTotal = document.createElement('td');
      const d = e?.date ? new Date(e.date) : null;
      tdDate.textContent = d && !isNaN(d.getTime()) ? d.toLocaleString() : (e?.date || '');
      tdName.textContent = e?.name || '';
      tdUser.textContent = e?.username || '';
      tdTotal.textContent = String(e?.total != null ? e.total : '');
      
      // Add click indicator
      tdTotal.innerHTML = `${String(e?.total != null ? e.total : '')} <span class="click-indicator">▶</span>`;
      
      // Make the row clickable
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => toggleLogDetail(tr, e));
      
      tr.appendChild(tdDate);
      tr.appendChild(tdName);
      tr.appendChild(tdUser);
      tr.appendChild(tdTotal);
      if (logsTbody) {
        logsTbody.appendChild(tr);
        console.log('added row:', e);
      }
    }
  } catch (error) {
    console.error('Error in renderLogs:', error);
  }
}

function toggleLogDetail(tr, entry) {
  // Remove active class from all other rows
  document.querySelectorAll('.log-entry').forEach(row => {
    if (row !== tr) {
      row.classList.remove('active');
      const existingDetail = row.nextElementSibling;
      if (existingDetail && existingDetail.classList.contains('log-detail')) {
        existingDetail.remove();
      }
    }
  });
  
  // Toggle current row
  if (tr.classList.contains('active')) {
    tr.classList.remove('active');
    const existingDetail = tr.nextElementSibling;
    if (existingDetail && existingDetail.classList.contains('log-detail')) {
      existingDetail.remove();
    }
  } else {
    tr.classList.add('active');
    
    // Create detail row
    const detailRow = document.createElement('tr');
    detailRow.classList.add('log-detail');
    
    const detailCell = document.createElement('td');
    detailCell.colSpan = 4;
    
    if (entry.codes && Array.isArray(entry.codes) && entry.codes.length > 0) {
      // Add a header showing total items
      const headerDiv = document.createElement('div');
      headerDiv.classList.add('detail-header');
      headerDiv.innerHTML = `<strong>Codes filled: ${entry.codes.length}</strong>`;
      detailCell.appendChild(headerDiv);
      
      const codesTable = document.createElement('table');
      codesTable.classList.add('codes-table');
      
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      const thCode = document.createElement('th');
      thCode.textContent = 'Code';
      const thQty = document.createElement('th');
      thQty.textContent = 'Quantity';
      headerRow.appendChild(thCode);
      headerRow.appendChild(thQty);
      thead.appendChild(headerRow);
      codesTable.appendChild(thead);
      
      const tbody = document.createElement('tbody');
      entry.codes.forEach(item => {
        const row = document.createElement('tr');
        const tdCode = document.createElement('td');
        tdCode.textContent = item.code || '';
        const tdQty = document.createElement('td');
        tdQty.textContent = String(item.qty || 1);
        row.appendChild(tdCode);
        row.appendChild(tdQty);
        tbody.appendChild(row);
      });
      codesTable.appendChild(tbody);
      
      detailCell.appendChild(codesTable);
    } else {
      detailCell.innerHTML = '<div class="detail-header"><em>No codes available for this entry</em></div>';
      detailCell.style.fontStyle = 'italic';
      detailCell.style.color = '#777';
    }
    
    detailRow.appendChild(detailCell);
    
    // Insert after the clicked row
    tr.parentNode.insertBefore(detailRow, tr.nextSibling);
  }
}

function handleProcess() {
  const input = inputArea.value;
  currentItems = extractItems(input);
  renderTable(currentItems, null);
  setStatus(currentItems.length ? t('statusFormatted') : t('statusNoCodes'));

  // Sanity: count 5-digit codes in input (total and unique) vs output rows
  try {
    // Count 5-digit codes not part of a longer digit run; allow letters after (e.g., "07575x2")
    // Prefer lookbehind when available; fall back to a non-digit prefix capture otherwise.
    let reInputCodes;
    try {
      reInputCodes = new RegExp('(?<!\\d)(\\d{5})(?!\\d)', 'g');
    } catch {
      reInputCodes = /(?:^|[^0-9])(\d{5})(?!\d)/g;
    }
    const allInputCodes = [];
    for (const m of input.matchAll(reInputCodes)) {
      allInputCodes.push(m[1]);
    }
    const uniqueInputCodes = Array.from(new Set(allInputCodes));
    const outputCodes = currentItems.map(it => it.code);
    const outputUniqueCodes = Array.from(new Set(outputCodes));
    const mismatch = uniqueInputCodes.length !== outputUniqueCodes.length;
    const summary = t('countsSummary', [
      String(allInputCodes.length),
      String(uniqueInputCodes.length),
      String(outputCodes.length),
      String(outputUniqueCodes.length)
    ]) || `Codes in input: total ${allInputCodes.length}, unique ${uniqueInputCodes.length} | output: ${outputCodes.length} (${outputUniqueCodes.length} unique)`;
    const warn = mismatch ? (t('countsMismatchIndicator') || ' ⚠️') : '';
    setCounts(summary + warn);
  } catch {
    setCounts('');
  }
}

btnProcess?.addEventListener('click', handleProcess);
btnClear?.addEventListener('click', () => {
  inputArea.value = '';
  outputArea.value = '';
  setStatus(t('statusCleared'));
  try { chrome.storage?.local?.remove?.('lastInput'); } catch {}
});
btnCopy?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(itemsToLines(currentItems));
    setStatus(t('statusCopied'));
  } catch {
    setStatus(t('statusCopyFailed'));
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
      // Initialize logs display
      renderLogs();
    } catch {}
  })();

  // React to alias updates from Options without reopening the popup
  try {
    chrome.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes?.aliases) {
        aliasList = Array.isArray(changes.aliases.newValue) ? changes.aliases.newValue : [];
      }
      // Refresh logs when fill history changes
      if (areaName === 'local' && changes?.fillHistory) {
        renderLogs();
      }
    });
  } catch {}

// Send to active tab for automated filling
btnFill?.addEventListener('click', async () => {
  const tab = await getActiveTab();
  const items = currentItems;
  if (!items.length) {
    setStatus(t('statusNothingToFill'));
    return;
  }

  try {
    const selectedLogin = getSelectedOrTypedLogin();
    const loginName = selectedLogin?.name || '';
    const loginUsername = selectedLogin?.username || '';
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'AVON_FILL_PRODUCTS',
      items,
      loginName,
      loginUsername
    });
    setStatus(response?.ok
      ? (t('statusQueuedStarting', [String(items.length), String(response?.batchSize || 30)]) || `Queued ${items.length}. Starting first ${response?.batchSize || 30}...`)
      : (response?.error || t('statusFillFailed')));
    if (response?.ok) {
      btnContinue.style.display = 'none';
    }
  } catch (err) {
    setStatus(t('statusUnableToCommunicate'));
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
      setStatus(t('statusApplyingRow', [String(index + 1), String(currentItems.length)]) || `Applying row ${index + 1} / ${currentItems.length}`);
    }
  }
  if (message.type === 'AVON_FILL_DONE') {
    renderTable(currentItems, null);
    setStatus(t('statusFillComplete'));
    btnContinue.style.display = 'none';
    // Refresh logs to show the new entry
    renderLogs();
  }
  if (message.type === 'AVON_FILL_PAUSED') {
    const { nextIndex, total, remaining, batchSize } = message;
    lastProcessedIndex = nextIndex - 1;
    renderTable(currentItems, null);
    setStatus(t('statusPausedAfter', [String(Math.min(nextIndex, batchSize)), String(remaining)])
      || `Paused after ${Math.min(nextIndex, batchSize)} items. ${remaining} remaining.`);
    btnContinue.style.display = 'inline-block';
  }
});

btnContinue?.addEventListener('click', async () => {
  const tab = await getActiveTab();
  try {
    btnContinue.style.display = 'none';
    setStatus(t('statusContinuingNextBatch'));
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'AVON_FILL_CONTINUE' });
    if (response?.done) {
      setStatus(t('statusAllItemsCompleted'));
      btnContinue.style.display = 'none';
    }
  } catch (e) {
    setStatus(t('statusUnableToContinue'));
    btnContinue.style.display = 'inline-block';
  }
});

// Load example input from bundled text file
btnLoadExample?.addEventListener('click', async () => {
  try {
    const resp = await fetch(chrome.runtime.getURL('example_input.txt'));
    if (!resp.ok) throw new Error('fetch failed');
    const text = await resp.text();
    if (inputArea) {
      inputArea.value = text.trim();
      handleProcess();
      try { chrome.storage?.local?.set?.({ lastInput: inputArea.value }); } catch {}
      setStatus(t('statusLoadedExample') || 'Loaded example input.');
    }
  } catch (e) {
    setStatus(t('statusUnableToLoadExample') || 'Unable to load example.');
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
    setStatus(t('statusOpenedProductEntry'));
  } catch (err) {
    setStatus(t('statusUnableToOpenProductEntry'));
  }
});


