#!/usr/bin/env python3
"""Convert an ASCII / box-drawing table from stdin into GitHub-flavored Markdown.

Supports:
  - Box-drawing tables using ┌─┬┐│├┼┤└┴┘
  - ASCII tables using +---+ / | / +===+
  - Tables without an explicit separator after the header (first data row
    becomes the header by default; pass --no-header to keep all rows as data
    with a synthesized "Col 1 | Col 2 ..." header)

Usage:
  pbpaste | to_md.py
  to_md.py < table.txt
  to_md.py --align center,left,right < table.txt
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import subprocess
import sys
from typing import List, Optional

# Linkify patterns (used with --linkify)
# 1. HTML anchor: <a href="URL">TITLE</a> (case-insensitive, single or double quotes)
ANCHOR_RE = re.compile(
    r'<a\s+[^>]*?href\s*=\s*["\\\'](?P<url>[^"\\\']+)["\\\'][^>]*>(?P<title>.*?)</a>',
    re.IGNORECASE | re.DOTALL,
)
# 2. Whole cell is "TITLE (URL)" — trailing http(s) URL in parens, non-empty title before
TITLE_PAREN_RE = re.compile(r'^\s*(?P<title>\S.*?)\s*\((?P<url>https?://[^\s)]+)\)\s*$')
# 3. Whole cell is "TITLE - URL" / "TITLE — URL" / "TITLE – URL" (space-dash-space separator)
TITLE_DASH_RE = re.compile(r'^\s*(?P<title>\S.*?)\s+[-\u2013\u2014]\s+(?P<url>https?://\S+?)\s*$')


def linkify_cell(s: str) -> str:
    """Convert link-like text in a cell to GFM `[title](url)`. Conservative — no false positives.

    Order: HTML anchor (anywhere in cell) → whole-cell "Title (URL)" → whole-cell "Title — URL".
    Bare URLs and `<URL>` autolinks are left alone (GFM auto-linkifies them).
    Cells already containing `[...](...)` Markdown links are left alone.
    """
    if not s:
        return s
    # Skip if a Markdown link is already present anywhere
    if re.search(r'\[[^\]]+\]\([^)]+\)', s):
        return s
    # 1. Replace ALL HTML anchors in place
    def _anchor_sub(m: re.Match) -> str:
        title = re.sub(r'\s+', ' ', m.group('title')).strip()
        url = m.group('url').strip()
        if not title:
            title = url
        return f"[{title}]({url})"
    new = ANCHOR_RE.sub(_anchor_sub, s)
    if new != s:
        return new
    # 2. Whole-cell "Title (URL)"
    m = TITLE_PAREN_RE.match(s)
    if m:
        title = m.group('title').strip()
        url = m.group('url').strip()
        # Guard: don't match if title is itself a URL
        if not re.match(r'^https?://', title):
            return f"[{title}]({url})"
    # 3. Whole-cell "Title - URL" / "Title — URL"
    m = TITLE_DASH_RE.match(s)
    if m:
        title = m.group('title').strip()
        url = m.group('url').strip()
        if not re.match(r'^https?://', title):
            return f"[{title}]({url})"
    return s


BOX_VERT = "│"
BOX_HORIZ_CHARS = set("─━═")
BOX_LEFT = set("├┝┠┣╞╟╠")
BOX_RIGHT = set("┤┥┨┫╡╢╣")
BOX_TOP = set("┌┍┎┏╒╓╔")
BOX_BOTTOM = set("└┕┖┗╘╙╚")
ALL_BORDER_CHARS = BOX_LEFT | BOX_RIGHT | BOX_TOP | BOX_BOTTOM | BOX_HORIZ_CHARS | {"┬", "┯", "┰", "┳", "╤", "╥", "╦", "┴", "┷", "┸", "┻", "╧", "╨", "╩", "┼", "┿", "╀", "╁", "╂", "╃", "╄", "╅", "╆", "╇", "╈", "╉", "╊", "╋", "╪", "╫", "╬", "+", "-", "="}
MARKDOWN_SEPARATOR_CELL_RE = re.compile(r"^:?-{3,}:?$")


def is_markdown_separator_line(line: str) -> bool:
    s = line.strip()
    if not (s.startswith("|") and s.endswith("|") and s.count("|") >= 2):
        return False
    cells = split_row(s)
    return len(cells) >= 2 and all(MARKDOWN_SEPARATOR_CELL_RE.match(c.strip()) for c in cells)


def is_separator_line(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    if is_markdown_separator_line(s):
        return True
    # Must contain at least one horizontal-rule char and only border-ish chars
    if not any(c in BOX_HORIZ_CHARS or c == "-" or c == "=" for c in s):
        return False
    return all((c in ALL_BORDER_CHARS or c.isspace()) for c in s)


def is_data_line(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    # Box-drawing: starts with │ or contains │
    if BOX_VERT in s:
        return True
    # Markdown separator rows are structural, not body data.
    if is_markdown_separator_line(s):
        return False
    # ASCII / Markdown pipe table rows: starts and ends with |
    if s.startswith("|") and s.endswith("|") and s.count("|") >= 2:
        return True
    return False


def split_row(line: str) -> List[str]:
    s = line.strip()
    # Strip leading/trailing border char
    if s and s[0] in (BOX_VERT, "|"):
        s = s[1:]
    if s and s[-1] in (BOX_VERT, "|"):
        s = s[:-1]
    parts = re.split(r"[│|]", s)
    return [p.strip() for p in parts]


def extract_tables(text: str) -> List[List[str]]:
    """Return list of tables, each a list of raw lines belonging to it."""
    tables: List[List[str]] = []
    current: List[str] = []
    for raw in text.splitlines():
        if is_data_line(raw) or is_separator_line(raw):
            current.append(raw)
        else:
            if current and any(is_data_line(l) for l in current):
                tables.append(current)
            current = []
    if current and any(is_data_line(l) for l in current):
        tables.append(current)
    # Filter: must have ≥1 data row with ≥2 columns
    out = []
    for t in tables:
        data_rows = [l for l in t if is_data_line(l)]
        if data_rows and len(split_row(data_rows[0])) >= 2:
            out.append(t)
    return out


def parse_table(lines: List[str], assume_header: bool = True) -> tuple[List[str], List[List[str]]]:
    data_rows = [split_row(l) for l in lines if is_data_line(l)]
    if not data_rows:
        return [], []
    width = max(len(r) for r in data_rows)
    data_rows = [r + [""] * (width - len(r)) for r in data_rows]
    if assume_header and len(data_rows) >= 1:
        header = data_rows[0]
        body = data_rows[1:]
    else:
        header = [f"Col {i+1}" for i in range(width)]
        body = data_rows
    return header, body


def infer_aligns(lines: List[str]) -> Optional[List[str]]:
    for line in lines:
        if not is_markdown_separator_line(line):
            continue
        aligns: List[str] = []
        for cell in split_row(line):
            s = cell.strip()
            left = s.startswith(":")
            right = s.endswith(":")
            if left and right:
                aligns.append("center")
            elif right:
                aligns.append("right")
            else:
                aligns.append("left")
        return aligns
    return None


def render_markdown(header: List[str], body: List[List[str]], aligns: Optional[List[str]] = None) -> str:
    width = len(header)
    if aligns is None:
        aligns = ["left"] * width
    aligns = (aligns + ["left"] * width)[:width]

    def sep(a: str) -> str:
        if a == "center":
            return ":---:"
        if a == "right":
            return "---:"
        if a == "left":
            return ":---"
        return "---"

    sep_row = [sep(a) for a in aligns]

    def fmt(row: List[str]) -> str:
        # Escape pipes inside cells
        cells = [c.replace("|", "\\|") for c in row]
        return "| " + " | ".join(cells) + " |"

    out_lines = [fmt(header), fmt(sep_row)]
    for row in body:
        out_lines.append(fmt(row))
    return "\n".join(out_lines) + "\n"


TABLE_HINT_RE = re.compile(r'[\u250c\u2510\u2514\u2518\u251c\u2524\u252c\u2534\u253c\u2502\u2500]|^\s*\+[-+]+\+', re.M)


_FILENAME_TS_RE = re.compile(r'^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_')


def _walk_to_pi() -> Optional[int]:
    """Walk up to 12 ancestors looking for a process whose `comm` is exactly `pi`."""
    pid = os.getpid()
    for _ in range(12):
        try:
            ppid = int(subprocess.check_output(
                ['ps', '-o', 'ppid=', '-p', str(pid)], text=True, stderr=subprocess.DEVNULL).strip())
        except (subprocess.CalledProcessError, ValueError):
            return None
        if ppid <= 1:
            return None
        try:
            comm = subprocess.check_output(
                ['ps', '-o', 'comm=', '-p', str(ppid)], text=True, stderr=subprocess.DEVNULL).strip()
        except subprocess.CalledProcessError:
            return None
        if comm == 'pi' or comm.endswith('/pi'):
            return ppid
        pid = ppid
    return None


def _pi_cwd(pi_pid: int) -> Optional[str]:
    """Get the cwd of the pi process via lsof."""
    try:
        out = subprocess.check_output(
            ['lsof', '-p', str(pi_pid), '-a', '-d', 'cwd', '-Fn'],
            text=True, stderr=subprocess.DEVNULL)
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    for line in out.splitlines():
        if line.startswith('n'):
            return line[1:]
    return None


def _pi_start_epoch(pi_pid: int) -> Optional[float]:
    """Get the start time of the pi process as a Unix epoch (float seconds)."""
    try:
        out = subprocess.check_output(
            ['ps', '-o', 'lstart=', '-p', str(pi_pid)], text=True, stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError:
        return None
    if not out:
        return None
    # macOS lstart format: 'Thu May 15 03:29:39 2026'
    import time
    for fmt in ('%a %b %d %H:%M:%S %Y', '%a %b  %d %H:%M:%S %Y'):
        try:
            return time.mktime(time.strptime(out, fmt))
        except ValueError:
            continue
    return None


def _cwd_to_session_slug(cwd: str) -> str:
    """Pi's session dir-slug rule: leading '--', trailing '--', '/' → '-'."""
    return '--' + cwd.replace('/', '-').strip('-') + '--'


