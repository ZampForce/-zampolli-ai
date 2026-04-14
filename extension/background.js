/**
 * Salesforce AI Flow Builder - Background Service Worker
 * Handles all backend communication from the sidebar,
 * avoiding mixed-content blocking (HTTPS page → HTTP localhost).
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({ backendUrl: '', apiKey: '' });
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'send-to-sf-agent', title: 'Send to SF AI Agent', contexts: ['selection'] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'send-to-sf-agent') {
    chrome.tabs.sendMessage(tab.id, { action: 'prefill', text: info.selectionText });
  }
});

// ── Backend Proxy (handles all fetches from the sidebar) ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'get-settings') {
    chrome.storage.local.get(['backendUrl', 'apiKey', 'sfUsername', 'sfPassword', 'sfDomain'], (result) => {
      sendResponse(result);
    });
    return true;
  }

  if (message.action === 'update-settings') {
    chrome.storage.local.set(message.settings, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  // Proxy: backend API call from background (no mixed content block)
  if (message.action === 'backend-fetch') {
    chrome.storage.local.get(['backendUrl', 'apiKey', 'sfUsername', 'sfPassword', 'sfDomain'], async (storage) => {
      if (!storage.backendUrl) {
        sendResponse({ error: true, message: 'Backend URL não configurada' });
        return;
      }

      const url = storage.backendUrl + message.path;
      const headers = { 'Content-Type': 'application/json' };
      if (storage.apiKey) headers['Authorization'] = 'Bearer ' + storage.apiKey;
      if (storage.sfUsername) headers['X-SF-Username'] = storage.sfUsername;
      if (storage.sfPassword) headers['X-SF-Password'] = storage.sfPassword;
      if (storage.sfDomain) headers['X-SF-Domain'] = storage.sfDomain;

      try {
        const resp = await fetch(url, {
          method: message.method || 'POST',
          headers,
          body: message.body ? JSON.stringify(message.body) : undefined,
        });

        const data = await resp.json().catch(() => ({ error: 'Invalid JSON response' }));

        if (!resp.ok) {
          sendResponse({
            httpError: true,
            status: resp.status,
            data,
            message: 'HTTP ' + resp.status,
          });
        } else {
          sendResponse({ success: true, data });
        }
      } catch (err) {
        sendResponse({ error: true, message: err.message || 'Network error' });
      }
    });
    return true; // async sendResponse
  }

  return false;
});
