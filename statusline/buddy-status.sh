#!/usr/bin/env bash
# claude-buddy status line — animated, right-aligned multi-line companion
#
# Art rendering: the server (writeStatusState in server/state.ts) pre-bakes
# every frame with eye, hat overlay, and blink resolved, and writes them into
# status.json along with the frame-index sequence. This script is a dumb
# cycler — one jq call per tick picks the current frame body.
#
# BUDDY_FAKE_NOW env var: override wall clock for snapshot tests.
#
# Uses Braille Blank (U+2800) for padding — survives JS .trim()
#
# When running inside buddy-shell (the PTY wrapper), skip status line rendering
# so the buddy doesn't show up twice (once in status line, once in wrapper panel).
[ "$BUDDY_SHELL" = "1" ] && exit 0

# shellcheck source=../scripts/paths.sh
source "$(dirname "${BASH_SOURCE[0]}")/../scripts/paths.sh"

STATE="$BUDDY_STATE_DIR/status.json"
CONFIG_FILE="$BUDDY_STATE_DIR/config.json"
# Session ID: sanitized tmux pane number, or "default" outside tmux
SID="${TMUX_PANE#%}"
SID="${SID:-default}"

[ -f "$STATE" ] || exit 0

MUTED=$(jq -r '.muted // false' "$STATE" 2>/dev/null)
[ "$MUTED" = "true" ] && exit 0

NAME=$(jq -r '.name // ""' "$STATE" 2>/dev/null)
[ -z "$NAME" ] && exit 0

SPECIES=$(jq -r '.species // ""' "$STATE" 2>/dev/null)
RARITY=$(jq -r '.rarity // "common"' "$STATE" 2>/dev/null)
SHINY=$(jq -r '.shiny // false' "$STATE" 2>/dev/null)
HAT=$(jq -r '.hat // "none"' "$STATE" 2>/dev/null)
E=$(jq -r '.eye // "°"' "$STATE" 2>/dev/null)
REACTION=$(jq -r '.reaction // ""' "$STATE" 2>/dev/null)
ACHIEVEMENT=$(jq -r '.achievement // ""' "$STATE" 2>/dev/null)

# ─── Parse session metrics from stdin (JSON piped by Claude Code) ────────────
STDIN_JSON=$(cat)
SESSION_MODEL=$(echo "$STDIN_JSON" | jq -r '.model.display_name // ""' 2>/dev/null)
SESSION_COST=$(echo "$STDIN_JSON" | jq -r '.cost.total_cost_usd // 0' 2>/dev/null)
CTX_TOKENS=$(echo "$STDIN_JSON" | jq -r '.context_window.total_input_tokens // 0' 2>/dev/null)
CTX_MAX=$(echo "$STDIN_JSON" | jq -r '.context_window.context_window_size // 0' 2>/dev/null)
CTX_PCT=$(echo "$STDIN_JSON" | jq -r '.context_window.used_percentage // 0' 2>/dev/null | cut -d. -f1)
EFFORT=$(echo "$STDIN_JSON" | jq -r '.effort.level // ""' 2>/dev/null)
RATE_5H=$(echo "$STDIN_JSON" | jq -r '.rate_limits.five_hour.used_percentage // ""' 2>/dev/null | cut -d. -f1)

