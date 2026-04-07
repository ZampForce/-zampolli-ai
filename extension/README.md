# Salesforce AI Flow Builder - Chrome Extension

Extension that adds a chat sidebar to Salesforce Lightning Experience for creating Flows via natural language.

## Quick Start

### 1. Install the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select this `extension/` folder
5. The extension icon appears in your toolbar

### 2. Configure Settings

1. Click the extension icon
2. Set your **Backend URL** (e.g., `http://localhost:3000`)
3. Set your **API Key** (optional)
4. Save

### 3. Open Salesforce

1. Navigate to your Salesforce org (`*.lightning.force.com`)
2. The sidebar appears automatically on the **right side** of the screen
3. Describe your Flow in natural language and press **Send**

---

## Running the Backend Server

```bash
cd extension
npm install express cors
export OPENROUTER_API_KEY="sk-or-v1-..."
export OPENROUTER_URL="https://openrouter.ai/api/v1/chat/completions"
export AI_MODEL="qwen/qwen3.6-plus:free"

node backend-server.js
```

Server runs on `http://localhost:3000`

---

## Features

- **Detects context automatically** - Knows current object (Lead, Opportunity, etc.)
- **Chat interface** - Describe what you want, it generates Flow XML
- **Deploy button** - Click to push Flow to your Salesforce org
- **Collapsible sidebar** - Won't interfere with Salesforce UI
- **Settings panel** - Configure backend URL and API key
- **Toast notifications** - Visual feedback (no alerts)

---

## Architecture

| File | Purpose |
|------|---------|
| `manifest.json` | Chrome Extension V3 config |
| `content.js` | Injects sidebar into Salesforce pages |
| `background.js` | Service worker, settings, context menu |
| `sidebar.js` | Chat UI controller |
| `sidebar.css` | Styles (dark theme, Lightning compatible) |
| `sidebar.html` | Template container |
| `api.js` | Backend communication layer |
| `onboarding.html` | Setup wizard (first install) |
| `backend-server.js` | Node.js server for AI flow generation |

---

## Security

- No sensitive data stored in extension code
- API key stored in Chrome's secure `chrome.storage.local`
- CORS properly configured
- No alert(), uses toast notifications

---

## Future

- Salesforce OAuth integration (no manual credentials)
- Direct Metadata API deploy (no backend needed)
- Support for Screen Flows, Record-Triggered Flows, Scheduled Flows
- Apex Code generation
