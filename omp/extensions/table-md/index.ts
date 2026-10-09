import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findLatestTableText,
  parseTableMdArgs,
  pickerPromptFromTables,
  withoutIndexArgs,
} from "./helpers.mjs";

const CONVERTER = join(dirname(fileURLToPath(import.meta.url)), "scripts", "to_md.py");

const USAGE = [
  "Usage: /table-md [index|index,index] [--linkify] [--no-header] [--drop-cols N[,N]] [--keep-cols N[,N]] [--align left,center,right]",
  "Examples: /table-md, /table-md 2, /table-md 1,3 --linkify, /table-md --drop-cols 4",
].join("\n");

type NotifyLevel = "info" | "warning" | "error";

type TableMdContext = ExtensionContext & {
  ui: ExtensionContext["ui"] & {
    input(prompt: string, placeholder?: string): Promise<string | undefined>;
    notify(message: string, level?: NotifyLevel): void;
  };
};

interface ConverterResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runConverter(tableText: string, scriptArgs: string[]): ConverterResult {
  const result = spawnSync(
    "python3",
    [CONVERTER, "--auto", "--copy", "--quiet", ...scriptArgs],
    {
      input: tableText,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    },
  );

  return {
    code: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr:
      result.stderr ??
      (result.error instanceof Error ? result.error.message : "Unknown converter error"),
  };
}

function summarize(stderr: string): string {
  const lines = stderr.trim().split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => line.startsWith("✓")) ?? lines[lines.length - 1] ?? "Copied table markdown.";
}

function parsePicker(stdout: string): { tables?: unknown[] } | null {
  try {
    const parsed = JSON.parse(stdout);
    if (parsed && Array.isArray(parsed.tables)) return parsed;
  } catch {
    // Fall through to null.
  }
  return null;
}

function normalizeSkillArgs(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "/skill:table-md") return "";
  if (trimmed.startsWith("/skill:table-md ")) return trimmed.slice("/skill:table-md".length).trim();
  return null;
}

async function copyTableMd(rawArgs: string, ctx: TableMdContext): Promise<void> {
  const parsed = parseTableMdArgs(rawArgs);
  if (parsed.help) {
    ctx.ui.notify(USAGE, "info");
    return;
  }
  if (parsed.error) {
    ctx.ui.notify(`${parsed.error}\n${USAGE}`, "error");
    return;
  }

  const tableText = findLatestTableText(ctx.sessionManager.getBranch());
  if (!tableText) {
    ctx.ui.notify("No table-shaped text found in the current session branch.", "warning");
    return;
  }

  let result = runConverter(tableText, parsed.scriptArgs);
  if (result.code === 0) {
    ctx.ui.notify(summarize(result.stderr), "info");
    return;
  }

  if (result.code === 2) {
    const picker = parsePicker(result.stdout);
    const tables = picker?.tables ?? [];
    const prompt = [
      `${tables.length} tables detected. Enter one index or comma-separated indexes:`,
      pickerPromptFromTables(tables),
    ]
      .filter(Boolean)
      .join("\n");
    const answer = await ctx.ui.input(prompt, "e.g. 1 or 1,3");
    const index = answer?.trim();
    if (!index) {
      ctx.ui.notify("Cancelled table-md copy.", "warning");
      return;
    }
    result = runConverter(tableText, [...withoutIndexArgs(parsed.scriptArgs), "--index", index]);
    if (result.code === 0) {
      ctx.ui.notify(summarize(result.stderr), "info");
      return;
    }
  }

  ctx.ui.notify((result.stderr || result.stdout || "table-md failed").trim(), "error");
}

export default function tableMd(pi: ExtensionAPI) {
  pi.registerCommand("table-md", {
    description: "Copy the latest table from the current session to the clipboard as GitHub-flavored Markdown",
    handler: async (args, ctx) => {
      await copyTableMd(args, ctx as TableMdContext);
    },
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" };
    const args = normalizeSkillArgs(event.text);
    if (args === null) return { action: "continue" };

    await copyTableMd(args, ctx as TableMdContext);
    return { action: "handled" };
  });
}
