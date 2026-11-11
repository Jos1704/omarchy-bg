// Mosaico: the top bar and the wallpaper picker, one mod in roles (props().role):
//   left        menu, sidebar toggle, space numbers, search, where you are
//   right       wallpaper prev / picker / next, session panel toggle, window buttons
//   wallpapers  the picker dialog: thumbnails, add pictures, see-through, auto-rotation
// The wallpaper is the layout root's background image; it never follows the theme.

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  spaces, agents, theme, run, window, props, layout, shared, setShared, focused, home,
  nextCommand, settings, openOverlay, closeOverlay, pickFolder, notify,
} from "herdr";
import {
  OWN, ownWallpapers, themeWallpapers, current, setWallpaper, step, random,
  setOpacity, importFiles, imagesIn, openFolder,
} from "./wallpaper.js";

const ICON = (name) => `mods/mosaico/${name}.svg`;
const CLEAR = "#00000000";
// Controls inside window_drag blocks stop the press, or it would drag the window.
const own = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export function openPicker() {
  openOverlay({ mod: "mosaico", kind: "dialog", frame: "none", width: 820, height: 640, props: { role: "wallpapers" } });
}

function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  const narrow = (width ?? Infinity) < 160;
  if (!narrow) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !narrow);
  run("layout.resize", { id: "sidebar", px: narrow ? (shared("sidebar.width") ?? 243) : window()?.platform === "macos" ? 76 : 44 });
}

const OPACITY = [1, 0.85, 0.7, 0.55, 0.4, 0.25];
const ROTATE = [0, 5, 15, 30, 60];

export default class Mosaico extends View {
  init(p, cx) {
    this.role = (props() ?? p ?? {}).role ?? "left";
    if (this.role === "left") {
      // One copy takes the keys and runs the rotation; each step touches cx, so a reloaded
      // copy's old loop ends instead of eating the next key.
      cx.spawn(async (cx) => {
        for (;;) {
          const c = String(await nextCommand());
          if (c.endsWith("next-wallpaper")) await step(1);
          else if (c.endsWith("prev-wallpaper")) await step(-1);
          else if (c.endsWith("random-wallpaper")) await random();
          else if (c.endsWith("wallpapers")) openPicker();
          cx.notify();
        }
      });
      cx.timer.every(30000, (cx) => this.rotate(cx));
    }
    if (this.role === "wallpapers") {
      this.own = [];
      this.themed = [];
      this.busy = false;
      this.reload(cx);
    }
  }

  rotate(cx) {
    const minutes = Number(shared("mosaico.rotate") ?? 0);
    if (!minutes || this.rotating) return;
    const last = Number(shared("mosaico.rotated_at") ?? 0);
    if (Date.now() - last < minutes * 60000) return;
    this.rotating = true;
    cx.spawn(async (cx) => {
      try {
        if (shared("mosaico.shuffle")) await random();
        else await step(1);
      } finally {
        this.rotating = false;
      }
      cx.notify();
    });
  }

  reload(cx) {
    cx.spawn(async (cx) => {
      this.own = await ownWallpapers();
      this.themed = await themeWallpapers();
      this.loadedTheme = settings().theme;
      cx.notify();
    });
  }

