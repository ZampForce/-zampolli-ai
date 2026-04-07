/**
 * Salesforce AI Flow Builder - Sidebar UI Controller
 * Builds and manages the chat sidebar interface.
 */
class SFAgentSidebar {
  constructor(container) {
    this.container = container;
    this.api = new window.SFAgentAPI();
    this.context = { orgId: '', object: '', url: '' };
    this.isCollapsed = false;
    this.isProcessing = false;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="sf-ai-agent" id="sfAgent">
        <!-- Toggle Button -->
        <button class="sf-toggle" id="sfToggle" title="Toggle sidebar">
          <svg class="sf-toggle-icon" viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        </button>

        <!-- Header -->
        <div class="sf-header">
          <div class="sf-header-left">
            <svg class="sf-logo" viewBox="0 0 24 24" fill="#fff">
              <path d="M 5.93628 21.5928 C 5.82218 21.9153 5.51634 22.1295 5.18135 22.1295 C 5.14801 22.1295 5.1135 22.1272 5.07813 22.1217 C 3.64434 21.4621 0.865424 20.2409 0.124999 19.1569 C -0.0220604 18.941 -0.0220603 18.6618 0.124999 18.4459 C 0.554687 17.8128 0.836877 16.7394 0.836877 15.5156 C 0.836877 15.3559 0.882774 15.1953 0.940125 15.0512 C 1.3626 15.1395 1.79663 15.1908 2.22754 15.2023 C 3.03754 14.4735 4.20844 13.7784 5.39719 13.2164 C 4.8061 13.443 4.2292 13.6862 3.67144 13.9422 C 3.2896 13.3997 2.95941 12.7516 2.6723 12.0227 C 2.8811 12.0875 3.09687 12.1301 3.31836 12.1559 C 5.25375 9.43995 8.66395 6.26465 12.6639 4.23403 C 13.5901 3.81684 14.4997 3.41937 15.0662 3.11328 C 15.8284 2.75117 16.7742 2.85117 17.4727 3.38984 C 17.9648 3.76367 18.1697 4.38047 18.0312 4.9375 C 17.9727 5.18359 17.8797 5.42304 17.7695 5.64765 C 20.6941 4.33242 23.4854 4.89375 24.0469 5.44687 C 24.5977 5.98437 24.716 6.83437 24.4141 7.50234 C 24.1117 8.07891 23.4992 8.70898 22.6969 9.16797 C 22.418 9.33125 21.9734 9.57773 21.3102 9.82812 C 20.3945 10.1863 19.2812 10.5047 18.0117 10.5047 C 17.6543 10.5047 17.2969 10.4801 16.9359 10.4219 C 17.223 10.8289 17.443 11.243 17.6023 11.6672 C 17.7414 12.0359 17.8488 12.4039 17.9195 12.7664 C 17.6379 12.6672 17.3516 12.5793 17.0656 12.507 C 17.343 12.7992 17.5773 13.0906 17.7797 13.3727 C 17.4023 14.0953 16.8914 14.8195 16.2539 15.5234 C 16.875 15.5164 17.5 15.4969 18.125 15.4648 C 18.9399 15.7016 19.7273 15.9445 20.4922 16.1836 C 20.0062 15.4383 19.418 14.6789 18.7441 13.9164 C 20.3148 14.6625 21.6672 15.8633 22.707 17.4609 C 22.5945 18.2648 22.375 19.7875 21.8203 20.7656 C 21.0672 21.3633 20.257 21.7187 19.3906 22.0078 C 17.052 22.7816 14.8445 23.7133 13.0625 24.7578 C 12.4656 25.1078 11.9168 25.507 11.4102 25.9531 C 11.0703 26.2492 10.6594 26.3789 10.1758 26.3418 C 9.68359 26.3 9.44336 25.957 9.41953 25.2281 C 9.36797 23.6477 10.1148 21.5281 11.4195 19.668 C 11.7859 19.1406 12.2086 18.6641 12.6602 18.2344 C 12.3172 17.9578 11.9512 17.6918 11.5656 17.443 C 11.2344 17.2164 10.8914 16.9996 10.5359 16.7938 C 10.452 17.0742 10.4016 17.3559 10.3727 17.634 C 10.3359 22.1305 8.96953 24.1367 6.87422 25.293 C 6.41484 25.5438 5.94766 25.7687 5.47266 25.9609 C 5.45156 25.9219 5.43828 25.8711 5.43437 25.8109 C 5.41406 25.5188 5.56797 25.2441 5.83594 25.0969 C 6.08359 24.9625 6.34766 24.8414 6.625 24.732 C 5.94219 24.143 5.41484 23.3836 5.11562 22.4543 C 5.39219 22.3711 5.66953 22.075 5.93628 21.5928 Z"/>
            </svg>
            <h3>AI Flow Builder</h3>
          </div>
          <div class="sf-header-controls">
            <button class="sf-header-btn" id="sfSettingsBtn" title="Settings">
              <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            </button>
            <button class="sf-header-btn" id="sfCollapseBtn" title="Collapse">
              <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        </div>

        <!-- Context Bar -->
        <div class="sf-context" id="sfContext">
          <span class="sf-context-badge" id="sfContextObject">Detecting...</span>
          <span class="sf-context-dot"></span>
          <span id="sfContextPage">Analyzing page...</span>
        </div>

        <!-- Chat -->
        <div class="sf-chat" id="sfChat">
          <!-- Welcome message -->
          <div class="sf-msg sf-ai">
            <div class="sf-msg-avatar">AI</div>
            <div class="sf-msg-bubble">
              <strong>Olá! Sou seu assistente de automação Salesforce.</strong><br><br>
              Descreva o Flow que deseja criar e eu gero o XML pronto para deploy na sua org.<br><br>
              <em>Ex: "Quando um Lead é criado, criar uma Task automaticamente"</em>
            </div>
          </div>
        </div>

        <!-- Input -->
        <div class="sf-input-area">
          <div class="sf-input-wrapper">
            <textarea
              class="sf-input"
              id="sfInput"
              placeholder="Descreva a automação..."
              rows="1"
            ></textarea>
            <button class="sf-send-btn" id="sfSendBtn" title="Enviar">
              <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
          <div class="sf-input-hint">Pressione Enter para enviar · Shift+Enter para nova linha</div>
        </div>

        <!-- Settings Overlay -->
        <div class="sf-settings-overlay" id="sfSettings" style="display:none;">
          <div class="sf-settings-panel">
            <h4>Configurações</h4>
            <div class="sf-settings-field">
              <label>Backend URL</label>
              <input type="url" id="sfBackendUrl" placeholder="https://seu-servidor.com">
            </div>
            <div class="sf-settings-field">
              <label>API Key (opcional)</label>
              <input type="password" id="sfApiKey" placeholder="sk-or-v1-...">
            </div>
            <button class="sf-settings-save" id="sfSettingsSave">Salvar</button>
          </div>
        </div>

        <!-- Toast -->
        <div class="sf-toast" id="sfToast"></div>
      </div>
    `;

    this.bindEvents();
    this.autoDetectContext();
    this.loadSettings();
  }

  bindEvents() {
    const toggle = this.container.querySelector('#sfToggle');
    const collapse = this.container.querySelector('#sfCollapseBtn');
    const sendBtn = this.container.querySelector('#sfSendBtn');
    const input = this.container.querySelector('#sfInput');
    const settingsBtn = this.container.querySelector('#sfSettingsBtn');
    const settingsSave = this.container.querySelector('#sfSettingsSave');

    const toggleSidebar = () => {
      const agent = this.container.querySelector('.sf-ai-agent');
      agent.classList.toggle('sf-collapsed');
      this.isCollapsed = agent.classList.contains('sf-collapsed');
    };

    toggle.addEventListener('click', toggleSidebar);
    collapse.addEventListener('click', toggleSidebar);

    sendBtn.addEventListener('click', () => this.sendMessage());

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    });

    settingsBtn.addEventListener('click', () => {
      const panel = this.container.querySelector('#sfSettings');
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
      this.loadSettings();
    });

    settingsSave.addEventListener('click', () => {
      const url = this.container.querySelector('#sfBackendUrl').value.trim();
      const key = this.container.querySelector('#sfApiKey').value.trim();
      chrome.storage.local.set({ backendUrl: url, apiKey: key }, () => {
        this.showToast('Configuração salva!', 'success');
        this.container.querySelector('#sfSettings').style.display = 'none';
      });
    });
  }

  async loadSettings() {
    chrome.storage.local.get(['backendUrl', 'apiKey'], (result) => {
      const urlField = this.container.querySelector('#sfBackendUrl');
      const keyField = this.container.querySelector('#sfApiKey');
      if (urlField) urlField.value = result.backendUrl || '';
      if (keyField) keyField.value = result.apiKey || '';
    });
  }

  async autoDetectContext() {
    const badge = this.container.querySelector('#sfContextObject');
    const pageText = this.container.querySelector('#sfContextPage');

    try {
      const url = window.location.href;
      this.context.url = url;

      // Detect Salesforce object from URL
      if (url.includes('/lightning/r/Lead/')) {
        this.context.object = 'Lead';
      } else if (url.includes('/lightning/r/Contact/')) {
        this.context.object = 'Contact';
      } else if (url.includes('/lightning/r/Account/')) {
        this.context.object = 'Account';
      } else if (url.includes('/lightning/r/Opportunity/')) {
        this.context.object = 'Opportunity';
      } else if (url.includes('/lightning/r/Case/')) {
        this.context.object = 'Case';
      } else if (url.includes('/lightning/o/Lead/')) {
        this.context.object = 'Lead';
      } else if (url.includes('/lightning/o/Contact/')) {
        this.context.object = 'Contact';
      } else if (url.includes('/lightning/o/Account/')) {
        this.context.object = 'Account';
      } else if (url.includes('/lightning/o/Opportunity/')) {
        this.context.object = 'Opportunity';
      } else if (url.includes('/lightning/o/Case/')) {
        this.context.object = 'Case';
      }

      // Try to extract record ID
      const idMatch = url.match(/\/lightning\/r\/(\w+)\/(\w+)/);
      if (idMatch) {
        this.context.recordId = idMatch[2];
        this.context.object = idMatch[1];
      }

      // Get org ID from DOM (Salesforce stores this in the global object)
      try {
        const orgEl = document.querySelector('[data-aura-class*="alohaPage"]');
        const orgMatch = document.cookie.match(/orgId=([^;]+)/);
        if (orgMatch) this.context.orgId = orgMatch[1];
      } catch (e) { /* org ID not available */ }

      if (badge) badge.textContent = this.context.object || 'Unknown';
      if (pageText) pageText.textContent = this.context.recordId ? `Record: ...${this.context.recordId.slice(-6)}` : 'List View';
    } catch (e) {
      if (badge) badge.textContent = 'Unknown';
      if (pageText) pageText.textContent = 'Could not detect context';
    }
  }

  async sendMessage() {
    const input = this.container.querySelector('#sfInput');
    const chat = this.container.querySelector('#sfChat');
    const text = input.value.trim();

    if (!text || this.isProcessing) return;

    // Add user message
    this.addMessage('user', text);
    input.value = '';
    input.style.height = 'auto';

    this.isProcessing = true;
    this.setSendEnabled(false);

    // Add loading message
    const loadingEl = this.addMessage('ai', this.loadingHtml(), 'loading');

    try {
      // Check if backend is configured
      const stored = await new Promise(r => chrome.storage.local.get('backendUrl', r));
      if (!stored.backendUrl) {
        this.removeMessage(loadingEl);
        this.addMessage('ai',
          `<strong>Backend não configurado.</strong><br><br>` +
          `Configure a URL do backend clicando no ícone de ⚙️ Configurações no topo da sidebar.<br>` +
          `<em>O backend deve estar rodando para processar a automação.</em>`,
          'error'
        );
        this.isProcessing = false;
        this.setSendEnabled(true);
        return;
      }

      const result = await this.api.sendPrompt(text, this.context);

      this.removeMessage(loadingEl);

      if (result.success || result.flowMetadata || result.instructions) {
        const html = this.formatResponse(result);
        const isField = result.metadataType === 'CustomField';
        const msgEl = this.addMessage('ai', html, 'response', {
          actions: result.deployable ? ['deploy'] : [],
          data: result,
          metadataType: result.metadataType,
        });

        // Bind action buttons
        if (result.deployable) {
          const deployBtn = msgEl.querySelector('.sf-deploy-btn');
          if (deployBtn) {
            deployBtn.textContent = isField ? 'Deploy Campo' : 'Deploy Flow';
            deployBtn.addEventListener('click', async () => {
              deployBtn.disabled = true;
              deployBtn.textContent = 'Deploying...';
              try {
                const deployResult = await this.api.deployFlow(result.flowMetadata, {
                  metadataType: result.metadataType || 'Flow',
                  flowName: result.flowName || result.flowLabel || '',
                  allXml: result.allXml || null,
                });
                if (deployResult.success) {
                  const msg = deployResult.output || (isField ? 'Campo criado com sucesso!' : 'Flow deployed successfully!');
                  this.showToast(msg, 'success');
                  deployBtn.textContent = isField ? 'Criado!' : 'Deployed';
                  deployBtn.classList.add('sf-success-btn');
                  deployBtn.disabled = true;
                } else {
                  this.showToast('Deploy failed: ' + (deployResult.error || 'Unknown error'), 'error');
                  deployBtn.textContent = 'Deploy Failed';
                  deployBtn.disabled = false;
                }
              } catch (e) {
                this.showToast('Deploy error: ' + e.message, 'error');
                deployBtn.textContent = 'Deploy Failed';
                deployBtn.disabled = false;
              }
            });
          }
        }
      } else {
        this.addMessage('ai', `
          <strong>Não consegui gerar o Flow.</strong><br><br>
          Verifique se o backend está configurado corretamente e tentando novamente.
        `, 'error');
      }
    } catch (error) {
      this.removeMessage(loadingEl);
      this.addMessage('ai', `<strong>Erro:</strong> ${error.message}`, 'error');
    } finally {
      this.isProcessing = false;
      this.setSendEnabled(true);
    }
  }

  addMessage(type, html, status = '', options = {}) {
    const chat = this.container.querySelector('#sfChat');
    const el = document.createElement('div');
    el.className = `sf-msg sf-${type}`;

    let actionsHtml = '';
    if (options.actions && options.actions.includes('deploy')) {
      const isField = options.metadataType === 'CustomField';
      const deployLabel = isField ? 'Deploy Campo' : 'Deploy Flow';
      actionsHtml = `
        <div class="sf-action-row">
          <button class="sf-action-btn sf-deploy-btn sf-primary">🚀 ${deployLabel}</button>
          <button class="sf-action-btn sf-secondary" onclick="navigator.clipboard.writeText(\`${this.escapeBacktick(JSON.stringify(options.data))}\`)">📋 Copiar</button>
        </div>`;
    }

    let statusHtml = '';
    if (status === 'loading') {
      statusHtml = '<div class="sf-status sf-loading"><span class="sf-status-dot"></span>Processando...</div>';
    }

    const avatar = type === 'ai' ? 'AI' : 'U';

    el.innerHTML = `
      <div class="sf-msg-avatar">${avatar}</div>
      <div class="sf-msg-bubble">
        ${html}
        ${statusHtml}
        ${actionsHtml}
      </div>
    `;

    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;

    return el;
  }

  removeMessage(el) {
    if (el && el.parentNode) el.remove();
  }

  formatResponse(result) {
    let html = '';
    const isField = result.metadataType === 'CustomField';

    if (result.instructions) {
      html += `<strong>Resultado:</strong><br>${result.instructions}<br><br>`;
    }

    if (result.flowMetadata) {
      const detailLabel = isField ? 'Ver XML do Campo' : 'Ver XML do Flow';
      html += `<details style="margin-top:8px;"><summary>${detailLabel}</summary><pre><code>${this.escapeHtml(result.flowMetadata)}</code></pre></details>`;
    }

    if (result.apexCode) {
      html += `<details style="margin-top:8px;"><summary>Ver Apex Code</summary><pre><code>${this.escapeHtml(result.apexCode)}</code></pre></details>`;
    }

    return html || JSON.stringify(result, null, 2);
  }

  loadingHtml() {
    return '<div class="sf-status sf-loading"><span class="sf-status-dot"></span>Procesando automação...</div>';
  }

  setSendEnabled(enabled) {
    const btn = this.container.querySelector('#sfSendBtn');
    const input = this.container.querySelector('#sfInput');
    if (btn) btn.disabled = !enabled;
    if (input) input.disabled = !enabled;
  }

  showToast(message, type = 'info') {
    const toast = this.container.querySelector('#sfToast');
    toast.textContent = message;
    toast.className = `sf-toast sf-toast-${type} sf-visible`;
    setTimeout(() => {
      toast.className = 'sf-toast';
    }, 3000);
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  escapeBacktick(str) {
    return str.replace(/`/g, '\\`').replace(/\$/g, '\\$');
  }
}

window.SFAgentSidebar = SFAgentSidebar;
