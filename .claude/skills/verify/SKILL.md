---
name: verify
description: soccer-sim の変更を検証する（型チェック・テスト・ヘッドレス実行）。コードを編集したあと、コミット前、「動作確認して」「テスト通して」「typecheck して」と言われたときに使う。この環境では npx が PATH に無いため、素の npm run では失敗する。
---

# 変更の検証

## 重要: npx が使えない

この環境では `npx` が PATH にありません。`npm run test` / `npm run typecheck` も内部で解決に失敗することがあるため、**`./node_modules/.bin/` を直接叩く**か、Node を PATH に追加してください。

Bash ツール（Git Bash）から:

```bash
cd g:/Agent_Football && PATH="$PATH:/c/Program Files/nodejs" ./node_modules/.bin/tsc --noEmit && echo "TYPECHECK OK"
cd g:/Agent_Football && PATH="$PATH:/c/Program Files/nodejs" ./node_modules/.bin/vitest run
cd g:/Agent_Football && PATH="$PATH:/c/Program Files/nodejs" ./node_modules/.bin/tsx src/headless.ts
```

単一テストファイルだけ実行する場合:

```bash
cd g:/Agent_Football && PATH="$PATH:/c/Program Files/nodejs" ./node_modules/.bin/vitest run tests/game/ball.test.ts
```

## 手順

1. **型チェック** — `tsc --noEmit`。`GameConfig` や `src/types.ts` を触った変更は、ここで漏れ（設定キーの追加忘れ、テスト側の追従漏れ）が真っ先に出る。
2. **テスト** — `vitest run`。全件緑であることを確認する。落ちたテストがあれば、実装とテストのどちらが正しいかを仕様（`specification/*.md`）に照らして判断してから直す。
3. **ヘッドレス実行** — `tsx src/headless.ts`。

## ヘッドレス実行の結果の読み方

第一段階が完成するまで、ヘッドレス実行は未実装スタブで止まるのが**正常**です。落ちた場所で進捗が分かります。

- `Error: not implemented at Simulator.run` — マイルストーンE 未着手（現状のベースライン）
- `Error: not implemented at stepMatch` — Simulator は動き始めたがマイルストーンD 未完
- `Error: not implemented at stepBall` / `decideAction` — マイルストーンB / C 未完
- **エラーなく試合結果まで出力された** — MVP v0.1 到達。`ConsoleLogger` がスコアと勝敗を出す

想定外の失敗（`not implemented` 以外の例外、NaN 座標、無限ループ）が出たら、そこが本物のバグです。

## 報告のしかた

3つの結果をそのまま伝える。ヘッドレスが `not implemented` で止まったことは**失敗ではない**ので、どのマイルストーン待ちなのかを添えて報告する。テストが落ちている場合は出力を隠さずに示す。
