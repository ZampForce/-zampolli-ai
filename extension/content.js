/**
 * Salesforce AI Flow Builder - Content Script (Fully Self-Contained)
 * All CSS and HTML inline - no external file dependencies.
 */
(function () {
  'use strict';

  if (window.__sfAgentInjected) { return; }
  window.__sfAgentInjected = true;

  function waitForDOM() {
    if (document.body) { inject(); }
    else {
      var obs = new MutationObserver(function () {
        if (document.body) { obs.disconnect(); inject(); }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function inject() {
    var root = document.getElementById('sf-ai-agent-root');
    if (root) { return; }

    var host = document.createElement('div');
    host.id = 'sf-ai-agent-root';
    document.body.appendChild(host);

    var sidebar = document.createElement('div');
    sidebar.className = 'sf-ai-agent';
    sidebar.id = 'sfAgent';
    sidebar.innerHTML = HTML;

    host.appendChild(sidebar);

    // Inject styles into page head
    var styleTag = document.createElement('style');
    styleTag.id = 'sf-agent-styles';
    styleTag.textContent = CSS;
    document.head.appendChild(styleTag);

    bindSidebar(sidebar);
    detectContext();
    loadSettings(sidebar);

    console.log('[SF Agent] Sidebar created!');
  }

  function bindSidebar(sidebar) {
    var toggle = sidebar.querySelector('#sfToggle');
    var collapse = sidebar.querySelector('#sfCollapseBtn');
    function doToggle() { sidebar.classList.toggle('sf-collapsed'); }
    if (toggle) toggle.addEventListener('click', doToggle);
    if (collapse) collapse.addEventListener('click', doToggle);

    var sendBtn = sidebar.querySelector('#sfSendBtn');
    var input = sidebar.querySelector('#sfInput');
    if (sendBtn) sendBtn.addEventListener('click', function () { doSend(sidebar); });
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(sidebar); }
      });
      input.addEventListener('input', function () {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 80) + 'px';
      });
    }

    var settingsBtn = sidebar.querySelector('#sfSettingsBtn');
    var overlay = sidebar.querySelector('#sfSettings');
    var saveBtn = sidebar.querySelector('#sfSettingsSave');
    if (settingsBtn && overlay) {
      settingsBtn.addEventListener('click', function () {
        overlay.style.display = (overlay.style.display === 'none') ? 'flex' : 'none';
        loadSettings(sidebar);
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var url = (sidebar.querySelector('#sfBackendUrl') || {}).value || '';
        var key = (sidebar.querySelector('#sfApiKey') || {}).value || '';
        var sfu = (sidebar.querySelector('#sfSfUsername') || {}).value || '';
        var sfp = (sidebar.querySelector('#sfSfPassword') || {}).value || '';
        var sfd = (sidebar.querySelector('#sfSfDomain') || {}).value || 'login';
        chrome.storage.local.set({ backendUrl: url.trim(), apiKey: key.trim(), sfUsername: sfu.trim(), sfPassword: sfp.trim(), sfDomain: sfd.trim() }, function () {
          doToast(sidebar, 'Configuração salva!', 'success');
          if (overlay) overlay.style.display = 'none';
          updateConnectionStatus(overlay || sidebar, sfu ? 'connected' : 'disconnected');
        });
      });
    }
    var testBtn = sidebar.querySelector('#sfTestConnection');
    if (testBtn) {
      testBtn.addEventListener('click', function () {
        var sfu = (sidebar.querySelector('#sfSfUsername') || {}).value || '';
        var sfp = (sidebar.querySelector('#sfSfPassword') || {}).value || '';
        var sfd = (sidebar.querySelector('#sfSfDomain') || {}).value || 'login';
        if (!sfu || !sfp) {
          doToast(sidebar, 'Preencha username e password', 'error');
          return;
        }
        updateConnectionStatus(sidebar, 'testing');
        testBtn.textContent = 'Testando...';
        testBtn.disabled = true;
        chrome.storage.local.get('backendUrl', function (res) {
          fetch(res.backendUrl + '/health', {
            headers: {
              'X-SF-Username': sfu,
              'X-SF-Password': sfp,
              'X-SF-Domain': sfd,
            }
          })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            testBtn.textContent = 'Testar Conexão';
            testBtn.disabled = false;
            if (d.sfConnected) {
              updateConnectionStatus(sidebar, 'connected', 'Conectado como ' + sfu);
            } else {
              updateConnectionStatus(sidebar, 'disconnected', 'Não foi possível conectar: ' + (d.sfError || 'Verifique as credenciais'));
            }
          })
          .catch(function () {
            testBtn.textContent = 'Testar Conexão';
            testBtn.disabled = false;
            updateConnectionStatus(sidebar, 'disconnected', 'Não foi possível conectar ao backend');
          });
        });
      });
    }

    // Ping handler
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (msg.action === 'ping') { sendResponse({ ok: true }); }
      return false;
    });
  }

  function doSend(sidebar) {
    var input = sidebar.querySelector('#sfInput');
    var chat = sidebar.querySelector('#sfChat');
    var text = input ? input.value.trim() : '';
    if (!text) { return; }

    addMsg(chat, 'user', esc(text));
    input.value = '';
    input.style.height = 'auto';

    var loadingEl = addMsg(chat, 'ai', '<div class="sf-status sf-loading"><span class="sf-status-dot"></span>Processando...</div>');

    chrome.storage.local.get('backendUrl', function (res) {
      if (!res.backendUrl) {
        if (loadingEl) loadingEl.remove();
        addMsg(chat, 'ai',
          '<strong>Backend não configurado.</strong><br><br>' +
          'Clique no ícone ⚙️ e configure:<br><code>http://localhost:3000</code>'
        );
        return;
      }

      var ctx = detectContext();
      var headers = { 'Content-Type': 'application/json' };
      var apiKey = '';

      chrome.storage.local.get(['apiKey', 'sfUsername', 'sfPassword', 'sfDomain'], function (r) {
        apiKey = r.apiKey || '';
        if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

        // Include user's Salesforce credentials if configured
        if (r.sfUsername && r.sfPassword) {
          headers['X-SF-Username'] = r.sfUsername;
          headers['X-SF-Password'] = r.sfPassword;
          headers['X-SF-Domain'] = r.sfDomain || 'login';
        }

        fetch(res.backendUrl + '/api/generate-flow', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            prompt: text,
            orgId: ctx.orgId || '',
            context: { object: ctx.object || '', url: window.location.href }
          })
        })
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then(function (data) {
            if (loadingEl) loadingEl.remove();
            var isField = data.metadataType === 'CustomField';
            var isVR = data.metadataType === 'ValidationRule';
            var html = '';
            if (data.instructions) html += '<strong>Resultado:</strong><br>' + esc(data.instructions) + '<br><br>';

            // Show VR details if available
            if (isVR && data.vrDetails) {
              var vr = data.vrDetails;
              html = '<strong>Validation Rule</strong><br><br>';
              html += '<small>Objeto: <strong>' + esc(vr.object) + '</strong></small><br>';
              html += '<small>Nome: <strong>' + esc(vr.ruleName) + '</strong></small><br>';
              html += '<small>Erro: <strong>' + esc(vr.errorMessage) + '</strong></small><br><br>';
              html += '<details><summary>Ver Fórmula</summary><pre><code>' + esc(vr.formula) + '</code></pre></details>';
            }
            if (data.error) {
              html = '<strong>Erro no processamento:</strong><br><br>' + esc(data.error);
              if (data.details) html += '<br><br><details><summary>Detalhes técnicos</summary><pre><code>' + esc(data.details) + '</code></pre></details>';
              addMsg(chat, 'ai', html);
              doToast(sidebar, 'Erro ao gerar resposta', 'error');
              return;
            }
            if (data.flowMetadata) {
              var detailLabel = isVR ? 'Ver XML da Regra' : (isField ? 'Ver XML do Campo' : 'Ver XML do Flow');
              html += '<details><summary>' + detailLabel + '</summary><pre><code>' + esc(data.flowMetadata) + '</code></pre></details>';
            }
            if (data.apexCode) html += '<details><summary>Ver Apex</summary><pre><code>' + esc(data.apexCode) + '</code></pre></details>';

            // Handle multi-field response
            if (data.multipleFields && data.multipleFields.length > 1) {
              var fieldList = data.multipleFields.map(function(f) {
                return '<strong>' + esc(f.label) + '</strong> (' + esc(f.type) + ') em ' + esc(f.object);
              }).join('<br>');
              html = '<strong>Criar ' + data.multipleFields.length + ' campos:</strong><br><br>' + fieldList + '<br>';
              if (loadingEl) loadingEl.remove();
              var msgElMulti = addMsg(chat, 'ai', html);
              if (data.deployable) {
                setTimeout(function() {
                  var row = document.createElement('div');
                  row.className = 'sf-action-row';
                  var dbtn = document.createElement('button');
                  dbtn.className = 'sf-action-btn sf-deploy-btn sf-primary';
                  dbtn.textContent = 'Deploy ' + data.multipleFields.length + ' Campos';
                  row.appendChild(dbtn);
                  var bubble = msgElMulti.querySelector('.sf-msg-bubble');
                  if (bubble) bubble.appendChild(row);

                  dbtn.addEventListener('click', function() {
                    dbtn.disabled = true;
                    dbtn.textContent = 'Deploying...';
                    var deployHeaders = { 'Content-Type': 'application/json' };
                    if (r.sfUsername && r.sfPassword) {
                      deployHeaders['X-SF-Username'] = r.sfUsername;
                      deployHeaders['X-SF-Password'] = r.sfPassword;
                      deployHeaders['X-SF-Domain'] = r.sfDomain || 'login';
                    }
                    fetch(res.backendUrl + '/deploy', {
                      method: 'POST',
                      headers: deployHeaders,
                      body: JSON.stringify({
                        flowMetadata: data.flowMetadata,
                        flowName: data.flowName || 'BatchFields',
                        metadataType: data.metadataType || 'CustomField',
                        allXml: data.allXml || [],
                      })
                    })
                      .then(function (r) {
                        if (!r.ok) throw new Error('HTTP ' + r.status + ' na resposta do servidor');
                        return r.json();
                      })
                      .then(function(d) {
                        if (d.success) {
                          doToast(sidebar, (d.output || 'Campos criados!'), 'success');
                          dbtn.textContent = 'Criados!';
                          dbtn.classList.add('sf-success-btn');
                          // Show partial results if some failed
                          if (d.failCount > 0) {
                            var warnHtml = '<br><strong style="color:var(--err)">' + d.failCount + ' campo(s) falharam</strong><br><br>';
                            if (d.results && d.results.length > 0) {
                              d.results.forEach(function(rr, ii) {
                                if (!rr.success) {
                                  warnHtml += '<small style="color:var(--err)">❌ Campo ' + (ii + 1) + ': ' + esc(rr.error || 'Erro desconhecido') + '</small><br>';
                                } else {
                                  warnHtml += '<small style="color:var(--ok)">✓ Campo ' + (ii + 1) + ': criado</small><br>';
                                }
                              });
                            }
                            var warnEl = setTimeout(function() {
                              var warnMsg = addMsg(chat, 'ai', warnHtml);
                            }, 200);
                          }
                        } else {
                          var errorHtml = '<strong>Deploy falhou:</strong><br>';
                          if (d.results && d.results.length > 0) {
                            d.results.forEach(function(rr, ii) {
                              if (!rr.success) {
                                errorHtml += '<small style="color:var(--err)">Campo ' + (ii + 1) + ': ' + esc(rr.error) + '</small><br>';
                              }
                            });
                          } else {
                            errorHtml += esc(d.error || 'Erro desconhecido. Verifique o terminal do backend para mais detalhes.');
                          }
                          addMsg(chat, 'ai', errorHtml);
                          doToast(sidebar, 'Deploy falhou — veja detalhes no chat', 'error');
                          dbtn.textContent = 'Failed';
                          dbtn.disabled = false;
                        }
                      })
                      .catch(function(err) {
                        var errHtml = '<strong>Erro de rede:</strong> Não foi possível comunicar o servidor.<br><br><small>Verifique se:<br>• O backend está rodando (<code>node backend-server.js</code>)<br>• A URL em ⚙️ está correta (' + esc(res.backendUrl || '') + ')<br>• O Salesforce não está bloqueando CORS</small>';
                        addMsg(chat, 'ai', errHtml);
                        doToast(sidebar, 'Erro de rede ao fazer deploy', 'error');
                        dbtn.textContent = 'Failed';
                        dbtn.disabled = false;
                      });
                  });
                }, 100);
              }
              return;
            }

            var msgEl = addMsg(chat, 'ai', html || JSON.stringify(data));
            if (!data.success && !data.flowMetadata && !data.instructions) {
              doToast(sidebar, 'Erro ao processar solicitação', 'error');
            }

            if (data.deployable) {
              setTimeout(function () {
                var row = document.createElement('div');
                row.className = 'sf-action-row';
                var dbtn = document.createElement('button');
                dbtn.className = 'sf-action-btn sf-deploy-btn sf-primary';
                dbtn.textContent = isField ? 'Deploy Campo' : 'Deploy Flow';
                row.appendChild(dbtn);
                var bubble = msgEl.querySelector('.sf-msg-bubble');
                if (bubble) bubble.appendChild(row);

                dbtn.addEventListener('click', function () {
                  dbtn.disabled = true;
                  dbtn.textContent = 'Deploying...';
                  var deployHeaders2 = { 'Content-Type': 'application/json' };
                  if (r.sfUsername && r.sfPassword) {
                    deployHeaders2['X-SF-Username'] = r.sfUsername;
                    deployHeaders2['X-SF-Password'] = r.sfPassword;
                    deployHeaders2['X-SF-Domain'] = r.sfDomain || 'login';
                  }
                  fetch(res.backendUrl + '/deploy', {
                    method: 'POST',
                    headers: deployHeaders2,
                    body: JSON.stringify({
                      flowMetadata: data.flowMetadata,
                      flowName: data.flowName || 'AutoFlow',
                      metadataType: data.metadataType || 'Flow',
                      allXml: data.allXml || [],
                    })
                  })
                    .then(function (resp) {
                      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' na resposta do servidor');
                      return resp.json();
                    })
                    .then(function (d) {
                      if (d.success) {
                        doToast(sidebar, (d.output || (isField ? 'Campo criado!' : 'Flow criado!')), 'success');
                        dbtn.textContent = isField ? 'Criado!' : 'Deployed';
                        dbtn.classList.add('sf-success-btn');
                      } else {
                        var errHtml = '<strong>Deploy falhou:</strong> ' + esc(d.error || 'Erro desconhecido');
                        if (String(d.error || '').toLowerCase().includes('já existe')) {
                          errHtml += '<br><br><small>💡 Este campo já existe no Salesforce. Tente remover ou usar outro nome.</small>';
                        } else if (String(d.error || '').toLowerCase().includes('length')) {
                          errHtml += '<br><br><small>💡 Salesforce exige tamanho para campos Text. Tente outro nome ou tipo.</small>';
                        } else if (String(d.error || '').toLowerCase().includes('precision')) {
                          errHtml += '<br><br><small>💡 Campos Number/Currency exigem precisão. Informe o tipo correto.</small>';
                        }
                        addMsg(chat, 'ai', errHtml);
                        doToast(sidebar, 'Deploy falhou — veja detalhes no chat', 'error');
                        dbtn.textContent = 'Failed';
                        dbtn.disabled = false;
                      }
                    })
                    .catch(function (err) {
                      var errHtml = '<strong>Erro de rede:</strong> Não foi possível comunicar o servidor.<br><br><small>Verifique se:<br>• O backend está rodando (<code>node backend-server.js</code>)<br>• A URL em ⚙️ está correta (' + esc(res.backendUrl || '') + ')</small>';
                      addMsg(chat, 'ai', errHtml);
                      doToast(sidebar, 'Erro de rede ao fazer deploy', 'error');
                      dbtn.textContent = 'Failed';
                      dbtn.disabled = false;
                    });
                });
              }, 100);
            }
          })
          .catch(function (err) {
            if (loadingEl) loadingEl.remove();
            var msg = err.message || '';
            var errHtml = '<strong>Erro de comunicação:</strong> ';
            if (msg.includes('HTTP 5')) {
              errHtml += 'O servidor encontrou um erro interno (5xx).<br><br>';
              errHtml += '<small>💡 Veja o terminal do backend para o stack trace completo.</small>';
            } else if (msg.includes('HTTP 4')) {
              errHtml += 'Requisição inválida (4xx). Verifique se o prompt está correto.<br><br>';
              errHtml += '<small>Detalhes: ' + esc(msg) + '</small>';
            } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
              errHtml += 'Não foi possível conectar ao backend.<br><br>';
              errHtml += '<small>Verifique:<br>• O backend está rodando? (<code>node backend-server.js</code>)<br>• A URL em ⚙️ está correta<br>• O Chrome não está bloqueando requests</small>';
            } else {
              errHtml += esc(msg);
            }
            addMsg(chat, 'ai', errHtml);
            doToast(sidebar, 'Erro ao processar solicitação', 'error');
          });
      });
    });
  }

  function addMsg(chat, type, html) {
    var el = document.createElement('div');
    el.className = 'sf-msg sf-' + type;
    var av = type === 'ai' ? 'AI' : 'U';
    el.innerHTML = '<div class="sf-msg-avatar">' + av + '</div><div class="sf-msg-bubble">' + html + '</div>';
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }

  function doToast(sidebar, msg, type) {
    var toast = sidebar.querySelector('#sfToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'sf-toast sf-toast-' + type + ' sf-visible';
    setTimeout(function () { toast.className = 'sf-toast'; }, 3000);
  }

  function updateConnectionStatus(sidebar, status, message) {
    var el = sidebar.querySelector('#sfSfConnectionStatus');
    if (!el) return;
    el.style.display = 'block';
    el.className = 'sf-connection-status sf-' + status;
    el.textContent = message || (status === 'connected' ? 'Conectado ao Salesforce' : status === 'testing' ? 'Testando...' : 'Não conectado');
  }

  function loadSettings(sidebar) {
    chrome.storage.local.get(['backendUrl', 'apiKey', 'sfUsername', 'sfPassword', 'sfDomain'], function (r) {
      var bf = sidebar.querySelector('#sfBackendUrl');
      var ak = sidebar.querySelector('#sfApiKey');
      var su = sidebar.querySelector('#sfSfUsername');
      var sp = sidebar.querySelector('#sfSfPassword');
      var sd = sidebar.querySelector('#sfSfDomain');
      if (bf && r.backendUrl) bf.value = r.backendUrl;
      if (ak && r.apiKey) ak.value = r.apiKey;
      if (su && r.sfUsername) su.value = r.sfUsername;
      if (sp && r.sfPassword) sp.value = r.sfPassword;
      if (sd && r.sfDomain) sd.value = r.sfDomain;
      updateConnectionStatus(sidebar, r.sfUsername ? 'connected' : 'disconnected');
    });
  }

  function detectContext() {
    var url = window.location.href;
    var ctx = { object: '', recordId: '', url: url };
    var m = url.match(/\/lightning\/r\/(\w+)\/(\w+)/);
    if (m) { ctx.object = m[1]; ctx.recordId = m[2]; }
    else { var o = url.match(/\/lightning\/o\/(\w+)/); if (o) ctx.object = o[1]; }
    var el = document.getElementById('sfAgent');
    if (el) {
      var b = el.querySelector('#sfContextObject');
      var p = el.querySelector('#sfContextPage');
      if (b) b.textContent = ctx.object || 'Unknown';
      if (p) p.textContent = ctx.recordId ? 'Record: ...' + ctx.recordId.slice(-6) : 'Home / List';
    }
    return ctx;
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  // ─── CSS ──────────────────────────────────────────────────────
  var CSS = [
    '.sf-ai-agent *,.sf-ai-agent-wrapper *{margin:0;padding:0;box-sizing:border-box}',
    '.sf-ai-agent{',
    '  --b:#635bff;--bd:#4a44db;--bh:#7b73ff;--bg:#0d0f17;--cb:#181b28;',
    '  --ib:#22253a;--t:#e4e6f0;--ts:#8b8fa3;--bo:#2a2e42;',
    '  --ok:#34d399;--err:#f87171;--glow:rgba(99,91,255,.18);',
    '  font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;',
    '  position:fixed;top:0;right:0;width:400px;height:100vh;z-index:2147483647;',
    '  display:flex;flex-direction:column;background:var(--bg);color:var(--t);',
    '  transition:transform .35s cubic-bezier(.16,1,.3,1);transform:translateX(0);',
    '  box-shadow:-6px 0 36px rgba(0,0,0,.45),0 0 60px var(--glow);',
    '  border-left:1px solid var(--bo)',
    '}',
    '.sf-ai-agent.sf-collapsed{transform:translateX(calc(100% - 40px))}',
    '.sf-toggle{position:absolute;left:-40px;top:50%;transform:translateY(-50%);width:40px;height:72px;background:linear-gradient(135deg,var(--b),var(--bd));border:none;border-radius:12px 0 0 12px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:-3px 0 16px var(--glow);transition:background .2s}',
    '.sf-toggle:hover{background:linear-gradient(135deg,var(--bh),var(--b))}',
    '.sf-toggle-icon{width:20px;height:20px;fill:#fff;transition:transform .3s}.sf-collapsed .sf-toggle-icon{transform:rotate(180deg)}',
    '.sf-header{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:linear-gradient(135deg,rgba(74,68,219,.12),rgba(99,91,255,.06));border-bottom:1px solid var(--bo);flex-shrink:0}',
    '.sf-header-left{display:flex;align-items:center;gap:10px}',
    '.sf-logo{width:30px;height:30px;filter:drop-shadow(0 2px 8px rgba(99,91,255,.35))}',
    '.sf-header h3{font-size:15px;font-weight:700;color:#fff;letter-spacing:.3px}',
    '.sf-header-controls{display:flex;gap:6px}',
    '.sf-header-btn{background:rgba(255,255,255,.07);border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,transform .15s}',
    '.sf-header-btn:hover{background:rgba(255,255,255,.15);transform:scale(1.08)}',
    '.sf-header-btn svg{width:14px;height:14px;fill:#a8aec8}',
    '.sf-context{display:flex;align-items:center;gap:8px;padding:8px 20px;background:rgba(99,91,255,.06);border-bottom:1px solid var(--bo);flex-shrink:0;font-size:11.5px;color:var(--ts)}',
    '.sf-context-badge{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,var(--b),var(--bh));color:#fff;padding:4px 10px;border-radius:8px;font-size:11px;font-weight:600;letter-spacing:.2px}',
    '.sf-context-dot{width:5px;height:5px;background:var(--ok);border-radius:50%;box-shadow:0 0 6px rgba(52,211,153,.5)}',
    '.sf-chat{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px}',
    '.sf-chat::-webkit-scrollbar{width:5px}',
    '.sf-chat::-webkit-scrollbar-track{background:transparent}',
    '.sf-chat::-webkit-scrollbar-thumb{background:var(--bo);border-radius:3px}',
    '.sf-chat::-webkit-scrollbar-thumb:hover{background:var(--ts)}',
    '.sf-msg{display:flex;gap:10px;max-width:92%;animation:sfFade .3s ease}',
    '@keyframes sfFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}',
    '.sf-msg.sf-ai{align-self:flex-start}.sf-msg.sf-user{align-self:flex-end;flex-direction:row-reverse}',
    '.sf-msg-avatar{width:30px;height:30px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}',
    '.sf-msg.sf-ai .sf-msg-avatar{background:linear-gradient(135deg,var(--b),var(--bh));color:#fff;box-shadow:0 2px 8px rgba(99,91,255,.25)}',
    '.sf-msg.sf-user .sf-msg-avatar{background:#3a3d54;color:#b0b4c8}',
    '.sf-msg-bubble{padding:12px 15px;border-radius:16px;font-size:13px;line-height:1.55;word-wrap:break-word}',
    '.sf-msg.sf-ai .sf-msg-bubble{background:var(--cb);border:1px solid var(--bo);border-top-left-radius:6px}',
    '.sf-msg.sf-user .sf-msg-bubble{background:linear-gradient(135deg,var(--b),var(--bd));border:none;border-top-right-radius:6px;color:#fff}',
    '.sf-msg-bubble pre{background:rgba(0,0,0,.25);border:1px solid var(--bo);border-radius:10px;padding:10px 12px;margin:8px 0;font-size:11.5px;overflow-x:auto;font-family:SF Mono,Consolas,monospace;line-height:1.4}',
    '.sf-msg-bubble details{border:1px solid var(--bo);border-radius:10px;margin-top:8px;overflow:hidden}',
    '.sf-msg-bubble small{color:var(--ts);font-size:11.5px;line-height:1.6;display:block}',
    '.sf-msg-bubble summary{padding:10px 14px;background:rgba(255,255,255,.04);cursor:pointer;font-size:12px;font-weight:500;color:var(--ts);transition:background .2s}',
    '.sf-msg-bubble summary:hover{background:rgba(255,255,255,.08)}',
    '.sf-msg-bubble details pre{margin:0;border:none;border-top:1px solid var(--bo);border-radius:0}',
    '.sf-status{display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:500;margin-top:8px}',
    '.sf-status.sf-success{background:rgba(52,211,153,.12);color:var(--ok)}',
    '.sf-status.sf-error{background:rgba(248,113,113,.12);color:var(--err)}',
    '.sf-status.sf-loading{background:rgba(255,255,255,.05);color:var(--ts)}',
    '.sf-status.sf-loading .sf-status-dot{animation:sfPulse 1.5s infinite}',
    '@keyframes sfPulse{0%,100%{opacity:1}50%{opacity:.25}}',
    '.sf-status-dot{width:7px;height:7px;border-radius:50%;background:currentColor}',
    '.sf-action-row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}',
    '.sf-action-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;transition:background .2s,transform .1s}',
    '.sf-action-btn:active{transform:scale(.96)}',
    '.sf-action-btn.sf-primary{background:linear-gradient(135deg,var(--b),var(--bh));color:#fff;box-shadow:0 2px 10px rgba(99,91,255,.3)}',
    '.sf-action-btn.sf-primary:hover{box-shadow:0 4px 16px rgba(99,91,255,.4)}',
    '.sf-action-btn.sf-secondary{background:rgba(255,255,255,.07);color:var(--t);border:1px solid var(--bo)}',
    '.sf-action-btn.sf-success-btn{background:linear-gradient(135deg,var(--ok),#28b983);color:#fff;box-shadow:0 2px 10px rgba(52,211,153,.25)}',
    '.sf-input-area{padding:14px 16px 18px;background:var(--bg);border-top:1px solid var(--bo);flex-shrink:0}',
    '.sf-input-wrapper{display:flex;align-items:flex-end;gap:8px;background:var(--ib);border-radius:22px;padding:5px 5px 5px 18px;border:1.5px solid var(--bo);transition:border-color .25s,box-shadow .25s}',
    '.sf-input-wrapper:focus-within{border-color:var(--b);box-shadow:0 0 0 3px var(--glow)}',
    '.sf-input{flex:1;background:none;border:none;color:var(--t);font-size:13.5px;padding:8px 0;resize:none;outline:none;font-family:inherit;max-height:80px;line-height:1.45}',
    '.sf-input::placeholder{color:#555a70}',
    '.sf-send-btn{width:36px;height:36px;border-radius:50%;border:none;background:linear-gradient(135deg,var(--b),var(--bh));color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s,box-shadow .2s;box-shadow:0 2px 8px rgba(99,91,255,.3)}',
    '.sf-send-btn:hover{transform:scale(1.05);box-shadow:0 4px 14px rgba(99,91,255,.45)}',
    '.sf-send-btn:active{transform:scale(.95)}',
    '.sf-send-btn:disabled{background:#333;box-shadow:none;cursor:not-allowed}',
    '.sf-send-btn svg{width:16px;height:16px;fill:#fff}',
    '.sf-input-hint{font-size:10.5px;color:#4a4e64;margin-top:7px;text-align:center;letter-spacing:.2px}',
    '.sf-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(90px);background:var(--cb);color:var(--t);padding:12px 22px;border-radius:10px;font-size:13px;border:1px solid var(--bo);box-shadow:0 8px 32px rgba(0,0,0,.45);z-index:2147483647;transition:transform .45s cubic-bezier(.16,1,.3,1),opacity .35s ease;opacity:0;pointer-events:none;backdrop-filter:blur(8px)}',
    '.sf-toast.sf-visible{transform:translateX(-50%) translateY(0);opacity:1}',
    '.sf-toast.sf-toast-success{border-left:3px solid var(--ok)}',
    '.sf-toast.sf-toast-error{border-left:3px solid var(--err)}',
    '.sf-settings-overlay{position:absolute;inset:0;background:rgba(13,15,23,.88);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:10;animation:sfFadeIn .25s ease}',
    '@keyframes sfFadeIn{from{opacity:0}to{opacity:1}}',
    '.sf-settings-panel{background:var(--cb);border:1px solid var(--bo);border-radius:16px;padding:24px;width:calc(100% - 32px);max-width:320px;box-shadow:0 16px 48px rgba(0,0,0,.5)}',
    '.sf-settings-panel h4{font-size:15px;font-weight:700;margin-bottom:18px;color:#fff;letter-spacing:.3px}',
    '.sf-settings-field{margin-bottom:14px}',
    '.sf-settings-field label{display:block;font-size:11.5px;color:var(--ts);margin-bottom:5px;font-weight:500;letter-spacing:.2px}',
    '.sf-settings-field input{width:100%;padding:10px 13px;border-radius:10px;border:1.5px solid var(--bo);background:var(--ib);color:var(--t);font-size:13px;outline:none;transition:border-color .2s}',
    '.sf-settings-field input:focus{border-color:var(--b)}',
    '.sf-settings-field select{width:100%;padding:10px 13px;border-radius:10px;border:1.5px solid var(--bo);background:var(--ib);color:var(--t);font-size:13px;outline:none;transition:border-color .2s;cursor:pointer}',
    '.sf-settings-field select:focus{border-color:var(--b)}',
    '.sf-settings-save{width:100%;padding:11px;background:linear-gradient(135deg,var(--b),var(--bh));color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;margin-top:10px;transition:opacity .2s,transform .1s}',
    '.sf-settings-save:hover{opacity:.88}',
    '.sf-settings-save:active{transform:scale(.98)}',
    '.sf-settings-test{width:100%;padding:9px;background:rgba(255,255,255,.07);color:var(--t);border:1px solid var(--bo);border-radius:10px;font-size:12px;font-weight:500;cursor:pointer;margin-top:6px;transition:background .2s}',
    '.sf-settings-test:hover{background:rgba(255,255,255,.12)}',
    '.sf-settings-section{font-size:11px;font-weight:700;color:var(--bh);letter-spacing:.5px;text-transform:uppercase;margin-bottom:10px;margin-top:4px}',
    '.sf-settings-divider{height:1px;background:var(--bo);margin:14px 0}',
    '.sf-connection-status{padding:8px 12px;border-radius:8px;font-size:11.5px;margin-bottom:10px;font-weight:500}',
    '.sf-connection-status.sf-connected{background:rgba(52,211,153,.12);color:var(--ok);border-left:3px solid var(--ok)}',
    '.sf-connection-status.sf-disconnected{background:rgba(248,113,113,.12);color:var(--err);border-left:3px solid var(--err)}',
    '.sf-connection-status.sf-testing{background:rgba(255,255,255,.06);color:var(--ts)}'
  ].join('\n');

  // ─── HTML ─────────────────────────────────────────────────────
  var HTML =
    '<button class="sf-toggle" id="sfToggle" title="Toggle"><svg class="sf-toggle-icon" viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></button>' +
    '<div class="sf-header">' +
      '<div class="sf-header-left">' +
        '<svg class="sf-logo" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">' +
          '<defs>' +
            '<linearGradient id="sfLogoGrad" x1="0" y1="0" x2="1" y2="1">' +
              '<stop offset="0%" stop-color="#7b73ff"/>' +
              '<stop offset="100%" stop-color="#4a44db"/>' +
            '</linearGradient>' +
          '</defs>' +
          '<circle cx="16" cy="16" r="15" fill="url(#sfLogoGrad)" opacity=".15"/>' +
          '<path d="M18.5 5L9 17.5h5.5l-1 9.5L23 14.5h-5.5l1-9.5z" fill="url(#sfLogoGrad)" stroke="#7b73ff" stroke-width=".7" stroke-linejoin="round"/>' +
        '</svg>' +
        '<h3>AI Flow Builder</h3></div>' +
      '<div class="sf-header-controls">' +
        '<button class="sf-header-btn" id="sfSettingsBtn" title="Settings">' +
          '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.36.36 0 00.12-.61l-1.92-3.32a.484.484 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.484.484 0 00-.59.22L2.74 8.87a.36.36 0 00.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.36.36 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg></button>' +
        '<button class="sf-header-btn" id="sfCollapseBtn" title="Collapse">' +
          '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>' +
      '</div></div>' +
    '<div class="sf-context" id="sfContext">' +
      '<span class="sf-context-badge" id="sfContextObject">Detecting...</span>' +
      '<span class="sf-context-dot"></span>' +
      '<span id="sfContextPage">Page...</span></div>' +
    '<div class="sf-chat" id="sfChat">' +
      '<div class="sf-msg sf-ai"><div class="sf-msg-avatar">AI</div><div class="sf-msg-bubble"><strong>Olá! Assistente de automação Salesforce.</strong><br><br>Descreva o Flow que deseja e eu gero o XML pronto.<br><br><em>Ex: "&quot;Criar uma task quando um Lead é criado&quot;</em></div></div>' +
    '</div>' +
    '<div class="sf-input-area">' +
      '<div class="sf-input-wrapper">' +
        '<textarea class="sf-input" id="sfInput" placeholder="Descreva a automação..." rows="1"></textarea>' +
        '<button class="sf-send-btn" id="sfSendBtn" title="Enviar"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>' +
      '</div>' +
      '<div class="sf-input-hint">Enter para enviar · Shift+Enter nova linha</div>' +
    '</div>' +
    '<div class="sf-settings-overlay" id="sfSettings" style="display:none;">' +
      '<div class="sf-settings-panel">' +
        '<h4>Configurações</h4>' +
        '<div class="sf-settings-section">Backend</div>' +
        '<div class="sf-settings-field"><label>Backend URL</label><input type="url" id="sfBackendUrl" placeholder="http://localhost:3000"></div>' +
        '<div class="sf-settings-field"><label>API Key (opcional)</label><input type="password" id="sfApiKey" placeholder="sk-or-v1-..."></div>' +
        '<div class="sf-settings-divider"></div>' +
        '<div class="sf-settings-section">Conectar Salesforce</div>' +
        '<div class="sf-settings-field"><label>Username</label><input type="text" id="sfSfUsername" placeholder="seu@email.com"></div>' +
        '<div class="sf-settings-field"><label>Password + Security Token</label><input type="password" id="sfSfPassword" placeholder="senha + token"></div>' +
        '<div class="sf-settings-field"><label>Domínio</label><select id="sfSfDomain"><option value="login">Produção (login.salesforce.com)</option><option value="test">Sandbox (test.salesforce.com)</option></select></div>' +
        '<div id="sfSfConnectionStatus" class="sf-connection-status" style="display:none;"></div>' +
        '<button class="sf-settings-save" id="sfSettingsSave">Salvar Configurações</button>' +
        '<button class="sf-settings-test" id="sfTestConnection">Testar Conexão</button>' +
      '</div>' +
    '</div>' +
    '<div class="sf-toast" id="sfToast"></div>';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForDOM);
  } else {
    waitForDOM();
  }
})();
