---
name: verify
description: soccer-sim の変更を検証する（型チェック・テスト・ヘッドレス実行）。コードを編集したあと、コミット前、「動作確認して」「テスト通して」「typecheck して」と言われたときに使う。
---

# 変更の検証

## コマンド

`npm run` でそのまま動く（`npx`/PATHの問題は基本的に発生しない）:

```bash
cd g:/Agent_Football && npm run typecheck
cd g:/Agent_Football && npm run test
cd g:/Agent_Football && npm run headless
```

単一テストファイルだけ実行する場合:

```bash
cd g:/Agent_Football && npx vitest run tests/game/ball.test.ts
```

万一 `npx`/`npm run` がPATH解決に失敗する環境に当たったら、`./node_modules/.bin/tsc` のように直接叩くか `PATH="$PATH:/c/Program Files/nodejs"` を前置きするフォールバックがある（`node_modules/.bin/` に `tsc`/`vitest`/`tsx` が揃っている）。

## 手順

1. **型チェック** — `tsc --noEmit`。`GameConfig` や `src/types.ts` を触った変更は、ここで漏れ（設定キーの追加忘れ、テスト側の追従漏れ）が真っ先に出る。
2. **テスト** — `vitest run`。全件緑であることを確認する。落ちたテストがあれば、実装とテストのどちらが正しいかを仕様（`specification/*.md`）に照らして判断してから直す。
3. **ヘッドレス実行** — `tsx src/headless.ts`（`npm run headless`）。

## ヘッドレス実行の結果の読み方

第一ステップ（マイルストーンA〜G）は全て完了済みのため、通常は例外なく `Match result: Team A n - m Team B (Winner: ...)` まで到達する。これが**正常**な結果。

想定外の失敗（例外、NaN/Infinity 座標、無限ループで終わらない）が出たら、そこが本物のバグ。`find-bugs`/`anomaly-hunt` スキルで原因を特定する。

## 報告のしかた

3つの結果をそのまま伝える。ヘッドレスが `not implemented` で止まったことは**失敗ではない**ので、どのマイルストーン待ちなのかを添えて報告する。テストが落ちている場合は出力を隠さずに示す。
