// packages/adapter-paperclip/standalone-adapter.ts
import { runChildProcess } from "@paperclipai/adapter-utils/server-utils";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { config } from "dotenv";
var adapterDir = dirname(fileURLToPath(import.meta.url));
var possibleEnvPaths = [
  resolve(adapterDir, ".env"),
  resolve(adapterDir, "..", "..", "..", ".env"),
  // adapter/../../../.env -> project root
  "/Users/louloulin/Documents/linchong/touzhi/dexter/.env"
];
for (const envPath of possibleEnvPaths) {
  try {
    config({ path: envPath, override: false });
  } catch {
  }
}
var DEFAULT_MODEL = "deepseek-v4-flash";
var DEFAULT_TIMEOUT_SEC = 1800;
var DEFAULT_MAX_ITERATIONS = 50;
var AGENT_BUNDLE_PATH = "./agent-bundle.js";
var DEFAULT_PROMPT_TEMPLATE = `You are "{{agentName}}", an AI agent specializing in financial research and investment analysis, managed by Paperclip.

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
2. Mark issue as completed via Paperclip API
3. Post completion summary as a comment
{{/taskId}}

{{#noTask}}
## Heartbeat Wake \u2014 Check for Work
1. List open issues assigned to you
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
var MODEL_PROVIDER_MAP = {
  "deepseek-v4-flash": "deepseek",
  "deepseek-chat": "deepseek",
  "claude-sonnet-4-6": "anthropic",
  "claude-opus-4-7": "anthropic",
  "gpt-4o": "openai",
  "gpt-4.5": "openai"
};
function inferProvider(model) {
  return MODEL_PROVIDER_MAP[model] || "deepseek";
}
function buildPrompt(ctx) {
  const taskId = ctx.config?.taskId;
  const taskTitle = ctx.config?.taskTitle || "";
  const taskBody = ctx.config?.taskBody || "";
  let prompt = DEFAULT_PROMPT_TEMPLATE;
  prompt = prompt.replace(
    /\{\{#taskId\}\}([\s\S]*?)\{\{\/taskId\}\}/g,
    taskId ? "$1" : ""
  );
  prompt = prompt.replace(
    /\{\{#noTask\}\}([\s\S]*?)\{\{\/noTask\}\}/g,
    taskId ? "" : "$1"
  );
  prompt = prompt.replace(/\{\{agentId\}\}/g, ctx.agent?.id || "");
  prompt = prompt.replace(/\{\{agentName\}\}/g, ctx.agent?.name || "UpUp Agent");
  prompt = prompt.replace(/\{\{companyId\}\}/g, ctx.agent?.companyId || "");
  prompt = prompt.replace(/\{\{taskId\}\}/g, taskId || "");
  prompt = prompt.replace(/\{\{taskTitle\}\}/g, taskTitle);
  prompt = prompt.replace(/\{\{taskBody\}\}/g, taskBody);
  prompt = prompt.replace(/\{\{paperclipApiUrl\}\}/g, "http://127.0.0.1:3100/api");
  return prompt;
}
async function execute(ctx) {
  const startTime = Date.now();
  const model = ctx.config?.model || process.env.DEFAULT_MODEL || DEFAULT_MODEL;
  const provider = inferProvider(model);
  const timeoutSec = ctx.config?.timeoutSec || DEFAULT_TIMEOUT_SEC;
  const maxIterations = ctx.config?.maxIterations || DEFAULT_MAX_ITERATIONS;
  const persistSession = ctx.config?.persistSession !== false;
  const prompt = buildPrompt(ctx);
  await ctx.onLog("stdout", `[upup] Starting UpUp Agent (model=${model}, provider=${provider}, timeout=${timeoutSec}s)
`);
  const prevSessionId = ctx.runtime.sessionParams?.sessionId;
  if (prevSessionId) {
    await ctx.onLog("stdout", `[upup] Resuming session: ${prevSessionId}
`);
  }
  const agentBundlePath = resolve(adapterDir, AGENT_BUNDLE_PATH);
  await ctx.onLog("stdout", `[upup] Adapter dir: ${adapterDir}
`);
  await ctx.onLog("stdout", `[upup] Running agent bundle: ${agentBundlePath}
