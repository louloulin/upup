var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.bun/dotenv@17.3.1/node_modules/dotenv/package.json
var require_package = __commonJS({
  "node_modules/.bun/dotenv@17.3.1/node_modules/dotenv/package.json"(exports, module) {
    module.exports = {
      name: "dotenv",
      version: "17.3.1",
      description: "Loads environment variables from .env file",
      main: "lib/main.js",
      types: "lib/main.d.ts",
      exports: {
        ".": {
          types: "./lib/main.d.ts",
          require: "./lib/main.js",
          default: "./lib/main.js"
        },
        "./config": "./config.js",
        "./config.js": "./config.js",
        "./lib/env-options": "./lib/env-options.js",
        "./lib/env-options.js": "./lib/env-options.js",
        "./lib/cli-options": "./lib/cli-options.js",
        "./lib/cli-options.js": "./lib/cli-options.js",
        "./package.json": "./package.json"
      },
      scripts: {
        "dts-check": "tsc --project tests/types/tsconfig.json",
        lint: "standard",
        pretest: "npm run lint && npm run dts-check",
        test: "tap run tests/**/*.js --allow-empty-coverage --disable-coverage --timeout=60000",
        "test:coverage": "tap run tests/**/*.js --show-full-coverage --timeout=60000 --coverage-report=text --coverage-report=lcov",
        prerelease: "npm test",
        release: "standard-version"
      },
      repository: {
        type: "git",
        url: "git://github.com/motdotla/dotenv.git"
      },
      homepage: "https://github.com/motdotla/dotenv#readme",
      funding: "https://dotenvx.com",
      keywords: [
        "dotenv",
        "env",
        ".env",
        "environment",
        "variables",
        "config",
        "settings"
      ],
      readmeFilename: "README.md",
      license: "BSD-2-Clause",
      devDependencies: {
        "@types/node": "^18.11.3",
        decache: "^4.6.2",
        sinon: "^14.0.1",
        standard: "^17.0.0",
        "standard-version": "^9.5.0",
        tap: "^19.2.0",
        typescript: "^4.8.4"
      },
      engines: {
        node: ">=12"
      },
      browser: {
        fs: false
      }
    };
  }
});

