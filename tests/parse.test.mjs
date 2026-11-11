import { test } from "node:test";
import assert from "node:assert/strict";
import { short, ago, fromJson, fromScreen } from "../mods/mosaico-session/parse.js";

test("short", () => {
  assert.equal(short(320000), "320K");
  assert.equal(short(1000000), "1.0M");
  assert.equal(short(950), "950");
  assert.equal(short(null), null);
});

test("ago", () => {
  assert.equal(ago(1000, 24000), "hace 23s");
  assert.equal(ago(0), null);
  assert.equal(ago(0 + 1, 1 + 252000), "hace 4m 12s");
});

test("status-line JSON", () => {
  const d = fromJson({
    model: { display_name: "Opus 5.5" }, effort: { level: "medium" },
    context_window: { context_window_size: 1e6, current_usage: { input_tokens: 2e4, cache_read_input_tokens: 3e5 }, remaining_percentage: 68, total_input_tokens: 320000, total_output_tokens: 4100 },
    rate_limits: { five_hour: { used_percentage: 34 }, seven_day: { used_percentage: 31.2 } },
  });
  assert.deepEqual([d.model, d.effort, d.left, d.used, d.size, d.tin, d.tout, d.limit5h, d.limit7d], ["Opus 5.5", "medium", 68, 320000, 1e6, 320000, 4100, 34, 31]);
});

test("screen: our status line and mode", () => {
  const screen = [
    "● Bash(npm test)",
    "────────────────────────",
    "> ",
    "────────────────────────",
    "  Opus 5.5 · medium | ⎇ feat/warp | ctx ██████░░░░ 68% 320k/1.0M | ↑320k ↓4k | limit 5h 34% · 7d 31%",
    "  ⏵⏵ auto mode on (shift+tab to cycle)",
  ].join("\n");
  const d = fromScreen(screen);
  assert.deepEqual([d.mode, d.model, d.effort, d.left, d.used, d.size, d.tin, d.tout, d.limit5h, d.limit7d], ["auto", "Opus 5.5", "medium", 68, 320000, 1e6, 320000, 4000, 34, 31]);
});

test("screen: Arcade's status line", () => {
  const d = fromScreen("Opus 5.5 · high | x | ctx ███▌ %42 580k/1.0M | ↑1.2M ↓30k | limit 5s 10% · 7g 3%\n⏵⏵ plan mode on");
  assert.deepEqual([d.mode, d.left, d.tin, d.limit5h, d.limit7d], ["plan", 42, 1.2e6, 10, 3]);
});

test("screen: Claude Code's own footer", () => {
  const d = fromScreen("  ⏵⏵ auto mode on (shift+tab to cycle)\n  ctx ██░░░░░░ 22%   5h ██░░░░░░ 27% ↻ 19:30   sem █░░░░░░░ 12% ↻ mar 03:00");
  assert.deepEqual([d.mode, d.left, d.limit5h, d.limit7d, d.model], ["auto", 78, 27, 12, undefined]);
});

test("screen: nothing known", () => {
  assert.deepEqual(fromScreen("$ ls\nfoo bar"), {});
});