# ─── Animation: prefer server-rendered frames, fall back to inline species art
NOW=${BUDDY_FAKE_NOW:-$(date +%s)}
FRAME_BODY=$(jq -r --argjson now "$NOW" '
    .frameSequence[$now % (.frameSequence | length)] as $idx
    | .frames[$idx] // ""
' "$STATE" 2>/dev/null)

if [ -n "$FRAME_BODY" ]; then
    ART_LINES=()
    while IFS= read -r line; do
        ART_LINES+=("$line")
    done <<< "$FRAME_BODY"
else
    # Inline species art when server hasn't written .frames to status.json
    SEQ=(0 0 0 0 1 0 0 0 -1 0 0 2 0 0 0)
    FRAME_IDX=$(( NOW % ${#SEQ[@]} ))
    FRAME=${SEQ[$FRAME_IDX]}
    BLINK=0
    if [ "$FRAME" -eq -1 ]; then BLINK=1; FRAME=0; fi

    case "$SPECIES" in
      duck)
        case $FRAME in
          0) L1="   __";      L2=" <(${E} )___"; L3="  (  ._>";   L4="   \`--'" ;;
          1) L1="   __";      L2=" <(${E} )___"; L3="  (  ._>";   L4="   \`--'~" ;;
          2) L1="   __";      L2=" <(${E} )___"; L3="  (  .__>";  L4="   \`--'" ;;
        esac ;;
      goose)
        case $FRAME in
          0) L1="  (${E}>";    L2="   ||";       L3=" _(__)_";   L4="  ^^^^" ;;
          1) L1=" (${E}>";     L2="   ||";       L3=" _(__)_";   L4="  ^^^^" ;;
          2) L1="  (${E}>>";   L2="   ||";       L3=" _(__)_";   L4="  ^^^^" ;;
        esac ;;
      blob)
        case $FRAME in
          0) L1=" .----.";    L2="( ${E}  ${E} )"; L3="(      )";  L4=" \`----'" ;;
          1) L1=".------.";   L2="( ${E}  ${E} )"; L3="(       )"; L4="\`------'" ;;
          2) L1="  .--.";     L2=" (${E}  ${E})";  L3=" (    )";   L4="  \`--'" ;;
        esac ;;
      cat)
        case $FRAME in
          0) L1=" /\\_/\\";   L2="( ${E}   ${E})"; L3="(  ω  )";  L4="(\")_(\")" ;;
          1) L1=" /\\_/\\";   L2="( ${E}   ${E})"; L3="(  ω  )";  L4="(\")_(\")~" ;;
          2) L1=" /\\-/\\";   L2="( ${E}   ${E})"; L3="(  ω  )";  L4="(\")_(\")" ;;
        esac ;;
      dragon)
        case $FRAME in
          0) L1="/^\\  /^\\"; L2="< ${E}  ${E} >"; L3="(  ~~  )"; L4=" \`-vvvv-'" ;;
          1) L1="/^\\  /^\\"; L2="< ${E}  ${E} >"; L3="(      )"; L4=" \`-vvvv-'" ;;
          2) L1="/^\\  /^\\"; L2="< ${E}  ${E} >"; L3="(  ~~  )"; L4=" \`-vvvv-'" ;;
        esac ;;
      octopus)
        case $FRAME in
          0) L1=" .----.";   L2="( ${E}  ${E} )"; L3="(______)"; L4="/\\/\\/\\/\\" ;;
          1) L1=" .----.";   L2="( ${E}  ${E} )"; L3="(______)"; L4="\\/\\/\\/\\/" ;;
          2) L1=" .----.";   L2="( ${E}  ${E} )"; L3="(______)"; L4="/\\/\\/\\/\\" ;;
        esac ;;
      owl)
        case $FRAME in
          0) L1=" /\\  /\\";  L2="((${E})(${E}))"; L3="(  ><  )"; L4=" \`----'" ;;
          1) L1=" /\\  /\\";  L2="((${E})(${E}))"; L3="(  ><  )"; L4=" .----." ;;
          2) L1=" /\\  /\\";  L2="((${E})(-))";    L3="(  ><  )"; L4=" \`----'" ;;
        esac ;;
      penguin)
        case $FRAME in
          0) L1=" .---.";    L2=" (${E}>${E})";   L3="/(   )\\"; L4=" \`---'" ;;
          1) L1=" .---.";    L2=" (${E}>${E})";   L3="|(   )|";  L4=" \`---'" ;;
          2) L1=" .---.";    L2=" (${E}>${E})";   L3="/(   )\\"; L4=" \`---'" ;;
        esac ;;
      turtle)
        case $FRAME in
          0) L1=" _,--._";   L2="( ${E}  ${E} )"; L3="[______]"; L4="\`\`    \`\`" ;;
          1) L1=" _,--._";   L2="( ${E}  ${E} )"; L3="[______]"; L4=" \`\`  \`\`" ;;
          2) L1=" _,--._";   L2="( ${E}  ${E} )"; L3="[======]"; L4="\`\`    \`\`" ;;
        esac ;;
      snail)
        case $FRAME in
          0) L1="${E}   .--."; L2="\\  ( @ )";   L3=" \\_\`--'"; L4="~~~~~~~" ;;
          1) L1=" ${E}  .--."; L2="|  ( @ )";   L3=" \\_\`--'"; L4="~~~~~~~" ;;
          2) L1="${E}   .--."; L2="\\  ( @ )";   L3=" \\_\`--'"; L4=" ~~~~~~" ;;
        esac ;;
      ghost)
        case $FRAME in
          0) L1=" .----.";   L2="/ ${E}  ${E} \\"; L3="|      |"; L4="~\`~\`\`~\`~" ;;
          1) L1=" .----.";   L2="/ ${E}  ${E} \\"; L3="|      |"; L4="\`~\`~~\`~\`" ;;
          2) L1=" .----.";   L2="/ ${E}  ${E} \\"; L3="|      |"; L4="~~\`~~\`~~" ;;
        esac ;;
      axolotl)
        case $FRAME in
          0) L1="}~(____)~{"; L2="}~(${E}..${E})~{"; L3=" (.--.)";  L4=" (_/\\_)" ;;
          1) L1="~}(____){~"; L2="~}(${E}..${E}){~"; L3=" (.--.)";  L4=" (_/\\_)" ;;
          2) L1="}~(____)~{"; L2="}~(${E}..${E})~{"; L3=" ( -- )";  L4=" ~_/\\_~" ;;
        esac ;;
      capybara)
        case $FRAME in
          0) L1="n______n";  L2="( ${E}    ${E} )"; L3="(  oo  )"; L4="\`------'" ;;
          1) L1="n______n";  L2="( ${E}    ${E} )"; L3="(  Oo  )"; L4="\`------'" ;;
          2) L1="u______n";  L2="( ${E}    ${E} )"; L3="(  oo  )"; L4="\`------'" ;;
        esac ;;
      cactus)
        case $FRAME in
          0) L1="n ____ n";  L2="||${E}  ${E}||"; L3="|_|  |_|"; L4="  |  |" ;;
          1) L1="  ____";    L2="n|${E}  ${E}|n"; L3="|_|  |_|"; L4="  |  |" ;;
          2) L1="n ____ n";  L2="||${E}  ${E}||"; L3="|_|  |_|"; L4="  |  |" ;;
        esac ;;
      robot)
        case $FRAME in
          0) L1=" .[||].";   L2="[ ${E}  ${E} ]"; L3="[ ==== ]"; L4="\`------'" ;;
          1) L1=" .[||].";   L2="[ ${E}  ${E} ]"; L3="[ -==- ]"; L4="\`------'" ;;
          2) L1=" .[||].";   L2="[ ${E}  ${E} ]"; L3="[ ==== ]"; L4="\`------'" ;;
        esac ;;
      rabbit)
        case $FRAME in
          0) L1=" (\\__/)";  L2="( ${E}  ${E} )"; L3="=(  ..  )="; L4="(\")__(\")" ;;
          1) L1=" (|__/)";   L2="( ${E}  ${E} )"; L3="=(  ..  )="; L4="(\")__(\")" ;;
          2) L1=" (\\__/)";  L2="( ${E}  ${E} )"; L3="=( .  . )="; L4="(\")__(\")" ;;
        esac ;;
      mushroom)
        case $FRAME in
          0) L1="-o-OO-o-";  L2="(________)";  L3="  |${E}${E}|"; L4="  |__|" ;;
          1) L1="-O-oo-O-";  L2="(________)";  L3="  |${E}${E}|"; L4="  |__|" ;;
          2) L1="-o-OO-o-";  L2="(________)";  L3="  |${E}${E}|"; L4="  |__|" ;;
        esac ;;
      chonk)
        case $FRAME in
          0) L1="/\\    /\\"; L2="( ${E}    ${E} )"; L3="(  ..  )"; L4="\`------'" ;;
          1) L1="/\\    /|";  L2="( ${E}    ${E} )"; L3="(  ..  )"; L4="\`------'" ;;
          2) L1="/\\    /\\"; L2="( ${E}    ${E} )"; L3="(  ..  )"; L4="\`------'~" ;;
        esac ;;
      *)
        L1="(${E}${E})"; L2="(  )"; L3=""; L4="" ;;
    esac

    # Blink: replace eyes with "-"
    if [ "$BLINK" -eq 1 ]; then
        L1="${L1//${E}/-}"; L2="${L2//${E}/-}"; L3="${L3//${E}/-}"; L4="${L4//${E}/-}"
    fi

    # Hat
    HAT_LINE=""
    case "$HAT" in
      crown)     HAT_LINE=" \\^^^/" ;;
      tophat)    HAT_LINE=" [___]" ;;
      propeller) HAT_LINE="  -+-" ;;
      halo)      HAT_LINE=" (   )" ;;
      wizard)    HAT_LINE="  /^\\" ;;
      beanie)    HAT_LINE=" (___)" ;;
      tinyduck)  HAT_LINE="  ,>" ;;
    esac

    ART_LINES=()
    [ -n "$HAT_LINE" ] && ART_LINES+=("$HAT_LINE")
    ART_LINES+=("$L1" "$L2" "$L3")
    [ -n "$L4" ] && ART_LINES+=("$L4")
