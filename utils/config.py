"""Credential and configuration management for Salesforce AI Agent."""
import os
import json
import pathlib
import shutil
from dotenv import set_key

# Config file location - user home directory
CONFIG_DIR = pathlib.Path.home() / '.salesforce-ai-agent'
CONFIG_FILE = CONFIG_DIR / 'config.json'

# Old directory name (had typo with double 's') — kept for migration only
_OLD_CONFIG_DIR = pathlib.Path.home() / '.salessforce-ai-agent'
_OLD_CONFIG_FILE = _OLD_CONFIG_DIR / 'config.json'

DEFAULT_SALESFORCE_DOMAIN = 'login'
DEFAULT_AI_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free'
DEFAULT_AI_BASE_URL = 'https://openrouter.ai/api/v1'


def _ensure_config_dir():
    """Create config directory if it doesn't exist, migrating old typo dir if needed."""
    os.makedirs(CONFIG_DIR, exist_ok=True)
    # Migrate from old typo directory if needed
    if _OLD_CONFIG_FILE.exists() and not CONFIG_FILE.exists():
        shutil.copy2(str(_OLD_CONFIG_FILE), str(CONFIG_FILE))


def get_config():
    """Load configuration from file, then fallback to .env."""
    _ensure_config_dir()

    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)

    # Fallback to legacy .env
    config = {}
    env_file = pathlib.Path(__file__).parent.parent / '.env'
    if env_file.exists():
        from dotenv import dotenv_values
        env_vals = dotenv_values(str(env_file))
        config['salesforce_username'] = env_vals.get('SALESFORCE_USERNAME', '')
        config['salesforce_password'] = env_vals.get('SALESFORCE_PASSWORD', '')
        config['salesforce_token'] = env_vals.get('SALESFORCE_TOKEN', '')
        config['salesforce_domain'] = env_vals.get('SALESFORCE_DOMAIN', DEFAULT_SALESFORCE_DOMAIN)
        config['ai_api_key'] = env_vals.get('OPENAI_API_KEY', '')
        config['ai_base_url'] = env_vals.get('OPENAI_BASE_URL', DEFAULT_AI_BASE_URL)
        config['ai_model'] = env_vals.get('OPENAI_MODEL', DEFAULT_AI_MODEL)

    return config


def save_config(config):
    """Save configuration to file and .env files."""
    _ensure_config_dir()

    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

    # Also update .env for backward compatibility
    env_file = pathlib.Path(__file__).parent.parent / '.env'
    if env_file.exists():
        set_key(str(env_file), 'SALESFORCE_USERNAME', config.get('salesforce_username', ''))
        set_key(str(env_file), 'SALESFORCE_PASSWORD', config.get('salesforce_password', ''))
        set_key(str(env_file), 'SALESFORCE_TOKEN', config.get('salesforce_token', ''))
        set_key(str(env_file), 'SALESFORCE_DOMAIN', config.get('salesforce_domain', DEFAULT_SALESFORCE_DOMAIN))
        set_key(str(env_file), 'OPENAI_API_KEY', config.get('ai_api_key', ''))
        set_key(str(env_file), 'OPENAI_BASE_URL', config.get('ai_base_url', DEFAULT_AI_BASE_URL))
        set_key(str(env_file), 'OPENAI_MODEL', config.get('ai_model', DEFAULT_AI_MODEL))

    return True


def load_env_for_app():
    """Load env vars from config for the rest of the app to use."""
    config = get_config()
    os.environ['SALESFORCE_USERNAME'] = config.get('salesforce_username', '')
    os.environ['SALESFORCE_PASSWORD'] = config.get('salesforce_password', '')
    os.environ['SALESFORCE_TOKEN'] = config.get('salesforce_token', '')
    os.environ['SALESFORCE_DOMAIN'] = config.get('salesforce_domain', DEFAULT_SALESFORCE_DOMAIN)
    os.environ['OPENAI_API_KEY'] = config.get('ai_api_key', '')
    os.environ['OPENAI_BASE_URL'] = config.get('ai_base_url', DEFAULT_AI_BASE_URL)
    os.environ['OPENAI_MODEL'] = config.get('ai_model', DEFAULT_AI_MODEL)
