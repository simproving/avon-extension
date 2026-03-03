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

  // Function to verify all 5-digit codes on the page
  const verifyAllCodes = () => {
    try {
      // Guard: ensure we have original items to verify against
      if (!Array.isArray(avonFillState.originalItems) || avonFillState.originalItems.length === 0) {
        return {
          error: 'No original items to verify against',
          totalRows: 0,
          totalCodes: 0,
          correctCodes: 0,
          incorrectCodes: 0,
          emptyCodes: 0,
          missingCodes: 0,
          accuracy: 0,
          verificationResults: [],
          missingItems: []
        };
      }

      const allRows = Array.from(document.querySelectorAll('.pSrch-row'));
      const verificationResults = [];
      let totalCodes = 0;
      let correctCodes = 0;
      let incorrectCodes = 0;
      let emptyCodes = 0;

      allRows.forEach((row, rowIndex) => {
        const codeInput = row.querySelector('input[name="tabEntry"], input.ps-lnInpt');
        const qtyInput = row.querySelector('input.qntyVal');
        
        if (codeInput) {
          const enteredCode = codeInput.value?.trim() || '';
          const enteredQty = qtyInput?.value?.trim() || '';
          
          if (enteredCode) {
            totalCodes++;
            
            // Check if this code exists in our original queue
            const expectedItem = avonFillState.originalItems.find(item => 
              item.code === enteredCode
            );
            
            if (expectedItem) {
              correctCodes++;
              verificationResults.push({
                row: rowIndex + 1,
                code: enteredCode,
                qty: enteredQty,
                expectedQty: expectedItem.qty,
                status: 'correct',
                qtyMatch: enteredQty == expectedItem.qty
              });
            } else {
              incorrectCodes++;
              verificationResults.push({
                row: rowIndex + 1,
                code: enteredCode,
                qty: enteredQty,
                expectedQty: null,
                status: 'incorrect',
                qtyMatch: false
              });
            }
          } else {
            emptyCodes++;
            verificationResults.push({
              row: rowIndex + 1,
              code: '',
              qty: '',
              status: 'empty',
              expectedQty: null
            });
          }
        }
      });

      // Check for any codes in our queue that weren't entered
      const enteredCodes = allRows
        .map(row => row.querySelector('input[name="tabEntry"], input.ps-lnInpt')?.value?.trim())
        .filter(code => code);
      
      const missingCodes = avonFillState.originalItems.filter(item => 
        !enteredCodes.includes(item.code)
      );

      const summary = {
        totalRows: allRows.length,
        totalCodes: totalCodes,
        correctCodes: correctCodes,
        incorrectCodes: incorrectCodes,
        emptyCodes: emptyCodes,
        missingCodes: missingCodes.length,
        accuracy: avonFillState.originalItems.length > 0 ? Math.round((correctCodes / avonFillState.originalItems.length) * 100) : 0,
        verificationResults,
        missingItems: missingCodes,
        totalExpected: avonFillState.originalItems.length
      };

      console.log('Verification summary:', summary);
      return summary;
    } catch (error) {
      console.error('Error verifying codes:', error);
      return {
        error: String(error?.message || error),
        totalRows: 0,
        totalCodes: 0,
        correctCodes: 0,
        incorrectCodes: 0,
        emptyCodes: 0,
        missingCodes: 0,
        accuracy: 0,
        verificationResults: [],
        missingItems: []
      };
    }
  };

    // Function to highlight verification issues on the page
  const highlightVerificationIssues = (verificationSummary) => {
    try {
      if (!verificationSummary || !verificationSummary.verificationResults) return;
      
      // Remove any existing highlights
      const existingHighlights = document.querySelectorAll('.avon-verification-highlight');
      existingHighlights.forEach(el => el.remove());
      
      // Clear any existing input styling
      const allCodeInputs = document.querySelectorAll('input[name="tabEntry"], input.ps-lnInpt');
      allCodeInputs.forEach(input => {
        input.style.border = '';
        input.style.backgroundColor = '';
      });
      
      verificationSummary.verificationResults.forEach(result => {
        if (result.status === 'incorrect' || result.status === 'empty') {
          const rows = document.querySelectorAll('.pSrch-row');
          if (rows[result.row - 1]) {
            const row = rows[result.row - 1];
            const codeInput = row.querySelector('input[name="tabEntry"], input.ps-lnInpt');
            if (codeInput) {
              // Add visual highlight
              codeInput.style.border = '2px solid #ff4444';
              codeInput.style.backgroundColor = '#ffeeee';
              
              // Add tooltip with issue details
              const tooltip = document.createElement('div');
              tooltip.className = 'avon-verification-highlight';
              tooltip.style.cssText = `
                position: absolute;
                background: #ff4444;
                color: white;
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 12px;
                z-index: 10000;
                pointer-events: none;
                white-space: nowrap;
              `;
              tooltip.textContent = result.status === 'incorrect' 
                ? `Invalid code: ${result.code}` 
                : 'Empty code field';
              
              // Position tooltip near the input
              const rect = codeInput.getBoundingClientRect();
              tooltip.style.left = rect.left + 'px';
              tooltip.style.top = (rect.bottom + 5) + 'px';
              
              document.body.appendChild(tooltip);
              
              // Remove tooltip after 3 seconds
              setTimeout(() => tooltip.remove(), 3000);
            }
          }
        }
      });
    } catch (error) {
      console.error('Error highlighting verification issues:', error);
    }
  };

  // Function to clear all verification highlights
  const clearVerificationHighlights = () => {
    try {
      // Remove tooltips
      const existingHighlights = document.querySelectorAll('.avon-verification-highlight');
      existingHighlights.forEach(el => el.remove());
      
      // Clear input styling
      const allCodeInputs = document.querySelectorAll('input[name="tabEntry"], input.ps-lnInpt');
      allCodeInputs.forEach(input => {
        input.style.border = '';
        input.style.backgroundColor = '';
      });
    } catch (error) {
      console.error('Error clearing verification highlights:', error);
    }
  };

  // Shared utility functions for batch processing
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

  const getAllRows = () => Array.from(document.querySelectorAll('.pSrch-row'));

  const fireEnter = (el) => {
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    el.dispatchEvent(new KeyboardEvent('keypress', opts));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
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
      
      const { fillHistory = [] } = await (chrome.storage?.local?.get?.(['fillHistory']) || {});
      const history = Array.isArray(fillHistory) ? fillHistory : [];
      history.push(entry);
      while (history.length > 100) history.shift();
      await chrome.storage?.local?.set?.({ fillHistory: history });
      console.log('Log entry saved');
    } catch (error) {
      console.error('Error logging fill completion:', error);
    }
  };

  // Core step function for filling products
  const stepFill = () => {
    // Returns: 'done' | 'paused' | 'continue'
    console.log('stepFill: nextIndex=', avonFillState.nextIndex, 'queue.length=', avonFillState.queue.length, 'processedInBatch=', avonFillState.processedInBatch);
    
    if (avonFillState.nextIndex >= avonFillState.queue.length) return 'done';
    if (avonFillState.processedInBatch >= avonFillState.batchSize) return 'paused';

    // Find the next empty row
    const rows = getAllRows();
    let targetRow = null;
    
    // Look for an empty row
    for (let i = 0; i < rows.length; i++) {
      const codeInput = rows[i].querySelector('input[name="tabEntry"], input.ps-lnInpt');
      const qtyInput = rows[i].querySelector('input.qntyVal');
      if (codeInput && qtyInput && !codeInput.value.trim() && !qtyInput.value.trim()) {
        targetRow = rows[i];
        break;
      }
    }
    
    // If no empty row found, wait and try again
    if (!targetRow) {
      return 'continue';
    }

    // Fill one code at a time
    const codeInput = targetRow.querySelector('input[name="tabEntry"], input.ps-lnInpt');
    const qtyInput = targetRow.querySelector('input.qntyVal');
    const currIndex = avonFillState.nextIndex;
    const { code, qty } = avonFillState.queue[avonFillState.nextIndex++];
    
    console.log('Filling code:', code, 'qty:', qty, 'at index:', currIndex);
    
    if (!codeInput || !qtyInput) return 'continue';

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
      }, 777);
    }

    // Always return continue to process next code with delay
    return 'continue';
  };

  // Batch processing runner
  const runBatch = () => {
    if (avonFillState.inProgress) return;
    avonFillState.inProgress = true;
    
    const tick = () => {
      const result = stepFill();
      if (result === 'done') {
        avonFillState.inProgress = false;
        // Log completion once
        try { logIfNotLogged(); } catch {}
        // Verify all codes after completion
        try { 
          const verificationSummary = verifyAllCodes();
          chrome.runtime.sendMessage({ 
            type: 'AVON_FILL_DONE', 
            verification: verificationSummary 
          }); 
        } catch {}
        return;
      }
      if (result === 'paused') {
        avonFillState.inProgress = false;
        sendPaused();
        return;
      }
      // Wait 500ms before next iteration if no empty input found
      setTimeout(tick, 900);
    };
    
    // initial burst
    stepFill();
    setTimeout(tick, 900);
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
    if (message.type === 'AVON_VERIFY_CODES') {
      try {
        if (!document.querySelector('.pSrch-row')) {
          sendResponse({ ok: false, error: t('csNoProductEntry') || 'Product Entry form not detected on this page.' });
          return;
        }
        
        const verificationSummary = verifyAllCodes();
        
        // Highlight any issues found
        if (verificationSummary && !verificationSummary.error) {
          highlightVerificationIssues(verificationSummary);
        }
        
        sendResponse({ ok: true, verification: verificationSummary });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return true;
    }
    if (message.type === 'AVON_HIGHLIGHT_ISSUES') {
      try {
        if (!document.querySelector('.pSrch-row')) {
          sendResponse({ ok: false, error: t('csNoProductEntry') || 'Product Entry form not detected on this page.' });
          return;
        }
        
        // Get verification summary and highlight issues
        const verificationSummary = verifyAllCodes();
        if (verificationSummary && !verificationSummary.error) {
          highlightVerificationIssues(verificationSummary);
          sendResponse({ ok: true, highlighted: true, verification: verificationSummary });
        } else {
          sendResponse({ ok: false, error: verificationSummary?.error || 'Verification failed' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return true;
    }
    if (message.type === 'AVON_CLEAR_HIGHLIGHTS') {
      try {
        clearVerificationHighlights();
        sendResponse({ ok: true, cleared: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return true;
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
          // Verify all codes after completion
          try { 
            const verificationSummary = verifyAllCodes();
            chrome.runtime.sendMessage({ 
              type: 'AVON_FILL_DONE', 
              verification: verificationSummary 
            }); 
          } catch {}
          sendResponse({ ok: true, done: true });
          return;
        }
        
        // Reset batch counter and continue
        avonFillState.processedInBatch = 0;
        avonFillState.inProgress = false;
        
        // Continue with the next batch
        runBatch();
        
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return true;
    }
  });
})();


