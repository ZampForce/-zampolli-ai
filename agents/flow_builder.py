import html
import json
import os
import re
import shutil
import subprocess
import tempfile
from utils.sf_client import get_sf_client
from utils.ai_client import ask_ai_code

# Valid Salesforce object names
VALID_OBJECTS = ['Lead', 'Contact', 'Account', 'Opportunity', 'Case', 'Task', 'Event', 'Campaign', 'Quote']


def validate_object_name(raw_name):
    """Extract a valid object name from AI response."""
    raw = raw_name.strip()
    raw = re.sub(r'["`\[\],]+', '', raw).strip()
    for obj in VALID_OBJECTS:
        if obj.lower() in raw.lower():
            return obj
    return 'Lead'


def get_object_fields(object_name):
    """Busca todos os campos de um objeto Salesforce via REST describe."""
    sf = get_sf_client()
    try:
        schema = sf.describe(object_name)
        fields = schema.get('fields', [])
        usable_fields = []
        for f in fields:
            if not f.get('calculated') and not f.get('deprecatedAndHidden'):
                usable_fields.append({
                    'name': f['name'],
                    'label': f.get('label', ''),
                    'type': f.get('type', 'string'),
                    'creatable': f.get('createable', False),
                    'updateable': f.get('updateable', False),
                })
        return {'object_name': object_name, 'fields': usable_fields}
    except Exception as e:
        raise Exception(f"Objeto '{object_name}' nao encontrado: {e}")


def detect_missing_fields(spec, available_fields):
    """Detectar campos customizados faltando. Ignora standard fields."""
    existing = {f['name'] for f in available_fields}
    standard_fields = {
        'Id', 'Name', 'OwnerId', 'CreatedDate', 'CreatedById',
        'LastModifiedDate', 'LastModifiedById', 'IsDeleted', 'SystemModstamp',
        'Subject', 'Status', 'Priority', 'Description', 'ActivityDate',
        'WhoId', 'WhatId', 'Type', 'RecordTypeId',
    }
    missing = []

    for action in spec.get('actions', []):
        obj = action.get('object', '')
        values = action.get('values', {})
        trigger_objs = spec.get('trigger_object', '').lower() if isinstance(spec.get('trigger_object'), str) else ''
        if obj.lower() != trigger_objs:
            continue
        used_fields = list(values.keys()) if isinstance(values, dict) else []
        for field_name in used_fields:
            if field_name in standard_fields:
                continue
            if field_name.endswith('__c') and field_name not in existing:
                missing.append({
                    'object': obj,
                    'field_name': field_name,
                    'type': _infer_field_type(field_name, values.get(field_name, '') if isinstance(values, dict) else ''),
                    'label': _camel_to_spaces(field_name),
                })
    return missing


def _infer_field_type(field_name, value):
    """Infer Salesforce field type from value."""
    if 'date' in field_name.lower():
        return 'Date'
    if 'email' in field_name.lower():
        return 'Email'
    if 'phone' in field_name.lower():
        return 'Phone'
    if 'amount' in field_name.lower() or 'price' in field_name.lower():
        return 'Currency'
    if 'number' in field_name.lower() or '_count' in field_name.lower():
        return 'Number'
    if isinstance(value, (int, float)):
        return 'Number'
    return 'Text'


def _camel_to_spaces(name):
    """Convert CamelCase to spaces."""
    s = re.sub(r'__c$', '', name)
    s = re.sub(r'([a-z])([A-Z])', r'\1 \2', s)
    return s.title()


