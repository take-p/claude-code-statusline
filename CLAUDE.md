## Guidelines

- `statusline.sh` を編集した際は、必ず `cp statusline.sh ~/.claude/statusline.sh` で上書きコピーすること

## セットアップ手順

ユーザーから「セットアップしてください」と言われたら、以下を実行すること：

1. `statusline.sh` を `~/.claude/statusline.sh` にコピーする
2. `chmod +x ~/.claude/statusline.sh` で実行権限を付与する
3. `~/.claude/settings.json` に以下を追加する（既存の内容を壊さないよう注意）：
   ```json
   "statusLine": {
     "type": "command",
     "command": "/Users/YOUR_USERNAME/.claude/statusline.sh"
   }
   ```
   `YOUR_USERNAME` は実際のユーザー名（`whoami` で確認）に置き換えること
