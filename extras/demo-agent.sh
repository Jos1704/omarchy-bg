#!/usr/bin/env bash
# A pretend Claude Code session for screenshots: draws a plausible screen with the
# Mosaico status line and reports its status to Herdr (OSC 7501). Nothing runs.
#   extras/demo-agent.sh [working|blocked|done|idle] [folder label] [branch]
state=${1:-working}; where=${2:-~/code/atlas}; branch=${3:-feat/aurora}
report() { printf '\e]7501;state=%s:app=claude-code\a' "$state"; }
B=$'\e[1m'; D=$'\e[2m'; G=$'\e[32m'; C=$'\e[36m'; Y=$'\e[33m'; M=$'\e[35m'; R=$'\e[0m'
draw() {
  clear
  case $state in
    working) cat <<T
${B}●${R} Read(src/sky/palette.ts)
  ⎿  Read 64 lines

${B}●${R} Update(src/sky/palette.ts)
  ⎿  Updated ${B}src/sky/palette.ts${R} with 3 additions
${G}     18 + export const dusk = mix(night, ember, 0.35);${R}
${G}     19 + export const glow = lighten(dusk, 0.2);${R}
${G}     20 + export const haze = alpha(glow, 0.6);${R}

${B}●${R} Bash(pnpm test sky)
  ⎿  ✓ 18 tests passed

${M}✻${R} Blending colors… (48s · ↓ 2.1k tokens)
T
    ;;
    blocked) cat <<T
${B}●${R} Bash(rm -rf dist && pnpm build)

  Do you want to proceed?
  ${C}❯ 1. Yes${R}
    2. Yes, and don't ask again for this command
    3. No, and tell Claude what to do differently
T
    ;;
    *) cat <<T
${B}●${R} The aurora theme is in place and every test passes.

  - Added dusk, glow and haze to the sky palette.
  - Covered the new colors in palette.test.ts.
T
    ;;
  esac
  local cols line; cols=$(stty size 2>/dev/null | cut -d' ' -f2); [ -n "$cols" ] && [ "$cols" -gt 0 ] || cols=$(tput cols 2>/dev/null || echo 80)
  line=$(printf '─%.0s' $(seq 1 "$cols"))
  printf '\n%s\n%s\n%s\n' "$D$line$R" "${B}❯${R} " "$D$line$R"
  printf '  %sOpus 5.5%s %s·%s %smedium%s %s|%s %s⎇ %s%s %s|%s %sctx%s %s██████░░░░%s %s68%%%s %s320k/1.0M%s %s|%s ↑320k ↓4k %s|%s limit 5h 34%% · 7d 31%%\n' \
    "$C" "$R" "$D" "$R" "$M" "$R" "$D" "$R" "$Y" "$branch" "$R" "$D" "$R" "$D" "$R" "$G" "$R" "$G" "$R" "$D" "$R" "$D" "$R" "$D" "$R"
  printf '  %s⏵⏵ auto mode on%s (shift+tab to cycle)' "$Y" "$R"
}
trap draw WINCH
report; sleep 0.3; draw
while :; do sleep 15 & wait $!; report; done