`);
  let usage;
  let summary;
  const apiKeys = [
    "ANTHROPIC_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "EXA_API_KEY",
    "FINANCIAL_DATASETS_API_KEY"
  ];
  const passedEnv = {};
  for (const key of apiKeys) {
    passedEnv[key] = process.env[key];
  }
  const proc = await runChildProcess(
    ctx.runId,
    "bun",
    ["run", "./agent-bundle.js", prompt],
    {
      cwd: adapterDir,
      // Run from adapter directory so ./agent-bundle.js resolves
      env: {
        ...process.env,
        ...passedEnv,
        // Pass API keys explicitly
        DEFAULT_MODEL: model
      },
      timeoutSec,
      graceSec: 10,
      // Grace period before SIGKILL
      onLog: async (stream, chunk) => {
        await ctx.onLog(stream, chunk);
        if (stream === "stdout") {
          const lines = chunk.split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const msg = JSON.parse(line);
              if (msg.type === "acpx.result") {
                usage = msg.usage;
                summary = msg.summary;
              }
            } catch {
            }
          }
        }
      }
    }
  );
  const resultExitCode = proc.exitCode ?? 0;
  const isTimeout = proc.timedOut;
  const sessionId = resultExitCode === 0 && summary ? `upup-session-${startTime}` : prevSessionId || `upup-session-${startTime}`;
  await ctx.onLog(
    "stdout",
    `[upup] Exit code: ${resultExitCode}, timed out: ${isTimeout}, tokens: ${usage?.inputTokens ?? 0}/${usage?.outputTokens ?? 0}
`
  );
  return {
    exitCode: resultExitCode,
    signal: proc.signal,
    timedOut: isTimeout,
    errorMessage: proc.stderr || null,
    provider,
    model,
    billingType: "api",
    usage,
    sessionParams: persistSession ? { sessionId, model, provider } : null,
    summary: summary?.slice(0, 2e3) || proc.stderr || null
  };
}
async function testEnvironment() {
  const checks = [];
  try {
    const { readFileSync, existsSync } = await import("fs");
    const { createRequire } = await import("module");
    const require2 = createRequire(import.meta.url);
    const { execSync } = require2("child_process");
    execSync("bun --version", { encoding: "utf-8", stdio: "pipe" });
    checks.push({ code: "BUN", level: "info", message: "bun runtime installed" });
  } catch {
    checks.push({ code: "BUN", level: "error", message: "bun not found - required" });
  }
  checks.push({
    code: "NODE",
    level: process.version >= "v20" ? "info" : "warn",
    message: `Node ${process.version}`
  });
  const model = process.env.DEFAULT_MODEL;
  checks.push({
    code: "MODEL",
    level: model ? "info" : "warn",
    message: model ? `default: ${model}` : "not set - will use provider default"
  });
  for (const [key, name] of [
    ["ANTHROPIC_API_KEY", "Anthropic"],
    ["DEEPSEEK_API_KEY", "DeepSeek"],
    ["OPENAI_API_KEY", "OpenAI"]
  ]) {
    checks.push({
      code: key,
      level: process.env[key] ? "info" : "warn",
      message: process.env[key] ? "configured" : `not set (${name})`
    });
  }
  return checks;
}
async function detectModel() {
  const model = process.env.DEFAULT_MODEL || DEFAULT_MODEL;
  return { model, provider: inferProvider(model) };
}
var sessionCodec = {
  deserialize(raw) {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw;
    if (!obj.sessionId && obj.sessionId !== 0) return null;
    if (typeof obj.sessionId === "number") {
      return { ...obj, sessionId: String(obj.sessionId) };
    }
    return obj;
  },
  serialize(params) {
    return params ?? {};
  },
  getDisplayId(params) {
    if (!params) return null;
    const id = params.sessionId;
    if (id === void 0 || id === null) return null;
    const strId = typeof id === "number" ? String(id) : id;
    return strId.slice(0, 16);
  }
};
var models = [
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { id: "deepseek-chat", label: "DeepSeek Chat" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4.5", label: "GPT-4.5" }
];
function createServerAdapter() {
  return {
    type: "upup_local",
    label: "UpUp Agent",
    models,
    modelProfiles: [],
    // External adapters don't support model profiles yet
    capabilities: {
      supportsInstructionsBundle: false,
      supportsSkills: false,
      supportsLocalAgentJwt: false,
      requiresMaterializedRuntimeSkills: false,
      supportsModelProfiles: false
    },
    agentConfigurationDoc: `
# UpUp Agent Configuration

## Overview
UpUp is a financial research AI agent that can analyze investments, run quantitative models, and research companies.

## Model
The default model is **DeepSeek V4 Flash** (optimized for speed and cost).

## Execution Settings
- Timeout: Maximum execution time (default: 1800s)
- Max Iterations: Maximum agent iterations (default: 50)
- Session Persistence: Keep context across heartbeats

## Capabilities
- Financial data analysis (US + A-share markets)
- Quantitative modeling and backtesting
- Investment portfolio analysis
- Company valuation (DCF, comparables)
- Web research for financial information
`,
    execute,
    testEnvironment,
    sessionCodec,
    detectModel
  };
}
var standalone_adapter_default = { createServerAdapter };
export {
  createServerAdapter,
  standalone_adapter_default as default,
  detectModel,
  execute,
  models,
  sessionCodec,
  testEnvironment
};
