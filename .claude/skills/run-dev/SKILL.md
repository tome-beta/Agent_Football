---
name: run-dev
description: soccer-sim の Canvas 描画版（npm run dev、Vite）を Windows 環境で起動し、ユーザーが目視確認できるようブラウザを開く。「試合を見たい」「dev で起動して」「ブラウザで確認したい」と言われたときに使う。chromium-cli や curl ポーリングが使えない Windows/PowerShell 環境向けの手順。
---

# dev サーバー起動（Windows）

このプロジェクトは Windows 上で動いており、`chromium-cli` は入っていない。汎用の「run」手順（`npm run dev &` + `curl` ポーリング + `chromium-cli` で操作）はそのままでは動かない。ユーザー自身が実際のブラウザで目視確認したい場面が中心なので、スクリーンショットで検証するより「サーバーを起動してユーザーのブラウザを開く」ことを主眼にする。

## 手順

1. **PowerShell で `npm run dev` をバックグラウンド起動する。** `Start-Process -FilePath "npm"` は直接使えない（`%1 is not a valid Win32 application` エラーになる）。`cmd.exe` 経由でラップし、ログをファイルへリダイレクトする:

```powershell
cd G:\Agent_Football; Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev > dev_stdout.log 2>dev_stderr.log" -WorkingDirectory "G:\Agent_Football" -WindowStyle Hidden; Start-Sleep -Seconds 5; Get-Content dev_stdout.log -ErrorAction SilentlyContinue
```

2. **ログに `VITE vX.X.X ready` と `Local: http://localhost:5173/` が出ていることを確認する。** 出ていなければ `dev_stderr.log` を見てエラー内容を確認する。

3. **ユーザーのデフォルトブラウザで開く:**

```powershell
Start-Process "http://localhost:5173/"
```

これで実際のブラウザウィンドウが開き、ユーザー自身が目視確認できる。`vite.config.ts` の `server.open: true` は隠しウィンドウの `cmd.exe` から起動した場合には効かないことがあるため、明示的に `Start-Process` で開くのが確実。

4. **止めるとき**（再起動する前や作業終了時）は、ポート5173を掴んでいるプロセスを止める:

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

先に止めずに再度起動しようとすると `EADDRINUSE` になる。

5. `dev_stdout.log`/`dev_stderr.log` は `.gitignore` 済みなので、コミットに混ざる心配はない（削除しなくてよい）。

## 意図切り替えログを見る

このプロジェクトには選手AIの意図（`Player.intent.type`）切り替えを `console.log` するデバッグ機構がある（`Logger.logIntentChange`、マイルストーンN-5）。ブラウザの DevTools コンソールで `Turn N: playerId from -> to` の形式のログが見える。不自然な動きの原因調査にはこのログとブラウザでの目視の両方を使うとよい。

## 目視確認だけでなく検証が必要なとき

コード変更の妥当性を機械的に確認したいだけなら、この Skill ではなく `verify`（型チェック・テスト・ヘッドレス実行）や `balance-check`/`anomaly-hunt`（統計的な健全性・異常検知）を使う。この Skill はあくまで「人間の目でCanvas描画を見る」ためのもの。
