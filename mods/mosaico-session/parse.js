// Pure helpers for the session panel (no Herdr imports, so tests can load them).

const MODES = { "auto mode": "auto", "accept edits": "aceptar ediciones", "plan mode": "plan", "bypass permissions": "sin permisos" };
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

// 320000 → "320K", 1000000 → "1.0M"
export function short(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  n = Number(n);
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(Math.round(n));
}

// "320k" / "1.0M" / "4521" → number
function unshort(s) {
  const m = String(s ?? "").match(/^([\d.]+)\s*([kKmM]?)$/);
  if (!m) return null;
  return Number(m[1]) * (m[2].toLowerCase() === "m" ? 1e6 : m[2].toLowerCase() === "k" ? 1e3 : 1);
}

export function ago(ms, now = Date.now()) {
  if (!ms) return null;
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h ${m % 60}m`;
  return `hace ${Math.floor(h / 24)}d`;
}

// Claude Code's status-line JSON (what statusline.sh saves) → the panel's numbers.
export function fromJson(j) {
  if (!j || typeof j !== "object") return {};
  const ctx = j.context_window ?? {};
  const u = ctx.current_usage;
  const used = u ? (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) : null;
  const size = ctx.context_window_size ?? null;
  let left = ctx.remaining_percentage ?? (ctx.used_percentage != null ? 100 - ctx.used_percentage : null);
  if (left == null && used != null && size) left = 100 - (used * 100) / size;
  const pct = (w) => (w?.used_percentage != null ? Math.round(w.used_percentage) : null);
  return {
    model: j.model?.display_name ?? null,
    effort: j.effort?.level ?? null,
    left: left != null ? Math.max(0, Math.min(100, Math.round(left))) : null,
    used,
    size,
    tin: ctx.total_input_tokens ?? null,
    tout: ctx.total_output_tokens ?? null,
    limit5h: pct(j.rate_limits?.five_hour),
    limit7d: pct(j.rate_limits?.seven_day),
    cost: j.cost?.total_cost_usd ?? null,
    at: j.mosaico_at ? j.mosaico_at * 1000 : null,
  };
}

// The visible screen → permission mode, plus the status line's numbers when it's ours
// ("Opus 5.5 · medium | … | ctx ███ 68% 320k/1.0M | ↑320k ↓4k | limit 5h 34% · 7d 31%").
// Arcade's line ("%68", "5s"/"7g") reads too.
export function fromScreen(text) {
  const out = {};
  const lines = String(text ?? "").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!out.mode) {
      const m = l.match(/(auto mode|accept edits|plan mode|bypass permissions) on/);
      if (m) out.mode = MODES[m[1]];
    }
    if (!out.seen && /\bctx\b/.test(l)) {
      const c = l.match(/ctx\s+\S*\s*(?:%(\d+)|(\d+)%)\s+(\S+)\/(\S+)/);
      if (c) {
        // Our status line (or Arcade's): the percent is what's left.
        out.seen = true;
        const head = l.match(/^\s*([^|]+?)(?:\s+·\s+(\w+))?\s*\|/);
        if (head) {
          out.model = head[1].trim();
          if (EFFORTS.includes(head[2])) out.effort = head[2];
        }
        out.left = Number(c[1] ?? c[2]);
        out.used = unshort(c[3]);
        out.size = unshort(c[4]);
        const tok = l.match(/↑\s*(\S+)\s+↓\s*(\S+)/);
        if (tok) {
          out.tin = unshort(tok[1]);
          out.tout = unshort(tok[2]);
        }
      } else {
        // Claude Code's own footer ("ctx ██░░ 22%   5h ██░░ 27% ↻ 19:30   sem █░░ 12%"):
        // the percent is what's used; the week's label follows the app's language.
        const n = l.match(/\bctx\s+[^\d%]*?(\d+)%/);
        if (n) {
          out.seen = true;
          out.left = 100 - Number(n[1]);
        }
      }
      if (out.seen) {
        const l5 = l.match(/\b5[hs]\s+[^\d%]*?(\d+)%/);
        const l7 = l.match(/\b(?:7[dg]|7-day|sem|semana|week|wk|woche|sem\.)\s+[^\d%]*?(\d+)%/i);
        if (l5) out.limit5h = Number(l5[1]);
        if (l7) out.limit7d = Number(l7[1]);
      }
    }
  }
  return out;
}