def _filename_epoch(path: str) -> Optional[float]:
    """Parse the ISO timestamp out of pi's session jsonl filename, return Unix epoch."""
    m = _FILENAME_TS_RE.match(os.path.basename(path))
    if not m:
        return None
    import calendar
    yr, mo, dy, hr, mn, sc, ms = (int(g) for g in m.groups())
    return calendar.timegm((yr, mo, dy, hr, mn, sc, 0, 0, 0)) + ms / 1000.0


def _find_owning_pi_jsonl() -> Optional[str]:
    """Identify the active pi session jsonl even when multiple pi instances run concurrently.

    Strategy:
      1. Walk up to find the parent pi process.
      2. Get its cwd via `lsof -d cwd` → narrow candidates to that session-dir-slug.
      3. Get its start time via `ps -o lstart` → pick the jsonl whose filename timestamp
         is closest to (and not after) the pi start time.
    Returns None when any step fails.
    """
    base = os.path.expanduser(os.environ.get('PI_SESSIONS_DIR', '~/.pi/agent/sessions'))
    pi_pid = _walk_to_pi()
    if pi_pid is None:
        return None
    cwd = _pi_cwd(pi_pid)
    if cwd is None:
        return None
    slug = _cwd_to_session_slug(cwd)
    session_dir = os.path.join(base, slug)
    if not os.path.isdir(session_dir):
        return None
    candidates = glob.glob(os.path.join(session_dir, '*.jsonl'))
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    start = _pi_start_epoch(pi_pid)
    if start is None:
        # No start-time signal; fall back to most recent mtime within cwd-matching dir
        candidates.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        return candidates[0]
    # Pick the jsonl whose filename timestamp is closest to pi's start time, preferring <= start.
    scored = []
    for p in candidates:
        ft = _filename_epoch(p)
        if ft is None:
            continue
        delta = start - ft  # positive when filename is older than pi start
        # Strongly prefer filename created at-or-just-before pi start (delta in [-2, +5] sec).
        # Anything else gets penalized by absolute distance.
        scored.append((abs(delta) if -2 <= delta <= 5 else abs(delta) + 1000, p))
    if not scored:
        candidates.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        return candidates[0]
    scored.sort()
    return scored[0][1]


