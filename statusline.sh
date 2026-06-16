#!/bin/bash
input=$(cat)

# デバッグ用（必要な時だけコメントを外す）
# echo "$input" >> /tmp/claude_statusline_debug.json

# ANSI カラーコード
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
RED=$'\033[38;5;203m'
MAGENTA=$'\033[1;95m'
ORANGE=$'\033[38;5;208m'
RESET=$'\033[0m'

SESSION_NAME=$(echo "$input" | jq -r '.session_name // "unnamed"')
CWD=$(echo "$input" | jq -r '.cwd // ""')
MODEL=$(echo "$input" | jq -r '.model.display_name // "unknown"')
EFFORT=$(echo "$input" | jq -r '.effort.level // "default"')
FIVE_H=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // "?" | if type == "number" then round else . end')
SEVEN_D=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // "?" | if type == "number" then round else . end')
CTX=$(echo "$input" | jq -r '.context_window.used_percentage // "?" | if type == "number" then round else . end')
COST=$(echo "$input" | jq -r '.cost.total_cost_usd // "?" | if type == "number" then (100 * . | round / 100 | tostring) else . end')

# 為替レート（6時間キャッシュ）
RATE_CACHE="${HOME}/.claude/usd_jpy_rate"
if [ ! -f "$RATE_CACHE" ] || [ $(( $(date +%s) - $(date -r "$RATE_CACHE" +%s 2>/dev/null || echo 0) )) -gt 21600 ]; then
  FETCHED=$(curl -sf --max-time 3 "https://api.exchangerate-api.com/v4/latest/USD" 2>/dev/null | jq -r '.rates.JPY // ""')
  [ -n "$FETCHED" ] && echo "$FETCHED" > "$RATE_CACHE"
fi
USD_JPY=$(cat "$RATE_CACHE" 2>/dev/null)

SESSION_ID=$(echo "$input" | jq -r '.session_id // .session_name // "unknown"')

# 累計コスト記録（日次・月次）
COST_DIR="${HOME}/.claude/session_costs"
mkdir -p "$COST_DIR/daily" "$COST_DIR/daily_start" "$COST_DIR/monthly" "$COST_DIR/monthly_start"
TODAY=$(date +%Y-%m-%d)
THIS_MONTH=$(date +%Y-%m)
if [ "$COST" != "?" ] && [ -n "$SESSION_ID" ]; then
  DAILY_START_FILE="$COST_DIR/daily_start/${TODAY}_${SESSION_ID}"
  [ ! -f "$DAILY_START_FILE" ] && echo "$COST" > "$DAILY_START_FILE"
  DAILY_BASE=$(cat "$DAILY_START_FILE" 2>/dev/null || echo "0")
  SESSION_TODAY=$(awk -v c="$COST" -v s="$DAILY_BASE" 'BEGIN {d=c-s; printf "%.4f", (d<0?0:d)}')
  echo "$SESSION_TODAY" > "$COST_DIR/daily/${TODAY}_${SESSION_ID}"

  MONTHLY_START_FILE="$COST_DIR/monthly_start/${THIS_MONTH}_${SESSION_ID}"
  [ ! -f "$MONTHLY_START_FILE" ] && echo "$COST" > "$MONTHLY_START_FILE"
  MONTHLY_BASE=$(cat "$MONTHLY_START_FILE" 2>/dev/null || echo "0")
  SESSION_THIS_MONTH=$(awk -v c="$COST" -v s="$MONTHLY_BASE" 'BEGIN {d=c-s; printf "%.4f", (d<0?0:d)}')
  echo "$SESSION_THIS_MONTH" > "$COST_DIR/monthly/${THIS_MONTH}_${SESSION_ID}"
fi
SUM_AWK='{s+=$1} END {printf "%.2f", s+0}'
DAILY_COST=$(ls $COST_DIR/daily/${TODAY}_* 2>/dev/null | xargs cat 2>/dev/null | awk "$SUM_AWK")
MONTHLY_COST=$(ls $COST_DIR/monthly/${THIS_MONTH}_* 2>/dev/null | xargs cat 2>/dev/null | awk "$SUM_AWK")

FIVE_H_RESET=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // ""')
SEVEN_D_RESET=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // ""')

BRANCH=$(git -C "$CWD" branch --show-current 2>/dev/null)
DIRNAME=$(basename "$CWD")

# モデルカラー（Haiku:緑 Sonnet:黄 Opus:橙 Fable:紫）
case "$MODEL" in
  *Haiku*)  MODEL_C="${GREEN}" ;;
  *Sonnet*) MODEL_C="${YELLOW}" ;;
  *Opus*)   MODEL_C="${ORANGE}" ;;
  *Fable*)  MODEL_C="${MAGENTA}" ;;
  *)        MODEL_C="" ;;
esac

# effortカラー（low:緑 medium:黄 high:橙 xhigh/very_high:赤 max:紫）
case "$EFFORT" in
  low)                    EFFORT_C="${GREEN}" ;;
  medium)                 EFFORT_C="${YELLOW}" ;;
  high)                   EFFORT_C="${ORANGE}" ;;
  xhigh|very_high|veryhigh) EFFORT_C="${RED}" ;;
  max)                    EFFORT_C="${MAGENTA}" ;;
  *)                      EFFORT_C="" ;;