fi

# ─── Rarity color (pC4 = dark theme, the default) ────────────────────────────
NC=$'\033[0m'
case "$RARITY" in
  common)    C=$'\033[38;2;153;153;153m' ;;
  uncommon)  C=$'\033[38;2;78;186;101m'  ;;
  rare)      C=$'\033[38;2;177;185;249m' ;;
  epic)      C=$'\033[38;2;175;135;255m' ;;
  legendary) C=$'\033[38;2;255;193;7m'   ;;
  *)         C=$'\033[0m' ;;
esac

B=$'\xe2\xa0\x80'  # Braille Blank U+2800

# ─── Rainbow colors for shiny buddies ────────────────────────────────────────
# Default ROYGBIV palette; overridden by rainbowColors in config.json
_hex_to_ansi() {
    local hex="${1#\#}"
    printf '\033[38;2;%d;%d;%dm' "$(( 16#${hex:0:2} ))" "$(( 16#${hex:2:2} ))" "$(( 16#${hex:4:2} ))"
}

RAINBOW=(
  $'\033[38;2;255;50;50m'
  $'\033[38;2;255;140;0m'
  $'\033[38;2;255;220;0m'
  $'\033[38;2;50;210;50m'
  $'\033[38;2;50;120;255m'
  $'\033[38;2;100;50;220m'
  $'\033[38;2;180;50;220m'
)

