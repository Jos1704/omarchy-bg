// Sesión: the run of the agent you're looking at, in one Omarchy tile.
// Status, tokens, agent, folder, space, branch, permission mode, model, time and the
// context left (with the plan's 5h / 7d limits).
//
// Where the numbers come from, best first:
//   1. extras/statusline.sh (Claude Code's status line) saves its JSON per terminal in
//      ~/.cache/herdr-mosaico/sessions/<terminal>.json  (this machine only)
//   2. the agent's visible screen (`hc read <t> --lines 0`): the permission mode, and the
//      same status line's text when there is no JSON (other machines).
// Without either, the panel still shows status, agent, folder, space, branch and time.

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, spaces, panes, focused, theme, home, hc, readTextFile, layout, run } from "herdr";
import { short, ago, fromJson, fromScreen } from "./parse.js";

const ICON = (n) => `mods/mosaico-session/${n}.svg`;
const CLEAR = "#00000000";
const WORD = { working: "trabajando", blocked: "te necesita", done: "terminó", idle: "en espera" };

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Which agent: the focused one; else the newest in the focused tab; else in the focused space.
function pick() {
  const all = agents();
  const f = focused();
  const newest = (list) => list.reduce((best, a) => (!best || a.seq > best.seq ? a : best), null);
  return all.find((a) => a.focused)
    ?? (f?.terminal && all.find((a) => a.address === f.terminal))
    ?? newest(all.filter((a) => a.tab === f?.tab))
    ?? newest(all.filter((a) => a.space === f?.space))
    ?? null;
}

const tilde = (p) => (p && p.startsWith(home()) ? `~${p.slice(home().length)}` : p);

export default class Session extends View {
  init(_props, cx) {
    this.data = {};
    this.busy = false;
    this.refresh(cx);
    cx.timer.every(4000, (cx) => this.refresh(cx));
  }

