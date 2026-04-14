"""Professional CLI for Salesforce AI Agent."""
from utils.config import get_config, save_config, load_env_for_app


def show_setup_wizard():
    """Interactive setup wizard for credentials."""
    print('\n Salesforce AI Agent - Setup')
    print('=' * 40)
    print()

    config = get_config()

    print('Salesforce Credentials:')
    username = input(f'  Email [{config.get("salesforce_username", "")}]: ').strip() or config.get('salesforce_username', '')
    password = input(f'  Password [{mask(config.get("salesforce_password", ""))}]: ').strip() or config.get('salesforce_password', '')
    token = input(f'  Security Token [{mask(config.get("salesforce_token", ""))}]: ').strip() or config.get('salesforce_token', '')
    domain = input(f'  Domain (login/test) [{config.get("salesforce_domain", "login")}]: ').strip() or config.get('salesforce_domain', 'login')

    print()
    print('AI Provider Credentials:')
    ai_key = input(f'  AI API Key [{mask(config.get("ai_api_key", ""))}]: ').strip() or config.get('ai_api_key', '')
    ai_url = input(f'  AI Base URL [{config.get("ai_base_url", "https://openrouter.ai/api/v1")}]: ').strip() or config.get('ai_base_url', 'https://openrouter.ai/api/v1')
    ai_model = input(f'  AI Model [{config.get("ai_model", "nvidia/nemotron-3-super-120b-a12b:free")}]: ').strip() or config.get('ai_model', 'nvidia/nemotron-3-super-120b-a12b:free')

    new_config = {
        'salesforce_username': username,
        'salesforce_password': password,
        'salesforce_token': token,
        'salesforce_domain': domain,
        'ai_api_key': ai_key,
        'ai_base_url': ai_url,
        'ai_model': ai_model,
    }

    save_config(new_config)
    print('\n Configuration saved!')
    return new_config


def mask(value):
    """Mask sensitive values for display."""
    if not value:
        return ''
    return value[:4] + '*' * (len(value) - 4) if len(value) > 4 else '****'


def show_menu():
    """Show main menu and return choice."""
    print('\n Salesforce AI Agent')
    print('-' * 40)
    print('1. Score de Leads (Lead Scoring)')
    print('2. Preparar Reuniao (Meeting Prep)')
    print('3. Criar Flow no Salesforce (Flow Builder)')
    print('4. Configurar Credenciais')
    print('5. Sair')
    return input('\nEscolha: ').strip()


def main():
    """Main CLI entry point."""
    # Load configuration
    load_env_for_app()
    config = get_config()

    # Check if credentials are configured
    if not config.get('salesforce_username') or not config.get('ai_api_key'):
        print(' Credenciais nao configuradas. Vamos configurar!')
        show_setup_wizard()
        load_env_for_app()

    while True:
        choice = show_menu()

        if choice == '1':
            from agents.lead_scorer import score_leads
            n = input('Quantos leads avaliar? (default 20): ').strip() or '20'
            score_leads(limit=int(n))

        elif choice == '2':
            from agents.meeting_prep import prep_meeting
            cid = input('ID do Contact: ').strip()
            prep_meeting(cid)

        elif choice == '4':
            show_setup_wizard()
            load_env_for_app()

        elif choice == '3':
            from agents.flow_builder import build_flow
            desc = input('\nDescreva o fluxo que voce quer criar (ex: "Quando um Lead e criado, criar uma Task automaticamente"): ').strip()
            result = build_flow(desc)
            if result.get('status') == 'success':
                print(f"\n Flow criado com sucesso: {result['flow_name']}")

        elif choice == '5':
            print('Ate logo!')
            break

        else:
            print('Opcao invalida.')


if __name__ == '__main__':
    main()
