// Wallpapers: the pictures behind the whole window, kept apart from the theme.
// Your own live in backgrounds/mosaico/ (in the Herdr home). Optionally the current
// Omarchy theme's wallpapers (backgrounds/omarchy/<theme>/) join the rotation.

import { exec, appHome, layout, shared, setShared, settings, window } from "herdr";

export const OWN = "backgrounds/mosaico";
const IMAGE = /\.(jpe?g|png|webp|gif|bmp)$/i;

// Image file names in a folder of the Herdr home, sorted. None or missing: [].
async function list(dir) {
  const full = `${appHome()}/${dir}`;
  let names = null;
  try {
    const r = window()?.platform === "windows"
      ? await exec("powershell", ["-NoProfile", "-Command", `Get-ChildItem -LiteralPath '${full.replace(/'/g, "''")}' -File | ForEach-Object Name`])
      : await exec("ls", ["-1", full]);
    if (r.code === 0) names = r.stdout.split(/\r?\n/);
  } catch {}
  return (names ?? []).map((n) => n.trim()).filter((n) => IMAGE.test(n) && !n.startsWith(".")).sort((a, b) => a.localeCompare(b)).map((n) => `${dir}/${n}`);
}

export const themeDir = () => `backgrounds/omarchy/${settings().theme ?? ""}`;
export const ownWallpapers = () => list(OWN);
export const themeWallpapers = () => (settings().theme ? list(themeDir()) : Promise.resolve([]));

// The pool next/prev/random walk: yours, plus the theme's when "mosaico.theme_walls" is on.
export async function pool() {
  const own = await ownWallpapers();
  const extra = shared("mosaico.theme_walls") ? await themeWallpapers() : [];
  return [...own, ...extra];
}

export const current = () => layout()?.background?.image ?? null;

// layout.set goes through the CLI: run() refuses arguments nested deeper than 16 levels,
// and this layout's tree is deeper than that.
export async function patchRoot(patch) {
  const l = layout();
  if (!l) return;
  await exec("herdr-app", ["do", "layout.set", JSON.stringify({ layout: { ...l, ...patch } })]);
}

export async function setWallpaper(image) {
  if (!image) return;
  setShared("mosaico.rotated_at", Date.now());
  const bg = layout()?.background;
  await patchRoot({ background: { fit: "cover", ...(bg && typeof bg === "object" ? bg : {}), image } });
}

export async function step(delta) {
  const all = await pool();
  if (!all.length) return;
  const i = all.indexOf(current());
  await setWallpaper(all[((i < 0 ? (delta > 0 ? -1 : 0) : i) + delta + all.length) % all.length]);
}

export async function random() {
  const all = (await pool()).filter((p) => p !== current());
  if (all.length) await setWallpaper(all[Math.floor(Math.random() * all.length)]);
}

export const setOpacity = (value) => patchRoot({ terminal_opacity: value });

// Copies picture files into backgrounds/mosaico/, never over an existing one
// (Herdr caches images by path, so a replaced file would keep showing the old picture).
export async function importFiles(paths) {
  const taken = new Set((await ownWallpapers()).map((p) => p.split("/").pop().toLowerCase()));
  const win = window()?.platform === "windows";
  const added = [];
  if (win) await exec("powershell", ["-NoProfile", "-Command", `New-Item -ItemType Directory -Force -Path '${appHome()}/${OWN}' | Out-Null`]).catch(() => null);
  else await exec("mkdir", ["-p", `${appHome()}/${OWN}`]).catch(() => null);
  for (const src of paths) {
    const base = src.split(/[\\/]/).pop() ?? "";
    if (!IMAGE.test(base)) continue;
    const dot = base.lastIndexOf(".");
    const stem = base.slice(0, dot).replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "fondo";
    const ext = base.slice(dot).toLowerCase();
    let name = `${stem}${ext}`;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem}-${n}${ext}`;
    const dest = `${appHome()}/${OWN}/${name}`;
    const r = win
      ? await exec("powershell", ["-NoProfile", "-Command", `Copy-Item -LiteralPath '${src.replace(/'/g, "''")}' -Destination '${dest.replace(/'/g, "''")}'`]).catch(() => null)
      : await exec("cp", [src, dest]).catch(() => null);
    if (r?.code === 0) {
      taken.add(name.toLowerCase());
      added.push(`${OWN}/${name}`);
    }
  }
  return added;
}

// Every picture directly inside a folder (not its subfolders).
export async function imagesIn(folder) {
  const win = window()?.platform === "windows";
  try {
    const r = win
      ? await exec("powershell", ["-NoProfile", "-Command", `Get-ChildItem -LiteralPath '${folder.replace(/'/g, "''")}' -File | ForEach-Object FullName`])
      : await exec("find", [folder, "-maxdepth", "1", "-type", "f"]);
    if (r.code !== 0) return [];
    return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter((s) => IMAGE.test(s));
  } catch {
    return [];
  }
}

export function openFolder() {
  const dir = `${appHome()}/${OWN}`;
  const p = window()?.platform;
  const cmd = p === "macos" ? "open" : p === "windows" ? "explorer" : "xdg-open";
  return exec(cmd, [p === "windows" ? dir.replace(/\//g, "\\") : dir]).catch(() => null);
}
