// このファイルは記録用です。
// ~/.claude/settings.json の statusLine.command に現在設定されている
// Node.js ワンライナーを、2026-07-12 時点でそのまま抽出し、読みやすく整形したものです。
// (実際に有効なのは settings.json 側の1行版であり、このファイル自体は参照用の写しです)
//
// 動作: Claude Code から渡される statusline 入力 JSON を stdin から読み取り、
// セッション名 / 作業ディレクトリ名+ブランチ / モデル・effort・コンテキスト使用率・コスト /
// 5h・7dレート制限(リセット時刻付き) の4行を標準出力に書き出す。

let d = '';
process.stdin.on('data', c => d += c).on('end', () => {
  const j = JSON.parse(d);

  const cwd = (j.workspace && j.workspace.current_dir) || '';
  const dir = cwd ? require('path').basename(cwd) : '';

  let branch = '';
  try {
    branch = require('child_process').execFileSync(
      'git',
      ['--no-optional-locks', '-C', cwd, 'branch', '--show-current'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
  } catch (e) {}

  const session = j.session_name || j.session_id || '';
  const model = (j.model && j.model.display_name) || '';
  const effort = (j.effort && j.effort.level) || '';
  const ctx = j.context_window && j.context_window.used_percentage;
  const cost = j.cost && j.cost.total_cost_usd;
  const five = j.rate_limits && j.rate_limits.five_hour && j.rate_limits.five_hour.used_percentage;
  const week = j.rate_limits && j.rate_limits.seven_day && j.rate_limits.seven_day.used_percentage;
  const fiveResets = j.rate_limits && j.rate_limits.five_hour && j.rate_limits.five_hour.resets_at;
  const weekResets = j.rate_limits && j.rate_limits.seven_day && j.rate_limits.seven_day.resets_at;

  // 1行目: セッション名
  const line1 = session || '';

  // 2行目: 作業ディレクトリ名 + ブランチ名
  let line2Parts = [];
  if (dir) line2Parts.push(' ' + dir);
  if (branch) line2Parts.push(' ' + branch);
  const line2 = line2Parts.join(' | ');

  // 3行目: モデル名 / effort / コンテキスト使用率 / コスト
  let l3 = [];
  if (model) l3.push(' ' + model);
  if (effort) l3.push(' ' + effort);
  if (typeof ctx === 'number') l3.push(' ' + ctx.toFixed(0) + '%');
  if (typeof cost === 'number') l3.push('$' + cost.toFixed(2));
  const line3 = l3.join(' | ');

  // 4行目: 5時間・7日レート制限(リセット時刻付き)
  let l4 = [];
  if (typeof five === 'number') {
    let s = ' 5h ' + five.toFixed(0) + '%';
    if (typeof fiveResets === 'number') {
      s += '  ' + new Date(fiveResets * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    l4.push(s);
  }
  if (typeof week === 'number') {
    let s = ' 7d ' + week.toFixed(0) + '%';
    if (typeof weekResets === 'number') {
      const wd = new Date(weekResets * 1000);
      const md = (wd.getMonth() + 1) + '/' + wd.getDate();
      const wkday = wd.toLocaleDateString([], { weekday: 'short' });
      const tm = wd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      s += '  ' + md + '(' + wkday + ') ' + tm;
    }
    l4.push(s);
  }
  const line4 = l4.join(' | ');

  process.stdout.write([line1, line2, line3, line4].filter(Boolean).join('\n'));
});
