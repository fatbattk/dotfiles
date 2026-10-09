// Pure, dependency-free helpers for the /copy-clean extension.
// Cleans the artifacts left behind when you copy multi-line pi (TUI) output
// out of a terminal: full-width trailing-space padding, a leading box indent,
// space-filled "blank" rows, stray ANSI codes / unicode spaces, and lines that
// were hard-wrapped at the terminal width.

// Canonical ansi-regex pattern (covers CSI + OSC sequences).
const ANSI_RE =
  // eslint-disable-next-line no-control-regex
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

// Vertical glyphs that show up as a left border in box-drawn output (tables,
// grokt panels, quote bars). Stripped only when they prefix most lines.
const BORDER_PREFIX_RE = /^([\u2502\u2503\u2506\u2507\u250A\u250B\u2551\u258C\u258F\u2595\u2590\u23B8\u23B9\u254E\u254F])\s?/;

// Markers that signal a new structured block we must not merge a wrap into.
const STRUCTURED_RE = /^(?:[-*+]\s|\d+[.)]\s|>\s|#{1,6}\s|\|)/;

const MIN_WRAP_WIDTH = 40; // below this we assume text wasn't terminal-wrapped
const WRAP_MIN_FRACTION = 0.6; // a line must fill >= this share of the width to count as wrapped

function leadingSpaces(line) {
  const m = /^ */.exec(line);
  return m ? m[0].length : 0;
}

function firstWordLength(line) {
  const m = /^\s*(\S+)/.exec(line);
  return m ? m[1].length : 0;
}

function normalizeUnicode(text) {
  return text
    // Collapse the various unicode space glyphs to a plain space.
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    // Drop zero-width / invisible characters and soft hyphens entirely.
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "");
}

function stripBorderPrefix(lines) {
  const nonBlank = lines.filter((l) => l.trim() !== "");
  if (nonBlank.length === 0) return { lines, stripped: false };
  const matches = nonBlank.filter((l) => BORDER_PREFIX_RE.test(l)).length;
  // Only strip when the border clearly frames the block (>= 60% of lines).
  if (matches / nonBlank.length < 0.6) return { lines, stripped: false };
  return {
    lines: lines.map((l) => l.replace(BORDER_PREFIX_RE, "")),
    stripped: true,
  };
}

function commonIndent(lines) {
  let min = Infinity;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const n = leadingSpaces(line);
    if (n < min) min = n;
    if (min === 0) break;
  }
  return min === Infinity ? 0 : min;
}

// Rejoin lines the terminal hard-wrapped at its width. Trailing padding is
// already stripped by this stage, so we can't rely on exact width: word-wrapped
// lines vary by a whole word. Instead we use the word-fit rule — a line was
// wrapped if the next line's first word would have overflowed the content
// width. The final segment of a paragraph is short, so it never triggers a join.
function dewrap(lines) {
  const widths = lines.filter((l) => l.trim() !== "").map((l) => l.length);
  if (widths.length === 0) return { lines, joined: 0 };

  const width = Math.max(...widths);
  if (width < MIN_WRAP_WIDTH) return { lines, joined: 0 };
  const minLen = width * WRAP_MIN_FRACTION;

  const wasWrapped = (cur, next) =>
    cur.length >= minLen &&
    cur.replace(/\s+$/, "").length + 1 + firstWordLength(next) > width;

  const out = [];
  let joined = 0;
  let i = 0;
  while (i < lines.length) {
    let cur = lines[i];
    if (cur.trim() === "") {
      out.push(cur);
      i++;
      continue;
    }
    while (
      i + 1 < lines.length &&
      lines[i + 1].trim() !== "" &&
      leadingSpaces(lines[i + 1]) <= leadingSpaces(cur) &&
      !STRUCTURED_RE.test(lines[i + 1].trimStart()) &&
      wasWrapped(cur, lines[i + 1])
    ) {
      cur = cur.replace(/\s+$/, "") + " " + lines[i + 1].replace(/^\s+/, "");
      joined++;
      i++;
    }
    out.push(cur);
    i++;
  }
  return { lines: out, joined };
}

