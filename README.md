# Claude Code ステータスライン

Claude Code の画面下部に、セッション名・モデル・使用率・コストなどを常時表示するステータスラインスクリプトです。

## 表示例

```
# git リポジトリの場合
マイプロジェクトの実装作業
 myproject |  main
 Sonnet 4.6 |  high |  12% |  $0.58 (¥93)
 day: $0.58 (¥93) |  month: $12.40 (¥1,988)
 5h: 17%  05:30 |  7d: 2%  6/17(火) 09:00
```

## 表示項目

| 行 | 内容 |
|---|---|
| 1行目 | セッション名 |
| 2行目 | 作業ディレクトリ名（git リポジトリの場合は右にブランチ名） |
| 3行目 | モデル名・effort・コンテキスト使用率・セッションコスト（円換算付き） |
| 4行目 | 日次・月次累計コスト（円換算付き） |
| 5行目 | 5時間・7日レート制限の使用率とリセット日時 |

### カラールール

| 項目 | 色 |
|---|---|
| モデル名 | Haiku:緑 / Sonnet:黄 / Opus:橙 / Fable:紫 |
| effort | low:緑 / medium:黄 / high:橙 / very high:赤 / max:紫 |
| 使用率 | <50%:緑 / 50〜90%:黄 / ≥90%:橙 |
| コスト | <$1:緑 / $1〜$10:黄 / $10〜$100:橙 / ≥$100:紫 |
| ブランチ名 | main/master:黄 / その他:緑 |

## 必要なもの

- **macOS**（`date -r` コマンドを使用しているため macOS 専用です）
- [Claude Code](https://claude.ai/code)
- `jq`（`brew install jq`）
- `curl`（為替レート取得に使用）
- [Nerd Fonts](https://www.nerdfonts.com/) 対応フォント（アイコン表示に必要）

## セットアップ

1. このリポジトリをクローンして Claude Code で開く

```bash
git clone https://github.com/YOUR_USERNAME/claude-code-statusline.git
cd claude-code-statusline
claude .
```

> `YOUR_USERNAME` は実際の GitHub ユーザー名に置き換えてください。

2. Claude Code に以下のように依頼する

```
セットアップしてください
```

Claude Code が `statusline.sh` を読み取り、`~/.claude/statusline.sh` へのコピーと `~/.claude/settings.json` への設定追加を自動で行います。

3. Claude Code を再起動（または新しいセッションを開始）する

## 仕様メモ

- 為替レート（USD/JPY）は `~/.claude/usd_jpy_rate` に6時間キャッシュ
- セッションコストは `~/.claude/session_costs/` に記録（日次・月次で自動リセット）
