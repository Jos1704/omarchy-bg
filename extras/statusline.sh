#!/usr/bin/env bash
# Mosaico status line for Claude Code.
#  1. Prints:  Opus 5.5 · medium | ⎇ main | ctx ██████░░░░ 68% 320k/1.0M | ↑320k ↓4k | limit 5h 34% · 7d 31%
#  2. Inside Herdr (HC_TERMINAL_ID is set) it also saves Claude's status JSON to
#     ~/.cache/herdr-mosaico/sessions/<terminal>.json for the mosaico-session panel.
# Needs jq. Install: see README ("Panel de sesión").
in=$(cat)

if [ -n "$HC_TERMINAL_ID" ] && command -v jq >/dev/null 2>&1; then
  dir="${XDG_CACHE_HOME:-$HOME/.cache}/herdr-mosaico/sessions"
  id=${HC_TERMINAL_ID//[^A-Za-z0-9_-]/}
  if mkdir -p "$dir" 2>/dev/null && jq -c --argjson at "$(date +%s)" '. + {mosaico_at: $at}' <<<"$in" >"$dir/$id.json.tmp" 2>/dev/null; then
    mv -f "$dir/$id.json.tmp" "$dir/$id.json"
  fi
fi

j() { jq -r "$1 // empty" <<<"$in" 2>/dev/null; }
k() { awk -v n="${1:-0}" 'BEGIN{ if(n>=1000000) printf "%.1fM", n/1000000; else if(n>=1000) printf "%.0fk", n/1000; else printf "%d", n }'; }
c() { printf '\033[%sm%s\033[0m' "$1" "$2"; }

model=$(j '.model.display_name')
effort=$(j '.effort.level')
cwd=$(j '.workspace.current_dir'); [ -z "$cwd" ] && cwd=$(j '.cwd')
branch=$(git -C "${cwd:-.}" --no-optional-locks branch --show-current 2>/dev/null)
size=$(j '.context_window.context_window_size')
used=$(jq -r '.context_window.current_usage | if . == null then empty else ((.input_tokens//0)+(.cache_creation_input_tokens//0)+(.cache_read_input_tokens//0)) end' <<<"$in" 2>/dev/null)
left=$(j '.context_window.remaining_percentage')
tin=$(j '.context_window.total_input_tokens'); tout=$(j '.context_window.total_output_tokens')
r5=$(j '.rate_limits.five_hour.used_percentage'); r7=$(j '.rate_limits.seven_day.used_percentage')

out="$(c 36 "${model:-?}")"
[ -n "$effort" ] && out+=" $(c 2 ·) $(c 35 "$effort")"
[ -n "$branch" ] && out+=" $(c 2 '|') $(c 33 "⎇ $branch")"
if [ -n "$size" ] && [ "$size" != 0 ]; then
  if [ -z "$left" ] && [ -n "$used" ]; then left=$(( 100 - used * 100 / size )); fi
  l=${left%.*}; l=${l:-100}
  if [ "$l" -gt 50 ]; then fg=32; elif [ "$l" -gt 20 ]; then fg=33; else fg=31; fi
  n=$(( l / 10 )); bar=""; for ((i=0;i<10;i++)); do if [ $i -lt $n ]; then bar+="█"; else bar+="░"; fi; done
  out+=" $(c 2 '|') $(c 2 ctx) $(c "$fg" "$bar") $(c "1;$fg" "${l}%") $(c 2 "$(k "${used:-0}")/$(k "$size")")"
fi
[ -n "$tin$tout" ] && out+=" $(c 2 '|') ↑$(k "${tin:-0}") ↓$(k "${tout:-0}")"
lim=""; [ -n "$r5" ] && lim+="5h ${r5%.*}%"; [ -n "$r7" ] && lim+="${lim:+ · }7d ${r7%.*}%"
[ -n "$lim" ] && out+=" $(c 2 '|') limit $lim"
printf '%s' "$out"
