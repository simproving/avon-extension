chrome.runtime.onInstalled.addListener(() => {
  console.log('Avon Extension installed.');
});

// Example: respond to pings from popup/content
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'PING') {
    sendResponse({ type: 'PONG', source: 'background' });
  }
});

// When the user clicks the toolbar icon, split the screen:
// - shrink the current window to the left half
// - open our UI in a new right-hand window targeting the current tab
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Determine the active tab and its window
    let activeTab = tab;
    if (!activeTab || activeTab.id == null) {
      const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTab = t;
    }
    if (!activeTab || activeTab.windowId == null) return;

    // Maximize first to learn full work area dimensions on this display
    let win = await chrome.windows.get(activeTab.windowId);
    await chrome.windows.update(win.id, { state: 'maximized', focused: true });
    win = await chrome.windows.get(activeTab.windowId);

    const fullLeft = typeof win.left === 'number' ? win.left : 0;
    const fullTop = typeof win.top === 'number' ? win.top : 0;
    const fullWidth = Math.max(600, typeof win.width === 'number' ? win.width : 1600);
    const fullHeight = Math.max(400, typeof win.height === 'number' ? win.height : 900);
    const rightWidth = Math.floor(fullWidth / 4);
    const leftWidth = fullWidth - rightWidth; // handle odd pixel

    // Resize current window to left half flush to left edge
    await chrome.windows.update(win.id, {
      state: 'normal',
      left: fullLeft,
      top: fullTop,
      width: leftWidth,
      height: fullHeight,
      focused: true
    });

    // Open extension UI on the right half flush to right edge
    const uiUrl = chrome.runtime.getURL(`popup/popup.html?targetTabId=${activeTab.id}`);
    await chrome.windows.create({
      url: uiUrl,
      type: 'popup',
      left: fullLeft + leftWidth,
      top: fullTop,
      width: rightWidth,
      height: fullHeight,
      focused: true
    });
  } catch (e) {
    console.warn('Failed to split and open UI:', e);
  }
});