def read_pi_session() -> str:
    """Find the most recent text/toolResult block in the active pi session log that contains a table.

    Concurrency-safe: walks up to find the parent pi process and uses lsof to identify *that*
    pi's open session jsonl. Fails closed when discovery is ambiguous so sibling pi sessions
    cannot accidentally supply the clipboard table.
    """
    base = os.path.expanduser(os.environ.get('PI_SESSIONS_DIR', '~/.pi/agent/sessions'))
    latest = _find_owning_pi_jsonl()
    if latest is None:
        print(
            "--from-pi-session: could not identify owning pi session; refusing to pick "
            "a global latest session log because multiple active pi sessions can collide. "
            "Use /table-md, --from-file, or --from-clipboard.",
            file=sys.stderr,
        )
        sys.exit(1)

    def _block_text(blk) -> str:
        if not isinstance(blk, dict):
            return ''
        t = blk.get('type')
        if t == 'text':
            return blk.get('text') or ''
        if t == 'toolResult':
            # toolResult content may be str or list of {type:text, text:...}
            content = blk.get('content') or blk.get('result') or ''
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                parts = []
                for sub in content:
                    if isinstance(sub, dict) and sub.get('type') == 'text':
                        parts.append(sub.get('text') or '')
                    elif isinstance(sub, str):
                        parts.append(sub)
                return '\n'.join(parts)
        return ''

    candidates: List[str] = []
    with open(latest) as f:
        for line in f:
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            if d.get('type') != 'message':
                continue
            content = d.get('message', {}).get('content')
            if not isinstance(content, list):
                continue
            for blk in content:
                txt = _block_text(blk)
                if txt and TABLE_HINT_RE.search(txt):
                    candidates.append(txt)
    if not candidates:
        print(f"--from-pi-session: no table-shaped text found in {os.path.basename(latest)}", file=sys.stderr)
        sys.exit(1)
    # Most recent message wins
    return candidates[-1]