  add(paths, cx) {
    if (!paths?.length) return;
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      const added = await importFiles(paths);
      this.busy = false;
      this.own = await ownWallpapers();
      if (added.length) {
        await setWallpaper(added[added.length - 1]);
        notify({ title: added.length === 1 ? "Fondo añadido" : `${added.length} fondos añadidos`, level: "success", timeout: 2500 });
      } else {
        notify({ title: "No encontré imágenes", body: "Usa .jpg, .png, .webp o .gif", level: "warning" });
      }
      cx.notify();
    });
  }

  render(cx) {
    const t = theme();
    if (this.role === "wallpapers") return this.picker(cx, t);
    const row = h_flex().id(`mosaico-${this.role}`).size_full().items_center().bg(t.chrome).text_size(12).text_color(t.muted).overflow_hidden();
    return this.role === "right" ? this.right(row, t) : this.left(row, t);
  }

  // ------------------------------------------------------------------ bar
  btn(id, icon, onClick, t, { active = false, danger = false, tip } = {}) {
    return own(div().id(id).flex_none().w(30).h_full().flex().items_center().justify_center().cursor_pointer()
      .text_color(active ? t.accent : t.dim)
      .when(active, (el) => el.bg(t.hover))
      .hover((s) => s.bg(danger ? t.blocked : t.hover).text_color(danger ? t.background : t.foreground))
      .when(Boolean(tip), (el) => el.tooltip(tip))
      .on_click(onClick)
      .child(svg(ICON(icon)).size(14)));
  }

  left(row, t) {
    const list = spaces();
    const blocked = new Set(agents().filter((a) => a.status === "blocked").map((a) => a.space));
    const space = list.find((s) => s.active);
    const cwd = focused()?.cwd;
    const here = cwd ? (cwd === home() ? "~" : cwd.split(/[\\/]/).filter(Boolean).pop()) : null;
    const sep = () => div().flex_none().mx(10).text_color(t.border).child("│");
    const w = window();
    return row.pl(w?.platform === "macos" && !w.fullscreen ? 76 : 4)
      .child(this.btn("menu", "grid", () => run("mod.open", { name: "omarchy-palette" }), t, { tip: "Paleta de comandos" }).text_color(t.accent))
      .child(this.btn("sidebar-toggle", "sidebar", toggleSidebar, t, { tip: "Barra lateral" }))
      .children(list.map((s, i) => own(div().id(`ws-${s.id}`).flex_none().h_full().px(8).flex().items_center().justify_center().cursor_pointer()
        .border_b(2).border_color(s.active ? t.accent : CLEAR)
        .text_color(blocked.has(s.id) ? t.blocked : s.active ? t.foreground : t.dim)
        .hover((st) => st.text_color(t.foreground).bg(t.hover))
        .on_click(() => run("space.select", { id: s.id }))
        .child(String(i + 1)))))
      .child(this.btn("search", "search", () => run("mod.open", { name: "picker" }), t, { tip: "Buscar" }))
      .when(Boolean(space), (el) => el.child(sep())
        .child(div().flex_none().text_color(t.foreground).child(space.name))
        .when(Boolean(here) && here !== space.name, (e) => e.child(div().flex_none().ml(8).text_color(t.muted).child(here)))
        .when(Boolean(space.branch), (e) => e.child(div().flex_none().ml(8).text_color(t.dim).child(space.branch)))
        .when(Boolean(space.machine), (e) => e.child(div().flex_none().ml(8).text_color(t.dim).child(`@${space.machine}`))));
  }

  right(row, t) {
    const w = window();
    const session = find(layout(), "session");
    const sessionOpen = session && session.hidden !== true;
    const spawn = (fn) => (_e, cx) => cx.spawn(async (cx) => { await fn(); cx.notify(); });
    return row.justify_end()
      .child(this.btn("wp-prev", "prev", spawn(() => step(-1)), t, { tip: "Fondo anterior" }))
      .child(this.btn("wp-pick", "image", () => openPicker(), t, { tip: "Fondos" }))
      .child(this.btn("wp-next", "next", spawn(() => step(1)), t, { tip: "Fondo siguiente" }))
      .when(Boolean(session), (el) => el
        .child(div().flex_none().mx(4).text_color(t.border).child("│"))
        .child(this.btn("session-toggle", "panel", () => run("layout.toggle", { id: "session" }), t, { active: sessionOpen, tip: "Panel de sesión" })))
      .when(Boolean(w?.buttons), (el) => el
        .child(div().flex_none().mx(4).text_color(t.border).child("│"))
        .child(this.btn("wb-min", "minus", () => run("window.minimize"), t))
        .child(this.btn("wb-max", "square", () => run("window.maximize"), t))
        .child(this.btn("wb-close", "x", () => run("window.close"), t, { danger: true })));
  }

  // --------------------------------------------------------------- picker
  chip(id, label, on, onClick, t) {
    return div().id(id).flex_none().h(24).px(9).flex().items_center().cursor_pointer().text_size(11.5)
      .border(1).border_color(on ? t.accent : t.border)
      .bg(on ? t.accent : CLEAR).text_color(on ? t.accent_foreground : t.muted)
      .hover((s) => (on ? s : s.bg(t.hover).text_color(t.foreground)))
      .on_click(onClick)
      .child(label);
  }

  tile(path, t, cur) {
    const name = path.split("/").pop().replace(/\.[^.]+$/, "");
    return v_flex().id(`wp-${path}`).flex_none().w(176).gap(4).cursor_pointer()
      .on_click((_e, cx) => cx.spawn(async (cx) => { await setWallpaper(path); cx.notify(); }))
      .child(div().w(176).h(99).border(2).border_color(cur ? t.accent : t.border).hover((s) => s.border_color(cur ? t.accent : t.input))
        .child(image(path).w(172).h(95)))
      .child(div().text_size(11).truncate().text_color(cur ? t.foreground : t.muted).child(cur ? `● ${name}` : name));
  }

  section(title, count, tiles, t) {
    return v_flex().gap(8)
      .child(h_flex().gap(6).items_center().text_size(12)
        .child(div().text_color(t.foreground).child(title))
        .child(div().text_color(t.dim).child(String(count))))
      .child(h_flex().flex_wrap().gap(12).children(tiles));
  }

  picker(cx, t) {
    if (settings().theme !== this.loadedTheme && this.loadedTheme !== undefined) {
      this.loadedTheme = settings().theme;
      this.reload(cx);
    }
    const cur = current();
    const root = layout();
    const opacity = Number(root?.terminal_opacity ?? settings().terminal_opacity ?? 1);
    const rotate = Number(shared("mosaico.rotate") ?? 0);
    const shuffle = Boolean(shared("mosaico.shuffle"));
    const themeWalls = Boolean(shared("mosaico.theme_walls"));
    const spawn = (fn) => (_e, cx) => cx.spawn(async (cx) => { await fn(); cx.notify(); });
    const label = (s) => div().flex_none().w(110).text_size(11.5).text_color(t.dim).child(s);

    const addTile = v_flex().id("wp-add").flex_none().w(176).gap(4).cursor_pointer()
      .on_click((_e, cx) => cx.spawn(async (cx) => {
        const folder = await pickFolder({ prompt: "Importar" });
        if (folder) this.add(await imagesIn(folder), cx);
      }))
      .child(v_flex().w(176).h(99).border(2).border_color(t.border).items_center().justify_center().gap(6).text_color(t.dim)
        .hover((s) => s.border_color(t.accent).text_color(t.accent))
        .child(svg(ICON(this.busy ? "image" : "plus")).size(20))
        .child(div().text_size(11).child(this.busy ? "Copiando…" : "Importar carpeta")))
      .child(div().text_size(11).text_color(t.dim).child("o arrastra imágenes aquí"));

    const header = h_flex().h(44).flex_none().px(16).gap(10).items_center().border_b(2).border_color(t.border)
      .child(svg(ICON("image")).size(16).text_color(t.accent))
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child("Fondos"))
      .child(div().text_size(12).text_color(t.dim).child(`${this.own.length} propios`))
      .child(div().flex_1())
      .child(div().id("wp-folder").h(26).px(10).flex().items_center().gap(6).cursor_pointer().text_size(11.5).text_color(t.muted)
        .border(1).border_color(t.border).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => openFolder()).child(svg(ICON("folder")).size(13)).child("Abrir carpeta"))
      .child(div().id("wp-random").h(26).px(10).flex().items_center().gap(6).cursor_pointer().text_size(11.5).text_color(t.muted)
        .border(1).border_color(t.border).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click(spawn(random)).child(svg(ICON("shuffle")).size(13)).child("Al azar"))
      .child(div().id("wp-close").size(26).flex().items_center().justify_center().cursor_pointer().text_color(t.dim)
        .hover((s) => s.bg(t.blocked).text_color(t.background))
        .on_click(() => closeOverlay(props().overlay)).child(svg(ICON("x")).size(14)));

    const controls = v_flex().flex_none().px(16).py(12).gap(8).border_b(1).border_color(t.border)
      .child(h_flex().gap(6).items_center()
        .child(label("Terminales"))
        .children(OPACITY.map((v) => this.chip(`op-${v}`, v === 1 ? "sólidas" : `${Math.round(v * 100)}%`, Math.abs(opacity - v) < 0.01, spawn(() => setOpacity(v)), t))))
      .child(h_flex().gap(6).items_center()
        .child(label("Cambiar cada"))
        .children(ROTATE.map((m) => this.chip(`rot-${m}`, m ? `${m} min` : "nunca", rotate === m, () => {
          setShared("mosaico.rotate", m);
          setShared("mosaico.rotated_at", Date.now());
        }, t)))
        .child(div().w(8))
        .child(this.chip("shuffle", "aleatorio", shuffle, () => setShared("mosaico.shuffle", !shuffle), t)))
      .child(h_flex().gap(6).items_center()
        .child(label("Incluir"))
        .child(this.chip("theme-walls", `fondos del tema ${settings().theme ?? ""}`, themeWalls, () => setShared("mosaico.theme_walls", !themeWalls), t)));

    const body = v_flex().id("wp-scroll").flex_1().min_h(0).overflow_y_scroll().px(16).py(14).gap(18)
      .child(this.section("Mis fondos", this.own.length, [...this.own.map((p) => this.tile(p, t, p === cur)), addTile], t))
      .when(this.themed.length > 0, (el) => el.child(this.section(`Tema · ${settings().theme}`, this.themed.length, this.themed.map((p) => this.tile(p, t, p === cur)), t)));

    const footer = h_flex().h(30).flex_none().px(16).gap(14).items_center().border_t(1).border_color(t.border).text_size(11).text_color(t.dim)
      .child(`Carpeta: ~/.config/herdr-app/${OWN}`)
      .child(div().flex_1())
      .child("Esc cierra");

    return v_flex().id("wp-root").size_full().bg(t.chrome).border(2).border_color(t.accent).text_color(t.foreground)
      .on_drop((event, cx) => this.add(event.paths, cx))
      .child(header).child(controls).child(body).child(footer);
  }
}
