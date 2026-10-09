const TABLE_HINT_RE = /[┌┐└┘├┤┬┴┼│─]|^\s*\+[-+]+\+|^\s*\|.*\|\s*\n\s*\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|\s*$/m;
const BARE_INDEX_RE = /^\d+(?:,\d+)*$/;

const BOOLEAN_FLAGS = new Set(['--linkify', '--no-header']);
const VALUE_FLAGS = new Set(['--index', '--drop-cols', '--keep-cols', '--align']);
const EXTENSION_OWNED_FLAGS = new Set([
  '--auto',
  '--copy',
  '--quiet',
  '--summary',
  '--list',
  '--from-pi-session',
  '--from-clipboard',
  '--from-file',
]);

export function contentToText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  const parts = [];
  for (const block of content) {
    if (typeof block === 'string') {
      parts.push(block);
    } else if (block && typeof block === 'object' && block.type === 'text') {
      parts.push(typeof block.text === 'string' ? block.text : '');
    }
  }
  return parts.join('\n');
}

export function messageToText(message) {
  if (!message || typeof message !== 'object') return '';
  if (typeof message.output === 'string') return message.output;
  return contentToText(message.content);
}

export function tableCandidateTextsFromEntries(entries) {
  const candidates = [];
  if (!Array.isArray(entries)) return candidates;

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;

    const texts = [];
    if (entry.type === 'message' || 'message' in entry) {
      texts.push(messageToText(entry.message));
    } else if (entry.type === 'custom_message') {
      texts.push(contentToText(entry.content));
    } else if (typeof entry.output === 'string') {
      texts.push(entry.output);
    }

    for (const text of texts) {
      if (text && TABLE_HINT_RE.test(text)) {
        candidates.push(text);
      }
    }
  }

  return candidates;
}

export function findLatestTableText(entries) {
  const candidates = tableCandidateTextsFromEntries(entries);
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

function splitArgs(input) {
  return input.trim().split(/\s+/).filter(Boolean);
}

export function parseTableMdArgs(input) {
  const tokens = splitArgs(input ?? '');
  const scriptArgs = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === '--help' || token === '-h' || token === 'help') {
      return { scriptArgs: [], help: true };
    }

    if (BARE_INDEX_RE.test(token)) {
      scriptArgs.push('--index', token);
      continue;
    }

    const eq = token.indexOf('=');
    if (eq > 0) {
      const flag = token.slice(0, eq);
      const value = token.slice(eq + 1);
      if (VALUE_FLAGS.has(flag)) {
        if (!value) {
          return { scriptArgs: [], help: false, error: `${flag} requires a value` };
        }
        scriptArgs.push(flag, value);
        continue;
      }
      if (EXTENSION_OWNED_FLAGS.has(flag) || BOOLEAN_FLAGS.has(flag)) {
        return { scriptArgs: [], help: false, error: `Unsupported argument: ${token}` };
      }
    }

    if (BOOLEAN_FLAGS.has(token)) {
      scriptArgs.push(token);
      continue;
    }

    if (VALUE_FLAGS.has(token)) {
      const value = tokens[i + 1];
      if (!value || value.startsWith('--')) {
        return { scriptArgs: [], help: false, error: `${token} requires a value` };
      }
      scriptArgs.push(token, value);
      i++;
      continue;
    }

    if (EXTENSION_OWNED_FLAGS.has(token)) {
      return { scriptArgs: [], help: false, error: `Unsupported argument: ${token}` };
    }

    return { scriptArgs: [], help: false, error: `Unsupported argument: ${token}` };
  }

  return { scriptArgs, help: false };
}

export function withoutIndexArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--index') {
      i++;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

export function pickerPromptFromTables(tables) {
  return tables
    .map((table) => {
      const headers = Array.isArray(table.headers) ? table.headers.filter(Boolean).join(', ') : '';
      const suffix = headers ? ` — ${headers}` : '';
      return `${table.index}: ${table.rows} rows × ${table.cols} cols${suffix}`;
    })
    .join('\n');
}
