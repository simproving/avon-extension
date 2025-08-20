export function extractItems(text) {
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
    // so the page number isn't misinterpreted as quantity (e.g., "Pag 32-49361", "Pag-32 49361").
    s = s.replace(/\bP(?:ag|g)\.?\s*[-:\/]?\s*\d+\s*[-:\/]?\s*/gi, ' ');
  
    // Smart page number detection: if we find any 3-digit number at the start of a line
    // before a 5-digit code, then assume ALL first numbers on lines are page numbers
    const hasThreeDigitPageNumbers = /^(\d{3})\s+(\d{5})/m.test(s);
    if (hasThreeDigitPageNumbers) {
      // Remove all first numbers from lines (page numbers) when page number format is detected
      s = s.replace(/^(\d{1,3})\s+(\d{5})/gm, '$2');
    }
  
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
    re = /(\d{5})\s*(?:[-:\/]|[\(\[]\s*)\s*(\d+)\s*(?:[\)\]])?/g;
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
