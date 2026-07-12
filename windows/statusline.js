#!/usr/bin/env node
// Windows 版ステータスライン (statusline.sh の Node.js 移植版)
// jq / bash / curl(bash経由) / date -r への依存を排除し、Node.js のみで動作する。
// セットアップ: このファイルを ~/.claude/statusline.js にコピーし、
// ~/.claude/settings.json の statusLine.command を
//   node "C:/Users/<ユーザー名>/.claude/statusline.js"
// に設定する。

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const RESET = '\x1b[0m';
const COLOR = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[38;5;203m',
  magenta: '\x1b[1;95m',
  orange: '\x1b[38;5;208m',
};

const ICON = {
  clock: '',
  calendar: '',
  robot: '',
  chart: '',
  reload: '',
  folder: '',
  git: '',
  bolt: '',
  money: '',
};

let input = '';
process.stdin.on('data', c => (input += c));
process.stdin.on('end', () => {
  try {
    process.stdout.write(render(input));
  } catch (e) {
    // 壊れた入力でもステータスラインを空にせず終了コード0で終わる
    process.stdout.write('');
  }
});

function render(input) {
  const j = JSON.parse(input);

  const cwd = (j.workspace && j.workspace.current_dir) || j.cwd || '';
  const dirname = cwd ? path.basename(cwd) : '';

  let branch = '';
  try {
    branch = execFileSync(
      'git',
      ['--no-optional-locks', '-C', cwd, 'branch', '--show-current'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
  } catch (e) {}

  const sessionName = j.session_name || 'unnamed';
  const sessionId = j.session_id || j.session_name || 'unknown';
  const model = (j.model && j.model.display_name) || 'unknown';
  const effort = (j.effort && j.effort.level) || 'default';

  const fiveRaw = j.rate_limits && j.rate_limits.five_hour && j.rate_limits.five_hour.used_percentage;
  const weekRaw = j.rate_limits && j.rate_limits.seven_day && j.rate_limits.seven_day.used_percentage;
  const ctxRaw = j.context_window && j.context_window.used_percentage;
  const costRaw = j.cost && j.cost.total_cost_usd;

  const five = typeof fiveRaw === 'number' ? Math.round(fiveRaw) : '?';
  const week = typeof weekRaw === 'number' ? Math.round(weekRaw) : '?';
  const ctx = typeof ctxRaw === 'number' ? Math.round(ctxRaw) : '?';
  const cost = typeof costRaw === 'number' ? Math.round(costRaw * 100) / 100 : '?';

  const fiveResets = j.rate_limits && j.rate_limits.five_hour && j.rate_limits.five_hour.resets_at;
  const weekResets = j.rate_limits && j.rate_limits.seven_day && j.rate_limits.seven_day.resets_at;

  const HOME = os.homedir();
  const CLAUDE_DIR = path.join(HOME, '.claude');

  const usdJpy = getUsdJpyRate(CLAUDE_DIR);
  const { dailyCost, monthlyCost } = trackCost(CLAUDE_DIR, costRaw, sessionId);

  const lines = [];
  lines.push(sessionName);

  if (branch) {
    const branchC = branch === 'main' || branch === 'master' ? COLOR.yellow : COLOR.green;
    lines.push(`${ICON.folder} ${dirname} | ${ICON.git} ${branchC}${branch}${RESET}`);
  } else {
    lines.push(`${ICON.folder} ${dirname}`);
  }

  const modelC = modelColor(model);
  const effortC = effortColor(effort);
  lines.push(
    `${ICON.robot} ${modelC}${model}${RESET} | ${ICON.bolt} ${effortC}${effort}${RESET} | ` +
    `${ICON.chart} ${pctColor(ctx)} | ${ICON.money} ${costColor(cost)}${jpyStr(cost, usdJpy)}`
  );

  lines.push(
    `${ICON.money} day: ${costColor(dailyCost)}${jpyStr(dailyCost, usdJpy)} | ` +
    `${ICON.money} month: ${costColor(monthlyCost)}${jpyStr(monthlyCost, usdJpy)}`
  );

  const fiveResetStr = formatResetTime(fiveResets);
  const weekResetStr = formatResetDateTime(weekResets);
  lines.push(
    `${ICON.clock} 5h: ${pctColor(five)}${fiveResetStr} | ${ICON.calendar} 7d: ${pctColor(week)}${weekResetStr}`
  );

  return lines.join('\n');
}

function modelColor(model) {
  if (/Haiku/.test(model)) return COLOR.green;
  if (/Sonnet/.test(model)) return COLOR.yellow;
  if (/Opus/.test(model)) return COLOR.orange;
  if (/Fable/.test(model)) return COLOR.magenta;
  return '';
}

function effortColor(effort) {
  switch (effort) {
    case 'low': return COLOR.green;
    case 'medium': return COLOR.yellow;
    case 'high': return COLOR.orange;
    case 'xhigh': case 'very_high': case 'veryhigh': return COLOR.red;
    case 'max': return COLOR.magenta;
    default: return '';
  }
}

// 使用率カラー（<50%:緑 50~90%:黄 90~100%:橙 >=100%:赤）
function pctColor(val) {
  if (val === '?') return '?';
  if (val >= 100) return `${COLOR.red}${val}%${RESET}`;
  if (val >= 90) return `${COLOR.orange}${val}%${RESET}`;
  if (val >= 50) return `${COLOR.yellow}${val}%${RESET}`;
  return `${COLOR.green}${val}%${RESET}`;
}

// コストカラー（<$1:緑 $1~$20:黄 $20~$100:橙 $100~$200:赤 >=$200:紫）
function costColor(val) {
  if (val === '?' || val === null || val === undefined) return '$?';
  const v = Number(val);
  const s = v.toFixed(2);
  if (v >= 200) return `${COLOR.magenta}$${s}${RESET}`;
  if (v >= 100) return `${COLOR.red}$${s}${RESET}`;
  if (v >= 20) return `${COLOR.orange}$${s}${RESET}`;
  if (v >= 1) return `${COLOR.yellow}$${s}${RESET}`;
  return `${COLOR.green}$${s}${RESET}`;
}

function jpyStr(val, usdJpy) {
  if (val === '?' || val === null || val === undefined || !usdJpy) return '';
  const yen = Math.trunc(Number(val) * usdJpy);
  return ` (¥${yen.toLocaleString('en-US')})`;
}

function formatResetTime(epochSeconds) {
  if (typeof epochSeconds !== 'number') return '';
  const t = new Date(epochSeconds * 1000).toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return ` ${ICON.reload} ${t}`;
}

function formatResetDateTime(epochSeconds) {
  if (typeof epochSeconds !== 'number') return '';
  const d = new Date(epochSeconds * 1000);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const weekday = d.toLocaleDateString('ja-JP', { weekday: 'short' });
  const t = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
  return ` ${ICON.reload} ${md}(${weekday}) ${t}`;
}

// 為替レート（USD/JPY）を6時間キャッシュして取得
function getUsdJpyRate(claudeDir) {
  const rateCache = path.join(claudeDir, 'usd_jpy_rate');
  let needFetch = true;
  try {
    const stat = fs.statSync(rateCache);
    if (Date.now() - stat.mtimeMs < 6 * 60 * 60 * 1000) needFetch = false;
  } catch (e) {}

  if (needFetch) {
    try {
      const out = execFileSync(
        'curl',
        ['-sf', '--max-time', '3', 'https://api.exchangerate-api.com/v4/latest/USD'],
        { encoding: 'utf8' }
      );
      const rate = JSON.parse(out).rates.JPY;
      if (typeof rate === 'number') {
        fs.mkdirSync(claudeDir, { recursive: true });
        fs.writeFileSync(rateCache, String(rate));
      }
    } catch (e) {}
  }

  try {
    const rate = parseFloat(fs.readFileSync(rateCache, 'utf8'));
    return isFinite(rate) ? rate : null;
  } catch (e) {
    return null;
  }
}

// 日次・月次の累計コストを記録・集計する（セッション開始時点のコストを基準に差分を積算）
function trackCost(claudeDir, costRaw, sessionId) {
  const costDir = path.join(claudeDir, 'session_costs');
  const dailyDir = path.join(costDir, 'daily');
  const dailyStartDir = path.join(costDir, 'daily_start');
  const monthlyDir = path.join(costDir, 'monthly');
  const monthlyStartDir = path.join(costDir, 'monthly_start');
  for (const d of [dailyDir, dailyStartDir, monthlyDir, monthlyStartDir]) {
    fs.mkdirSync(d, { recursive: true });
  }

  const now = new Date();
  const today = formatDate(now);
  const thisMonth = today.slice(0, 7);

  if (typeof costRaw === 'number' && sessionId) {
    updateTracker(dailyStartDir, dailyDir, `${today}_${sessionId}`, costRaw);
    updateTracker(monthlyStartDir, monthlyDir, `${thisMonth}_${sessionId}`, costRaw);
  }

  return {
    dailyCost: sumFilesWithPrefix(dailyDir, `${today}_`),
    monthlyCost: sumFilesWithPrefix(monthlyDir, `${thisMonth}_`),
  };
}

function updateTracker(startDir, valueDir, key, costRaw) {
  const startFile = path.join(startDir, key);
  if (!fs.existsSync(startFile)) {
    fs.writeFileSync(startFile, String(costRaw));
  }
  const base = parseFloat(safeRead(startFile)) || 0;
  const sessionValue = Math.max(0, costRaw - base);
  fs.writeFileSync(path.join(valueDir, key), sessionValue.toFixed(4));
}

function sumFilesWithPrefix(dir, prefix) {
  let sum = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith(prefix)) continue;
      const v = parseFloat(safeRead(path.join(dir, f)));
      if (isFinite(v)) sum += v;
    }
  } catch (e) {}
  return Math.round(sum * 100) / 100;
}

function safeRead(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    return '';
  }
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