if [ -f "$CONFIG_FILE" ]; then
    _custom=$(jq -r '(.rainbowColors // []) | @tsv' "$CONFIG_FILE" 2>/dev/null)
    if [ -n "$_custom" ]; then
        RAINBOW=()
        for _hex in $_custom; do
            RAINBOW+=("$(_hex_to_ansi "$_hex")")
        done
    fi
fi

RAINBOW_LEN=${#RAINBOW[@]}
RAINBOW_OFFSET=$(( NOW % RAINBOW_LEN ))

# ─── Terminal width ──────────────────────────────────────────────────────────
COLS=0
PID=$$
for _ in 1 2 3 4 5; do
    PID=$(ps -o ppid= -p "$PID" 2>/dev/null | tr -d ' ')
    [ -z "$PID" ] || [ "$PID" = "1" ] && break

    # Linux: read PTY device from /proc
    PTY=$(readlink "/proc/${PID}/fd/0" 2>/dev/null)
    if [ -c "$PTY" ] 2>/dev/null; then
        COLS=$(stty size < "$PTY" 2>/dev/null | awk '{print $2}')
        [ "${COLS:-0}" -gt 40 ] 2>/dev/null && break
    fi

    # macOS: /proc doesn't exist — get TTY name from process table
    TTY_NAME=$(ps -o tty= -p "$PID" 2>/dev/null | tr -d ' ')
    if [ -n "$TTY_NAME" ] && [ "$TTY_NAME" != "??" ] && [ "$TTY_NAME" != "?" ]; then
        TTY_DEV="/dev/$TTY_NAME"
        if [ -c "$TTY_DEV" ] 2>/dev/null; then
            COLS=$(stty size < "$TTY_DEV" 2>/dev/null | awk '{print $2}')
            [ "${COLS:-0}" -gt 40 ] 2>/dev/null && break
        fi
    fi
done
[ "${COLS:-0}" -lt 40 ] 2>/dev/null && COLS=${COLUMNS:-0}
# Windows: /proc and TTY device detection don't exist; use PowerShell as fallback
if [ "${COLS:-0}" -lt 40 ] 2>/dev/null; then
    _ps_cols=$(powershell.exe -NoProfile -Command "(Get-Host).UI.RawUI.WindowSize.Width" 2>/dev/null | tr -d '\r\n')
    case "$_ps_cols" in ''|*[!0-9]*) ;; *) [ "$_ps_cols" -gt 40 ] 2>/dev/null && COLS=$_ps_cols ;; esac
