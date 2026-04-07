/**
 * Salesforce AI Flow Builder - Background Service Worker
 * Handles extension lifecycle, icon toggle, and optional proxy messaging.
 */

// ── Install ───────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      backendUrl: '',
      apiKey: '',
    });

    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding.html'),
    });

    console.log('[SF Agent] Installed — onboarding opened');
  }
});

// ── Action Click (Toggle Extension) ──────────────────────
chrome.action.onClicked.addListener(async (tab) => {
  // Toggle the sidebar via messaging to the content script
  await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
});

// ── Message Handler ──────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'get-settings') {
    chrome.storage.local.get(['backendUrl', 'apiKey'], (result) => {
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

  if (message.action === 'deploy-to-org') {
    // Future: integrate with Metadata API via server
    // For now, forward to content script which handles the UI
    chrome.tabs.sendMessage(sender.tab.id, message, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse(response || {});
      }
    });
    return true;
  }
});

// ── Context Menu (right-click to send to AI) ─────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'send-to-sf-agent',
    title: 'Send to SF AI Agent',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'send-to-sf-agent') {
    // Open sidebar and pre-fill with selected text
    chrome.tabs.sendMessage(tab.id, {
      action: 'prefill',
      text: info.selectionText,
    });
  }
});
