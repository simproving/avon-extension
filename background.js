chrome.runtime.onInstalled.addListener(() => {
  console.log('Avon Extension installed.');
});

// Example: respond to pings from popup/content
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'PING') {
    sendResponse({ type: 'PONG', source: 'background' });
  }
});