fi
[ "${COLS:-0}" -lt 40 ] 2>/dev/null && COLS=125

# ─── Reaction bubble (with TTL check) ────────────────────────────────────────
BUBBLE=""
if [ -n "$ACHIEVEMENT" ] && [ "$ACHIEVEMENT" != "null" ] && [ "$ACHIEVEMENT" != "" ]; then
    BUBBLE=$'\xf0\x9f\x8f\x86'" $ACHIEVEMENT"
fi
REACTION_FILE="$BUDDY_STATE_DIR/reaction.$SID.json"
REACTION_TTL=0
INNER_W=44
MARGIN=8
if [ -f "$CONFIG_FILE" ]; then
    _ttl=$(jq -r '.reactionTTL // 0' "$CONFIG_FILE" 2>/dev/null || echo 0)
    case "$_ttl" in ''|*[!0-9]*) ;; *) REACTION_TTL="$_ttl" ;; esac
    _bw=$(jq -r '.bubbleWidth // 44' "$CONFIG_FILE" 2>/dev/null || echo 44)
    case "$_bw" in ''|*[!0-9]*) ;; *) INNER_W="$_bw" ;; esac
    _bm=$(jq -r '.bubbleMargin // 8' "$CONFIG_FILE" 2>/dev/null || echo 8)
    case "$_bm" in ''|*[!0-9]*) ;; *) MARGIN="$_bm" ;; esac
fi
if [ -n "$REACTION" ] && [ "$REACTION" != "null" ] && [ "$REACTION" != "" ]; then
    FRESH=0
    if [ "$REACTION_TTL" -eq 0 ]; then
        FRESH=1
    elif [ -f "$REACTION_FILE" ]; then
        TS=$(jq -r '.timestamp // 0' "$REACTION_FILE" 2>/dev/null || echo 0)
        if [ "$TS" != "0" ]; then
            NOW=$(date +%s)
            AGE=$(( NOW - TS / 1000 ))
            [ "$AGE" -lt "$REACTION_TTL" ] && FRESH=1
        fi
    fi
    if [ "$FRESH" -eq 1 ]; then
        if [ -n "$BUBBLE" ]; then
            BUBBLE="$BUBBLE | \"${REACTION}\""
        else
            BUBBLE="\"${REACTION}\""
        fi
    fi
fi

