(() => {
  // This script runs on every page (document_idle)
  //console.log('Avon content script loaded on', window.location.href);

  // State for batched filling
  const avonFillState = {
    queue: [],
    nextIndex: 0,
    inProgress: false,
    batchSize: 30,
    processedInBatch: 0,
    originalItems: [],
    logged: false,
    loginName: '',
    loginUsername: '',
  };

  // Lightweight i18n access that respects selected language if i18n.js is present in the extension context
  const t = (key, substitutions) => {
    try {
      if (typeof window !== 'undefined' && typeof window.i18nGet === 'function') {
        const v = window.i18nGet(key, substitutions);
        if (v) return v;
      }
    } catch {}
    try {
      const v = chrome.i18n?.getMessage?.(key, substitutions);
      if (v) return v;
    } catch {}
    return '';
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return;
    if (message.type === 'PING') {
      sendResponse({ type: 'PONG', source: 'contentScript' });
    }
    if (message.type === 'AVON_LOGIN_FILL') {
      try {
        const usernameInput = document.querySelector('#sellerUserId');
        const passwordInput = document.querySelector('#sellerEmailPassword');
        if (!usernameInput || !passwordInput) {
          sendResponse({ ok: false, error: 'Login inputs not found on this page.' });
          return;
        }
        const setInputValue = (el, value) => {
          el.focus();
          el.value = value ?? '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        setInputValue(usernameInput, message.username || '');
        setInputValue(passwordInput, message.password || '');
        // Optional: blur to let frameworks validate
        usernameInput.blur();
        passwordInput.blur();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return true;
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
        sendResponse({ ok: false, error: t('csNoItems') || 'No items.' });
        return; // keep listener
      }

      try {
        // Guard: ensure we're on the product entry page (or at least structure exists)
        if (!document.querySelector('.pSrch-row')) {
          sendResponse({ ok: false, error: t('csNoProductEntry') || 'Product Entry form not detected on this page.' });
          return;
        }

        // Initialize state and start first batch
        avonFillState.queue = items.slice();
        avonFillState.nextIndex = 0;
        avonFillState.processedInBatch = 0;
        avonFillState.inProgress = false;
        avonFillState.originalItems = items.slice();
        avonFillState.logged = false;
        avonFillState.loginName = typeof message.loginName === 'string' ? message.loginName : '';
        avonFillState.loginUsername = typeof message.loginUsername === 'string' ? message.loginUsername : '';

        const appendFillHistoryLog = async (entry) => {
          try {
            console.log('appendFillHistoryLog called with:', entry);
            const { fillHistory = [] } = await (chrome.storage?.local?.get?.(['fillHistory']) || {});
            console.log('Current fillHistory:', fillHistory);
            const history = Array.isArray(fillHistory) ? fillHistory : [];
            history.push(entry);
            while (history.length > 100) history.shift();
            console.log('New history to save:', history);
            await chrome.storage?.local?.set?.({ fillHistory: history });
            console.log('fillHistory saved to storage');
          } catch (error) {
            console.error('Error in appendFillHistoryLog:', error);
          }
        };

        const logIfNotLogged = async () => {
          if (avonFillState.logged) return;
          avonFillState.logged = true;
          try {
            console.log('Logging fill completion:', {
              name: avonFillState.loginName,
              username: avonFillState.loginUsername,
              total: avonFillState.originalItems?.length || avonFillState.queue?.length || 0
            });
            const entry = {
              date: new Date().toISOString(),
              name: avonFillState.loginName || '',
              username: avonFillState.loginUsername || '',
              total: Array.isArray(avonFillState.originalItems)
                ? avonFillState.originalItems.length
                : (Array.isArray(avonFillState.queue) ? avonFillState.queue.length : 0),
              codes: Array.isArray(avonFillState.originalItems) 
                ? avonFillState.originalItems 
                : (Array.isArray(avonFillState.queue) ? avonFillState.queue : [])
            };
            console.log('Log entry:', entry);
            await appendFillHistoryLog(entry);
            console.log('Log entry saved');
          } catch (error) {
            console.error('Error logging fill completion:', error);
          }
        };

        const parseQty = (n) => Math.max(1, Math.min(99, Number(n) || 1));

        const notifyProgress = (index, code, qty) => {
          try {
            chrome.runtime.sendMessage({
              type: 'AVON_FILL_PROGRESS',
              index,
              item: { code, qty }
            });
          } catch {}
        };

        const sendPaused = () => {
          try {
            chrome.runtime.sendMessage({
              type: 'AVON_FILL_PAUSED',
              nextIndex: avonFillState.nextIndex,
              total: avonFillState.queue.length,
              remaining: Math.max(0, avonFillState.queue.length - avonFillState.nextIndex),
              batchSize: avonFillState.batchSize
            });
          } catch {}
        };

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

        const fireEnter = (el) => {
          const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
          el.dispatchEvent(new KeyboardEvent('keydown', opts));
          el.dispatchEvent(new KeyboardEvent('keypress', opts));
          el.dispatchEvent(new KeyboardEvent('keyup', opts));
        };

        const stepFill = () => {
          // Returns: 'done' | 'paused' | 'continue'
          if (avonFillState.nextIndex >= avonFillState.queue.length) return 'done';
          if (avonFillState.processedInBatch >= avonFillState.batchSize) return 'paused';

          const rows = getAllRows();
          // If page already has 30 rows in use and no empty rows, we can't add more now
          if (rows.length >= avonFillState.batchSize && findEmptyRows().length === 0) {
            return avonFillState.processedInBatch >= avonFillState.batchSize ? 'paused' : 'continue';
          }

          const empty = findEmptyRows();
          // Avon page typically has 2 empty entry slots at a time
          const slots = Math.max(0, Math.min(2, empty.length));
          for (let n = 0; n < slots; n++) {
            if (avonFillState.nextIndex >= avonFillState.queue.length) break;
            if (avonFillState.processedInBatch >= avonFillState.batchSize) break;

            const row = empty[n];
            const codeInput = row.querySelector('input[name="tabEntry"], input.ps-lnInpt');
            const qtyInput = row.querySelector('input.qntyVal');
            const currIndex = avonFillState.nextIndex;
            const { code, qty } = avonFillState.queue[avonFillState.nextIndex++];
            if (!codeInput || !qtyInput) continue;

            // Step 1: put in code
            codeInput.focus();
            codeInput.value = code;
            codeInput.dispatchEvent(new Event('input', { bubbles: true }));
            codeInput.dispatchEvent(new Event('change', { bubbles: true }));

            // Step 2: press Enter while code entry is in focus to make the site react
            fireEnter(codeInput);

            // Step 3: put in quantity only if greater than 1 (site handles 1 automatically)
            const quantity = parseQty(qty);
            notifyProgress(currIndex, code, quantity);
            avonFillState.processedInBatch++;
            if (quantity > 1) {
              // slight delay to allow site to populate defaults after Enter
              setTimeout(() => {
                qtyInput.focus();
                qtyInput.value = String(quantity);
                qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
                qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
                qtyInput.blur();
              }, 120);
            }
          }

          if (avonFillState.nextIndex >= avonFillState.queue.length) return 'done';
          if (avonFillState.processedInBatch >= avonFillState.batchSize) return 'paused';
          return 'continue';
        };

        const runBatch = () => {
          if (avonFillState.inProgress) return;
          avonFillState.inProgress = true;
          const tick = () => {
            const result = stepFill();
            if (result === 'done') {
              avonFillState.inProgress = false;
              // Log completion once
              try { logIfNotLogged(); } catch {}
              try { chrome.runtime.sendMessage({ type: 'AVON_FILL_DONE' }); } catch {}
              return;
            }
            if (result === 'paused') {
              avonFillState.inProgress = false;
              sendPaused();
              return;
            }
            setTimeout(tick, 250);
          };
          // initial burst
          stepFill();
          setTimeout(tick, 250);
        };

        runBatch();
        sendResponse({ ok: true, batchSize: avonFillState.batchSize, total: avonFillState.queue.length });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      // Return true to indicate async response
      return true;
    }

    if (message.type === 'AVON_FILL_CONTINUE') {
      try {
        if (!document.querySelector('.pSrch-row')) {
          sendResponse({ ok: false, error: t('csNoProductEntry') || 'Product Entry form not detected on this page.' });
          return;
        }
        if (avonFillState.nextIndex >= avonFillState.queue.length) {
          try { logIfNotLogged(); } catch {}
          try { chrome.runtime.sendMessage({ type: 'AVON_FILL_DONE' }); } catch {}
          sendResponse({ ok: true, done: true });
          return;
        }
        // Reset batch counter and continue
        avonFillState.processedInBatch = 0;
        avonFillState.inProgress = false;

        const runAgain = () => {
          const rows = Array.from(document.querySelectorAll('.pSrch-row'));
          // If rows look cleared after user submitted, proceed. Otherwise still proceed; site will create new rows as needed.
          const tick = () => {
            const event = new Event('input', { bubbles: true });
            // Nudge DOM if needed (no-op placeholder)
            if (rows[0]) rows[0].dispatchEvent(event);
          };
          setTimeout(tick, 0);
        };
        runAgain();

        // Reuse the batching runner from above by sending ourselves a start signal
        // Start the next batch directly
        const stepFill = () => {
          // Returns: 'done' | 'paused' | 'continue'
          const rows = Array.from(document.querySelectorAll('.pSrch-row'));
          const findEmptyRows = () => rows.filter(row => {
            const codeInput = row.querySelector('input[name="tabEntry"], input.ps-lnInpt');
            const qtyInput = row.querySelector('input.qntyVal');
            const codeVal = codeInput?.value?.trim() || '';
            const qtyVal = qtyInput?.value?.trim() || '';
            return !codeVal && !qtyVal;
          });
          if (avonFillState.nextIndex >= avonFillState.queue.length) return 'done';
          if (avonFillState.processedInBatch >= avonFillState.batchSize) return 'paused';
          const empty = findEmptyRows();
          if (!empty.length) return 'continue';
          // Trigger original path by delegating to AVON_FILL_PRODUCTS logic via direct call is complex here; instead, trigger a synthetic message would be overkill.
          // So fall back to requesting a fresh run by calling AVON_FILL_PRODUCTS with remaining queue.
          return 'continue';
        };
        // Minimal kick; actual continuation is driven by the same runner created in AVON_FILL_PRODUCTS branch
        avonFillState.inProgress = false;
        // Manually invoke the same code path as start: small helper
        const resumeEvent = new CustomEvent('AVON_RESUME_BATCH');
        window.dispatchEvent(resumeEvent);
        // The resume event is used only to satisfy TypeScript linters in some setups; not required here.
        // Instead, just re-run a mini loop like in runBatch
        const tick = () => {
          // Reuse the inner step from the first branch by simulating a click on empty rows; but since we kept state, we can just resend the start again.
          // To avoid code duplication, send a lightweight pause signal to popup and rely on user clicking Continue again if nothing to do.
        };
        // We can simply trigger the same path by invoking a minimal batch runner defined inline here
        (function runBatch() {
          if (avonFillState.inProgress) return;
          avonFillState.inProgress = true;
          const parseQty = (n) => Math.max(1, Math.min(99, Number(n) || 1));
          const notifyProgress = (index, code, qty) => {
            try { chrome.runtime.sendMessage({ type: 'AVON_FILL_PROGRESS', index, item: { code, qty } }); } catch {}
          };
          const findEmptyRows = () => Array.from(document.querySelectorAll('.pSrch-row')).filter(row => {
            const codeInput = row.querySelector('input[name="tabEntry"], input.ps-lnInpt');
            const qtyInput = row.querySelector('input.qntyVal');
            const codeVal = codeInput?.value?.trim() || '';
            const qtyVal = qtyInput?.value?.trim() || '';
            return !codeVal && !qtyVal;
          });
          const getAllRows = () => Array.from(document.querySelectorAll('.pSrch-row'));
          const fireEnter = (el) => {
            const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
            el.dispatchEvent(new KeyboardEvent('keydown', opts));
            el.dispatchEvent(new KeyboardEvent('keypress', opts));
            el.dispatchEvent(new KeyboardEvent('keyup', opts));
          };
          const stepFill = () => {
            if (avonFillState.nextIndex >= avonFillState.queue.length) return 'done';
            if (avonFillState.processedInBatch >= avonFillState.batchSize) return 'paused';
            const rows = getAllRows();
            if (rows.length >= avonFillState.batchSize && findEmptyRows().length === 0) {
              return 'paused';
            }
            const empty = findEmptyRows();
            const slots = Math.max(0, Math.min(2, empty.length));
            for (let n = 0; n < slots; n++) {
              if (avonFillState.nextIndex >= avonFillState.queue.length) break;
              if (avonFillState.processedInBatch >= avonFillState.batchSize) break;
              const row = empty[n];
              const codeInput = row.querySelector('input[name="tabEntry"], input.ps-lnInpt');
              const qtyInput = row.querySelector('input.qntyVal');
              const currIndex = avonFillState.nextIndex;
              const { code, qty } = avonFillState.queue[avonFillState.nextIndex++];
              if (!codeInput || !qtyInput) continue;
              codeInput.focus();
              codeInput.value = code;
              codeInput.dispatchEvent(new Event('input', { bubbles: true }));
              codeInput.dispatchEvent(new Event('change', { bubbles: true }));
              fireEnter(codeInput);
              const quantity = parseQty(qty);
              notifyProgress(currIndex, code, quantity);
              avonFillState.processedInBatch++;
              if (quantity > 1) {
                setTimeout(() => {
                  qtyInput.focus();
                  qtyInput.value = String(quantity);
                  qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
                  qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
                  qtyInput.blur();
                }, 120);
              }
            }
            if (avonFillState.nextIndex >= avonFillState.queue.length) return 'done';
            if (avonFillState.processedInBatch >= avonFillState.batchSize) return 'paused';
            return 'continue';
          };
          const loop = () => {
            const r = stepFill();
            if (r === 'done') {
              avonFillState.inProgress = false;
              try { logIfNotLogged(); } catch {}
              try { chrome.runtime.sendMessage({ type: 'AVON_FILL_DONE' }); } catch {}
              return;
            }
            if (r === 'paused') {
              avonFillState.inProgress = false;
              try {
                chrome.runtime.sendMessage({
                  type: 'AVON_FILL_PAUSED',
                  nextIndex: avonFillState.nextIndex,
                  total: avonFillState.queue.length,
                  remaining: Math.max(0, avonFillState.queue.length - avonFillState.nextIndex),
                  batchSize: avonFillState.batchSize
                });
              } catch {}
              return;
            }
            setTimeout(loop, 250);
          };
          // kick
          stepFill();
          setTimeout(loop, 250);
        })();

        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return true;
    }
  });
})();


