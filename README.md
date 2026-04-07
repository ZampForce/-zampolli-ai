# Salesforce AI Agent

Agente de Inteligencia Artificial para Salesforce que automatiza tarefas comuns:
- **Lead Scoring**: Avalia leads automaticamente com IA
- **Meeting Prep**: Gera briefings de reunioes com contatos
- **Flow Builder**: Cria Flows no Salesforce a partir de texto natural

## Instalacao

### Pre-requisitos
- Python 3.9+
- Salesforce Developer Edition ou Production org
- AI Provider API Key (OpenRouter ou OpenAI compatible)
- Salesforce CLI (sf) para Flow Builder

### Setup Rapido

```bash
# Instalar dependencias
pip install -r requirements.txt

# Instalar Salesforce CLI (Windows)
winget install Salesforce.CLI

# Rodar via CLI
python cli.py

# Rodar via Web App
streamlit run app.py
```

## Credenciais

O agente precisa de:

**Salesforce:**
- Email de login na sua org
- Senha
- Security token (Setup > My Settings > Reset Security Token)
- Domain: `login` (production/dev edition) ou `test` (sandbox)

**AI Provider:**
- API Key do OpenRouter (https://openrouter.ai)
- Base URL: `https://openrouter.ai/api/v1`
- Model: `qwen/qwen3.6-plus:free` (ou qualquer modelo compatible)

## Funcionalidades

### Lead Scoring
Analisa leads existentes no Salesforce e atribui pontuacoes baseadas em dados como industria, tamanho, etc.

### Meeting Prep
Gera briefing completo para reunioes com contatos, incluindo historico e contexto relevante.

### Flow Builder
Cria Flows no Salesforce automaticamente. Basta descrever em linguagem natural o que voce quer.

Exemplos:
- "criar uma task quando um Lead e criado"
- "enviar email quando um Opportunity e fechado"
- "atualizar status quando Case e resolvido"

## Estrutura

```
salesforce-agent/
├── cli.py              # CLI principal com setup wizard
├── app.py              # Streamlit Web App
├── main.py             # Menu antigo (legado)
├── agents/
│   ├── flow_builder.py # Flow creation engine
│   ├── lead_scorer.py  # Lead scoring engine
│   └── meeting_prep.py # Meeting briefing engine
├── utils/
│   ├── sf_client.py    # Salesforce client wrapper
│   ├── ai_client.py    # AI provider client
│   └── config.py       # Configuration management
└── requirements.txt    # Dependencies
```

## Suporte

Para problemas ou duvidas, verifique as credenciais e conectividade.
