const statusEl = document.getElementById('status');
const btnPing = document.getElementById('btnPing');
const btnHighlight = document.getElementById('btnHighlight');
const btnInject = document.getElementById('btnInject');
const openOptions = document.getElementById('openOptions');
const btnProductEntry = document.getElementById('btnProductEntry');

// Formatter controls
const inputArea = document.getElementById('inputArea');
const outputArea = document.getElementById('outputArea');
const btnProcess = document.getElementById('btnProcess');
const btnClear = document.getElementById('btnClear');
const btnCopy = document.getElementById('btnCopy');
const btnFill = document.getElementById('btnFill');

function setStatus(text) {
  statusEl.textContent = text;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function processMessyInput(text) {
  if (!text || typeof text !== 'string') return '';

  // Normalize common separators and symbols
  let s = text
    .replace(/[\u00D7\u2715]/g, 'x') // ×, ✕ to x
    .replace(/[;,|\t\n\r]+/g, ' ') // to spaces
    .replace(/\s+/g, ' ') // collapse spaces
    .trim();

  const codeToQuantity = new Map();
  const codeFirstIndex = new Map();
  /** @type {{start:number,end:number}[]} */
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

  // 1) qty x code  e.g., 2x11155 or 2 x 11155 or 2*11155
  let re = /(\d+)\s*[xX*]\s*(\d{5})/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, qty, code] = m;
    addQty(code, qty, m.index, m.index + full.length);
  }

  // 2) code x qty  e.g., 11155x3 or 11155 x 3 or 11155*3
  re = /(\d{5})\s*[xX*]\s*(\d+)/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, code, qty] = m;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }

  // 3) code(sep)qty e.g., 11155-3, 11155:3, 11155/3, 11155(3), 11155[3]
  re = /(\d{5})\s*(?:[-:\/]|[\(\[]\s*)(\d+)\s*(?:[\)\]])?/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, code, qty] = m;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }

  // 4) qty(sep)code e.g., 3-11155, 3:11155, 3/11155, (3)11155, [3]11155
  re = /(\d+)\s*(?:[-:\/]|[\(\[]\s*)(\d{5})\s*(?:[\)\]])?/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, qty, code] = m;
    if (!overlaps(m.index, m.index + full.length)) {
      addQty(code, qty, m.index, m.index + full.length);
    }
  }

  // 5) Standalone 5-digit codes → quantity 1
  re = /\b(\d{5})\b/g;
  for (let m; (m = re.exec(s)); ) {
    const [full, code] = m;
    const start = m.index;
    const end = start + full.length;
    if (!overlaps(start, end)) {
      addQty(code, 1, start, end);
    }
  }

  // Produce ordered lines by first appearance in text
  const codes = Array.from(codeToQuantity.keys());
  codes.sort((a, b) => (codeFirstIndex.get(a) ?? 0) - (codeFirstIndex.get(b) ?? 0));

  const lines = codes.map(code => {
    const qty = codeToQuantity.get(code) || 0;
    return qty > 1 ? `${code} x ${qty}` : `${code}`;
  });

  return lines.join('\n');
}

function handleProcess() {
  const input = inputArea.value;
  const output = processMessyInput(input);
  outputArea.value = output;
  setStatus(output ? 'Formatted.' : 'No 5-digit codes found.');
}

btnProcess?.addEventListener('click', handleProcess);
btnClear?.addEventListener('click', () => {
  inputArea.value = '';
  outputArea.value = '';
  setStatus('Cleared.');
});
btnCopy?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(outputArea.value || '');
    setStatus('Copied output.');
  } catch {
    setStatus('Copy failed.');
  }
});

// Auto-process on paste
inputArea?.addEventListener('paste', () => {
  setTimeout(handleProcess, 0);
});

// Send to active tab for automated filling
btnFill?.addEventListener('click', async () => {
  const tab = await getActiveTab();
  const lines = (outputArea.value || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    setStatus('Nothing to fill.');
    return;
  }
  // Convert to payload {code, qty}
  const items = lines.map(line => {
    const m = line.match(/^(\d{5})(?:\s*x\s*(\d+))?$/i);
    const code = m ? m[1] : '';
    const qty = m && m[2] ? Number(m[2]) : 1;
    return { code, qty };
  }).filter(i => /^\d{5}$/.test(i.code) && i.qty > 0);

  if (!items.length) {
    setStatus('No valid items to fill.');
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'AVON_FILL_PRODUCTS',
      items
    });
    setStatus(response?.ok ? `Queued ${items.length} item(s).` : (response?.error || 'Fill failed.'));
  } catch (err) {
    setStatus('Unable to communicate with page.');
  }
});

btnPing.addEventListener('click', async () => {
  const tab = await getActiveTab();
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
    setStatus(`Content replied: ${response?.type}`);
  } catch (err) {
    // If content script isn't injected yet on this page, fall back to background
    const bg = await chrome.runtime.sendMessage({ type: 'PING' });
    setStatus(`Background replied: ${bg?.type}`);
  }
});

btnHighlight.addEventListener('click', async () => {
  const tab = await getActiveTab();
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'HIGHLIGHT_SELECTION' });
    setStatus(response?.ok ? 'Highlighted selection.' : 'No selection.');
  } catch (err) {
    setStatus('Unable to highlight.');
  }
});

btnInject.addEventListener('click', async () => {
  const tab = await getActiveTab();
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => alert('Injected from Avon popup'),
    });
    setStatus('Injected alert.');
  } catch (err) {
    setStatus('Injection failed.');
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
    setStatus('Opened Product Entry.');
  } catch (err) {
    setStatus('Unable to open Product Entry.');
  }
});


