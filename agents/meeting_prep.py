from utils.sf_client import get_sf_client
from utils.ai_client import ask_ai


def prep_meeting(contact_id):
    sf = get_sf_client()

    contact = sf.Contact.get(contact_id)

    # Fetch account name instead of showing raw AccountId
    account_name = 'N/A'
    if contact.get('AccountId'):
        try:
            account = sf._get_object('Account', contact['AccountId'])
            account_name = account.get('Name', contact['AccountId'])
        except Exception:
            account_name = contact['AccountId']

    opps = sf.query(f'''
        SELECT Name, StageName, Amount, CloseDate
        FROM Opportunity
        WHERE AccountId = '{contact.get('AccountId', '')}'
        AND IsClosed = false
        LIMIT 5
    ''')['records']

    tasks = sf.query(f'''
        SELECT Subject, Status, Priority, CreatedDate
        FROM Task
        WHERE WhoId = '{contact_id}'
        ORDER BY CreatedDate DESC
        LIMIT 5
    ''')['records']

    prompt = f'''
    Crie um briefing de reuniao com este contato:

    CONTATO: {contact.get('Name')} - {contact.get('Title', 'N/A')} na {account_name}
    Email: {contact.get('Email', 'N/A')}
    Telefone: {contact.get('Phone', 'N/A')}

    OPORTUNIDADES ABERTAS:
    {[(o['Name'], o['StageName'], o.get('Amount')) for o in opps]}

    ATIVIDADES RECENTES:
    {[(t['Subject'], t['Status'], t['Priority']) for t in tasks]}

    Faca:
    1. Resumo executivo do contexto
    2. 3-5 talking points sugeridos
    3. Sugestao de proximo passo
    4. Possiveis objeceoes e como contorna-las
    '''

    briefing = ask_ai(prompt, system='Voce e um especialista em vendas B2B.')

    print('\n' + '=' * 60)
    print(f'  BRIEFING - {contact.get("Name", "")}')
    print('=' * 60)
    print(briefing)
    print('=' * 60 + '\n')
    return briefing
