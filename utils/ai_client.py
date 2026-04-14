from openai import OpenAI
import os


def _get_client():
    """Create an OpenAI client reading env vars at call time."""
    kwargs = {'api_key': os.environ.get('OPENAI_API_KEY', '')}
    base_url = os.environ.get('OPENAI_BASE_URL', '')
    if base_url:
        kwargs['base_url'] = base_url
    return OpenAI(**kwargs)


def ask_ai(prompt, system='You are a helpful sales assistant.'):
    client = _get_client()
    model = os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')
    response = client.chat.completions.create(
        model=model,
        messages=[
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': prompt},
        ],
        temperature=0.7,
    )
    return response.choices[0].message.content


def ask_ai_code(prompt, system='You are a helpful sales assistant.'):
    """Version for code/JSON generation with lower temperature."""
    client = _get_client()
    model = os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')
    response = client.chat.completions.create(
        model=model,
        messages=[
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': prompt},
        ],
        temperature=0.2,
    )
    return response.choices[0].message.content
