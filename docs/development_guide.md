# 開発ガイド

スケルトンから実装を進める際の実務手順。API の一覧は [`api.md`](api.md)、層構成は [`architecture.md`](architecture.md) を参照。

---

## 1. コマンド

```bash
npm install
npm run headless    # src/headless.ts を Node（tsx）で実行 — 第一段階の検証用
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
npm run test:watch
npm run dev         # Vite dev server（第二段階の Canvas 描画）
npm run build       # tsc --noEmit && vite build
```

単一テストファイル: `npx vitest run tests/game/ball.test.ts`

> `npx` が PATH に無い環境では `./node_modules/.bin/vitest run ...` を使うか、Node を PATH に追加する。

---

## 2. 開発の2段階

1. **第一段階（完了）**: 描画なし・Node ヘッドレスでロジックを完成させる。`npm run headless` で1試合を最後まで走らせられる状態がゴール（**MVP v0.1 達成**）。
2. **第二段階（完了）**: 完成したロジックの上に Canvas 2D 描画を載せる。ピッチ/選手/ボール/HUD 描画、一時停止/再開、`PlayerParams` 調整UI、視野範囲のデバッグ表示は実装済み（**MVP v0.2 達成**）。

`src/game/*` は `src/renderer/*` を import せず、DOM/Canvas API にも触れない。この制約があるからこそ同じロジックを Node とブラウザの両方で動かせる。

---

## 3. 実装の進め方

`TODO.md` のマイルストーン順（A → B → C → D → E → F → G → H）に進める。**A〜H は完了済み**。着手前に対応する `specification/features_*.md` を読むこと。コードや型に現れない「なぜそうするか」がそこにある。次に着手するのは第二ステップ（`TODO.md` の「第二ステップ以降」）。

各関数は `throw new Error("not implemented")` のスタブとして既に置かれている。**シグネチャを勝手に変えず、まず中身を埋める**。変更が必要なら `docs/api.md` も同時に更新する。

### 実装時の約束ごと

- **ゲームプレイ定数は必ず `GameConfig` 経由**。マジックナンバーをロジックに書かない。新しい調整値が必要になったら `src/types.ts` の `GameConfig` にキーを足し、`src/config/default.ts` にデフォルト値を書く。
- **`Math.random()` を使わない**。確率判定は `src/game/random.ts` の `nextRandom` / `chance` に `GameState` を渡す。これでテストと試合の再現性が保たれる。
- **`step*` 系は引数を直接書き換える**（戻り値なし）。新しいオブジェクトを返す方式と混ぜない。
- **時間は秒で扱う**。1ターン = `config.physics.dt` 秒。位置更新は `pos += vel * dt`、摩擦は `vel *= friction^dt`（`friction` は毎秒の保持率）。ティック数を直接掛けるコードを書かない。
- **スコアは `scoreLog` が単一の情報源**。チームごとのカウンタを別に持たず、`currentScore(state)` で集計する。

---

## 4. 座標系（間違えやすいので必読）

- 原点はピッチ中央。x = タッチライン方向（±`width/2`）、y = ゴールライン方向（±`length/2`）。
- **チームA は y = -length/2 のゴールを守り、チームB は y = +length/2 のゴールを守る。**
  つまりチームA の攻撃方向は +y、チームB は -y。
- `Pitch.isInGoalA()` は「**チームA のゴールにボールが入った**」＝ **チームB の得点**。名前は持ち主を指すので、得点者の判定では逆になる。
- `specification/features_3_match_rules.md` は「x軸方向にゴール・座標 0〜100」と書いているが**これは実装と異なる**。`src/game/pitch.ts` が正。

---

## 5. テスト

`vitest.config.ts` の include は `tests/**/*.test.ts`。配置規約は `tests/<層>/<名前>.test.ts`（例: `tests/game/ball.test.ts`, `tests/simulation/simulator.test.ts`）でソースの構成をミラーする。

```typescript
import { describe, it, expect } from "vitest";
import { createInitialState } from "../../src/game/match";
import { defaultConfig } from "../../src/config/default";

describe("createInitialState", () => {
  it("creates 3 players per team", () => {
    const state = createInitialState(defaultConfig);
    expect(state.teams.A.players).toHaveLength(3);
  });
});
```

テストの指針:

- **物理は境界値を突く**。停止閾値ちょうど、最高速度超過、ゴールライン上、ゴール幅の端。
- **確率的なロジックは固定シードで検証する**。`loadConfig({ random: { seed: 123 } })` で系列を固定すれば、パス成否のような乱数依存の挙動も決定的にテストできる。
- **AI は「試合が壊れないこと」を確認する**。最適な判断かどうかより、無限ループ・NaN・ピッチ外への逸脱が起きないこと。

---

## 6. ヘッドレス実行

`src/headless.ts` がエントリ。`NullRenderer` は `src/renderer/nullRenderer` から**直接** import する（`src/renderer/index.ts` 経由だと DOM 依存の `CanvasRenderer` を Node に持ち込んでしまう）。

```bash
npm run headless
```

`Simulator.run()` は実装済み。例外なく `MATCH_END` まで到達し、`ConsoleLogger` が `Match result: Team A n - m Team B (Winner: ...)` を出力する。

---

## 7. 第二段階（Canvas 描画）

- `CanvasRenderer`（`src/renderer/canvasRenderer.ts`）は `Renderer` インターフェースに沿って実装済み。ロジック側（`src/game/*`）は一切変更していない。
- ワールド座標（原点中央・メートル、y=ゴールライン方向）→ スクリーン座標（左上原点・ピクセル）の変換は `CanvasRenderer.toCanvas` に1箇所にまとめてある。**表示だけ横向き**にするため x/y を入れ替えて変換している（ゲームロジックの座標系自体は変えていない）。`index.html` の canvas は 600×400 px、ピッチは 75×50 m（length×width）なので 8 px/m。`init()` が `config.pitch` から canvas サイズを設定し直すので、独自ループを組む場合は呼び忘れに注意（`src/main.ts` は起動時に1回呼ぶ）。
- `index.html` に一時停止/再開ボタン・再スタートボタン・役割別（FW/MF/DF）`PlayerParams` 調整スライダーを実装済み（`TODO.md` マイルストーンF）。スライダーの変更は「再スタート」を押すまで反映されない（既存の `Simulator`/選手には即時反映しない設計）。
- ブラウザの一時停止/再開は `requestAnimationFrame` の連鎖を止めずに `running` フラグで `Simulator.step()` の呼び出しだけを止める設計にしている。連鎖自体を都度張り直す実装は「一時停止直後に再開を押すと反映されない」タイミング問題を起こしたため避けること。

---

## 8. スキル

繰り返す手順（ヘッドレス結果の確認、物理パラメータの調整・検証フローなど）に気づいたら `.claude/skills/<名前>/SKILL.md` に切り出す。書き方は `.claude/skills/README.md` を参照。
