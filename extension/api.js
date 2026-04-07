/**
 * Salesforce AI Flow Builder - API Layer
 * Handles communication with the AI backend.
 */
class SFAgentAPI {
  constructor() {
    this._settings = null;
  }

  loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['backend_url', 'api_key'], (result) => {
        this._settings = {
          backendUrl: result.backendUrl || '',
          apiKey: result.apiKey || '',
        };
        resolve(this._settings);
      });
    });
  }

  async sendPrompt(prompt, context = {}) {
    await this.loadSettings();

    const payload = {
      prompt,
      orgId: context.orgId || '',
      context: {
        object: context.object || '',
        url: context.url || window.location.href,
        ...context,
      },
    };

    const headers = { 'Content-Type': 'application/json' };
    if (this._settings.apiKey) {
      headers['Authorization'] = `Bearer ${this._settings.apiKey}`;
    }

    const response = await fetch(`${this._settings.backendUrl}/api/generate-flow`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async deployFlow(flowMetadata, options = {}) {
    await this.loadSettings();

    const headers = { 'Content-Type': 'application/json' };
    if (this._settings.apiKey) {
      headers['Authorization'] = `Bearer ${this._settings.apiKey}`;
    }

    const response = await fetch(`${this._settings.backendUrl}/deploy`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        flowMetadata,
        flowName: options.flowName || 'AutoFlow',
        metadataType: options.metadataType || 'Flow',
        allXml: options.allXml || null,
      }),
    });

    if (!response.ok) {
      throw new Error(`Deploy Error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async testConnection() {
    await this.loadSettings();
    if (!this._settings.backendUrl) {
      throw new Error('No backend URL configured');
    }

    const response = await fetch(`${this._settings.backendUrl}/health`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    return true;
  }
}

window.SFAgentAPI = SFAgentAPI;