def build_sfdx_deploy_package(flow_xml, flow_name, custom_fields=None):
    """Cria o pacote de deploy no formato que o SFDX espera."""
    flow_name_clean = re.sub(r'[^a-zA-Z0-9_]', '', flow_name)

    temp_dir = tempfile.mkdtemp()
    flows_dir = os.path.join(temp_dir, 'flows')
    os.makedirs(flows_dir, exist_ok=True)

    with open(os.path.join(flows_dir, f'{flow_name_clean}.flow-meta.xml'), 'w', encoding='utf-8') as f:
        f.write(flow_xml)

    if custom_fields:
        for cf in custom_fields:
            obj = cf.get('object', 'Lead')
            fname = cf['field_name']
            if not fname.endswith('__c'):
                fname_safe = fname.replace('_', '').lower() + '__c'
            else:
                fname_safe = fname.replace('__c', '')

            fields_dir = os.path.join(temp_dir, 'objects', obj, 'fields')
            os.makedirs(fields_dir, exist_ok=True)

            sf_type = cf.get('type', 'Text')
            field_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>{obj}.{cf['field_name']}</fullName>
    <label>{cf['label']}</label>
    <type>{sf_type}</type>
</CustomField>"""
            with open(os.path.join(fields_dir, f'{fname_safe}.field-meta.xml'), 'w', encoding='utf-8') as f:
                f.write(field_xml)

    with open(os.path.join(temp_dir, 'package.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        f.write('<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n')
        f.write(f'    <types><members>{flow_name_clean}</members><name>Flow</name></types>\n')
        if custom_fields:
            for cf in custom_fields:
                obj = cf.get('object', 'Lead')
                f.write(f'    <types><members>{obj}.{cf["field_name"]}</members><name>CustomField</name></types>\n')
        f.write('    <version>59.0</version>\n')
        f.write('</Package>')

    return temp_dir


def find_sf_cmd():
    """Find the sf CLI command."""
    sfdx_paths = [
        r'C:\Program Files\Salesforce CLI\sf\bin',
        r'C:\Program Files (x86)\Salesforce CLI\sf\bin',
        os.path.expandvars(r'%PROGRAMFILES%\Salesforce CLI\sf\bin'),
        os.path.expandvars(r'%LOCALAPPDATA%\Programs\Salesforce CLI\bin'),
    ]
    for p in sfdx_paths:
        if os.path.isdir(p) and p not in os.environ.get('PATH', ''):
            os.environ['PATH'] = p + os.pathsep + os.environ.get('PATH', '')

    for candidate in ['sf', 'sf.cmd']:
        try:
            result = subprocess.run([candidate, '--version'], capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                print(f"SFDX versao: {result.stdout.strip()}")
                return candidate
        except FileNotFoundError:
            continue
    return None


def sfdx_login(sf_cmd):
    """Login via SFDX. Returns True if already authenticated or login succeeds."""
    sf_username = os.environ.get('SALESFORCE_USERNAME', '')
    try:
        check = subprocess.run(
            [sf_cmd, 'org', 'list'],
            capture_output=True, text=True, timeout=30,
        )
        output = str(check.stdout)
        if 'ai-agent-org' in output or (sf_username and sf_username in output):
            print("Sessao SFDX ativa, pulando login.")
            return True
    except Exception:
        pass

    domain = os.environ.get('SALESFORCE_DOMAIN', 'login')
    instance_url = f'https://{domain}.salesforce.com'
    print("\nAutenticando com SFDX...")
    try:
        result = subprocess.run(
            [sf_cmd, 'org', 'login', 'web', '--alias', 'ai-agent-org', '--instance-url', instance_url],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode == 0:
            print("Login efetuado com sucesso!")
            return True
        else:
            print("Login nao concluido. Faca login manual no navegador.")
            return False
    except subprocess.TimeoutExpired:
        print("Login expirado. Faca: sf org login web")
        return False


def sfdx_deploy(sf_cmd, temp_dir):
    """Deploy via SFDX CLI."""
    print("\nFazendo deploy via SFDX...")
    print(f"Pacote: {os.listdir(temp_dir)}")

    deploy_result = subprocess.run(
        [sf_cmd, 'project', 'deploy', 'start', '--target-org', 'ai-agent-org', '--metadata-dir', temp_dir],
        capture_output=True, text=False, timeout=300,
    )

    stdout = deploy_result.stdout.decode('utf-8', errors='replace')
    stderr = deploy_result.stderr.decode('utf-8', errors='replace')

    print(f"\n{stdout}")
    if stderr:
        print(f"Erro: {stderr}")

    return deploy_result.returncode == 0, stdout, stderr


def build_flow_xml(trigger_object, flow_name, flow_label, actions=None):
    """Build Flow XML dynamically from AI-generated spec."""
    trigger_obj = trigger_object or 'Lead'
    try:
        sf = get_sf_client()
        sf.describe(trigger_obj)
    except Exception:
        trigger_obj = 'Lead'

    # Filter to create_record actions; fallback to default Task creation if none
    create_actions = [a for a in (actions or []) if a.get('type') == 'create_record']
    if not create_actions:
        create_actions = [{
            'type': 'create_record',
            'object': 'Task',
            'values': {'Subject': 'Follow up', 'Status': 'NotStarted'},
            'description': 'Create Task',
        }]

    # Build recordCreates blocks
    record_creates_blocks = []
    for i, action in enumerate(create_actions):
        node_name = f"CreateRecord_{i}"
        obj = action.get('object', 'Task')
        values = action.get('values', {})
        label = action.get('description', f'Create {obj}')

        assignments = ''
        if isinstance(values, dict):
            for field, value in values.items():
                safe_val = html.escape(str(value))
                assignments += f"""
        <inputAssignments>
            <field>{field}</field>
            <value>
                <stringValue>{safe_val}</stringValue>
            </value>
        </inputAssignments>"""

        connector = ''
        if i < len(create_actions) - 1:
            next_name = f"CreateRecord_{i + 1}"
            connector = f"""
        <connector>
            <targetReference>{next_name}</targetReference>
        </connector>"""

        record_creates_blocks.append(
            f"    <recordCreates>\n"
            f"        <name>{node_name}</name>\n"
            f"        <label>{label}</label>\n"
            f"        <locationX>{176 + i * 200}</locationX>\n"
            f"        <locationY>198</locationY>\n"
            f"        <object>{obj}</object>"
            f"{assignments}"
            f"{connector}\n"
            f"        <storeOutputAutomatically>true</storeOutputAutomatically>\n"
            f"    </recordCreates>"
        )

    record_creates_xml = '\n'.join(record_creates_blocks)
    first_node = 'CreateRecord_0'

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>59.0</apiVersion>
    <description>Criado automaticamente pelo agente de IA</description>
    <interviewLabel>{flow_label} Interview</interviewLabel>
    <label>{flow_label}</label>
    <processMetadataValues>
        <name>BuilderType</name>
        <value>
            <stringValue>VisualBuilder</stringValue>
        </value>
    </processMetadataValues>
    <processMetadataValues>
        <name>CanvasMode</name>
        <value>
            <stringValue>AUTO_LAYOUT_CANVAS</stringValue>
        </value>
    </processMetadataValues>
    <processType>AutoLaunchedFlow</processType>
{record_creates_xml}
    <start>
        <locationX>50</locationX>
        <locationY>0</locationY>
        <connector>
            <targetReference>{first_node}</targetReference>
        </connector>
        <filterLogic>and</filterLogic>
        <object>{trigger_obj}</object>
        <recordTriggerType>Create</recordTriggerType>
        <triggerType>RecordAfterSave</triggerType>
    </start>
    <status>Active</status>
</Flow>"""
    return xml