esac

# 使用率カラー（<50%:緑 50~90%:黄 >=90%:橙）
pct_color() {
  local val=$1
  if [ "$val" = "?" ]; then echo -n "?"; return; fi
  if [ "$val" -ge 100 ]; then echo -n "${RED}${val}%${RESET}"
  elif [ "$val" -ge 90 ]; then echo -n "${ORANGE}${val}%${RESET}"
  elif [ "$val" -ge 50 ]; then echo -n "${YELLOW}${val}%${RESET}"
  else echo -n "${GREEN}${val}%${RESET}"
  fi
}

# コストカラー（<$1:緑 $1~$10:黄 $10~$100:橙 >=$100:紫）
cost_color() {
  local val=$1
  if [ "$val" = "?" ]; then echo -n "\$?"; return; fi
  if awk "BEGIN {exit !($val+0 >= 200)}"; then echo -n "${MAGENTA}\$${val}${RESET}"
  elif awk "BEGIN {exit !($val+0 >= 100)}"; then echo -n "${RED}\$${val}${RESET}"
  elif awk "BEGIN {exit !($val+0 >= 20)}"; then echo -n "${ORANGE}\$${val}${RESET}"
  elif awk "BEGIN {exit !($val+0 >= 1)}"; then echo -n "${YELLOW}\$${val}${RESET}"
  else echo -n "${GREEN}\$${val}${RESET}"
  fi
}

FIVE_H_STR=$(pct_color "$FIVE_H")
SEVEN_D_STR=$(pct_color "$SEVEN_D")
CTX_STR=$(pct_color "$CTX")
COST_STR=$(cost_color "$COST")
jpy_str() {
  local val=$1
  [ -z "$val" ] || [ -z "$USD_JPY" ] && return
  awk -v cost="$val" -v rate="$USD_JPY" 'BEGIN {n=int(cost*rate); s=sprintf("%d",n); r=""; for(i=length(s);i>=1;i--){r=substr(s,i,1) r; if((length(s)-i)%3==2 && i>1) r="," r}; printf " (¥%s)", r}' 2>/dev/null
}
DAILY_COST_STR=$(cost_color "$DAILY_COST")
DAILY_JPY_STR=$(jpy_str "$DAILY_COST")
MONTHLY_COST_STR=$(cost_color "$MONTHLY_COST")
MONTHLY_JPY_STR=$(jpy_str "$MONTHLY_COST")

JPY_STR=""
if [ "$COST" != "?" ] && [ -n "$USD_JPY" ]; then
  JPY_STR=$(awk -v cost="$COST" -v rate="$USD_JPY" 'BEGIN {n=int(cost*rate); s=sprintf("%d",n); r=""; for(i=length(s);i>=1;i--){r=substr(s,i,1) r; if((length(s)-i)%3==2 && i>1) r="," r}; printf " (¥%s)", r}' 2>/dev/null)
fi

CLOCK=$(printf '')
CALENDAR=$(printf '')
ROBOT=$(printf '')
CHART=$(printf '')
RELOAD=$(printf '')
FOLDER=$(printf '')
GIT=$(printf '')
BOLT=$(printf '')
MONEY=$(printf '')

echo "$SESSION_NAME"
if [ -n "$BRANCH" ]; then
  case "$BRANCH" in
    main|master) BRANCH_C="${YELLOW}" ;;
    *)           BRANCH_C="${GREEN}" ;;
  esac
  echo "${FOLDER} $DIRNAME | ${GIT} ${BRANCH_C}${BRANCH}${RESET}"
else
  echo "${FOLDER} $DIRNAME"
fi
FIVE_H_RESET_STR=""
SEVEN_D_RESET_STR=""
[ -n "$FIVE_H_RESET" ] && FIVE_H_RESET_STR=$(date -r "$FIVE_H_RESET" "+%H:%M" 2>/dev/null || echo "")
[ -n "$SEVEN_D_RESET" ] && SEVEN_D_RESET_STR=$(date -r "$SEVEN_D_RESET" "+%-m/%-d(%a) %H:%M" 2>/dev/null || echo "")
[ -n "$FIVE_H_RESET_STR" ] && FIVE_H_RESET_STR=" ${RELOAD} ${FIVE_H_RESET_STR}"
[ -n "$SEVEN_D_RESET_STR" ] && SEVEN_D_RESET_STR=" ${RELOAD} ${SEVEN_D_RESET_STR}"
echo "${ROBOT} ${MODEL_C}${MODEL}${RESET} | ${BOLT} ${EFFORT_C}${EFFORT}${RESET} | ${CHART} ${CTX_STR} | ${MONEY} ${COST_STR}${JPY_STR}"
echo "${MONEY} day: ${DAILY_COST_STR}${DAILY_JPY_STR} | ${MONEY} month: ${MONTHLY_COST_STR}${MONTHLY_JPY_STR}"
echo "${CLOCK} 5h: ${FIVE_H_STR}${FIVE_H_RESET_STR} | ${CALENDAR} 7d: ${SEVEN_D_STR}${SEVEN_D_RESET_STR}"
