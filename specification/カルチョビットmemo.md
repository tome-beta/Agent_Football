# カルチョビット仕様調査メモ

本ドキュメントは、参考タイトル「カルチョビット」（GBA版・3DS版「ポケットサッカーリーグ カルチョビット」）の選手パラメータ仕様を、攻略サイト「3DS ポケットサッカーリーグ カルチョビット 攻略wiki 組長式」（http://dqff.sakura.ne.jp/karubit/）から調査したメモ。soccer-sim の `PlayerParams` 設計の参考用。

## カルチョビットのパラメータ一覧（7種）

| パラメータ | 説明（サイト記載） |
|---|---|
| **キック** | シュートの精度／シュートのスピード／パスの正確性 |
| **メンタル** | アウェイでも力を発揮／イエローカードのもらいにくさ／スタミナ消耗後も頑張れる |
| **スタミナ** | 最大走力値。消耗するとスピード低下。時間とともに回復 |
| **フィジカル** | 当たりの強さ／疲労回復の早さ／怪我のしにくさ |
| **スピード** | 走る速さ（E系はS系の0.7倍）。スタミナを消耗するとスピード低下 |
| **テクニック** | キープ・トラップ・タックル能力 |
| **ジャンプ** | 未調査（ヘディング関連と推測） |

## soccer-sim の `PlayerParams`（speed/passAccuracy/shootPower/vision/aggressiveness）との対応関係

- **speed** ≒ カルチョビットの「スピード」。ただしカルチョビットは「スタミナ消耗でスピード低下」という動的要素あり。soccer-sim は現状スタミナ未実装（`specification/features_1_player_ai.md` で Phase 2 予定）。
- **passAccuracy / shootPower** はカルチョビットでは「キック」1パラメータに統合されている。soccer-sim は分離しておりより細かい調整が可能（劣化ではなく拡張）。
- **vision（視野）** に対応する独立パラメータはカルチョビットに無い。テクニック／メンタルに暗黙的に含まれていると推測される。soccer-sim が独立パラメータ化しているのはカルチョビットより踏み込んだ設計。
- **aggressiveness（積極性）** は「メンタル」（カード・アウェイ耐性・根性）とも「テクニック」（タックル能力）とも部分的に重なるが、完全に一致するパラメータはカルチョビットに無い。
- **フィジカル（当たりの強さ）** に相当するパラメータが soccer-sim に無い。`resolvePlayerPlayer`（選手同士の当たり判定）はあるが、選手ごとの「当たりの強さ」で結果を左右する設計は未検討。追加候補。

## 今後の参考ポイント（Phase 2 以降）

1. **スタミナ実装時**: 単純な線形減衰だけでなく、「メンタル（またはaggressiveness相当）が高いとスタミナ消耗が緩やか／消耗後も踏ん張れる」という掛け合わせを入れるとカルチョビットらしさが増す。
2. **対人接触**: 「フィジカル（当たりの強さ）」に相当するパラメータの追加を検討してもよい（`PlayerParams` 拡張候補）。
3. **キック統合 vs 分離**: soccer-sim の passAccuracy/shootPower 分離は意図的な拡張として維持してよい。

## 参照元

- 3DS ポケットサッカーリーグ カルチョビット 攻略wiki 組長式: http://dqff.sakura.ne.jp/karubit/
  - スピード: http://dqff.sakura.ne.jp/karubit/d130e930e130fc30bf30/b930d430fc30c930.html
  - キック: http://dqff.sakura.ne.jp/karubit/d130e930e130fc30bf30/ad30c330af30.html
  - メンタル: http://dqff.sakura.ne.jp/karubit/d130e930e130fc30bf30/e130f330bf30eb30.html
  - スタミナ: http://dqff.sakura.ne.jp/karubit/d130e930e130fc30bf30/b930bf30df30ca30.html
  - フィジカル: http://dqff.sakura.ne.jp/karubit/d130e930e130fc30bf30/d530a330b830ab30eb30.html
  - テクニック: http://dqff.sakura.ne.jp/karubit/d130e930e130fc30bf30/c630af30cb30c330af30.html
  - ジャンプ: http://dqff.sakura.ne.jp/karubit/d130e930e130fc30bf30/b830e330f330d730.html
