"""Salesforce AI Agent - Professional Streamlit Web Application."""
import streamlit as st
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from utils.config import get_config, save_config

st.set_page_config(
    page_title="Salesforce AI Agent",
    page_icon=":zap:",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Custom CSS ──────────────────────────────────────────────
st.markdown("""
<style>
/* Base */
:root {
    --sf-blue: #0176D3;
    --sf-dark: #032D60;
    --sf-light: #F3F3F3;
    --sf-success: #2E844A;
    --sf-warning: #DD7A01;
    --card-bg: #ffffff;
}

.stApp { background: var(--sf-light); }

/* Headers */
.section-title {
    font-size: 2rem;
    font-weight: 700;
    color: var(--sf-dark);
    margin-bottom: 0.25rem;
}
.section-subtitle {
    font-size: 1rem;
    color: #747474;
    margin-bottom: 1.5rem;
}

/* Cards */
.feature-card {
    background: white;
    border: 1px solid #E5E5E5;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    transition: box-shadow 0.2s;
}
.feature-card:hover {
    box-shadow: 0 4px 12px rgba(1,118,211,0.12);
}
.card-title {
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--sf-dark);
    margin-bottom: 0.5rem;
}
.card-desc {
    font-size: 0.9rem;
    color: #555;
    line-height: 1.5;
}
.card-tag {
    display: inline-block;
    background: #EBF4FC;
    color: var(--sf-blue);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 14px;
    margin-top: 8px;
}

/* Sidebar */
[data-testid="stSidebar"] {
    background: var(--sf-dark) !important;
}
[data-testid="stSidebar"] .stMarkdown h1,
[data-testid="stSidebar"] .stMarkdown p {
    color: #ffffff !important;
}
.sidebar-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 268px;
    padding: 16px;
    color: rgba(255,255,255,0.5) !important;
    font-size: 0.75rem;
}

/* Metric override */
.css-16idsys p, .stMetric label, .stMetric value, .stMetric p {
    background: transparent !important;
    color: white !important;
}

/* Button */
.stButton>button {
    border-radius: 8px !important;
    font-weight: 600 !important;
}

/* Hide streamlit footer */
footer { visibility: hidden !important; }
footer:after { visibility: hidden !important; }
</style>
""", unsafe_allow_html=True)

# ── Session State ───────────────────────────────────────────
if "page" not in st.session_state:
    st.session_state.page = "dashboard"


def nav_to(page):
    st.session_state.page = page


# ── Config ─────────────────────────────────────────────────
def init_env():
    config = get_config()
    os.environ['SALESFORCE_USERNAME'] = config.get('salesforce_username', '')
    os.environ['SALESFORCE_PASSWORD'] = config.get('salesforce_password', '')
    os.environ['SALESFORCE_TOKEN'] = config.get('salesforce_token', '')
    os.environ['SALESFORCE_DOMAIN'] = config.get('salesforce_domain', 'login')
    os.environ['OPENAI_API_KEY'] = config.get('ai_api_key', '')
    os.environ['OPENAI_BASE_URL'] = config.get('ai_base_url', 'https://openrouter.ai/api/v1')
    os.environ['OPENAI_MODEL'] = config.get('ai_model', 'qwen/qwen3.6-plus:free')
    init_env.has_creds = bool(
        os.environ['SALESFORCE_USERNAME'] and os.environ['OPENAI_API_KEY']
    )

init_env()

# ── Sidebar ────────────────────────────────────────────────
with st.sidebar:
    st.markdown(
        """<div style="padding:12px 0 20px 0;">
            <span style="font-size:1.25rem;font-weight:700;color:#fff;">SF</span>
            <span style="font-size:1.25rem;font-weight:600;color:#1AB2FF;"> Agent</span>
        </div>""",
        unsafe_allow_html=True,
    )

    pages = [
        ("dashboard", "Dashboard"),
        ("flow-builder", ":wrench: Flow Builder"),
        ("lead-scoring", ":bar_chart: Lead Scoring"),
        ("meeting-prep", ":calendar: Meeting Prep"),
        ("settings", ":gear: Configuracoes"),
    ]

    st.markdown("<div style='color:rgba(255,255,255,0.4);font-size:0.75rem;margin-bottom:8px;'>MENU</div>", unsafe_allow_html=True)

    for key, label in pages:
        clicked = st.button(
            label,
            key=f"nav_{key}",
            use_container_width=True,
            type="primary" if st.session_state.page == key else "secondary",
        )
        if clicked:
            nav_to(key)

    st.markdown("<div style='margin-top:auto;padding-top:24px;color:rgba(255,255,255,0.3);font-size:0.7rem;'>v0.1.0 &copy; 2025</div>", unsafe_allow_html=True)

    if init_env.has_creds:
        st.markdown(f"<div style='color:#8BE04F;font-size:0.8rem;'>Conectado</div>", unsafe_allow_html=True)
    else:
        st.markdown("<div style='color:#FCB401;font-size:0.8rem;'>Nao configurado</div>", unsafe_allow_html=True)


# ── Page Helpers ────────────────────────────────────────────
def header(title, subtitle=""):
    st.markdown(f'<div class="section-title">{title}</div>', unsafe_allow_html=True)
    if subtitle:
        st.markdown(f'<div class="section-subtitle">{subtitle}</div>', unsafe_allow_html=True)

def feature_card(icon, title, desc, tag=""):
    st.markdown(f"""
    <div class="feature-card">
        <div class="card-title">{icon} {title}</div>
        <div class="card-desc">{desc}</div>
        {f'<span class="card-tag">{tag}</span>' if tag else ''}
    </div>""", unsafe_allow_html=True)

def check_creds():
    if not init_env.has_creds:
        st.warning("Credenciais nao configuradas. Vá para **Configuracoes** no menu lateral.")
        return False
    return True

def capture_output(func, *args, **kwargs):
    """Capture stdout from function calls."""
    import io, contextlib
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        func(*args, **kwargs)
    return buf.getvalue()


# ════════════════════════════════════════════════════════════
# DASHBOARD
# ════════════════════════════════════════════════════════════
if st.session_state.page == "dashboard":
    header("Salesforce AI Agent", "Automacao inteligente para Salesforce com Inteligencia Artificial")

    col1, col2 = st.columns(2, gap="large")
    with col1:
        feature_card(
            ":pencil:",
            "Flow Builder",
            "Crie Flows no Salesforce automaticamente a partir de descricoes em linguagem natural. O agente analisa sua org e gera o XML pronto para deploy.",
            "Automated",
        )
        feature_card(
            ":bar_chart:",
            "Lead Scoring",
            "Avalie e classifique seus leads automaticamente com IA. Receba scores baseados em dados como industria, tamanho e potencial.",
            "Intelligent",
        )
    with col2:
        feature_card(
            ":briefcase:",
            "Meeting Prep",
            "Gere briefings completos para suas reunioes com contatos Salesforce. Inclui historico, contexto e informacoes relevantes.",
            "Automated",
        )

    st.markdown("---")
    st.markdown("### Como comecar")
    steps = [
        ("1", "Configurar", "Adicione suas credenciais Salesforce e AI em Configuracoes"),
        ("2", "Selecionar", "Escolha uma funcionalidade no menu lateral"),
        ("3", "Rodar", "Descreva o que deseja e clique no botao para executar"),
    ]
    cols = st.columns(3)
    for i, (num, title, desc) in enumerate(steps):
        with cols[i]:
            st.markdown(f"""
            <div class="feature-card" style="text-align:center;">
                <div style="font-size:2rem;color:#0176D3;font-weight:800;">{num}</div>
                <div class="card-title">{title}</div>
                <div class="card-desc">{desc}</div>
            </div>""", unsafe_allow_html=True)


# ════════════════════════════════════════════════════════════
# FLOW BUILDER
# ════════════════════════════════════════════════════════════
elif st.session_state.page == "flow-builder":
    header("Flow Builder", "Crie Flows no Salesforce a partir de texto natural")

    if not check_creds():
        st.stop()

    col_left, col_right = st.columns([3, 2], gap="medium")

    with col_left:
        examples = [
            "criar uma task quando um Lead e criado",
            "quando um Opportunity e criado, notificar o gerente",
            "ao criar um Case, criar uma Task para o owner",
        ]
        desc = st.text_area(
            "Descreva o Flow",
            placeholder="Ex: Quando um Lead e criado, criar uma Task automaticamente",
            height=120,
        )

        row = st.columns(3)
        for ex in examples:
            with row[examples.index(ex)]:
                st.caption(ex)

        run_btn = st.button(
            "Gerar e Deploy do Flow",
            type="primary",
            use_container_width=True,
        )

        if run_btn:
            if not desc.strip():
                st.warning("Descreva o flow que voce quer criar.")
                st.stop()

            with st.spinner("Analisando org e gerando o Flow..."):
                try:
                    import importlib
                    import agents.flow_builder as fb
                    importlib.reload(fb)

                    result = capture_output(fb.build_flow, desc.strip())
                    st.success("Processamento concluido!")
                    st.text_area("Log de Execucao", value=result, height=400, disabled=True)
                except Exception as e:
                    st.error(f"Erro: {e}")

    with col_right:
        st.markdown("### Exemplos rapidos")
        feature_card(":pencil:", "Lead -> Task", "Quando um novo Lead é criado, criar uma Task automaticamente")
        feature_card(":email:", "Opportunity -> Email", "Quando um Opportunity é criado, enviar email pro gerente")
        feature_card(":wrench:", "Case -> Update", "When a Case is created, auto-assign based on type")


# ════════════════════════════════════════════════════════════
# LEAD SCORING
# ════════════════════════════════════════════════════════════
elif st.session_state.page == "lead-scoring":
    header("Lead Scoring", "Avalie leads automaticamente com IA")

    if not check_creds():
        st.stop()

    n_leads = st.slider("Quantos leads avaliar?", min_value=1, max_value=100, value=20, step=5)

    if st.button("Avaliar Leads", type="primary", use_container_width=True):
        with st.spinner("Analisando leads com IA..."):
            try:
                from agents.lead_scorer import score_leads
                result = capture_output(score_leads, limit=n_leads)
                st.success(f"{n_leads} leads avaliados!")
                st.text_area("Resultado", value=result, height=500, disabled=True)
            except Exception as e:
                st.error(f"Erro: {e}")


# ════════════════════════════════════════════════════════════
# MEETING PREP
# ════════════════════════════════════════════════════════════
elif st.session_state.page == "meeting-prep":
    header("Meeting Prep", "Gere briefings completos para suas reunioes")

    if not check_creds():
        st.stop()

    contact_id = st.text_input("ID do Contact", placeholder="Ex: 003xxxxxxxxxxxxxxx")

    if st.button("Preparar Briefing", type="primary", use_container_width=True):
        if not contact_id.strip():
            st.warning("Informe o ID do Contact.")
            st.stop()

        with st.spinner("Preparando briefing..."):
            try:
                from agents.meeting_prep import prep_meeting
                result = capture_output(prep_meeting, contact_id.strip())
                st.success("Briefing gerado!")
                st.text_area("Briefing", value=result, height=500, disabled=True)
            except Exception as e:
                st.error(f"Erro: {e}")


# ════════════════════════════════════════════════════════════
# SETTINGS
# ════════════════════════════════════════════════════════════
elif st.session_state.page == "settings":
    header("Configuracoes", "Credenciais de acesso ao Salesforce e AI Provider")

    config = get_config()

    st.markdown("### Salesforce")
    col1, col2 = st.columns(2)
    with col1:
        new_username = st.text_input("Email / Username", value=config.get('salesforce_username', ''))
        new_password = st.text_input("Password", value=config.get('salesforce_password', ''), type="password")
    with col2:
        new_token = st.text_input("Security Token", value=config.get('salesforce_token', ''), type="password")
        new_domain = st.selectbox(
            "Domain",
            ["login", "test"],
            index=0 if config.get('salesforce_domain', 'login') == 'login' else 1,
        )

    st.markdown("---")
    st.markdown("### AI Provider")
    col3, col4 = st.columns(2)
    with col3:
        new_ai_key = st.text_input("AI API Key", value=config.get('ai_api_key', ''), type="password")
    with col4:
        new_ai_url = st.text_input("Base URL", value=config.get('ai_base_url', 'https://openrouter.ai/api/v1'))
        new_ai_model = st.text_input("Model", value=config.get('ai_model', 'qwen/qwen3.6-plus:free'))

    if st.button("Salvar Configuracao", type="primary", use_container_width=True):
        new_config = {
            'salesforce_username': new_username,
            'salesforce_password': new_password,
            'salesforce_token': new_token,
            'salesforce_domain': new_domain,
            'ai_api_key': new_ai_key,
            'ai_base_url': new_ai_url,
            'ai_model': new_ai_model,
        }
        save_config(new_config)
        init_env()
        st.success("Configuração salva com sucesso! As credenciais foram atualizadas.")
        st.rerun()