# ─── Build all art lines ──────────────────────────────────────────────────────
# ART_LINES comes from the pre-rendered frame (already includes hat + blink).
# Center the name under the art. Frames are 12 cols wide (see server/art.ts),
# so the geometric center sits at col 6.
NAME_LEN=${#NAME}
ART_CENTER=6
NAME_PAD=$(( ART_CENTER - NAME_LEN / 2 ))
[ "$NAME_PAD" -lt 0 ] && NAME_PAD=0
NAME_LINE="$(printf '%*s%s' "$NAME_PAD" '' "$NAME")"

DIM=$'\033[2;3m'

ALL_LINES=()
ALL_COLORS=()
_arc=0
for line in "${ART_LINES[@]}"; do
    ALL_LINES+=("$line")
    if [ "$SHINY" = "true" ]; then
        ALL_COLORS+=("${RAINBOW[$(( (_arc + RAINBOW_OFFSET) % RAINBOW_LEN ))]}")
    else
        ALL_COLORS+=("$C")
    fi
    _arc=$(( _arc + 1 ))
done
ALL_LINES+=("$NAME_LINE"); ALL_COLORS+=("$DIM")

ART_W=14
ART_COUNT=${#ALL_LINES[@]}

# ─── Speech bubble (left of art, word-wrapped) ──────────────────────────────
# Strip the quotes we added earlier
BUBBLE_TEXT=""
if [ -n "$BUBBLE" ]; then
    BUBBLE_TEXT="${BUBBLE%\"}"
    BUBBLE_TEXT="${BUBBLE_TEXT#\"}"
fi

# ─── Display width (emojis count as 2 cols) ──────────────────────────────────
# iconv turns the string into a stream of UTF-32LE codepoints, then awk sums
# widths. Rules mirror server/art.ts:displayWidth — the U+2600-U+27BF range
# is split by Emoji_Presentation (2) vs text-presentation (1), and VS16
# (U+FE0F) upgrades the previous narrow symbol to 2 cols (e.g. ❤ + VS16).
# The ambiguous codepoint list comes from emoji-widths.data, generated by
# scripts/gen-emoji-widths.ts from the Unicode Emoji_Presentation property.
EMOJI_WIDTHS_DATA="$(dirname "${BASH_SOURCE[0]}")/emoji-widths.data"
EMOJI_PRES_2600="$(grep -v '^#' "$EMOJI_WIDTHS_DATA" 2>/dev/null | tr -d '\n')"

dwidth() {
    printf '%s' "$1" | iconv -f UTF-8 -t UTF-32LE 2>/dev/null | od -An -tu4 | awk -v pres="$EMOJI_PRES_2600" '
    BEGIN {
        n = split(pres, arr)
        for (k = 1; k <= n; k++) wide[arr[k]] = 1
    }
    # Precondition: cp is neither a variation selector (65024-65039) nor ZWJ
    # (8205); the main loop filters those before calling in.
    function char_width(cp) {
        if (cp >= 126976) return 2
        if (cp >= 9728 && cp <= 10175) return (cp in wide) ? 2 : 1
        if (cp >= 9472 && cp <= 9631) return 1
        if (cp >= 12288 && cp <= 40959) return 2
        if (cp >= 65281 && cp <= 65376) return 2
        return 1
    }
    { for (i = 1; i <= NF; i++) {
        cp = $i + 0
        if (cp == 65039) {
            if (upgradable) { w += 1; upgradable = 0 }
            continue
        }
        if ((cp >= 65024 && cp <= 65038) || cp == 8205) { upgradable = 0; continue }
        cw = char_width(cp)
        w += cw
        upgradable = (cw == 1 && cp >= 9728 && cp <= 10175) ? 1 : 0
    } }
    END { print w+0 }'
}

# ─── Word-wrap bubble text ────────────────────────────────────────────────────
TEXT_LINES=()
if [ -n "$BUBBLE_TEXT" ]; then
    WORDS=($BUBBLE_TEXT)
    CUR_LINE=""
    CUR_W=0
    for word in "${WORDS[@]}"; do
        word_w=$(dwidth "$word")
        if [ -z "$CUR_LINE" ]; then
            CUR_LINE="$word"; CUR_W=$word_w
        elif [ $(( CUR_W + 1 + word_w )) -le $INNER_W ]; then
            CUR_LINE="$CUR_LINE $word"; CUR_W=$(( CUR_W + 1 + word_w ))
        else
            TEXT_LINES+=("$CUR_LINE")
            CUR_LINE="$word"; CUR_W=$word_w
        fi
    done
    [ -n "$CUR_LINE" ] && TEXT_LINES+=("$CUR_LINE")
fi

TEXT_COUNT=${#TEXT_LINES[@]}

# Build box as plain strings (no ANSI). Color applied at output time.
# Box display width = INNER_W + 4:  "| " + text(INNER_W) + " |"
BOX_W=$(( INNER_W + 4 ))
BUBBLE_LINES=()
BUBBLE_TYPES=()  # "border" or "text" — determines coloring
if [ $TEXT_COUNT -gt 0 ]; then
    # Top border
    BORDER=$(printf '%*s' "$(( BOX_W - 2 ))" '' | tr ' ' '-')
    BUBBLE_LINES+=(".${BORDER}.")
    BUBBLE_TYPES+=("border")
    # Text rows: "| text padded |"
    for tl in "${TEXT_LINES[@]}"; do
        tpad=$(( INNER_W - $(dwidth "$tl") ))
        [ "$tpad" -lt 0 ] && tpad=0
        padding=$(printf '%*s' "$tpad" '')
        BUBBLE_LINES+=("| ${tl}${padding} |")
        BUBBLE_TYPES+=("text")
    done
    # Bottom border
    BUBBLE_LINES+=("\`${BORDER}'")
    BUBBLE_TYPES+=("border")
fi

BUBBLE_COUNT=${#BUBBLE_LINES[@]}

# ─── Right-align with bubble box to the left ─────────────────────────────────
GAP=2
if [ $BUBBLE_COUNT -gt 0 ]; then
    TOTAL_W=$(( BOX_W + GAP + ART_W ))
else
    TOTAL_W=$ART_W
fi
PAD=$(( COLS - TOTAL_W - MARGIN ))
[ "$PAD" -lt 0 ] && PAD=0

# On Windows (Git Bash / MSYS2), Braille Blank (U+2800) renders as double-width,
# which doubles the spacer and pushes content off-screen. Use regular spaces instead.
case "$(uname -s)" in
    MINGW*|CYGWIN*|MSYS*) SPACER=$(printf '%*s' "$PAD" '') ;;
    *)                     SPACER=$(printf "${B}%${PAD}s" "") ;;
esac
GAP_STR=$(printf '%*s' "$GAP" '')

# Vertically center bubble box on the art
BUBBLE_START=0
if [ $BUBBLE_COUNT -gt 0 ] && [ $BUBBLE_COUNT -lt $ART_COUNT ]; then
    BUBBLE_START=$(( (ART_COUNT - BUBBLE_COUNT) / 2 ))
fi

# ─── Find the connector line (middle text line → points to buddy's mouth) ─────
# The connector goes on the middle text row of the bubble
CONNECTOR_BI=-1
if [ $BUBBLE_COUNT -gt 2 ]; then
    # text rows are indices 1..(BUBBLE_COUNT-2), pick the middle one
    FIRST_TEXT=1
    LAST_TEXT=$(( BUBBLE_COUNT - 2 ))
    CONNECTOR_BI=$(( (FIRST_TEXT + LAST_TEXT) / 2 ))
fi

# ─── Output: merged bubble box + connector + art per line ─────────────────────
TOTAL_BUBBLE=$(( BUBBLE_START + BUBBLE_COUNT ))
MAX_LINES=$(( ART_COUNT > TOTAL_BUBBLE ? ART_COUNT : TOTAL_BUBBLE ))
for (( i=0; i<MAX_LINES; i++ )); do
    # Art part: actual art line or blank filler
    if [ $i -lt $ART_COUNT ]; then
        art_part="${ALL_COLORS[$i]}${ALL_LINES[$i]}${NC}"
    else
        art_part=$(printf '%*s' "$ART_W" '')
    fi

    if [ $BUBBLE_COUNT -gt 0 ]; then
        bi=$(( i - BUBBLE_START ))
        if [ $bi -ge 0 ] && [ $bi -lt $BUBBLE_COUNT ]; then
            bline="${BUBBLE_LINES[$bi]}"
            btype="${BUBBLE_TYPES[$bi]}"

            # Connector: "-- " on the middle text line, spaces otherwise
            if [ $bi -eq $CONNECTOR_BI ]; then
                gap="${C}--${NC} "
            else
                gap="   "
            fi

            if [ "$btype" = "border" ]; then
                echo "${SPACER}${C}${bline}${NC}${gap}${art_part}"
            else
                pipe_l="${bline:0:1}"
                pipe_r="${bline: -1}"
                inner="${bline:1:$(( ${#bline} - 2 ))}"
                echo "${SPACER}${C}${pipe_l}${NC}${DIM}${inner}${NC}${C}${pipe_r}${NC}${gap}${art_part}"
            fi
        else
            empty=$(printf '%*s' "$BOX_W" '')
            echo "${SPACER}${empty}   ${art_part}"
        fi
    else
        echo "${SPACER}${art_part}"
    fi
done

# ─── Session metrics line (tokens · cost · model) ───────────────────────────
if [ -n "$SESSION_MODEL" ] && [ "$SESSION_MODEL" != "" ] && [ "$SESSION_MODEL" != "null" ]; then
    # Format tokens: 45231 → 45k
    if [ "${CTX_TOKENS:-0}" -ge 1000 ] 2>/dev/null; then
        CTX_DISPLAY="$(( CTX_TOKENS / 1000 ))k"
    else
        CTX_DISPLAY="${CTX_TOKENS:-0}"
    fi
    if [ "${CTX_MAX:-0}" -ge 1000 ] 2>/dev/null; then
        CTX_MAX_DISPLAY="$(( CTX_MAX / 1000 ))k"
    else
        CTX_MAX_DISPLAY="${CTX_MAX:-0}"
    fi

    # Color context % based on usage
    if [ "${CTX_PCT:-0}" -ge 80 ] 2>/dev/null; then
        CTX_COLOR=$'\033[38;2;255;85;85m'   # red
    elif [ "${CTX_PCT:-0}" -ge 50 ] 2>/dev/null; then
        CTX_COLOR=$'\033[38;2;255;193;7m'   # gold
    else
        CTX_COLOR=$'\033[38;2;78;186;101m'  # green
    fi

    # Format cost
    COST_DISPLAY=$(printf '$%.2f' "${SESSION_COST:-0}")

    # Effort level (short label)
    EFFORT_PART=""
    EFFORT_RAW=""
    if [ -n "$EFFORT" ] && [ "$EFFORT" != "null" ] && [ "$EFFORT" != "" ]; then
        case "$EFFORT" in
          low)    EFF_COLOR=$'\033[38;2;78;186;101m'  ;;  # green
          medium) EFF_COLOR=$'\033[38;2;153;153;153m' ;;  # gray
          high)   EFF_COLOR=$'\033[38;2;255;193;7m'   ;;  # gold
          *)      EFF_COLOR=$'\033[38;2;255;85;85m'   ;;  # red (xhigh/max)
        esac
        EFFORT_PART="${DIM} · ${NC}${EFF_COLOR}${EFFORT}${NC}"
        EFFORT_RAW=" · ${EFFORT}"
    fi

    # Rate limit 5h (only shown if available)
    RATE_PART=""
    RATE_RAW=""
    if [ -n "$RATE_5H" ] && [ "$RATE_5H" != "null" ] && [ "$RATE_5H" != "" ]; then
        if [ "${RATE_5H:-0}" -ge 80 ] 2>/dev/null; then
            RATE_COLOR=$'\033[38;2;255;85;85m'   # red
        elif [ "${RATE_5H:-0}" -ge 50 ] 2>/dev/null; then
            RATE_COLOR=$'\033[38;2;255;193;7m'   # gold
        else
            RATE_COLOR=$'\033[38;2;78;186;101m'  # green
        fi
        RATE_PART="${DIM} · ${NC}${RATE_COLOR}${RATE_5H}%${NC}${DIM}5h${NC}"
        RATE_RAW=" · ${RATE_5H}%5h"
    fi

    METRICS="${DIM}ctx ${NC}${CTX_COLOR}${CTX_DISPLAY}/${CTX_MAX_DISPLAY}${NC}${DIM} · ${NC}${DIM}${COST_DISPLAY}${NC}${DIM} · ${NC}${DIM}${SESSION_MODEL}${NC}${EFFORT_PART}${RATE_PART}"

    # Right-align under the art
    METRICS_RAW="ctx ${CTX_DISPLAY}/${CTX_MAX_DISPLAY} · ${COST_DISPLAY} · ${SESSION_MODEL}${EFFORT_RAW}${RATE_RAW}"
    METRICS_LEN=${#METRICS_RAW}
    METRICS_PAD=$(( COLS - METRICS_LEN - MARGIN ))
    [ "$METRICS_PAD" -lt 0 ] && METRICS_PAD=0
    METRICS_SPACER=$(printf "${B}%${METRICS_PAD}s" "")

    echo "${METRICS_SPACER}${METRICS}"
fi

exit 0
