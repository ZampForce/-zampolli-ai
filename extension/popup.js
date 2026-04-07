/**
 * popup.js - Handles popup buttons for the extension.
 */
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggleBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');

  // Load current tab info
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const tab = tabs[0];
    const isSalesforce = tab.url && (tab.url.includes('.salesforce.com') || tab.url.includes('.force.com'));

    if (isSalesforce) {
      statusBadge.className = 'status-badge active';
      statusBadge.textContent = 'Salesforce detectado';
      statusText.textContent = tab.url.split('/')[2];

      // Check if sidebar is already injected
      chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (response) => {
        if (response && response.ok) {
          toggleBtn.textContent = 'Ativar Sidebar';
        } else {
          toggleBtn.textContent = 'Abrir Sidebar no Salesforce';
        }
      });
    } else {
      statusBadge.className = 'status-badge inactive';
      statusBadge.textContent = 'Fora do Salesforce';
      statusText.textContent = 'Abra sua org Salesforce primeiro';
      toggleBtn.textContent = 'Abrir Salesforce';
      toggleBtn.onclick = () => {
        chrome.tabs.create({ url: 'https://login.salesforce.com' });
      };
    }
  });

  // Toggle sidebar
  toggleBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const tab = tabs[0];

      // Inject script into the active tab
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('[SF Agent] Injection failed:', chrome.runtime.lastError.message);
          toggleBtn.textContent = 'Erro ao injetar — recarregue';
        } else {
          toggleBtn.textContent = 'Sidebar ativada ✓';
          console.log('[SF Agent] Script injected into page');
        }
      });
    });
  });

  // Open settings
  settingsBtn.addEventListener('click', () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding.html'),
    });
    window.close();
  });
});
