import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { platform } from "node:os";
// @ts-expect-error -- plain ESM helper, no type declarations.
import { cleanPiOutput, parseCopyCleanArgs, summarizeClean } from "./helpers.mjs";

const USAGE = [
  "Usage: /copy-clean [--no-dewrap]",
  "Reads the clipboard, strips TUI/terminal copy-paste artifacts (trailing padding,",
  "leading indent, space-filled blank lines, stray ANSI/unicode, wrapped lines),",
  "and writes the cleaned text back to the clipboard.",
  "  --no-dewrap   keep line breaks; only strip padding/borders/whitespace",
].join("\n");

interface ClipboardCommands {
  read: string[];
  write: string[];
}

function clipboardCommands(): ClipboardCommands | null {
  switch (platform()) {
    case "darwin":
      return { read: ["pbpaste"], write: ["pbcopy"] };
    case "linux":
      // wl-clipboard (Wayland) is the only supported Linux backend.
      return { read: ["wl-paste", "--no-newline"], write: ["wl-copy"] };
    default:
      return null;
  }
}

function readClipboard(cmd: string[]): { text?: string; error?: string } {
  const [bin, ...args] = cmd;
  const result = spawnSync(bin, args, { encoding: "utf8", timeout: 5000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) return { error: result.error.message };
  if (typeof result.status === "number" && result.status !== 0) {
    return { error: (result.stderr || `${bin} exited ${result.status}`).trim() };
  }
  return { text: result.stdout ?? "" };
}

function writeClipboard(cmd: string[], text: string): { error?: string } {
  const [bin, ...args] = cmd;
  const result = spawnSync(bin, args, { input: text, encoding: "utf8", timeout: 5000 });
  if (result.error) return { error: result.error.message };
  if (typeof result.status === "number" && result.status !== 0) {
    return { error: (result.stderr || `${bin} exited ${result.status}`).trim() };
  }
  return {};
}

async function runCopyClean(rawArgs: string, ctx: ExtensionContext): Promise<void> {
  const parsed = parseCopyCleanArgs(rawArgs);
  if (parsed.help) {
    ctx.ui.notify(USAGE, "info");
    return;
  }
  if (parsed.error) {
    ctx.ui.notify(`${parsed.error}\n${USAGE}`, "error");
    return;
  }

  const cmds = clipboardCommands();
  if (!cmds) {
    ctx.ui.notify(`Unsupported platform: ${platform()} (need pbpaste/pbcopy or wl-clipboard).`, "error");
    return;
  }

  const read = readClipboard(cmds.read);
  if (read.error) {
    ctx.ui.notify(`Could not read clipboard: ${read.error}`, "error");
    return;
  }

  const { text, stats } = cleanPiOutput(read.text ?? "", { dewrap: parsed.dewrap });

  if (stats.empty || !stats.changed) {
    ctx.ui.notify(summarizeClean(stats), stats.empty ? "warning" : "info");
    return;
  }

  const write = writeClipboard(cmds.write, text);
  if (write.error) {
    ctx.ui.notify(`Cleaned, but could not write clipboard: ${write.error}`, "error");
    return;
  }

  ctx.ui.notify(summarizeClean(stats), "info");
}

export default function copyClean(pi: ExtensionAPI): void {
  const handler = async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
    await runCopyClean(args, ctx);
  };

  pi.registerCommand("copy-clean", {
    description: "Clean TUI/terminal copy-paste artifacts from the clipboard (in place)",
    handler,
  });

  // Registered as a real command, not an `aliases` field: OMP maps extension
  // commands into the TUI list as { name, description, getArgumentCompletions }
  // (interactive-mode.ts), so any extra `aliases` key is dropped before the
  // autocomplete scorer ever sees it. A literal `cc` name scores an exact match
  // (1000) and beats the subsequence matches — /reconnect, /compact, several
  // /skill:* — that otherwise tie at 35 and win on registry order.
  pi.registerCommand("cc", {
    description: "Alias of /copy-clean — clean clipboard copy-paste artifacts",
    handler,
  });
}

export const __test = { clipboardCommands, runCopyClean };