def analyze_request(description, object_fields):
    """Usa IA para gerar especificacao do Flow."""
    prompt = f"""
You are a Salesforce Flow expert. User wants to create a flow.

USER REQUEST:
{description}

EXISTING FIELDS on {object_fields['object_name']}:
{json.dumps([f['name'] for f in object_fields['fields']], indent=2)}

Return ONLY JSON:
{{
    "flow_name": "FlowName",
    "flow_label": "Flow Label",
    "trigger_object": "{object_fields['object_name']}",
    "actions": [
        {{
            "type": "create_record",
            "object": "Task",
            "values": {{"Subject": "Ligar para o Lead", "Status": "NotStarted"}},
            "description": "Criar tarefa"
        }}
    ]
}}
"""
    response = ask_ai_code(prompt, system='Return ONLY valid JSON.')
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        match = re.search(r'```json\s*(.*?)\s*```', response, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        return {
            'flow_name': 'AutoFlow_' + re.sub(r'[^a-zA-Z]', '', description[:20]),
            'flow_label': description[:40],
            'trigger_object': object_fields['object_name'],
            'actions': [],
        }


def build_flow(description):
    """Fluxo completo: analisa org -> gera campos se necessario -> cria XML -> deploy automatico."""
    print(f"\nProcessando: '{description}'\n")

    # Step 1: Get trigger object
    spec_prompt = f"What Salesforce object? Return ONLY one object name. Request: {description}"
    raw_obj = ask_ai_code(spec_prompt, system='Return only one Salesforce object name, nothing else.').strip()
    trigger_object = validate_object_name(raw_obj)
    print(f"Objeto: {trigger_object}")

    # Step 2: Get ALL fields
    print("Analisando org...")
    object_fields = get_object_fields(trigger_object)
    print(f"Campos encontrados: {len(object_fields['fields'])} em {object_fields['object_name']}")

    # Step 3: Analyze request and generate spec
    spec = analyze_request(description, object_fields)

    # Step 4: Validate object in spec
    spec_obj = spec.get('trigger_object', trigger_object)
    trigger_object = validate_object_name(spec_obj)
    print(f"\nObjeto validado: {trigger_object}")

    # Step 5: Detect missing fields
    missing = detect_missing_fields(spec, object_fields['fields'])
    if missing:
        print(f"\nCampos necessarios nao encontrados ({len(missing)}):")
        for f in missing:
            print(f"  - {f['field_name']} ({f['type']})")
    else:
        print("\nTodos os campos necessarios ja existem.")

    # Step 6: Build Flow XML dynamically from AI spec
    flow_name = spec.get('flow_name', 'AutoFlow_' + re.sub(r'[^a-zA-Z0-9_]', '', trigger_object))
    flow_label = spec.get('flow_label', f'Auto Flow - {trigger_object}')

    print(f"\nFlow name: {flow_name}")
    print(f"Flow label: {flow_label}")

    xml = build_flow_xml(trigger_object, flow_name, flow_label, spec.get('actions'))

    # Validate XML is well-formed
    try:
        import xml.etree.ElementTree as ET
        ET.fromstring(xml)
        print("XML valido e correto.")
    except ET.ParseError as e:
        print(f"Erro no XML: {e}")
        return {'status': 'xml_error', 'message': str(e)}

    # Step 7: Deploy via SFDX
    sf_cmd = find_sf_cmd()
    if not sf_cmd:
        print("SFDX CLI nao encontrado.")
        return {'status': 'no_sfdx'}

    if not sfdx_login(sf_cmd):
        return {'status': 'login_failed'}

    temp_dir = build_sfdx_deploy_package(xml, flow_name, custom_fields=missing)
    try:
        success, stdout, stderr = sfdx_deploy(sf_cmd, temp_dir)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    if success:
        print(f"\n=== Flow '{flow_name}' criado no Salesforce! ===")
        print("Verifique em Setup > Flows")
        return {'status': 'success', 'flow_name': flow_name}
    else:
        print(f"\nDeploy falhou. XML gerado para correcao:")
        print("=" * 60)
        print(xml)
        print("=" * 60)
        if stderr:
            print(f"\nLog de erro:\n{stderr}")
        return {'status': 'error', 'stderr': stderr, 'xml': xml}