def read_input(args) -> str:
    if args.from_pi_session:
        return read_pi_session()
    if args.from_clipboard:
        try:
            return subprocess.check_output(["pbpaste"], text=True)
        except (FileNotFoundError, subprocess.CalledProcessError) as e:
            print(f"--from-clipboard failed: {e}", file=sys.stderr)
            sys.exit(1)
    if args.from_file:
        try:
            with open(args.from_file, "r") as f:
                return f.read()
        except OSError as e:
            print(f"--from-file: {e}", file=sys.stderr)
            sys.exit(1)
    return sys.stdin.read()


def tables_summary(tables: List[List[str]]) -> List[dict]:
    """Machine-readable list of tables: index, headers, rows, cols."""
    out = []
    for i, t in enumerate(tables, 1):
        data_rows = [split_row(l) for l in t if is_data_line(l)]
        if not data_rows:
            continue
        width = max(len(r) for r in data_rows)
        headers = (data_rows[0] + [""] * width)[:width]
        out.append({
            "index": i,
            "cols": width,
            "rows": max(0, len(data_rows) - 1),  # excluding header
            "headers": headers,
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Convert ASCII / box-drawing table to Markdown")
    ap.add_argument("--no-header", action="store_true", help="Treat all rows as data; synthesize headers")
    ap.add_argument("--align", default="", help="Comma-separated alignments per column: left,center,right")
    ap.add_argument("--index", default=None,
                    help="1-based table index to convert. Comma-separated for multiple (e.g. '1,3') — rendered tables are concatenated with a blank line and copied as one block. Without --index, multiple-table input emits a picker JSON and exits 2.")
    ap.add_argument("--drop-cols", default="",
                    help="Comma-separated 1-based column indices to drop, e.g. '2' or '1,3'. Applied after parsing.")
    ap.add_argument("--keep-cols", default="",
                    help="Comma-separated 1-based column indices to keep (in given order). Mutually exclusive with --drop-cols.")
    ap.add_argument("--from-clipboard", action="store_true", help="Read input from pbpaste instead of stdin.")
    ap.add_argument("--from-file", default="", help="Read input from this path instead of stdin.")
    ap.add_argument("--from-pi-session", action="store_true",
                    help="Auto-extract the most recent table-shaped text from the active pi session log (~/.pi/agent/sessions/**/*.jsonl). Zero chat retype.")
    ap.add_argument("--copy", action="store_true", help="Pipe rendered Markdown to pbcopy as well as stdout.")
    ap.add_argument("--auto", action="store_true",
                    help="Convenience: if exactly 1 table, convert it. If multiple and no --index, emit JSON picker on stdout and exit 2.")
    ap.add_argument("--list", action="store_true",
                    help="Just emit the table picker JSON ({tables: [...]}); exit 0 if any tables found, 1 otherwise.")
    ap.add_argument("--quiet", action="store_true",
                    help="Suppress rendered Markdown on stdout. Use with --copy when only the clipboard side-effect is wanted.")
    ap.add_argument("--summary", action="store_true",
                    help="Print a one-line '✓ N rows × M cols copied' summary on stderr (auto-on with --copy).")
    ap.add_argument("--linkify", action="store_true",
                    help="Convert link-like cell text to [title](url): HTML <a> tags, 'Title (url)', 'Title - url', 'Title — url'. Bare URLs are left alone (GFM auto-linkifies them).")
    args = ap.parse_args()

    if args.drop_cols and args.keep_cols:
        print("--drop-cols and --keep-cols are mutually exclusive", file=sys.stderr)
        return 1
    sources = sum([bool(args.from_clipboard), bool(args.from_file), bool(args.from_pi_session)])
    if sources > 1:
        print("--from-clipboard / --from-file / --from-pi-session are mutually exclusive", file=sys.stderr)
        return 1

    text = read_input(args)
    tables = extract_tables(text)
    if not tables:
        if args.list:
            print(json.dumps({"tables": []}))
        else:
            print("No table detected in input.", file=sys.stderr)
        return 1

    if args.list:
        print(json.dumps({"tables": tables_summary(tables)}))
        return 0

    # Parse --index into a list of 1-based ints (supports "2" or "1,3")
    indices: List[int] = []
    if args.index is not None:
        try:
            indices = [int(x.strip()) for x in str(args.index).split(",") if x.strip()]
        except ValueError:
            print("--index must be int or comma-separated ints (e.g. '1,3')", file=sys.stderr)
            return 1
        bad = [i for i in indices if i < 1 or i > len(tables)]
        if bad:
            print(f"--index out of range: {bad} (input has {len(tables)} tables)", file=sys.stderr)
            return 1

    if len(tables) > 1 and not indices:
        # Machine-readable picker JSON on stdout, also human line on stderr.
        summary = tables_summary(tables)
        print(json.dumps({"tables": summary, "need_pick": True}))
        print(f"{len(tables)} tables detected. Re-run with --index N (1-based; comma-separated for multi-select).", file=sys.stderr)
        for t in summary:
            print(f"  [{t['index']}] {t['cols']} cols x {t['rows']} rows: {t['headers']}", file=sys.stderr)
        return 2

    if not indices:
        indices = [1]

    rendered_parts: List[str] = []
    total_rows = 0
    last_cols = 0
    for idx in indices:
        chosen = tables[idx - 1]
        header, body = parse_table(chosen, assume_header=not args.no_header)
        aligns = [a.strip() for a in args.align.split(",") if a.strip()] or infer_aligns(chosen)
        width = len(header)
        if args.keep_cols:
            try:
                keep = [int(x.strip()) - 1 for x in args.keep_cols.split(",") if x.strip()]
            except ValueError:
                print("--keep-cols must be comma-separated integers", file=sys.stderr)
                return 1
            bad = [i + 1 for i in keep if i < 0 or i >= width]
            if bad:
                print(f"--keep-cols out of range for table {idx}: {bad} (table has {width} cols)", file=sys.stderr)
                return 1
            header = [header[i] for i in keep]
            body = [[row[i] for i in keep] for row in body]
            if aligns is not None:
                aligns = [aligns[i] if i < len(aligns) else "left" for i in keep]
        elif args.drop_cols:
            try:
                drop = {int(x.strip()) - 1 for x in args.drop_cols.split(",") if x.strip()}
            except ValueError:
                print("--drop-cols must be comma-separated integers", file=sys.stderr)
                return 1
            bad = [i + 1 for i in drop if i < 0 or i >= width]
            if bad:
                print(f"--drop-cols out of range for table {idx}: {bad} (table has {width} cols)", file=sys.stderr)
                return 1
            keep = [i for i in range(width) if i not in drop]
            if not keep:
                print(f"--drop-cols would drop all columns of table {idx}", file=sys.stderr)
                return 1
            header = [header[i] for i in keep]
            body = [[row[i] for i in keep] for row in body]
            if aligns is not None:
                aligns = [aligns[i] if i < len(aligns) else "left" for i in keep]
        if args.linkify:
            header = [linkify_cell(c) for c in header]
            body = [[linkify_cell(c) for c in row] for row in body]
        rendered_parts.append(render_markdown(header, body, aligns))
        total_rows += len(body)
        last_cols = len(header)

    rendered = "\n".join(rendered_parts)  # parts already end in \n; blank line between tables
    if not args.quiet:
        sys.stdout.write(rendered)
    if args.copy:
        try:
            subprocess.run(["pbcopy"], input=rendered, text=True, check=True)
        except (FileNotFoundError, subprocess.CalledProcessError) as e:
            print(f"pbcopy failed: {e}", file=sys.stderr)
            return 1
    if args.summary or args.copy:
        verb = "copied" if args.copy else "rendered"
        if len(indices) == 1:
            print(f"✓ {total_rows} rows × {last_cols} cols {verb}.", file=sys.stderr)
        else:
            print(f"✓ {len(indices)} tables ({total_rows} total rows) {verb}.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