function collapseBlankRuns(lines) {
  const out = [];
  let collapsed = 0;
  let prevBlank = false;
  for (const line of lines) {
    const blank = line.trim() === "";
    if (blank && prevBlank) {
      collapsed++;
      continue;
    }
    out.push(line);
    prevBlank = blank;
  }
  return { lines: out, collapsed };
}

function trimBlankEdges(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end);
}

/**
 * Clean copy-pasted pi/terminal output.
 * @param {string} raw
 * @param {{ dewrap?: boolean }} [opts]
 * @returns {{ text: string, stats: object }}
 */
export function cleanPiOutput(raw, opts = {}) {
  const dewrapEnabled = opts.dewrap !== false;
  const charsBefore = raw.length;

  // Stage 1 — normalize encodings.
  let text = raw.replace(/\r\n?/g, "\n");
  text = text.replace(ANSI_RE, "");
  text = normalizeUnicode(text);

  // Stage 2 — per-line trailing whitespace (the full-width padding).
  let lines = text.split("\n");
  const linesBefore = lines.length;
  let trailingCharsRemoved = 0;
  lines = lines.map((line) => {
    const trimmed = line.replace(/[ \t]+$/, "");
    trailingCharsRemoved += line.length - trimmed.length;
    return trimmed;
  });

  // Stage 3 — strip a framing border, then dedent the common left indent.
  const border = stripBorderPrefix(lines);
  lines = border.lines;
  const dedent = commonIndent(lines);
  if (dedent > 0) lines = lines.map((l) => (l.trim() === "" ? "" : l.slice(dedent)));

  // Stage 4 — rejoin terminal-wrapped lines.
  let joined = 0;
  if (dewrapEnabled) {
    const result = dewrap(lines);
    lines = result.lines;
    joined = result.joined;
  }

  // Stage 5 — collapse blank runs and trim edges.
  const collapse = collapseBlankRuns(lines);
  lines = trimBlankEdges(collapse.lines);

  const out = lines.join("\n");
  return {
    text: out,
    stats: {
      charsBefore,
      charsAfter: out.length,
      linesBefore,
      linesAfter: lines.length,
      trailingCharsRemoved,
      borderStripped: border.stripped,
      dedent,
      joined,
      blanksCollapsed: collapse.collapsed,
      changed: out !== raw,
      empty: out.trim() === "",
    },
  };
}

/** Parse the slash-command argument string. */
export function parseCopyCleanArgs(rawArgs) {
  const tokens = (rawArgs || "").trim().split(/\s+/).filter(Boolean);
  const result = { dewrap: true, help: false, error: undefined };
  for (const token of tokens) {
    switch (token) {
      case "-h":
      case "--help":
        result.help = true;
        break;
      case "--no-dewrap":
      case "--keep-wrap":
        result.dewrap = false;
        break;
      default:
        result.error = `Unknown option: ${token}`;
    }
  }
  return result;
}

/** One-line human summary of what the cleaner changed. */
export function summarizeClean(stats) {
  if (stats.empty) return "Clipboard is empty — nothing to clean.";
  if (!stats.changed) return "Clipboard already clean — no changes.";
  const parts = [];
  if (stats.linesBefore !== stats.linesAfter) {
    parts.push(`${stats.linesBefore}\u2192${stats.linesAfter} lines`);
  }
  if (stats.trailingCharsRemoved > 0) {
    parts.push(`-${stats.trailingCharsRemoved} trailing chars`);
  }
  if (stats.dedent > 0) parts.push(`dedented ${stats.dedent}`);
  if (stats.borderStripped) parts.push("border stripped");
  if (stats.joined > 0) parts.push(`de-wrapped ${stats.joined}`);
  if (stats.blanksCollapsed > 0) parts.push(`-${stats.blanksCollapsed} blank`);
  const detail = parts.length ? ` (${parts.join(", ")})` : "";
  return `\u2713 Cleaned clipboard${detail}.`;
}
