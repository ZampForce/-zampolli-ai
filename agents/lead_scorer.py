import json
from utils.sf_client import get_sf_client
from utils.ai_client import ask_ai
from tabulate import tabulate


def score_leads(limit=20):
    sf = get_sf_client()
    leads = sf.query(f'''
        SELECT Id, Name, Email, Company, Title, Industry, AnnualRevenue
        FROM Lead
        WHERE IsConverted = false
        LIMIT {limit}
    ''')['records']

    print(f'\nAvaliando {len(leads)} leads...\n')

    results = []
    for i, lead in enumerate(leads, 1):
        lead_data = {k: v for k, v in lead.items() if k != 'attributes'}

        prompt = f'''
        Score this lead from 0-100 based on these fields:
        {json.dumps(lead_data, indent=2)}

        Consider: completeness of data, job title seniority, company size, industry.

        Return ONLY a JSON: {{"score": 75, "reason": "short explanation", "action": "email/call/ignore"}}
        '''

        try:
            response = ask_ai(prompt, system='You are a B2B sales expert. Return valid JSON only.')
            result = json.loads(response)
        except Exception as e:
            result = {'score': 0, 'reason': f'AI error: {e}', 'action': 'review'}

        results.append({**lead_data, **result})

    ranked = sorted(results, key=lambda x: x.get('score', 0), reverse=True)
    table = [
        [r.get('Name', '?'), r.get('Company', '?'), r.get('Title', ''), r['score'], r['action']]
        for r in ranked
    ]
    print(tabulate(table, headers=['Lead', 'Empresa', 'Cargo', 'Score', 'Acao'], tablefmt='grid'))
    print()
    return ranked
