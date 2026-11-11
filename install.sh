#!/usr/bin/env bash
# Installs Mosaico into the Herdr home (~/.config/herdr-app, or $HERDR_APP_HOME).
# Never overwrites: anything already there is left as it is and reported.
#   ./install.sh            install (and herdr-omarchy, which Mosaico builds on)
#   ./install.sh --no-switch   install without switching to the layout
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
H="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
OMARCHY_REPO="https://github.com/shafiqimtiaz/herdr-omarchy"
SWITCH=1; [ "${1:-}" = "--no-switch" ] && SWITCH=0

command -v herdr-app >/dev/null || { echo "herdr-app no está en el PATH. Abre Herdr una vez y vuelve a intentarlo."; exit 1; }
mkdir -p "$H/mods" "$H/layouts" "$H/themes" "$H/backgrounds"

skipped=()
# A mod folder, mod.json first as "place: none" so Herdr never docks it into the layout
# you're looking at (Omarchy's Files and Changes ask for "right").
copy_mod() {
  local from="$1" name; name="$(basename "$from")"
  if [ -e "$H/mods/$name" ]; then skipped+=("mods/$name"); return; fi
  mkdir -p "$H/mods/$name"
  echo '{ "place": "none" }' > "$H/mods/$name/mod.json"
  sleep 1.2
  cp -R "$from/." "$H/mods/$name/"
}
copy_file() {  # copy_file <from> <relative destination>
  if [ -e "$H/$2" ]; then skipped+=("$2"); return; fi
  mkdir -p "$(dirname "$H/$2")"; cp "$1" "$H/$2"
}

# 1. herdr-omarchy: sidebar, tabs, panes, Files/Changes, AI usage, palette, settings, themes.
if [ ! -d "$H/mods/omarchy-spaces" ]; then
  echo "→ Instalando herdr-omarchy (dependencia)…"
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  git clone -q --depth 1 "$OMARCHY_REPO" "$tmp/omarchy"
  for m in "$tmp"/omarchy/mods/omarchy-*; do copy_mod "$m"; done
  for t in "$tmp"/omarchy/themes/*.json; do copy_file "$t" "themes/$(basename "$t")"; done
  if [ ! -e "$H/backgrounds/omarchy" ]; then cp -R "$tmp/omarchy/backgrounds/omarchy" "$H/backgrounds/omarchy"; fi
else
  echo "→ herdr-omarchy ya está instalado"
fi

# 2. Mosaico.
echo "→ Instalando Mosaico…"
for m in "$SRC"/mods/*/; do copy_mod "${m%/}"; done
if [ -e "$H/layouts/mosaico.json" ]; then skipped+=("layouts/mosaico.json")
elif [ -f "$SRC/backgrounds/mosaico/frieren.jpg" ]; then cp "$SRC/layouts/mosaico.json" "$H/layouts/mosaico.json"
else
  # No Frieren picture in this copy (it isn't published): start on an Omarchy wallpaper.
  python3 - "$SRC/layouts/mosaico.json" "$H/layouts/mosaico.json" <<'PY'
import json, sys
l = json.load(open(sys.argv[1]))
l["background"] = {"image": "backgrounds/omarchy/tokyo-night/1-winding-road.webp", "fit": "cover"}
json.dump(l, open(sys.argv[2], "w"), indent=2, ensure_ascii=False)
PY
fi
copy_file "$SRC/layouts/mosaico.svg" "layouts/mosaico.svg"
mkdir -p "$H/backgrounds/mosaico"
for f in "$SRC"/backgrounds/mosaico/*; do [ -f "$f" ] && copy_file "$f" "backgrounds/mosaico/$(basename "$f")"; done

# 3. Keys: add the layout's section, never replace a key you already have.
keys="$SRC/keys.json"; [ "$(uname)" = "Darwin" ] || keys="$SRC/keys.linux.json"
python3 - "$H/keys.json" "$keys" <<'PY'
import json, os, sys
mine_path, theirs_path = sys.argv[1], sys.argv[2]
mine = json.load(open(mine_path)) if os.path.exists(mine_path) else {}
theirs = json.load(open(theirs_path))
kept = []
for section, binds in theirs.items():
    have = mine.setdefault(section, {})
    for key, action in binds.items():
        if key in have and have[key] != action: kept.append(f"{section} {key}")
        else: have[key] = action
tmp = mine_path + ".tmp"
json.dump(mine, open(tmp, "w"), indent=2, ensure_ascii=False)
os.replace(tmp, mine_path)
if kept: print("  Teclas que ya usabas y no cambié:", ", ".join(kept))
PY

# 4. Check every mod, then show the layout.
fail=0
for m in "$SRC"/mods/*/ "$H"/mods/omarchy-*/; do
  name="$(basename "${m%/}")"
  herdr-app check "$H/mods/$name" >/dev/null 2>&1 || { echo "  ✗ check falló: $name"; fail=1; }
done
[ ${#skipped[@]} -gt 0 ] && echo "  Ya existían (no se tocaron): ${skipped[*]}"
[ $fail -eq 0 ] && echo "  ✓ mods verificados"
if [ $SWITCH -eq 1 ]; then herdr-app do layout.switch --name mosaico >/dev/null && echo "✓ Listo: layout Mosaico activo (ctrl-shift-l para volver al tuyo)"; fi