  // Only while the panel shows, one read at a time, visible screen only: reading history
  // on a long session is slow and stalls every terminal.
  refresh(cx) {
    if (this.busy || find(layout(), "session")?.hidden === true) return;
    const a = pick();
    if (!a) {
      if (this.address) {
        this.address = null;
        this.data = {};
        cx.notify();
      }
      return;
    }
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        let json = {};
        if (!a.address.includes("/")) {
          const text = await readTextFile(`${home()}/.cache/herdr-mosaico/sessions/${a.address}.json`).catch(() => null);
          if (text) try { json = fromJson(JSON.parse(text)); } catch {}
        }
        let screen = {};
        const r = await hc(["read", a.address, "--lines", "0"]).catch(() => null);
        if (r?.code === 0) screen = fromScreen(r.stdout);
        const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
        this.address = a.address;
        this.data = { ...clean(screen), ...clean(json) };
      } finally {
        this.busy = false;
      }
      cx.notify();
    });
  }

  render(cx) {
    const t = theme();
    const a = pick();
    const tile = v_flex().id("session-root").size_full().bg(t.chrome).pt(10).px(10).gap(6).text_size(12).text_color(t.muted).overflow_hidden();
    const STATUS = { working: t.working, blocked: t.blocked, done: t.done, idle: t.dim };

    const head = h_flex().h(26).flex_none().pl(8).gap(6).items_center()
      .child(svg(ICON("activity")).size(13).text_color(t.accent))
      .child(div().text_color(t.foreground).child("sesión"))
      .child(div().flex_1())
      .when(Boolean(a), (el) => {
        const col = STATUS[a.status] ?? t.dim;
        return el.child(h_flex().h(20).px(7).gap(5).items_center().border(1).border_color(col).text_size(11).text_color(col)
          .child(a.status === "working"
            ? svg(ICON("spinner")).size(11).spin(900)
            : div().size(7).when(a.status === "idle", (d) => d.border(1).border_color(col)).when(a.status !== "idle", (d) => d.bg(col)))
          .child(WORD[a.status] ?? a.status));
      });

    if (!a) {
      return tile.child(head).child(div().pl(8).pt(8).text_size(12).text_color(t.dim).child("Enfoca el panel de un agente para ver su sesión."));
    }
    const d = this.address === a.address ? this.data : {};
    const pane = panes().find((p) => p.terminal === a.address || p.pane === a.pane);
    const space = spaces().find((s) => s.id === a.space);
    const tab = space?.tabs.find((x) => x.id === a.tab);
    const since = a.status === "working" ? tab?.working_since : tab?.changed_at;
    const p = a.program;

    const label = (s) => div().flex_none().w(76).text_color(t.dim).child(s);
    const value = (v, color = t.foreground) => div().flex_1().min_w(0).truncate().text_color(v == null ? t.dim : color).child(v ?? "—");
    const row = (name, ...kids) => h_flex().h(22).flex_none().px(8).gap(8).items_center().child(label(name)).children(kids);
    const icon = (path, color, tint = true) => (tint ? svg(path).size(13).flex_none().text_color(color) : image(path).size(13).flex_none());

    // Tokens: in (↓ out) for the whole session.
    const tokens = (d.tin != null || d.tout != null) && h_flex().h(30).flex_none().mx(8).mt(2).mb(4).px(10).gap(8).items_center().justify_center()
      .border(1).border_color(t.border).bg(t.hover)
      .child(div().text_size(11).text_color(t.dim).child("TOKENS"))
      .child(div().text_size(14).font_semibold().text_color(t.foreground).child(short(d.tin) ?? "—"))
      .child(div().text_size(11).text_color(t.muted).child(d.tout != null ? `↓${short(d.tout)}` : ""));

    // Context left as 20 square blocks.
    const left = d.left;
    const ctxColor = left == null ? t.dim : left > 50 ? t.done : left > 20 ? t.working : t.blocked;
    const blocks = 20;
    const on = left == null ? 0 : Math.round((left / 100) * blocks);
    const context = left != null && v_flex().flex_none().px(8).pt(6).gap(4)
      .child(h_flex().gap(8).items_center()
        .child(label("CONTEXTO"))
        .child(h_flex().flex_1().gap(2).children(Array.from({ length: blocks }, (_, i) => div().flex_1().h(10).bg(i < on ? ctxColor : t.hover))))
        .child(div().flex_none().w(40).text_right().text_color(ctxColor).child(`${left}%`)))
      .child(div().text_size(11).text_color(t.dim).truncate().child([
        d.used != null && d.size ? `${short(d.used)} / ${short(d.size)}` : null,
        d.limit5h != null || d.limit7d != null ? `LÍMITE${d.limit5h != null ? ` 5H ${d.limit5h}%` : ""}${d.limit7d != null ? ` · 7D ${d.limit7d}%` : ""}` : null,
      ].filter(Boolean).join("  ·  ") || " "));

    const model = d.model ? `${d.model}${d.effort ? ` (${d.effort})` : ""}` : null;
    const folder = tilde(pane?.cwd) ?? a.space_name;
    const world = `${a.space_name} · ${space?.machine ?? "este equipo"}`;

    return tile.child(head)
      .when(Boolean(tokens), (el) => el.child(tokens))
      .child(row("AGENTE", p?.icon ? icon(p.icon, p.color ?? t.foreground, p.tint) : div(), value(p?.name ?? a.app)))
      .child(row("CARPETA", icon(ICON("folder"), t.accent), value(folder)))
      .child(row("ESPACIO", value(world)))
      .when(Boolean(pane?.branch), (el) => el.child(row("RAMA", icon(ICON("branch"), t.ansi5 ?? t.accent), value(pane.branch))))
      .child(row("MODO", value(d.mode ?? null)))
      .child(row("MODELO", value(model)))
      .child(row("TIEMPO", value(ago(since))))
      .when(Boolean(context), (el) => el.child(context))
      .child(div().id("session-go").mt(8).mx(8).h(26).flex_none().flex().items_center().justify_center().cursor_pointer()
        .border(1).border_color(t.border).text_size(11.5).text_color(t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("agent.focus", { terminal: a.address }))
        .child("Ir al agente"));
  }
}
