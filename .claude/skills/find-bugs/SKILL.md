---
name: find-bugs
description: soccer-sim のコードを丁寧にバグ調査する。「バグがないか調べて」「丁寧にレビューして」など、探索的なバグ探しを頼まれたときに使う。コードを読むだけで終わらせず、疑わしい箇所は再現スクリプトで実際に動かして確認してから報告する。
---

# バグ調査

コードを読んで「怪しい」と思うだけでは報告しない。**再現できたものだけを確信度高く報告する。**

## 1. 読む範囲を決める

`src/game/*`（純ロジック）→ `src/simulation/*`（統合）→ `src/renderer/*`/`src/main.ts`（描画・エントリポイント）の順で、依存の下流から上流へ読む。各関数について:

- 型定義（`src/types.ts`）と実装が一致しているか
- コメントに書かれている前提（例:「〜は別物」「〜のときだけ更新する」）が実際に守られているか
- ある関数の戻り値・書き換え結果を、呼び出し側が正しく扱っているか

## 2. 疑わしい箇所の見つけ方

- **状態のライフサイクル**を追う: `Ball.status`/`possessorId`/`lastKickerId` のような複数フィールドが、あらゆる分岐（キック／奪取／ドリブル／アウトオブバウンズ／ゴール）で一貫して更新されているか。片方だけ更新され忘れているケースがないか。
- **境界条件**: `<=` と `<` の違い、ピッチ境界ちょうど、確率0/1、空配列。
- **呼び出し順序への暗黙の依存**: `Simulator.step` のように複数関数を順番に呼ぶ箇所で、途中の関数が状態を書き換えることで後続の判定が変わらないか（例: ループの前半で判定した条件が、ループ後半では既に成り立たなくなっている）。
- **エントリポイントの配線漏れ**: `headless.ts`/`main.ts` が `Simulator.run()` のような「正しい経路」を通さず自前でループを組んでいる場合、`init()` のような副作用の呼び出しが漏れていないか。

## 3. 再現して確認する（省略しない）

疑わしい箇所が見つかったら、`scratch_check/repro.ts`（作業後は削除）のような使い捨てスクリプトを書いて実際に動かす。パターン:

```typescript
import { createInitialState, stepMatch } from "../src/game/match";
import { decideAction, stepPlayer } from "../src/game/player";
import { stepBall } from "../src/game/ball";
import { resolveBallPossession } from "../src/game/collision";
import { loadConfig } from "../src/simulation/config";

const config = loadConfig({ /* 再現に必要な上書き */ });
const state = createInitialState(config);
// 疑わしい状況を手で作る（選手位置・ボール状態を直接セット）
// ...
// 1ターンずつ回して結果を console.log で確認
```

実行:

```bash
cd g:/Agent_Football && PATH="$PATH:/c/Program Files/nodejs" ./node_modules/.bin/tsx scratch_check/repro.ts
```

確認できたら `rm -rf scratch_check` で必ず削除する（コミットに混ぜない）。

## 4. 報告する

`ReportFindings` ツールが使える文脈ならそれを使う。各 finding には:

- `summary`: 何が起きるか一文で
- `failure_scenario`: 再現スクリプトで確認した具体的な入力と結果（再現できなかった＝コード読解のみの推測は `verdict` を付けず、その旨を明示する）
- `verdict: "CONFIRMED"`: 実際に再現できたものだけに付ける

コードレビューだけで再現していない懸念（設計判断が必要なもの、仕様との差分など）は分けて「要相談」として報告し、`CONFIRMED` にはしない。

## 5. 修正を頼まれたら

1. 該当箇所を直す
2. **再現スクリプトと同じシナリオを `tests/` 配下の恒久的なテストに落とす**（`describe`/`it` で再現条件を再現し、修正後の期待値を assert する）
3. `verify` スキルの手順（型チェック・全テスト・ヘッドレス実行）を通す
4. 再現スクリプトのスクラッチファイルは削除されていることを確認する
