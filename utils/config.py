"""Credential and configuration management for Salesforce AI Agent."""
import os
import sys
import json
import pathlib
from dotenv import load_dotenv, set_key

# Config file location - user home directory
CONFIG_DIR = pathlib.Path.home() / '.salessforce-ai-agent'
CONFIG_FILE = CONFIG_DIR / 'config.json'

DEFAULT_SALESFORCE_DOMAIN = 'login'
DEFAULT_AI_MODEL = 'qwen/qwen3.6-plus:free'
DEFAULT_AI_BASE_URL = 'https://openrouter.ai/api/v1'


def _ensure_config_dir():
    """Create config directory if it doesn't exist."""
    os.makedirs(CONFIG_DIR, exist_ok=True)


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
        config['salesforce_username'] = os.getenv('SALESFORCE_USERNAME', '')
        config['salesforce_password'] = os.getenv('SALESFORCE_PASSWORD', '')
        config['salesforce_token'] = os.getenv('SALESFORCE_TOKEN', '')
        config['salesforce_domain'] = os.getenv('SALESFORCE_DOMAIN', DEFAULT_SALESFORCE_DOMAIN)
        config['ai_api_key'] = os.getenv('OPENAI_API_KEY', '')
        config['ai_base_url'] = os.getenv('OPENAI_BASE_URL', DEFAULT_AI_BASE_URL)
        config['ai_model'] = os.getenv('OPENAI_MODEL', DEFAULT_AI_MODEL)

    return config


def save_config(config):
    """Save configuration to file and .env files."""
    _ensure_config_dir()

    # Save to config.json
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

    # Also update .env for backward compatibility
    env_file = pathlib.Path(__file__).parent.parent / '.env'
    _ensure_config_dir.parent  # Ensure parent exists

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
