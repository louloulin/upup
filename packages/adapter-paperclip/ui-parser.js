/**
 * UI Parser for UpUp Agent
 *
 * Parses ACPX events from UpUp agent stdout into UI-friendly format.
 * Self-contained ESM module with zero runtime dependencies.
 */

const CONTRACT_VERSION = "1";

/**
 * Parse a single line of ACPX output
 * @param {string} line - Raw stdout line
 * @returns {object|null} Parsed entry or null
 */
function parseLine(line) {
  if (!line || !line.trim()) return null;

  // Try to parse as JSON
  if (line.startsWith('{')) {
    try {
      const obj = JSON.parse(line);
      return parseAcpxEvent(obj);
    } catch {
      return { kind: 'stdout', text: line };
    }
  }

  // Check for special markers
  if (line.startsWith('[upup]')) {
    return { kind: 'system', text: line };
  }

  if (line.startsWith('[paperclip]')) {
    return { kind: 'system', text: line };
  }

  // Fallback: treat as stdout
  return { kind: 'stdout', text: line };
}

/**
 * Parse an ACPX event object
 * @param {object} obj - ACPX event object
 * @returns {object} Parsed entry
 */
function parseAcpxEvent(obj) {
  const ts = new Date().toISOString();

  switch (obj.type) {
    case 'acpx.result':
      return {
        kind: 'result',
        text: obj.summary || '',
        stopReason: obj.stopReason || 'unknown',
        usage: obj.usage,
        totalTimeMs: obj.totalTimeMs,
        ts,
      };

    case 'acpx.text_delta':
      if (obj.channel === 'thought') {
        return {
          kind: 'thinking',
          text: obj.text,
          ts,
        };
      }
      return {
        kind: 'assistant',
        text: obj.text,
        delta: true,
        ts,
      };

    case 'acpx.tool_call':
      if (obj.status === 'pending') {
        return {
          kind: 'tool_call',
          name: obj.name,
          input: parseJsonSafe(obj.text),
          toolUseId: obj.toolCallId,
          ts,
        };
      } else if (obj.status === 'completed') {
        return {
          kind: 'tool_result',
          toolName: obj.name,
          content: truncateText(obj.text, 500),
          isError: false,
          ts,
        };
      }
      return null;

    case 'acpx.error':
      return {
        kind: 'stderr',
        text: `[${obj.code || 'error'}] ${obj.message}`,
        ts,
      };

    default:
      return null;
  }
}

/**
 * Safely parse JSON, return original string on failure
 * @param {string} text - JSON string
 * @returns {object|string}
 */
function parseJsonSafe(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Truncate text to max length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string}
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Parse multiple lines from stdout
 * @param {string} stdout - Full stdout content
 * @returns {Array} Array of parsed entries
 */
function parseTranscript(stdout) {
  if (!stdout) return [];

  const lines = stdout.split('\n');
  const entries = [];

  for (const line of lines) {
    const entry = parseLine(line);
    if (entry) entries.push(entry);
  }

  return entries;
}

/**
 * Format a heartbeat report from parsed entries
 * @param {Array} entries - Parsed entries
 * @returns {object} Summary object
 */
function formatHeartbeatReport(entries) {
  const result = entries.find(e => e.kind === 'result');
  if (!result) return null;

  return {
    summary: result.text,
    stopReason: result.stopReason,
    tokens: result.usage,
    duration: result.totalTimeMs,
  };
}

// ESM export
export { parseLine, parseAcpxEvent, parseTranscript, formatHeartbeatReport, CONTRACT_VERSION };

// Also attach to window for browser usage
if (typeof globalThis !== 'undefined') {
  globalThis.upupUiParser = {
    parseLine,
    parseAcpxEvent,
    parseTranscript,
    formatHeartbeatReport,
    CONTRACT_VERSION,
  };
}
