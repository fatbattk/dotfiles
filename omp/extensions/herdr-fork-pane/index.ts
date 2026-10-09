/**
 * herdr-fork-pane — fork the current omp conversation into a sibling herdr pane.
 *
 *   /fork-right [prompt]   split right, fork, focus the new pane
 *   /fork-down  [prompt]   same, splitting downward
 *
 * The original conversation is never mutated: `omp --fork` copies the
 * transcript into a brand-new session file and leaves the source untouched.
 * Any trailing text becomes the fork's opening prompt, so the two agents
 * diverge from a shared history in one keystroke.
 *
 * Split ratio comes from HERDR_FORK_RATIO (default 0.5).
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const HERDR = process.env.HERDR_BIN_PATH || "herdr";
const DEFAULT_RATIO = 0.5;

type Direction = "right" | "down";

interface HerdrResult {
  stdout: string;
  error?: string;
}

/**
 * Read one property off an untrusted JSON value. Returns `undefined` unless
 * `value` really is an object carrying `key`, so every hop through a herdr
 * response is checked rather than asserted.
 */
function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) return undefined;
  return Reflect.get(value, key);
}

/**
 * Run the herdr CLI. Server-side failures arrive as JSON on stderr with exit 1
 * (protocol mismatches, dead sockets); syntax errors exit 2 with bare text.
 * Both are surfaced rather than collapsed into an empty string, so a broken
 * fork reports why instead of silently doing nothing.
 */
function runHerdr(args: string[]): HerdrResult {
  const proc = spawnSync(HERDR, args, { encoding: "utf8" });
  if (proc.error) {
    return { stdout: "", error: `cannot run ${HERDR}: ${proc.error.message}` };
  }
  const stdout = (proc.stdout || "").trim();
  if (proc.status === 0) return { stdout };

  const stderr = (proc.stderr || "").trim();
  // Server errors are JSON: {"id":...,"error":{"code":...,"message":...}}
  try {
    const message = field(field(JSON.parse(stderr), "error"), "message");
    if (typeof message === "string" && message.length > 0) {
      return { stdout, error: message };
    }
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return { stdout, error: stderr || `${HERDR} ${args[0]} exited ${proc.status}` };
}

/** POSIX single-quote for text typed into the new pane's shell. */
function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function splitRatio(): number {
  const raw = process.env.HERDR_FORK_RATIO;
  if (!raw) return DEFAULT_RATIO;
  const parsed = Number.parseFloat(raw);
  // Reject 0, 1, NaN and anything outside them: herdr would either error or
  // produce a zero-width pane, which looks like the fork silently failed.
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) return DEFAULT_RATIO;
  return parsed;
}

/** Pull `.result.pane.pane_id` out of a `pane split` response. */
function newPaneId(stdout: string): string | undefined {
  try {
    const id = field(field(field(JSON.parse(stdout), "result"), "pane"), "pane_id");
    return typeof id === "string" && id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

async function forkIntoPane(
  direction: Direction,
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const paneId = process.env.HERDR_PANE_ID;
  if (process.env.HERDR_ENV !== "1" || !paneId) {
    ctx.ui.notify("fork: not running inside herdr (HERDR_PANE_ID unset).", "warn");
    return;
  }

  // Let the in-flight turn land first; `omp --fork` reads the transcript from
  // disk, so anything still streaming would be missing from the copy.
  await ctx.waitForIdle();

  const sessionFile = ctx.sessionManager.getSessionFile();
  if (!sessionFile || !existsSync(sessionFile)) {
    ctx.ui.notify("fork: this session isn't persisted, nothing to fork.", "warn");
    return;
  }

  const split = runHerdr([
    "pane",
    "split",
    "--pane",
    paneId,
    "--direction",
    direction,
    "--ratio",
    String(splitRatio()),
    "--cwd",
    ctx.cwd,
    "--focus",
  ]);
  if (split.error) {
    ctx.ui.notify(`fork: split failed — ${split.error}`, "error");
    return;
  }

  const targetPane = newPaneId(split.stdout);
  if (!targetPane) {
    ctx.ui.notify("fork: herdr split returned no pane id.", "error");
    return;
  }

  // Deliberately no --model: the forked transcript replays its own recorded
  // model, and leaving the provider route untouched is what lets omp inherit
  // the source session's prompt-cache key.
  const prompt = args.trim();
  const command = `omp --fork ${shq(sessionFile)}${prompt ? ` ${shq(prompt)}` : ""}`;

  const label = ctx.sessionManager.getSessionName();
  runHerdr(["pane", "rename", targetPane, label ? `🌿 ${label} (fork)` : "🌿 fork"]);

  const launch = runHerdr(["pane", "run", targetPane, command]);
  if (launch.error) {
    ctx.ui.notify(`fork: pane opened but omp failed to launch — ${launch.error}`, "error");
    return;
  }

  ctx.ui.notify(
    prompt ? `Forked ${direction} and sent: ${prompt}` : `Forked ${direction}.`,
    "info",
  );
}

export default function (pi: ExtensionAPI) {
  for (const direction of ["right", "down"] as const) {
    pi.registerCommand(`fork-${direction}`, {
      description: `Fork this conversation into a new pane ${direction} (optional prompt seeds it)`,
      handler: async (args, ctx) => forkIntoPane(direction, args, ctx),
    });
  }
}
