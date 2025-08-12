(() => {
  // This script runs on every page (document_idle)
  //console.log('Avon content script loaded on', window.location.href);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return;
    if (message.type === 'PING') {
      sendResponse({ type: 'PONG', source: 'contentScript' });
    }
    if (message.type === 'HIGHLIGHT_SELECTION') {
      const selection = window.getSelection()?.toString() || '';
      if (selection) {
        const span = document.createElement('span');
        span.style.background = 'yellow';
        span.textContent = selection;
        const range = window.getSelection()?.getRangeAt(0);
        if (range) {
          range.deleteContents();
          range.insertNode(span);
          sendResponse({ ok: true });
        }
      } else {
        sendResponse({ ok: false, reason: 'no-selection' });
      }
    }
    if (message.type === 'AVON_FILL_PRODUCTS') {
      const items = Array.isArray(message.items) ? message.items : [];
      if (!items.length) {
        sendResponse({ ok: false, error: 'No items.' });
        return; // keep listener
      }

      try {
        // Guard: ensure we're on the product entry page (or at least structure exists)
        if (!document.querySelector('.pSrch-row')) {
          sendResponse({ ok: false, error: 'Product Entry form not detected on this page.' });
          return;
        }
        const enqueueFill = (queue) => {
          const maxTotal = 30;
          let idx = 0;

          const parseQty = (n) => Math.max(1, Math.min(99, Number(n) || 1));

          const findEmptyRows = () => {
            const rows = Array.from(document.querySelectorAll('.pSrch-row'));
            return rows.filter(row => {
              const codeInput = row.querySelector('input[name="tabEntry"], input.ps-lnInpt');
              const qtyInput = row.querySelector('input.qntyVal');
              const codeVal = codeInput?.value?.trim() || '';
              const qtyVal = qtyInput?.value?.trim() || '';
              return !codeVal && !qtyVal;
            });
          };

          const getAllRows = () => Array.from(document.querySelectorAll('.pSrch-row'));

          const ensureVisibleRows = (desiredCount) => {
            const rows = getAllRows();
            // Clicking + on quantity should add new rows only after the current are filled by site logic.
            // Here we rely on site dynamically creating up to 30 rows as previous fill.
            return rows.length >= desiredCount ? rows.length : rows.length;
          };

          const fillNextBatch = () => {
            if (idx >= queue.length) return true; // done
            const rows = getAllRows();
            if (rows.length >= maxTotal && findEmptyRows().length === 0) {
              return idx >= queue.length; // nothing more we can do
            }
            const empty = findEmptyRows();
            // Avon page typically has 2 empty entry slots at a time
            const slots = Math.max(0, Math.min(2, empty.length));
            for (let n = 0; n < slots && idx < queue.length; n++) {
              const row = empty[n];
              const codeInput = row.querySelector('input[name="tabEntry"], input.ps-lnInpt');
              const qtyInput = row.querySelector('input.qntyVal');
              const { code, qty } = queue[idx++];
              if (!codeInput || !qtyInput) continue;

              // Fill code
              codeInput.focus();
              codeInput.value = code;
              codeInput.dispatchEvent(new Event('input', { bubbles: true }));
              codeInput.dispatchEvent(new Event('change', { bubbles: true }));

              // Fill qty
              qtyInput.focus();
              qtyInput.value = String(parseQty(qty));
              qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
              qtyInput.dispatchEvent(new Event('change', { bubbles: true }));

              // Attempt to trigger site row validation (e.g., blur)
              qtyInput.blur();
              // Simulate Enter to confirm, in case site listens for key events
              qtyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              qtyInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
            }
            return idx >= queue.length;
          };

          // Run batches with small delays to let site create new rows
          const tick = () => {
            const done = fillNextBatch();
            if (done) return;
            setTimeout(tick, 250);
          };
          fillNextBatch();
          setTimeout(tick, 250);
        };

        enqueueFill(items);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      // Return true to indicate async response
      return true;
    }
  });
})();


