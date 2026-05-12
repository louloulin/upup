/**
 * Constants for @upup/adapter-paperclip
 */

// Adapter identity
export const ADAPTER_TYPE = 'upup_local';
export const ADAPTER_LABEL = 'UpUp Agent';

// Default execution settings
export const DEFAULT_TIMEOUT_SEC = 1800; // 30 minutes
export const DEFAULT_GRACE_SEC = 10;
export const DEFAULT_MAX_ITERATIONS = 50;
export const DEFAULT_MODEL = 'deepseek-v4-flash';

// Default prompt template
export const DEFAULT_PAPERCLIP_API_URL = 'http://127.0.0.1:3100/api';

// Default working directory
export const DEFAULT_CWD = '.';

// Model to provider mapping
export const MODEL_PROVIDER_MAP: Record<string, string> = {
  'deepseek-v4-flash': 'deepseek',
  'deepseek-chat': 'deepseek',
  'claude-sonnet-4-6': 'anthropic',
  'claude-opus-4-7': 'anthropic',
  'gpt-4.5': 'openai',
  'gpt-4o': 'openai',
  'gemini-2.5-flash': 'google',
};

/**
 * Infer provider from model name
 */
export function inferProvider(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('claude')) return 'anthropic';
  if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('o4')) return 'openai';
  if (lower.includes('gemini')) return 'google';
  if (lower.includes('moonshot') || lower.includes('kimi')) return 'moonshot';
  return 'unknown';
}

/**
 * Default prompt template for Paperclip context
 */
export const DEFAULT_PROMPT_TEMPLATE = `You are "{{agentName}}", an AI agent specializing in financial research and investment analysis, managed by Paperclip.

Your Paperclip identity:
  Agent ID: {{agentId}}
  Company ID: {{companyId}}
  API Base: {{paperclipApiUrl}}

{{#taskId}}
## Assigned Task
Issue ID: {{taskId}}
Title: {{taskTitle}}

{{taskBody}}

## Workflow
1. Use your financial research tools to complete the task
2. Mark issue as completed:
   \`curl -s -X PATCH -H "Authorization: Bearer $PAPERCLIP_API_KEY" "{{paperclipApiUrl}}/issues/{{taskId}}" -H "Content-Type: application/json" -d '{"status":"done"}'\`
3. Post completion summary as a comment on the issue
{{/taskId}}

{{#noTask}}
## Heartbeat Wake — Check for Work
1. List open issues assigned to you:
   \`curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "{{paperclipApiUrl}}/companies/{{companyId}}/issues?assigneeAgentId={{agentId}}" | python3 -c "import sys,json;issues=json.loads(sys.stdin.read());[print(f'{i['identifier']} {i['status']:>12} {i['title']}') for i in issues if i['status'] not in ('done','cancelled')]"\`
2. Prioritize financial research tasks
3. Work on highest priority item
4. Report findings concisely
{{/noTask}}

Specialized capabilities:
- Financial data analysis (US + A-share markets)
- Quantitative modeling and backtesting
- Investment portfolio analysis
- Company valuation (DCF, comparables)
- Web research for financial information
`;
