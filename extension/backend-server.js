// ── Imports and config ───────────────────────────────────
const pathModule = require('path');
require('dotenv').config({ path: pathModule.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

app.use(helmet({
  contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:8080', 'http://localhost:3000', '*'],
  credentials: true,
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const AI_MODELS = [
  process.env.AI_MODEL || 'qwen/qwen3.6-plus:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
];
const SF_ORG_ALIAS = process.env.SF_ORG_ALIAS || 'ai-agent-org';

let currentModelIndex = 0;

function getCurrentModel() {
  return AI_MODELS[currentModelIndex % AI_MODELS.length];
}

// ── AI helpers ───────────────────────────────────────────
async function callAI(prompt) {
  const model = getCurrentModel();
  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    const error = new Error(`AI API returned ${resp.status} (${model}): ${errText}`);
    error.httpStatus = resp.status;
    error.model = model;
    throw error;
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAIWithFallback(prompt) {
  // Try current model
  try {
    return await callAI(prompt);
  } catch (err) {
    // If it's a 429 (rate limit), try the next model
    if ((err.httpStatus === 429) && AI_MODELS.length > 1) {
      console.log(`[AI Fallback] ${err.model} rate limited, switching to fallback model`);
      currentModelIndex++;
      return callAI(prompt);
    }
    throw err;
  }
}

function extractJSON(raw) {
  if (!raw) throw new Error('Empty response');
  try { return JSON.parse(raw); } catch {}
  let match = raw.match(/```json\s*([\s\S]*?)\s*```/);
  if (match) { try { return JSON.parse(match[1]); } catch {} }
  match = raw.match(/```\s*([\s\S]*?)\s*```/);
  if (match) { try { return JSON.parse(match[1]); } catch {} }
  match = raw.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  throw new Error('Could not parse JSON from AI response');
}

// ── FIELD_MAP (keyword to Salesforce field mapping) ──────
const FIELD_MAP = {
  'account': { sfObject: 'Account', fields: {
    'data': 'LastModifiedDate', 'last modific': 'LastModifiedDate', 'ultima modific': 'LastModifiedDate', 'ultima atualiz': 'LastModifiedDate', 'last updat': 'LastModifiedDate', 'atualiz': 'LastModifiedDate', 'site': 'Website', 'descri': 'Description', 'rating': 'Rating', 'industria': 'Industry', 'revenue': 'AnnualRevenue', 'phone': 'Phone', 'fax': 'Fax', 'type': 'Type',
  }},
  'contact': { sfObject: 'Contact', fields: {
    'email': 'Email', 'phone': 'Phone', 'title': 'Title', 'descri': 'Description', 'mobile': 'MobilePhone',
  }},
  'lead': { sfObject: 'Lead', fields: {
    'email': 'Email', 'phone': 'Phone', 'status': 'Status', 'company': 'Company', 'descri': 'Description', 'rating': 'Rating', 'industry': 'Industry', 'date': 'ConvertedDate',
  }},
  'opportunity': { sfObject: 'Opportunity', fields: {
    'amount': 'Amount', 'stage': 'StageName', 'close date': 'CloseDate', 'probability': 'Probability', 'descri': 'Description',
  }},
  'case': { sfObject: 'Case', fields: {
    'status': 'Status', 'priority': 'Priority', 'reason': 'Reason', 'origin': 'Origin', 'descri': 'Description', 'subject': 'Subject',
  }},
  'task': { sfObject: 'Task', fields: {
    'subject': 'Subject', 'status': 'Status', 'priority': 'Priority', 'descri': 'Description', 'date': 'ActivityDate',
  }},
};

function detectField(targetObject, keywordLower) {
  const objKey = Object.keys(FIELD_MAP).find(k => targetObject && targetObject.toLowerCase().includes(k));
  if (!objKey) return null;
  const fields = FIELD_MAP[objKey].fields;
  for (const [kw, sfField] of Object.entries(fields)) {
    if (keywordLower.includes(kw)) return sfField;
  }
  return null;
}

// ── AI-powered Flow XML generation ───────────────────────
function generateFlowXML(prompt, triggerObject) {
  // Deprecated: delegated to generateFlowWithAI()
  return '';
}

function generateUpdateFlow(prompt, triggerObj, lower) {
  return ''; // deprecated
}

function generateCreateTaskFlow(prompt, triggerObj, lower) {
  return ''; // deprecated — use generateFlowWithAI() instead
}

function escapeXML(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ── Flow XML generators ──────────────────────────────────

// Basic template fallback — builds a simple create-task Flow
function _buildSimpleFlow(prompt, triggerObject, lower) {
  const safeObj = escapeXML(triggerObject);
  const safeLabel = escapeXML(prompt.slice(0, 80) || 'Auto Flow');
  let taskSubject = 'Follow up with ' + triggerObject;
  if (lower.includes('ligar')) taskSubject = 'Ligar para o ' + triggerObject;
  else if (lower.includes('email')) taskSubject = 'Enviar email para ' + triggerObject;
  else if (lower.includes('notific')) taskSubject = 'Notificar gerente';
  else if (lower.includes('follow up') || lower.includes('acompanhar')) taskSubject = 'Follow up com ' + triggerObject;
  const safeSubject = escapeXML(taskSubject);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>59.0</apiVersion>
    <description>Created by SF AI Agent</description>
    <interviewLabel>${safeLabel} Interview</interviewLabel>
    <label>${safeLabel}</label>
    <processMetadataValues>
        <name>BuilderType</name>
        <value><stringValue>VisualBuilder</stringValue></value>
    </processMetadataValues>
    <processMetadataValues>
        <name>CanvasMode</name>
        <value><stringValue>AUTO_LAYOUT_CANVAS</stringValue></value>
    </processMetadataValues>
    <processType>AutoLaunchedFlow</processType>
    <recordCreates>
        <name>CreateTask</name>
        <label>Create Task</label>
        <locationX>176</locationX>
        <locationY>198</locationY>
        <object>Task</object>
        <inputAssignments><field>Subject</field><value><stringValue>${safeSubject}</stringValue></value></inputAssignments>
        <inputAssignments><field>Status</field><value><stringValue>NotStarted</stringValue></value></inputAssignments>
        <storeOutputAutomatically>true</storeOutputAutomatically>
    </recordCreates>
    <start>
        <locationX>50</locationX>
        <locationY>0</locationY>
        <connector><targetReference>CreateTask</targetReference></connector>
        <filterLogic>and</filterLogic>
        <object>${safeObj}</object>
        <recordTriggerType>Create</recordTriggerType>
        <triggerType>RecordAfterSave</triggerType>
    </start>
    <status>Active</status>
</Flow>`;
}

// AI-powered Flow generation — calls LLM to produce complete Flow XML
async function generateFlowWithAI(prompt, triggerObject, context) {
  const systemPrompt = `You are an expert Salesforce Flow Builder with deep knowledge of Flow XML metadata format (API v59.0).

The user will describe an automation they want. You must return ONLY valid Flow XML (no markdown, no explanation, no code blocks).

CRITICAL RULES for Flow XML:
1. Every element needs: <name>CamelCaseNoSpaces</name>, <label>Human Label</label>, <locationX>N</locationX>, <locationY>N</locationY>
2. Location system: start at (50,0), elements at Y=0 increase downward (0,150,314,478), X=176 center, X=50 left, X=302 right
3. Every element except start needs a <connector><targetReference>NextElementName</targetReference></connector>
4. <start> has <filterLogic>and</filterLogic>, <object>, <recordTriggerType>, <triggerType>
5. Use <stringValue>text</stringValue>, <numberValue>123</numberValue>, <booleanValue>true</booleanValue>, or <elementReference>VariableName</elementReference> for values
6. Decision: requires <rules> and <defaultConnector><targetReference> and <label> inside rules
7. Operators: EqualTo, NotEqualTo, GreaterThan, LessThan, IsNull, IsBlank, IsChanged
8. $Record.FieldName references the triggering record's field
9. actionCalls with actionSubtype=emailSimple for inline emails: needs <inputParameters> with name=toAddresses, subject, body
10. recordLookups needs <storeOutputAutomatically>true</storeOutputAutomatically> or outputVariables
11. recordUpdates needs <filterLogic>and</filterLogic> and <filters>
12. recordCreates needs <inputAssignments> and <storeOutputAutomatically>true</storeOutputAutomatically>

Return ONLY the XML. No markdown, no code blocks, no explanation.
`;

  try {
    const aiResponse = await callAIWithFallback(`${systemPrompt}\n\nUser request: "${prompt}"\nTrigger object: ${triggerObject || 'none'}\n\nReturn ONLY the Flow XML.`);
    const cleanXml = aiResponse.replace(/```xml\s*/g, '').replace(/```\s*/g, '').trim();
    if (!cleanXml.includes('<?xml') || !cleanXml.includes('<Flow')) {
      throw new Error('AI response is not valid Flow XML');
    }
    return cleanXml;
  } catch (err) {
    console.log('[AI Flow Generation] Failed, falling back to template:', err.message);
    return null;
  }
}

// ── AI-powered classify intent (also handles large batches) ───────────
async function classifyIntent(userPrompt) {
  const systemPrompt = `You are a Salesforce admin assistant. The user speaks Portuguese, English, or mix. Return ONLY a JSON object (no markdown, no code blocks) with this exact structure:

For a SINGLE field:
{"intent":"field","object":"Account","field_name":"Telefone","field_type":"Phone","picklist_values":null,"required":false,"description":"Create phone field on Account"}

For MULTIPLE fields (2+):
{"intent":"multi_field","object":"Account","fields":[{"field_name":"Telefone","field_type":"Phone","picklist_values":["A","B"],"required":true}]}

For a validation rule:
{"intent":"validation_rule","object":"Account","description":"Validation rule"}

Rules:
- intent: "field" for single field, "multi_field" for 2+ fields, "validation_rule" for validation rules, "flow" for automation, "unknown" if unclear
- object: map Portuguese to API names — conta→Account, contato→Contact, oportunidade→Opportunity, caso→Case, campanha→Campaign, lead→Lead
- field_type: Text, Date, Phone, Email, Currency, Number, Checkbox, TextArea, Picklist
  — telefone/celular/phone → Phone
  — e-mail/email → Email
  — data/date → Date
  — moeda/currency/valor/amount → Currency
  — número/number/quantidade → Number
  — checkbox/boolean → Checkbox
  — text/textarea → TextArea or Text
- field_name: extract the NAME of the field (the word they want to call it)
- Handle informal/abbreviated language
- If field_type is Picklist and user mentions values/options, set picklist_values as an array: ["A", "B", "C"] — leave null if not mentioned
- If the user says the field is required/mandatory/obrigatório/requerido, set required: true
- For multi_field, return ALL fields in the "fields" array. Handle large lists (10, 20, 25 fields)
`;

  const aiResponse = await callAIWithFallback(`${systemPrompt}\n\nUser request: "${userPrompt}"\n\nReturn ONLY the JSON.`);
  const result = extractJSON(aiResponse);

  // Multi-field batch
  if (result.intent === 'multi_field' && result.fields && result.fields.length > 0) {
    const objDetected = !!(result.object && result.object !== 'unknown');
    const fields = result.fields.map(f => ({
      object: result.object || '__context__',
      label: f.field_name || 'Custom Field',
      apiName: (f.field_name || 'CustomField')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_'),
      type: f.field_type || 'Text',
      picklistValues: f.picklist_values || null,
      required: f.required === true,
      _objectDetected: objDetected,
    }));
    const fieldXmls = fields.map(f => generateCustomFieldXML(f));
    return { intent: 'multi_field', multiFields: fields, allXml: fieldXmls, object: result.object };
  }

  // Single field
  if (result.intent !== 'field') return { intent: result.intent || 'unknown', result };

  const objDetected = !!(result.object && result.object !== 'unknown');

  const fieldInfo = {
    object: result.object || '__context__',
    label: result.field_name || 'Custom Field',
    apiName: (result.field_name || 'CustomField')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_'),
    type: result.field_type || 'Text',
    picklistValues: result.picklist_values || null,
    required: result.required === true,
    _objectDetected: objDetected,
  };

  const fieldXml = generateCustomFieldXML(fieldInfo);
  return { intent: 'field', fieldInfo, fieldXml };
}

// ── Validation Rule generation and deployment ─────────────
function generateValidationRuleXML(fullName, label, formula, errorMessage, displayField) {
  const safeFn = escapeXML(fullName || 'Account.VR_Custom__c');
  const safeErr = escapeXML(errorMessage || 'Esta regra impediu a operação.');
  const safeDisp = escapeXML(displayField || '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ValidationRule xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${safeFn}</fullName>
    <active>true</active>
    <errorConditionFormula>${formula || 'false'}</errorConditionFormula>
    <errorDisplayField>${safeDisp}</errorDisplayField>
    <errorMessage>${safeErr}</errorMessage>
</ValidationRule>`;
}

async function sfDeployValidationRule(instanceUrl, accessToken, xmlContent) {
  console.log('[Deploy ValidationRule] Via SOAP Metadata API');

  const fullNameMatch = xmlContent.match(/<fullName>([^<]+)<\/fullName>/);
  const labelMatch = xmlContent.match(/<errorConditionFormula>([\s\S]*?)<\/errorConditionFormula>/);
  const fullName = fullNameMatch ? fullNameMatch[1] : 'Unknown.VR_Test';
  const [objName, ruleApi] = fullName.split('.');

  // Build zip
  const zip = new AdmZip();
  zip.addFile(`validationRules/${ruleApi || 'VR_Test'}.validationRule-meta.xml`, Buffer.from(xmlContent, 'utf-8'));
  const pkgXml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types><members>${ruleApi || 'VR_Test'}</members><name>ValidationRule</name></types>
    <version>59.0</version>
</Package>`;
  zip.addFile('package.xml', Buffer.from(pkgXml, 'utf-8'));
  const zipBase64 = zip.toBuffer().toString('base64');

  const soapEnv = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <env:Header>
    <SessionHeader xmlns="http://soap.sforce.com/2006/04/metadata">
      <sessionId>${accessToken}</sessionId>
    </SessionHeader>
  </env:Header>
  <env:Body>
    <deploy xmlns="http://soap.sforce.com/2006/04/metadata">
      <ZipFile>${zipBase64}</ZipFile>
      <DeployOptions>
        <singlePackage>true</singlePackage>
        <checkOnly>false</checkOnly>
        <rollbackOnError>true</rollbackOnError>
        <runAllTests>false</runAllTests>
      </DeployOptions>
    </deploy>
  </env:Body>
</env:Envelope>`;

  try {
    const resp = await fetch(`${instanceUrl}/services/Soap/m/59.0`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'deploy' },
      body: soapEnv,
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      return { success: false, error: `SOAP deploy failed (HTTP ${resp.status}): ${err.slice(0, 300)}` };
    }

    const text = await resp.text();
    const idMatch = text.match(/<id>([^<]+)<\/id>/);
    const stateMatch = text.match(/<state>([^<]+)<\/state>/);
    const doneMatch = text.match(/<done>(true|false)<\/done>/);
    const state = stateMatch ? stateMatch[1] : '';
    const done = doneMatch ? doneMatch[1] === 'true' : false;

    if (done && state === 'Succeeded') {
      const errMsgMatch = text.match(/<errorMessage>([^<]+)<\/errorMessage>/);
      const errLabel = errMsgMatch || `Regra criada: ${ruleApi}`;
      return { success: true, output: `Validation Rule criada: ${ruleApi || fullName}` };
    }
    if (done) {
      const errMsgMatch = text.match(/<errorMessage>([^<]+)<\/errorMessage>/);
      return { success: false, error: `Deploy falhou: ${errMsgMatch ? errMsgMatch[1] : state}` };
    }
    if (idMatch) {
      let result = await sfPollDeployStatus(instanceUrl, accessToken, idMatch[1], ruleApi || 'ValidationRule', ruleApi || 'VR_Test');
      if (result.success) result.output = `Validation Rule criada: ${ruleApi || fullName}`;
      return result;
    }

    const errMatch = text.match(/<faultstring>([^<]+)<\/faultstring>/);
    return { success: false, error: `Deploy erro: ${errMatch ? errMatch[1] : 'Unknown'}` };
  } catch (err) {
    return { success: false, error: `Deploy error: ${err.message}` };
  }
}

async function generateValidationRuleWithAI(prompt, triggerObject) {
  const systemPrompt = `You are an expert Salesforce admin. Generate a Salesforce Validation Rule as XML.

CRITICAL RULES:
- Return ONLY the XML, no markdown, no explanation, no code blocks
- The errorConditionFormula must use Salesforce formula syntax (ISBLANK, ISNEW(), ISCHANGED(), ISPICKVAL(), OR(), AND(), NOT())
- The formula evaluates to TRUE when the rule should BLOCK the save
- errorDisplayField is the API name of the field to highlight (no __c suffix for standard fields)
- fullName format: ObjectName.RuleName__c (e.g., Account.Email_Required__c)

ValidationRule XML format:
<?xml version="1.0" encoding="UTF-8"?>
<ValidationRule xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Account.Email_Required__c</fullName>
    <active>true</active>
    <errorConditionFormula>ISBLANK(Email)</errorConditionFormula>
    <errorDisplayField>Email</errorDisplayField>
    <errorMessage>Email é obrigatório</errorMessage>
</ValidationRule>

Common patterns:
- Required field: ISBLANK(FieldName)
- Required only on new record: AND(ISNEW(), ISBLANK(FieldName))
- Conditionally required: AND(NOT(ISBLANK(Status)), ISBLANK(FieldName))
- Picklist value check: ISPICKVAL(FieldName, "Value")
- Number comparison: Amount < 0 || Amount > 1000000
- Date comparison: CloseDate < TODAY()
- Cross-field: AND(ISNEW(), ISBLANK(Phone) && ISBLANK(Email))
`;

  try {
    const aiResponse = await callAIWithFallback(`${systemPrompt}\n\nObject: ${triggerObject || 'Account'}\nUser request: "${prompt}"\n\nReturn ONLY the ValidationRule XML.`);
    const cleanXml = aiResponse.replace(/```xml\s*/g, '').replace(/```\s*/g, '').trim();
    if (!cleanXml.includes('<?xml') || !cleanXml.includes('<ValidationRule')) {
      throw new Error('AI response is not valid ValidationRule XML');
    }
    return cleanXml;
  } catch (err) {
    console.log('[AI ValidationRule Generation] Failed:', err.message);
    return null;
  }
}

// ── Regex fallback for field detection ───────────────────
function detectFieldByRegex(prompt) {
  const lower = (prompt || '').toLowerCase();
  const fieldKeywords = ['criar campo', 'criar um campo', 'crie um campo', 'adicionar campo', 'add campo', 'add field', 'create field', 'create a field', 'cria campo', 'criar novo', 'inclui campo', 'incluir campo', 'adiciona campo', 'gera campo', 'gerar campo', 'configura campo'];
  const hasFieldHint = /(campo|field|telefone|celular|phone|email|currency|date|number|checkbox|text|picklist)/i.test(lower);
  const hasActionHint = /(criar|cria|crie|adicionar|add|incluir|inclui|gerar|gera|preciso de|quero um|colo?ca)/i.test(lower);
  if (!(fieldKeywords.some(kw => lower.includes(kw)) || (hasFieldHint && hasActionHint))) return null;

  let sfObject = null;
  if (lower.includes('oportunidade') || lower.includes('opportunity') || lower.includes('opp')) sfObject = 'Opportunity';
  else if (lower.includes('conta') || lower.includes('account')) sfObject = 'Account';
  else if (lower.includes('contato') || lower.includes('contact')) sfObject = 'Contact';
  else if (lower.includes('lead')) sfObject = 'Lead';
  else if (lower.includes('caso') || lower.includes('case')) sfObject = 'Case';
  else if (lower.includes('campanha') || lower.includes('campaign')) sfObject = 'Campaign';
  // Don't return null — let the route use context object
  if (!sfObject) sfObject = '__context__';

  let fieldType = 'Text';
  if (lower.includes('currency') || lower.includes('moeda') || lower.includes('valor') || lower.includes('dinheiro')) fieldType = 'Currency';
  else if (lower.includes('checkbox') || lower.includes('boolean')) fieldType = 'Checkbox';
  else if (lower.includes('textarea')) fieldType = 'TextArea';
  else if (lower.includes('date') || lower.includes('data')) fieldType = 'Date';
  else if (lower.includes('number') || lower.includes('numero') || lower.includes('quantidade')) fieldType = 'Number';
  else if (lower.includes('phone') || lower.includes('telefone') || lower.includes('celular') || lower.includes('mobile')) fieldType = 'Phone';
  else if (lower.includes('email')) fieldType = 'Email';
  else if (lower.includes('picklist')) fieldType = 'Picklist';

  let fieldLabel = '';
  const chamadoMatch = prompt.match(/(?:chamado|named|called|nome)\s+["']?([a-zA-Z\u00C0-\u00FF\u00DF-\u00F6\u00F8-\u00FF][a-zA-Z\u00C0-\u00FF\u00DF-\u00F6\u00F8-\u00FF\s]{1,40}?)(?:["']|\s+tipo|\s+type|\s+no|\s+na|\s+em|\s+do|\s+da|$|,)/i);
  if (chamadoMatch && chamadoMatch[1] && chamadoMatch[1].trim().length > 1) fieldLabel = chamadoMatch[1].trim();
  if (!fieldLabel) {
    const parenMatch = prompt.match(/\(\s*([a-zA-Z\u00C0-\u00FF\u00DF-\u00F6\u00F8-\u00FF][a-zA-Z\u00C0-\u00FF\u00DF-\u00F6\u00F8-\u00FF\s]{0,40}?)\s*\)/);
    if (parenMatch && parenMatch[1] && parenMatch[1].trim().length > 1) fieldLabel = parenMatch[1].trim();
  }
  if (!fieldLabel) {
    const campoMatch = prompt.match(/campo\s+["']?([a-zA-Z\u00C0-\u00FF\u00DF-\u00F6\u00F8-\u00FF][a-zA-Z\u00C0-\u00FF\u00DF-\u00F6\u00F8-\u00FF\s]{1,40}?)(?:\s*(?:__c)?\s*(?:tipo|type|no|na|em|do|da|,|$))/i);
    if (campoMatch && campoMatch[1] && campoMatch[1].trim().length > 1) {
      const candidate = campoMatch[1].trim();
      const skip = ['novo', 'um', 'uma', 'new', 'custom', 'field'];
      if (!skip.includes(candidate.toLowerCase())) fieldLabel = candidate;
    }
  }

  // Extract Picklist values — "valores A, B, C" or "com opcoes X, Y, Z"
  let picklistValues = null;
  if (fieldType === 'Picklist') {
    const valuesMatch = lower.match(/(?:com valores?|valores?|op[çc][oõ]es?|choices?|lista)\s*[=:]?\s*["']?([a-záàâãéèêíïóôõöúç0-9][a-záàâãéèêíïóôõöúç0-9\s,;\/é\-\_\.]{1,200})["']?(?:\s|$)/);
    if (valuesMatch) {
      picklistValues = valuesMatch[1].split(/[,;\/e]+/).map(v => v.trim().replace(/^["']+|["']+$/g, '')).filter(v => v.length > 0);
    }
  }

  // Detect if field is required
  const isRequired = lower.includes('obrigat') || lower.includes('requerid') || lower.includes('required') || lower.includes('mandatory') || lower.includes('preenchimento obrigat');

  const apiName = (fieldLabel || 'CustomField').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return { object: sfObject, label: fieldLabel || 'CustomField', apiName, type: fieldType, picklistValues, required: isRequired, _objectDetected: sfObject !== '__context__' };
}

// ── Generate Custom Field XML ────────────────────────────
function generateCustomFieldXML(fieldInfo) {
  const fieldName = fieldInfo.apiName.replace('__c', '') + '__c';
  const safeLabel = escapeXML(fieldInfo.label);
  const safeObj = escapeXML(fieldInfo.object);
  let typeXML = '';
  switch (fieldInfo.type) {
    case 'Date': typeXML = `<type>Date</type>`; break;
    case 'Email': typeXML = `<type>Email</type>`; break;
    case 'Phone': typeXML = `<type>Phone</type>`; break;
    case 'Currency': typeXML = `<type>Currency</type><precision>18</precision><scale>2</scale>`; break;
    case 'Number': typeXML = `<type>Number</type><precision>18</precision><scale>0</scale><unique>false</unique>`; break;
    case 'Checkbox': typeXML = `<type>Checkbox</type><defaultValue>false</defaultValue>`; break;
    case 'TextArea': typeXML = `<type>TextArea</type><length>32768</length>`; break;
    case 'Text': typeXML = `<type>Text</type><length>255</length>`; break;
    case 'Picklist':
      let picklistEntries = '<type>Picklist</type><valueSet><restricted>true</restricted><sorted>false</sorted>';
      const vals = fieldInfo.picklistValues && fieldInfo.picklistValues.length > 0 ? fieldInfo.picklistValues : ['Valor 1'];
      vals.forEach(function(v, i) {
        picklistEntries += `<valueSetEntry><fullName>${escapeXML(v)}</fullName><default>${i === 0 ? 'true' : 'false'}</default></valueSetEntry>`;
      });
      picklistEntries += '</valueSet>';
      typeXML = picklistEntries;
      break;
  }
  const requiredXML = fieldInfo.required ? '<required>true</required>' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${safeObj}.${fieldName}</fullName>
    <label>${safeLabel}</label>
    ${typeXML}
    ${requiredXML}
    <description>Created by SF AI Agent</description>
    <trackFeedHistory>false</trackFeedHistory>
</CustomField>`;
}

// ── Detect object ────────────────────────────────────────
function detectObject(prompt) {
  const lower = (prompt || '').toLowerCase();
  if (lower.includes('oportunidade') || lower.includes('opportunity')) return 'Opportunity';
  if (lower.includes('contato') || lower.includes('contact')) return 'Contact';
  if (lower.includes('conta') || lower.includes('account')) return 'Account';
  if (lower.includes('caso') || lower.includes('case')) return 'Case';
  if (lower.includes('campanha') || lower.includes('campaign')) return 'Campaign';
  return 'Lead';
}

// ── Salesforce REST API deploy (multi-tenant) ────────────
const SF_USERNAME = process.env.SALESFORCE_USERNAME || '';
const SF_PASSWORD = process.env.SALESFORCE_PASSWORD || '';
const SF_TOKEN = process.env.SALESFORCE_TOKEN || '';
const SF_DOMAIN = process.env.SALESFORCE_DOMAIN || 'login';

// Per-user token cache
const sfSessions = new Map();

function getCredentials(req) {
  const username = req.headers['x-sf-username'] || SF_USERNAME;
  const password = req.headers['x-sf-password'] || '';
  const domain = req.headers['x-sf-domain'] || SF_DOMAIN;

  // If no user credentials AND no admin password, fail
  if (!username || !(password || SF_PASSWORD)) {
    return null;
  }

  const actualPassword = password || (SF_PASSWORD + SF_TOKEN);
  const cacheKey = `${username}:${domain}`;
  const cached = sfSessions.get(cacheKey);

  return {
    username,
    password: actualPassword,
    domain,
    _cacheKey: cacheKey,
    _cached: cached || null,
  };
}

let sfAccessToken = '';
let sfInstanceUrl = '';

async function sfLogin(creds, req) {
  // Support legacy calls without creds
  if (!creds) creds = null;

  // If called from route, extract creds from request
  if (req && !creds) {
    creds = getCredentials(req);
    if (!creds) throw new Error('Credenciais Salesforce não configuradas. Conecte sua org nas ⚙️ Configurações.');
  }

  // Use cached session
  if (creds && creds._cached) {
    return creds._cached;
  }

  const username = creds ? creds.username : SF_USERNAME;
  const passwordCombined = creds ? creds.password : (SF_PASSWORD + SF_TOKEN);
  const sfDomain = creds ? creds.domain : SF_DOMAIN;

  if (!username || !passwordCombined) {
    throw new Error('Credenciais Salesforce não configuradas. Conecte sua org nas ⚙️ Configurações.');
  }

  console.log('[SF Auth] Logging in via SOAP as:', username);
  const soapUrl = `https://${sfDomain}.salesforce.com/services/Soap/u/59.0`;
  const soapBody = `<?xml version="1.0" encoding="utf-8" ?>
    <env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <env:Header>
            <CallOptions xmlns="urn:partner.soap.sforce.com">
                <client>sf_ai_agent</client>
            </CallOptions>
        </env:Header>
        <env:Body>
            <login xmlns="urn:partner.soap.sforce.com">
                <username>${SF_USERNAME}</username>
                <password>${passwordCombined}</password>
            </login>
        </env:Body>
    </env:Envelope>`;

  const resp = await fetch(soapUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'login' },
    body: soapBody,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Salesforce SOAP login failed (${resp.status}): ${errText}`);
  }

  // Parse SOAP XML response
  const text = await resp.text();
  const sessionMatch = text.match(/<sessionId>([^<]+)<\/sessionId>/);
  const serverUrlMatch = text.match(/<serverUrl>([^<]+)<\/serverUrl>/);

  if (!sessionMatch || !serverUrlMatch) {
    throw new Error(`Could not parse session from SOAP response`);
  }

  const accessToken = sessionMatch[1];
  const rawUrl = serverUrlMatch[1];
  const instanceUrl = rawUrl.split('/services')[0];

  // Cache session for this user
  const session = { accessToken, instanceUrl };
  if (creds && creds._cacheKey) {
    sfSessions.set(creds._cacheKey, session);
  } else {
    sfAccessToken = accessToken;
    sfInstanceUrl = instanceUrl;
  }

  console.log('[SF Auth] Logged in to:', instanceUrl);
  return session;
}

async function sfDeployWithZip(xmlContent, memberName, metadataType, req) {
  const creds = req ? getCredentials(req) : null;
  const { accessToken, instanceUrl } = await sfLogin(creds);

  // ── CustomField deploy via Tooling API ──
  if (metadataType === 'CustomField') {
    const fullNameMatch = xmlContent.match(/<fullName>([^<]+)<\/fullName>/);
    const labelMatch = xmlContent.match(/<label>([^<]+)<\/label>/);
    const typeMatch = xmlContent.match(/<type>([^<]+)<\/type>/);

    const fullName = fullNameMatch ? fullNameMatch[1] : 'Unknown__c';
    const label = labelMatch ? labelMatch[1] : memberName || 'Custom Field';
    const type = typeMatch ? typeMatch[1] : 'Text';

    // Parse description, required from XML
    const descMatch = xmlContent.match(/<description>([^<]+)<\/description>/);
    const reqMatch = xmlContent.match(/<required>(true|false)<\/required>/);
    const lengthMatch = xmlContent.match(/<length>(\d+)<\/length>/);
    const precisionMatch = xmlContent.match(/<precision>(\d+)<\/precision>/);
    const scaleMatch = xmlContent.match(/<scale>(\d+)<\/scale>/);
    const defaultMatch = xmlContent.match(/<defaultValue>(true|false)<\/defaultValue>/);

    const metadata = {
      label,
      type,
      description: descMatch ? descMatch[1] : 'Created by SF AI Agent',
      trackFeedHistory: false,
    };
    if (reqMatch) metadata.required = (reqMatch[1] === 'true');
    if (lengthMatch) metadata.length = parseInt(lengthMatch[1]);
    if (precisionMatch) metadata.precision = parseInt(precisionMatch[1]);
    if (scaleMatch) metadata.scale = parseInt(scaleMatch[1]);
    if (defaultMatch) metadata.defaultValue = (defaultMatch[1] === 'true');

    // Handle Picklist valueSet
    const valueSetMatch = xmlContent.match(/<valueSet>([\s\S]*?)<\/valueSet>/);
    if (valueSetMatch) {
      const entries = [];
      const entryRegex = /<valueSetEntry>.*?<fullName>([^<]+)<\/fullName>.*?<default>(true|false)<\/default>.*?<\/valueSetEntry>/g;
      let m;
      while ((m = entryRegex.exec(valueSetMatch[1])) !== null) {
        entries.push({ fullName: m[1], default: m[2] === 'true' });
      }
      if (entries.length > 0) metadata.valueSet = { restricted: true, sorted: false, valueSetEntries: entries };
    }

    const body = { FullName: fullName, Metadata: metadata };

    console.log('[Deploy CustomField] Creating:', fullName, 'type:', type);

    try {
      const resp = await fetch(`${instanceUrl}/services/data/v59.0/tooling/sobjects/CustomField/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const respData = await resp.json().catch(() => null);

      if (!resp.ok) {
        const errMsg = (respData && respData[0] && respData[0].message) || JSON.stringify(respData);
        console.log('[Deploy CustomField] Error:', errMsg);
        return {
          success: false,
          error: humanizeError(errMsg, type, fullName),
          _rawError: errMsg,
        };
      }

      console.log('[Deploy CustomField] Success:', JSON.stringify(respData));
      return { success: true, output: `Created ${fullName}`, fieldName: fullName };
    } catch (err) {
      return { success: false, error: 'Erro de rede ao conectar com Salesforce: ' + err.message };
    }
  }

  // ── Flow deploy via Tooling API ──
  return await sfDeployFlowViaTooling(instanceUrl, accessToken, xmlContent);
}

async function sfDeployFlowViaTooling(instanceUrl, accessToken, xmlContent) {
  console.log('[Deploy Flow] Via SOAP Metadata API');

  const labelMatch = xmlContent.match(/<label>([^<]+)<\/label>/);
  const label = labelMatch ? labelMatch[1] : 'AutoFlow';
  const apiName = label
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '').replace(/_+/g, '_').slice(0, 80);
  const safeApiName = /^[a-zA-Z]/.test(apiName) ? apiName : 'Flow_' + apiName;

  // Build zip package
  const zip = new AdmZip();
  zip.addFile(`flows/${safeApiName}.flow-meta.xml`, Buffer.from(xmlContent, 'utf-8'));
  const pkgXml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types><members>${safeApiName}</members><name>Flow</name></types>
    <version>59.0</version>
</Package>`;
  zip.addFile('package.xml', Buffer.from(pkgXml, 'utf-8'));
  const zipBuffer = zip.toBuffer();
  const zipBase64 = zipBuffer.toString('base64');

  // SOAP deploy
  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <env:Header>
    <SessionHeader xmlns="http://soap.sforce.com/2006/04/metadata">
      <sessionId>${accessToken}</sessionId>
    </SessionHeader>
  </env:Header>
  <env:Body>
    <deploy xmlns="http://soap.sforce.com/2006/04/metadata">
      <ZipFile>${zipBase64}</ZipFile>
      <DeployOptions>
        <singlePackage>true</singlePackage>
        <checkOnly>false</checkOnly>
        <rollbackOnError>true</rollbackOnError>
        <runAllTests>false</runAllTests>
      </DeployOptions>
    </deploy>
  </env:Body>
</env:Envelope>`;

  try {
    const resp = await fetch(`${instanceUrl}/services/Soap/m/59.0`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'SOAPAction': 'deploy',
      },
      body: soapEnvelope,
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      console.log('[Deploy Flow] SOAP deploy failed:', err.slice(0, 500));
      return { success: false, error: `SOAP deploy failed (HTTP ${resp.status}): ${err.slice(0, 300)}` };
    }

    const text = await resp.text();

    // Parse ID from response (SOAP always returns async job ID)
    const idMatch = text.match(/<id>([^<]+)<\/id>/);
    const stateMatch = text.match(/<state>([^<]+)<\/state>/);
    const doneMatch = text.match(/<done>(true|false)<\/done>/);
    const state = stateMatch ? stateMatch[1] : '';
    const done = doneMatch ? doneMatch[1] === 'true' : false;

    // If done and succeeded
    if (done && state === 'Succeeded') {
      console.log('[Deploy Flow] Success:', safeApiName);
      return { success: true, output: `Flow criado: ${label}`, flowName: safeApiName };
    }

    // If done and failed
    if (done) {
      const errMsgMatch = text.match(/<errorMessage>([^<]+)<\/errorMessage>/);
      const errMsg = errMsgMatch ? errMsgMatch[1] : `State: ${state || 'Unknown'}`;
      return { success: false, error: `Deploy falhou: ${errMsg}` };
    }

    // If not done yet, poll (always start polling if we have an ID)
    if (idMatch) {
      const deployId = idMatch[1];
      console.log('[Deploy Flow] Deploy started, polling for:', deployId);
      return await sfPollDeployStatus(instanceUrl, accessToken, deployId, label, safeApiName);
    }

    // No ID at all — parse any error
    const errMsgMatch = text.match(/<faultstring>([^<]+)<\/faultstring>/);
    const errMsg = errMsgMatch ? errMsgMatch[1] : `Unknown response, no deploy ID returned. State: ${state}`;
    return { success: false, error: `Deploy erro: ${errMsg}` };
  } catch (err) {
    return { success: false, error: `Deploy error: ${err.message}` };
  }
}

async function sfPollDeployStatus(instanceUrl, accessToken, deployId, label, apiName) {
  console.log('[Deploy Flow] Polling status for deploy:', deployId);
  let pollCount = 0;

  while (pollCount < 45) {
    await sleep(5000);

    const soapEnv = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <env:Header>
    <SessionHeader xmlns="http://soap.sforce.com/2006/04/metadata">
      <sessionId>${accessToken}</sessionId>
    </SessionHeader>
  </env:Header>
  <env:Body>
    <checkDeployStatus xmlns="http://soap.sforce.com/2006/04/metadata">
      <asyncProcessId>${deployId}</asyncProcessId>
      <includeDetails>true</includeDetails>
    </checkDeployStatus>
  </env:Body>
</env:Envelope>`;

    const resp = await fetch(`${instanceUrl}/services/Soap/m/59.0`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'checkDeployStatus' },
      body: soapEnv,
    });

    const text = await resp.text();
    const stateMatch = text.match(/<state>([^<]+)<\/state>/);
    const state = stateMatch ? stateMatch[1] : 'Unknown';
    pollCount++;
    console.log(`[Deploy Flow] Poll ${pollCount}: ${state}`);

    if (state === 'Succeeded') {
      console.log('[Deploy Flow] Success:', apiName);
      return { success: true, output: `Flow criado: ${label}`, flowName: apiName };
    }
    if (state === 'Failed' || state === 'Error' || state === 'Canceling' || state === 'Canceled') {
      // Extract all error messages from component failures
      const errors = [];
      const errRegex = /<componentType>([^<]*)<\/componentType>\s*<fileName>([^<]*)<\/fileName>\s*<fullName>([^<]*)<\/fullName>\s*<problem>([^<]*)<\/problem>/g;
      let m;
      while ((m = errRegex.exec(text)) !== null) {
        errors.push(`${m[3]} (${m[1]}/${m[2]}): ${m[4]}`);
      }
      const errMsgMatch = text.match(/<errorMsg>([^<]+)<\/errorMsg>/);
      const errMsg = errors.length > 0 ? errors.join(' | ') : (errMsgMatch ? errMsgMatch[1] : state);
      return { success: false, error: `Deploy falhou (${state}): ${errMsg}` };
    }
  }

  return { success: false, error: 'Deploy timed out — check Setup > Deploy Status in Salesforce.' };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Human-friendly error messages ─────────────────────────
function humanizeError(msg, type, fieldName) {
  if (!msg || typeof msg !== 'string') return 'Erro desconhecido ao criar campo ' + fieldName;
  const lower = msg.toLowerCase();

  // Field already exists
  if (lower.includes('já existe') || lower.includes('already exists') || lower.includes('duplicate') || lower.includes('unique')) {
    return 'O campo "' + fieldName + '" já existe neste objeto. Escolha outro nome ou remova o existente.';
  }

  // Validation errors
  if (lower.includes('length must be specified') || lower.includes('length')) {
    return 'O tipo "' + type + '" exige um tamanho (length) definido. Esse é um requisito do Salesforce.';
  }
  if (lower.includes('precision')) {
    return 'O tipo "' + type + '" exige precisão (precision) definida. Para Currency use 18 e scale 2.';
  }
  if (lower.includes('defaultvalue') || lower.includes('default value')) {
    return 'O tipo "' + type + '" exige um valor padrão (defaultValue). Para Checkbox será true/false.';
  }

  // Auth errors
  if (lower.includes('invalid_session') || lower.includes('session expired') || lower.includes('not authenticated')) {
    return 'Sessão Salesforce expirada. O backend tentará reconectar automaticamente na próxima requisição.';
  }

  // Rate limit
  if (lower.includes('too_many') || lower.includes('rate limit') || lower.includes('concurrent')) {
    return 'Muitas requisições simultâneas. Aguarde uns segundos e tente novamente.';
  }

  // Generic: show original but in a friendlier way
  if (msg.length > 200) return 'Erro ao criar campo ' + fieldName + ': ' + msg.slice(0, 200) + '...';
  return 'Erro ao criar campo ' + fieldName + ': ' + msg;
}

// ── Detect multiple fields in one prompt ──────────────────

// ── Detect multiple fields in one prompt ──────────────────
function detectMultipleFields(prompt, contextObject) {
  const lower = (prompt || '').toLowerCase();

  // Detect object — prefer explicit mention, fallback to context from extension
  let sfObject = null;
  if (lower.includes('oportunidade') || lower.includes('opportunity') || lower.includes('opp')) sfObject = 'Opportunity';
  else if (lower.includes('conta') || lower.includes('account')) sfObject = 'Account';
  else if (lower.includes('contato') || lower.includes('contact')) sfObject = 'Contact';
  else if (lower.includes('lead')) sfObject = 'Lead';
  else if (lower.includes('caso') || lower.includes('case')) sfObject = 'Case';
  else if (lower.includes('campanha') || lower.includes('campaign')) sfObject = 'Campaign';
  if (!sfObject) {
    // No explicit object from regex, try context from extension
    if (contextObject && !['__context__', ''].includes(contextObject)) {
      sfObject = contextObject;
      console.log('[MultiField] Using context object:', sfObject);
    } else {
      return null;
    }
  }

  // Pattern 1: "crie N campos em X: campo1 (tipo1), campo2 (tipo2)..."
  // First, extract each "name (type)" pair directly with a global regex
  const colonMatch = prompt.match(/(?:c?ri[eae]|adicion[ae]|inclu[aie]|ger[ae])\s+(?:\d+\s+)?(?:campos?\s+)(?:em|no|na|for|in|on)?\s*\w+[:\-]\s*(.+)/i);
  if (colonMatch) {
    const fieldPart = colonMatch[1].trim();
    const fields = [];
    // Match "field name (type)" — name is everything before (word)
    const itemRegex = /([\p{L}\p{M}][\p{L}\p{M}\s_-]*?)\s*\(\s*(\w+)\s*\)/gu;
    let m;
    while ((m = itemRegex.exec(fieldPart)) !== null) {
      const name = m[1].trim();
      if (name.length < 1) continue;
      fields.push({
        object: sfObject,
        label: name,
        apiName: makeApiName(name),
        type: inferFieldType(m[2].trim()),
        picklistValues: null,
        required: fieldPart.toLowerCase().includes('obrigat') || lower.includes('obrigat'),
      });
    }
    if (fields.length >= 2) return fields;
  }

  // Pattern 2: "crie campos: campo1, campo2, campo3" (no type hint)
  const simpleListMatch = prompt.match(/(?:c?ri[eae]|adicion[ae]|incl[ua][ai]|ger[ae])\s+(?:\d+\s+)?(?:campos?\s+)(?:em|no|na|for|in|on)?\s*\w*[:\-]\s*(.+)/i);
  if (simpleListMatch) {
    const raw = simpleListMatch[1].trim();
    // Don't re-parse if already got typed fields
    if (raw.includes('(')) return null; // let pattern 1 handle it
    const parts = raw.split(/[,;]/);
    const fields = [];
    for (const part of parts) {
      const cleaned = part.trim().replace(/^(e\s+|and\s+|,)/i, '');
      if (cleaned.length > 1) {
        fields.push({
          object: sfObject,
          label: cleaned,
          apiName: makeApiName(cleaned),
          type: 'Text',
          picklistValues: null,
          required: lower.includes('obrigat'),
        });
      }
    }
    if (fields.length >= 2) return fields;
  }

  return null;
}

function inferFieldType(keyword) {
  const k = keyword.toLowerCase();
  if (k === 'phone' || k === 'telefone') return 'Phone';
  if (k === 'email') return 'Email';
  if (k === 'date' || k === 'data') return 'Date';
  if (k === 'currency' || k === 'moeda') return 'Currency';
  if (k === 'number' || k === 'numero') return 'Number';
  if (k === 'checkbox' || k === 'booleano') return 'Checkbox';
  if (k === 'textarea' || k === 'texto longo') return 'TextArea';
  if (k === 'picklist' || k === 'escolha') return 'Picklist';
  return 'Text';
}

function makeApiName(label) {
  return label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Custom_Field';
}

// ── Routes ───────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/auth/test-connection', async (req, res) => {
  try {
    const creds = getCredentials(req);
    if (!creds || (!creds.password && !SF_PASSWORD)) {
      return res.json({ sfConnected: false, sfError: 'Credenciais não configuradas. Configure nas ⚙️ da extensão.' });
    }
    const session = await sfLogin(creds);
    res.json({ sfConnected: true, username: creds.username, instanceUrl: session.instanceUrl });
  } catch (err) {
    res.json({ sfConnected: false, sfError: err.message });
  }
});

app.post('/api/generate-flow', async (req, res) => {
  const { prompt, context } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  // Use context object detected by the sidebar
  const detectedObject = (context && context.object) || '';
  console.log('[Context] Detected:', detectedObject, 'URL:', context ? context.url : 'none');

  // Check for validation rule intent via regex
  const vrKeywords = /(validation\s*rule|regra\s*de\s*valida|vr\s*para|valida[çc][aã]o|bloquear|impedir|requer|obrigat.*campo|campo\s*obrigat|validar\s*campo|n[aã]o\s*pode\s*(ser|ter)|n[aã]o\s*pode\s+deixar|imped[e\i]|bloqueia|trava)/i;
  const hasVRIntent = detectedObject && vrKeywords.test(prompt) && !/criar?\s+\d*\s*campo/i.test(prompt);

  if (hasVRIntent) {
    try {
      const xml = await generateValidationRuleWithAI(prompt, detectedObject);
      if (!xml) {
        return res.json({ error: 'Não consegui gerar a regra de validação.', details: 'A IA não retornou XML válido.' });
      }
      const fullNameMatch = xml.match(/<fullName>([^<]+)<\/fullName>/);
      const formulaMatch = xml.match(/<errorConditionFormula>([\s\S]*?)<\/errorConditionFormula>/);
      const errorMatch = xml.match(/<errorMessage>([^<]+)<\/errorMessage>/);
      const [objName, ruleName] = fullNameMatch ? fullNameMatch[1].split('.') : ['Unknown', 'VR'];
      return res.json({
        flowMetadata: xml,
        metadataType: 'ValidationRule',
        deployable: true,
        flowName: ruleName || 'ValidationRule',
        instructions: `Validation Rule: ${ruleName || 'N/A'} em ${objName || detectedObject}`,
        vrDetails: {
          object: objName || detectedObject,
          ruleName: ruleName,
          formula: formulaMatch ? formulaMatch[1].trim() : '',
          errorMessage: errorMatch ? errorMatch[1] : '',
        },
      });
    } catch (err) {
      console.error('[ValidationRule] Error:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // Check for multiple fields in one prompt
  const multiFields = detectMultipleFields(prompt, detectedObject);
  if (multiFields) {
    // Apply context if object was __context__
    for (const f of multiFields) {
      if (f.object === '__context__' && detectedObject) f.object = detectedObject;
    }

    const fieldXmls = multiFields.map(f => generateCustomFieldXML(f));
    const summaries = multiFields.map(f => `"${f.label}" (${f.type}) em ${f.object}`);
    return res.json({
      flowMetadata: fieldXmls[0],
      metadataType: 'CustomField',
      deployable: true,
      flowName: `CreateFields_Batch_${Date.now()}`,
      instructions: `Criar ${multiFields.length} campos: ${summaries.join(', ')}`,
      multipleFields: multiFields,
      allXml: fieldXmls,
    });
  }

  try {
    // Try AI classification first
    let classification;
    try {
      // Inject context into the prompt for the AI
      const contextInfo = detectedObject ? `\n\nThe user is currently on the ${detectedObject} object in Salesforce. If they don't specify an object, use ${detectedObject}.` : '';
      classification = await classifyIntent(prompt + contextInfo);
    } catch (aiErr) {
      console.log('[Generate Flow] AI classification failed, falling back to regex:', aiErr.message);
      // Fallback: check for multi fields via regex first
      const multiFields = detectMultipleFields(prompt, detectedObject);
      if (multiFields) {
        for (const f of multiFields) {
          if (f.object === '__context__' && detectedObject) f.object = detectedObject;
        }
        const fieldXmls = multiFields.map(f => generateCustomFieldXML(f));
        const summaries = multiFields.map(f => `"${f.label}" (${f.type}) em ${f.object}`);
        return res.json({
          flowMetadata: fieldXmls[0],
          metadataType: 'CustomField',
          deployable: true,
          flowName: `CreateFields_Batch_${Date.now()}`,
          instructions: `Criar ${multiFields.length} campos: ${summaries.join(', ')}`,
          multipleFields: multiFields,
          allXml: fieldXmls,
        });
      }
      // Fallback: use regex-based detection
      const regexResult = detectFieldByRegex(prompt);
      if (regexResult) {
        if (!regexResult._objectDetected && detectedObject) {
          regexResult.object = detectedObject;
        }
        const fieldXml = generateCustomFieldXML(regexResult);
        return res.json({
          flowMetadata: fieldXml,
          metadataType: 'CustomField',
          deployable: true,
          flowName: `CreateField_${regexResult.apiName}`,
          flowLabel: `Create Field: ${regexResult.label}`,
          instructions: `Criar campo "${regexResult.label}" (${regexResult.type}) em ${regexResult.object}`,
        });
      }
      // Ultimate fallback: generate a flow via template
      const triggerObject = detectedObject || 'Lead';
      const lowerPrompt = (prompt || '').toLowerCase();
      const fallbackXml = _buildSimpleFlow(prompt, triggerObject, lowerPrompt);
      return res.json({
        flowMetadata: fallbackXml,
        metadataType: 'Flow',
        deployable: true,
        flowName: 'AutoFlow',
        instructions: `Não consegui entender o pedido via IA — gerei um Flow básico para ${triggerObject}.`,
      });
    }

    // AI detected validation rule
    if (classification.intent === 'validation_rule') {
      const obj = classification.result?.object || detectedObject;
      const xml = await generateValidationRuleWithAI(prompt, obj);
      if (!xml) {
        return res.json({ error: 'Não consegui gerar a regra de validação via IA.', details: 'AI não retornou XML válido.' });
      }
      const fullNameMatch = xml.match(/<fullName>([^<]+)<\/fullName>/);
      const formulaMatch = xml.match(/<errorConditionFormula>([\s\S]*?)<\/errorConditionFormula>/);
      const errorMatch = xml.match(/<errorMessage>([^<]+)<\/errorMessage>/);
      const [objName, ruleName] = fullNameMatch ? fullNameMatch[1].split('.') : ['Unknown', 'VR'];
      return res.json({
        flowMetadata: xml,
        metadataType: 'ValidationRule',
        deployable: true,
        flowName: ruleName || 'ValidationRule',
        instructions: `Validation Rule: ${ruleName || 'N/A'} em ${objName || obj}`,
        vrDetails: {
          object: objName || obj,
          ruleName: ruleName,
          formula: formulaMatch ? formulaMatch[1].trim() : '',
          errorMessage: errorMatch ? errorMatch[1] : '',
        },
      });
    }

    // AI detected multi-field batch (2-25+ fields)
    if (classification.intent === 'multi_field') {
      const mfields = classification.multiFields;
      for (const f of mfields) {
        if (!f._objectDetected && detectedObject && f.object === '__context__') f.object = detectedObject;
      }
      const fieldXmls = classification.allXml;
      const summaries = mfields.map(f => `"${f.label}" (${f.type}) em ${f.object}`);
      return res.json({
        flowMetadata: fieldXmls[0],
        metadataType: 'CustomField',
        deployable: true,
        flowName: `CreateFields_Batch_${Date.now()}`,
        instructions: `Criar ${mfields.length} campos: ${summaries.join(', ')}`,
        multipleFields: mfields,
        allXml: fieldXmls,
      });
    }

    if (classification.intent === 'field') {
      const fi = classification.fieldInfo;
      // If AI didn't detect object, use context
      if (!fi._objectDetected && detectedObject) {
        fi.object = detectedObject;
      }
      return res.json({
        flowMetadata: classification.fieldXml,
        metadataType: 'CustomField',
        deployable: true,
        flowName: `CreateField_${fi.apiName}`,
        flowLabel: `Create Field: ${fi.label}`,
        instructions: `Criar campo "${fi.label}" (${fi.type}) em ${fi.object}`,
      });
    }

    // flow or unknown intent — use AI to generate Flow XML
    const triggerObject = detectedObject || 'Lead';
    let aiFlowXml = await generateFlowWithAI(prompt, triggerObject, context);
    if (!aiFlowXml) {
      // Fallback to template if AI fails
      aiFlowXml = _buildSimpleFlow(prompt, triggerObject, (prompt || '').toLowerCase());
    }
    return res.json({
      flowMetadata: aiFlowXml,
      metadataType: 'Flow',
      deployable: true,
      flowName: `AutoFlow_${triggerObject}`,
      instructions: `Flow criado para ${triggerObject}: ${prompt.slice(0, 80)}`,
    });
  } catch (err) {
    console.error('[Generate Flow] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-validation-rule', async (req, res) => {
  const { prompt, context } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const detectedObject = (context && context.object) || '';
  console.log('[ValidationRule] Context:', detectedObject);

  try {
    const xml = await generateValidationRuleWithAI(prompt, detectedObject);
    if (!xml) {
      return res.json({
        error: 'Não consegui gerar a regra de validação. Tente descrever de outra forma.',
        details: 'A IA não retornou um XML válido.',
      });
    }

    const fullNameMatch = xml.match(/<fullName>([^<]+)<\/fullName>/);
    const formulaMatch = xml.match(/<errorConditionFormula>([^<]+)<\/errorConditionFormula>/);
    const errorMatch = xml.match(/<errorMessage>([^<]+)<\/errorMessage>/);
    const [objName, ruleName] = fullNameMatch ? fullNameMatch[1].split('.') : ['Unknown', 'VR'];

    return res.json({
      flowMetadata: xml,
      metadataType: 'ValidationRule',
      deployable: true,
      flowName: ruleName || 'ValidationRule',
      instructions: `Validation Rule: ${ruleName || 'N/A'} em ${objName || detectedObject}`,
      vrDetails: {
        object: objName || detectedObject,
        ruleName: ruleName,
        formula: formulaMatch ? formulaMatch[1] : '',
        errorMessage: errorMatch ? errorMatch[1] : '',
      },
    });
  } catch (err) {
    console.error('[ValidationRule] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/deploy', async (req, res) => {
  const { flowMetadata: xml, metadataType, flowName, allXml } = req.body;
  if (!xml) return res.status(400).json({ error: 'flowMetadata xml is required' });

  try {
    let result;
    if (metadataType === 'CustomField') {
      // Handle batch field creation
      if (allXml && Array.isArray(allXml) && allXml.length > 1) {
        console.log(`[Deploy] Batch CustomField deploy: ${allXml.length} fields`);
        const results = [];
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < allXml.length; i++) {
          const fieldXml = allXml[i];
          const r = await sfDeployWithZip(fieldXml, `Field_${i}`, 'CustomField', req);
          results.push(r);
          if (r.success) successCount++; else failCount++;
        }
        result = {
          success: failCount === 0,
          output: `${successCount}/${allXml.length} fields deployed`,
          successCount,
          failCount,
          results,
        };
      } else {
        console.log('[Deploy] CustomField via REST API');
        result = await sfDeployWithZip(xml, flowName, 'CustomField', req);
      }
    } else if (metadataType === 'ValidationRule') {
      console.log('[Deploy] ValidationRule via SOAP Metadata API');
      const creds = getCredentials(req);
      const { accessToken, instanceUrl } = await sfLogin(creds);
      result = await sfDeployValidationRule(instanceUrl, accessToken, xml);
    } else {
      console.log('[Deploy] Flow via SOAP Metadata API');
      const creds = getCredentials(req);
      const { accessToken, instanceUrl } = await sfLogin(creds);
      result = await sfDeployFlowViaTooling(instanceUrl, accessToken, xml);
    }
    res.json(result);
  } catch (err) {
    console.error('[Deploy] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start server ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`SF AI Agent server running on port ${PORT}`);
  console.log(`  AI Model: ${AI_MODELS.join(' → ')}`);
  console.log(`  SF Org: ${SF_ORG_ALIAS}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
});