// node_modules/.bun/dotenv@17.3.1/node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/.bun/dotenv@17.3.1/node_modules/dotenv/lib/main.js"(exports, module) {
    var fs = __require("fs");
    var path = __require("path");
    var os = __require("os");
    var crypto = __require("crypto");
    var packageJson = require_package();
    var version = packageJson.version;
    var TIPS = [
      "\u{1F510} encrypt with Dotenvx: https://dotenvx.com",
      "\u{1F510} prevent committing .env to code: https://dotenvx.com/precommit",
      "\u{1F510} prevent building .env in docker: https://dotenvx.com/prebuild",
      "\u{1F916} agentic secret storage: https://dotenvx.com/as2",
      "\u26A1\uFE0F secrets for agents: https://dotenvx.com/as2",
      "\u{1F6E1}\uFE0F auth for agents: https://vestauth.com",
      "\u{1F6E0}\uFE0F  run anywhere with `dotenvx run -- yourcommand`",
      "\u2699\uFE0F  specify custom .env file path with { path: '/custom/path/.env' }",
      "\u2699\uFE0F  enable debug logging with { debug: true }",
      "\u2699\uFE0F  override existing env vars with { override: true }",
      "\u2699\uFE0F  suppress all logs with { quiet: true }",
      "\u2699\uFE0F  write to custom object with { processEnv: myObject }",
      "\u2699\uFE0F  load multiple .env files with { path: ['.env.local', '.env'] }"
    ];
    function _getRandomTip() {
      return TIPS[Math.floor(Math.random() * TIPS.length)];
    }
    function parseBoolean(value) {
      if (typeof value === "string") {
        return !["false", "0", "no", "off", ""].includes(value.toLowerCase());
      }
      return Boolean(value);
    }
    function supportsAnsi() {
      return process.stdout.isTTY;
    }
    function dim(text) {
      return supportsAnsi() ? `\x1B[2m${text}\x1B[0m` : text;
    }
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      options = options || {};
      const vaultPath = _vaultPath(options);
      options.path = vaultPath;
      const result = DotenvModule.configDotenv(options);
      if (!result.parsed) {
        const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err.code = "MISSING_DATA";
        throw err;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _warn(message) {
      console.error(`[dotenv@${version}][WARN] ${message}`);
    }
    function _debug(message) {
      console.log(`[dotenv@${version}][DEBUG] ${message}`);
    }
    function _log(message) {
      console.log(`[dotenv@${version}] ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err = new Error("INVALID_DOTENV_KEY: Missing key part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path.resolve(process.cwd(), ".env.vault");
      }
      if (fs.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path.join(os.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      const debug = parseBoolean(process.env.DOTENV_CONFIG_DEBUG || options && options.debug);
      const quiet = parseBoolean(process.env.DOTENV_CONFIG_QUIET || options && options.quiet);
      if (debug || !quiet) {
        _log("Loading env from encrypted .env.vault");
      }
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      const dotenvPath = path.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      let debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || options && options.debug);
      let quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || options && options.quiet);
      if (options && options.encoding) {
        encoding = options.encoding;
      } else {
        if (debug) {
          _debug("No encoding is specified. UTF-8 is used by default");
        }
      }
      let optionPaths = [dotenvPath];
      if (options && options.path) {
        if (!Array.isArray(options.path)) {
          optionPaths = [_resolveHome(options.path)];
        } else {
          optionPaths = [];
          for (const filepath of options.path) {
            optionPaths.push(_resolveHome(filepath));
          }
        }
      }
      let lastError;
      const parsedAll = {};
      for (const path2 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs.readFileSync(path2, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`Failed to load ${path2} ${e.message}`);
          }
          lastError = e;
        }
      }
      const populated = DotenvModule.populate(processEnv, parsedAll, options);
      debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || debug);
      quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || quiet);
      if (debug || !quiet) {
        const keysCount = Object.keys(populated).length;
        const shortPaths = [];
        for (const filePath of optionPaths) {
          try {
            const relative = path.relative(process.cwd(), filePath);
            shortPaths.push(relative);
          } catch (e) {
            if (debug) {
              _debug(`Failed to load ${filePath} ${e.message}`);
            }
            lastError = e;
          }
        }
        _log(`injecting env (${keysCount}) from ${shortPaths.join(",")} ${dim(`-- tip: ${_getRandomTip()}`)}`);
      }
      if (lastError) {
        return { parsed: parsedAll, error: lastError };
      } else {
        return { parsed: parsedAll };
      }
    }
    function config2(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        } else if (decryptionFailed) {
          const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err.code = "DECRYPTION_FAILED";
          throw err;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      const populated = {};
      if (typeof parsed !== "object") {
        const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err.code = "OBJECT_REQUIRED";
        throw err;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
            populated[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
          populated[key] = parsed[key];
        }
      }
      return populated;
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config: config2,
      decrypt,
      parse,
      populate
    };
    module.exports.configDotenv = DotenvModule.configDotenv;
    module.exports._configVault = DotenvModule._configVault;
    module.exports._parseVault = DotenvModule._parseVault;
    module.exports.config = DotenvModule.config;
    module.exports.decrypt = DotenvModule.decrypt;
    module.exports.parse = DotenvModule.parse;
    module.exports.populate = DotenvModule.populate;
    module.exports = DotenvModule;
  }
});

// packages/adapter-paperclip/standalone-adapter.ts
var import_dotenv = __toESM(require_main(), 1);
import { runChildProcess } from "@paperclipai/adapter-utils/server-utils";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
var adapterDir = dirname(fileURLToPath(import.meta.url));
var possibleEnvPaths = [
  resolve(adapterDir, ".env"),
  resolve(adapterDir, "..", "..", "..", ".env"),
  // adapter/../../../.env -> project root
  "/Users/louloulin/Documents/linchong/touzhi/dexter/.env"
];
for (const envPath of possibleEnvPaths) {
  try {
    (0, import_dotenv.config)({ path: envPath, override: false });
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
