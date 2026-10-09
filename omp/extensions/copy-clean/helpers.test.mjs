import test from "node:test";
import assert from "node:assert/strict";
import { cleanPiOutput, parseCopyCleanArgs, summarizeClean } from "./helpers.mjs";

// Simulate pi Box output: 1-space left indent + every line right-padded to width 60.
const W = 60;
function row(content) {
  const indented = " " + content;
  return indented + " ".repeat(Math.max(0, W - indented.length));
}

test("strips trailing full-width padding and leading box indent", () => {
  const raw = [row("Hello world"), row("second line")].join("\n");
  const { text, stats } = cleanPiOutput(raw, { dewrap: false });
  assert.equal(text, "Hello world\nsecond line");
  assert.equal(stats.dedent, 1);
  assert.ok(stats.trailingCharsRemoved > 0);
  assert.equal(stats.changed, true);
});

test("space-filled blank rows collapse and edges are trimmed", () => {
  const raw = [row(""), row("body"), row(""), row(""), row("")].join("\n");
  const { text, stats } = cleanPiOutput(raw, { dewrap: false });
  assert.equal(text, "body");
  assert.ok(stats.blanksCollapsed >= 0);
});

test("collapses interior blank runs to a single blank line", () => {
  const raw = ["alpha", "", "", "", "beta"].join("\n");
  const { text, stats } = cleanPiOutput(raw, { dewrap: false });
  assert.equal(text, "alpha\n\nbeta");
  assert.equal(stats.blanksCollapsed, 2);
});

test("strips ANSI escape codes", () => {
  const raw = "\u001b[1mbold\u001b[0m and \u001b[31mred\u001b[0m";
  const { text } = cleanPiOutput(raw, { dewrap: false });
  assert.equal(text, "bold and red");
});

test("normalizes unicode spaces and removes zero-width chars", () => {
  // \u00A0/\u3000 -> space; \u200B/\uFEFF are zero-width and removed (so b+c join).
  const raw = "a\u00A0b\u200Bc\u3000d\uFEFF";
  const { text } = cleanPiOutput(raw, { dewrap: false });
  assert.equal(text, "a bc d");
});

test("normalizes CRLF line endings", () => {
  const raw = "one\r\ntwo\rthree";
  const { text } = cleanPiOutput(raw, { dewrap: false });
  assert.equal(text, "one\ntwo\nthree");
});

test("de-wraps lines hard-wrapped at terminal width", () => {
  // Two full-width rows + a short tail = one logical paragraph.
  const full1 = "a".repeat(W);
  const full2 = "b".repeat(W);
  const raw = [full1, full2, "tail end"].join("\n");
  const { text, stats } = cleanPiOutput(raw, { dewrap: true });
  assert.equal(text, `${full1} ${full2} tail end`);
  assert.equal(stats.joined, 2);
});

test("de-wraps a real paragraph whose wrapped lines vary in length", () => {
  // Terminal trims trailing padding on copy, so widths vary by a whole word.
  const raw = [
    " The extensibility host loads POS UI Extensions inside the Point of Sale app, and when a merchant taps an action the host",
    " forwards the active session context down into each registered plugin so the plugin can issue Direct API calls that are",
    " correctly scoped to the till the staff member is standing at, which previously failed because the location was undefined.",
    " passed an undefined location into the request URL.",
  ].join("\n");
  const { text, stats } = cleanPiOutput(raw, { dewrap: true });
  assert.equal(text.split("\n").length, 1, "should collapse to a single paragraph line");
  assert.ok(text.startsWith("The extensibility host loads"));
  assert.ok(text.endsWith("into the request URL."));
  assert.equal(stats.joined, 3);
});

test("--no-dewrap keeps line breaks intact", () => {
  const full1 = "a".repeat(W);
  const full2 = "b".repeat(W);
  const raw = [full1, full2, "tail end"].join("\n");
  const { text, stats } = cleanPiOutput(raw, { dewrap: false });
  assert.equal(text, `${full1}\n${full2}\ntail end`);
  assert.equal(stats.joined, 0);
});

test("de-wrap does not merge into a new list item", () => {
  const full = "word ".repeat(12).trim().padEnd(W, "x");
  const raw = [full, "- a bullet that follows"].join("\n");
  const { text } = cleanPiOutput(raw, { dewrap: true });
  assert.ok(text.includes("\n- a bullet that follows"));
});

test("de-wrap is skipped when no consistent wrapping is detected", () => {
  const raw = ["one long-ish line here", "short", "another short one"].join("\n");
  const { stats } = cleanPiOutput(raw, { dewrap: true });
  assert.equal(stats.joined, 0);
});

test("strips a framing vertical border when it prefixes most lines", () => {
  const raw = ["\u2502 col a", "\u2502 col b", "\u2502 col c"].join("\n");
  const { text, stats } = cleanPiOutput(raw, { dewrap: false });
  assert.equal(text, "col a\ncol b\ncol c");
  assert.equal(stats.borderStripped, true);
});

test("does not strip a border glyph that only appears on a minority of lines", () => {
  const raw = ["\u2502 only one", "plain two", "plain three"].join("\n");
  const { stats } = cleanPiOutput(raw, { dewrap: false });
  assert.equal(stats.borderStripped, false);
});

test("reports empty clipboard", () => {
  const { stats } = cleanPiOutput("   \n  \n", { dewrap: false });
  assert.equal(stats.empty, true);
  assert.equal(summarizeClean(stats), "Clipboard is empty — nothing to clean.");
});

test("reports already-clean clipboard", () => {
  const { stats } = cleanPiOutput("already clean", { dewrap: false });
  assert.equal(stats.changed, false);
  assert.equal(summarizeClean(stats), "Clipboard already clean — no changes.");
});

test("summary describes the changes made", () => {
  const raw = [row("Hello world"), row("second line")].join("\n");
  const { stats } = cleanPiOutput(raw, { dewrap: false });
  const summary = summarizeClean(stats);
  assert.ok(summary.startsWith("\u2713 Cleaned clipboard"));
  assert.ok(summary.includes("dedented 1"));
});

test("parseCopyCleanArgs handles flags, help, and errors", () => {
  assert.deepEqual(parseCopyCleanArgs(""), { dewrap: true, help: false, error: undefined });
  assert.deepEqual(parseCopyCleanArgs("--no-dewrap"), { dewrap: false, help: false, error: undefined });
  assert.deepEqual(parseCopyCleanArgs("--keep-wrap"), { dewrap: false, help: false, error: undefined });
  assert.equal(parseCopyCleanArgs("--help").help, true);
  assert.equal(parseCopyCleanArgs("-h").help, true);
  assert.equal(parseCopyCleanArgs("--bogus").error, "Unknown option: --bogus");
});
