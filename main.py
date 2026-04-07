import sys
from utils.config import load_env_for_app

load_env_for_app()

from dotenv import load_dotenv
load_dotenv()


def show_menu():
    print('\n Salesforce AI Agent')
    print('-' * 30)
    print('1. Score de Leads (Lead Scoring)')
    print('2. Preparar Reuniao (Meeting Prep)')
    print('3. Criar Flow no Salesforce (Flow Builder)')
    print('4. Sair')
    return input('\nEscolha: ').strip()


def main():
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

        elif choice == '3':
            import importlib
            import agents.flow_builder as fb
            importlib.reload(fb)
            desc = input('\nDescreva o fluxo que voce quer criar (ex: "Quando um Lead e criado, enviar email pro gerente e criar uma task"): ').strip()
            fb.build_flow(desc)

        elif choice == '4':
            print('Ate logo!')
            break

        else:
            print('Opcao invalida.')


if __name__ == '__main__':
    main()
