from openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv()

client_kwargs = {'api_key': os.getenv('OPENAI_API_KEY')}
base_url = os.getenv('OPENAI_BASE_URL')
if base_url:
    client_kwargs['base_url'] = base_url

ai_client = OpenAI(**client_kwargs)
MODEL = os.getenv('OPENAI_MODEL', 'gpt-4o-mini')


def ask_ai(prompt, system='You are a helpful sales assistant.'):
    response = ai_client.chat.completions.create(
        model=MODEL,
        messages=[
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': prompt},
        ],
        temperature=0.7,
    )
    return response.choices[0].message.content


def ask_ai_code(prompt, system='You are a helpful sales assistant.'):
    """Version for code/JSON generation with lower temperature."""
    response = ai_client.chat.completions.create(
        model=MODEL,
        messages=[
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': prompt},
        ],
        temperature=0.2,
    )
    return response.choices[0].message.content
