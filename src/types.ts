export interface Vec2 {
  x: number;
  y: number;
}

export type TeamSide = "A" | "B";

export type Role = "FW" | "MF" | "DF";

export type PlayerActionState =
  | "Idle"
  | "BallTracking"
  | "Possession"
  | "Passing"
  | "Receiving"
  | "Shooting"
  | "Marking"
  | "MovingToSpace";

export interface PlayerParams {
  speed: number;
  passAccuracy: number;
  shootPower: number;
  vision: number;
  aggressiveness: number;
}

export interface Player {
  id: string;
  team: TeamSide;
  role: Role;
  params: PlayerParams;
  /** キックオフ・再開時に戻る基準位置（フォーメーション上の定位置）。 */
  homePos: Vec2;
  pos: Vec2;
  vel: Vec2;
  state: PlayerActionState;
}

export type BallStatus = "Free" | "Possessed" | "OutOfBounds";

export interface Ball {
  pos: Vec2;
  vel: Vec2;
  status: BallStatus;
  /** 現在ボールを保持している選手ID。status !== "Possessed" のときは null。 */
  possessorId: string | null;
  /** 最後にボールを蹴った選手ID（アウト時の再開権・得点者判定に使う）。保持者とは別物。 */
  lastKickerId: string | null;
  /**
   * `selectPassReceiver`（`src/game/player.ts`）がオフサイドの選手を受け手として選んでしまった
   * 場合の一時フラグ。パスを実行した瞬間だけセットする。この選手が実際にボールに触れたら反則が
   * 成立し、それ以外の選手が触れたら不成立としてフラグだけ消える（`specification/features_offside.md` ステップ2）。
   */
  offsideOffenderId: string | null;
  /**
   * 現在の保持者が何ターン連続でボールを保持しているか。保持者が変わるたび0にリセットする。
   * `decidePossessionAction` が「受け取った直後の1フレーム目でいきなりパスしてしまい、
   * ドリブルではなく自分パス＆即拾いに見える」問題を避けるための保持クールダウン判定に使う
   * （ユーザー指摘、2026-08-08）。
   */
  possessionTurns: number;
}

export type MatchPhase =
  | "MATCH_START"
  | "KICKOFF"
  | "PLAYING"
  | "GOAL_SCORED"
  | "RESTART_SETUP"
  | "HALF_TIME"
  | "MATCH_END";

export interface ScoreLogEntry {
  team: TeamSide;
  playerId: string;
  turn: number;
}

export interface MatchResult {
  scoreA: number;
  scoreB: number;
  winner: TeamSide | "Draw";
  durationTurns: number;
}

/** チーム全体の行動傾向。選手AIが意思決定の重み付けに参照する。 */
export interface TeamTactics {
  /** 0 = 守備的 / 1 = 攻撃的 */
  aggressiveness: number;
  /** 0 = 狭い / 1 = 広い（フォーメーションの横幅） */
  formationWidth: number;
}

export interface Team {
  side: TeamSide;
  name: string;
  tactics: TeamTactics;
  players: Player[];
}

export interface GameState {
  phase: MatchPhase;
  /** 現在のフェーズに入ってから経過したターン数（フェーズのタイムアウト判定用）。 */
  phaseTurn: number;
  turn: number;
  half: 1 | 2;
  /** 次のキックオフを行うチーム。 */
  kickoffSide: TeamSide;
  teams: { A: Team; B: Team };
  ball: Ball;
  scoreLog: ScoreLogEntry[];
  /** 決定的乱数の内部状態。nextRandom() が更新する（Math.random() は使わない）。 */
  rngSeed: number;
  result: MatchResult | null;
}

export interface GameConfig {
  pitch: {
    /** タッチライン方向（x軸）の幅 [m]。 */
    width: number;
    /** ゴールライン方向（y軸）の長さ [m]。 */
    length: number;
    goalWidth: number;
  };
  player: { maxSpeed: number; radius: number };
  ball: {
    radius: number;
    /** 毎秒の速度保持率（0〜1）。実際の適用は friction^dt で dt 非依存にする。 */
    friction: number;
    /** この速度 [m/s] を下回ったらボールを停止させる。 */
    stopThreshold: number;
    maxSpeed: number;
  };
  ai: {
    /** キック可能と判定する選手-ボール距離 [m]。 */
    ballControlDistance: number;
    /** トラップして保持状態に移れる距離 [m]。キック距離より広め。 */
    trapDistance: number;
    /** この速度 [m/s] を超えるボールはトラップ失敗。 */
    trapMaxBallSpeed: number;
    /** 相手保持者からボールを奪える距離 [m]。 */
    tackleDistance: number;
    /**
     * パス/シュートで飛んでいる（Free状態の）ボールの軌跡（1ターン分の移動線分）に
     * インターセプトを試みる距離 [m]。トラップと違い trapMaxBallSpeed の速度制限を待たない。
     */
    interceptDistance: number;
    /** 軌跡ちょうど上（距離0）にいるときのインターセプト成功確率上限。距離に応じて線形に0まで減衰する。 */
    interceptChance: number;
    passDistance: number;
    shootDistance: number;
    shootProbability: number;
    /** 選手がボール・味方・敵を認識できる距離 [m]（視野角は PlayerParams.vision）。 */
    visionDistance: number;
    /** パスの基準初速 [m/s]。実際の速度は距離に応じて多少増える。 */
    passSpeed: number;
    /** シュートの基準初速上限 [m/s]。実際は shootPower を掛けて減衰させる。 */
    shootSpeed: number;
    /** passAccuracy/shootPower が 0 のときの最大キック角度誤差 [度]。1 のとき誤差0。 */
    aimErrorMaxDeg: number;
    /**
     * パス受け手がいてもあえてドリブルを続ける基準確率（aggressiveness=0.5, vision=90度のときの値）。
     * 役割分岐ではなく aggressiveness/vision の値がそのまま確率の差になる。
     */
    dribbleChanceBase: number;
    /** aggressiveness の偏差1あたりドリブル確率をどれだけ振るか（高いほど自分で運びたがる）。 */
    dribbleChanceAggroSpread: number;
    /** vision の偏差（vision/180を基準に0.5からの差）1あたりドリブル確率をどれだけ下げるか（視野が広いほど受け手を見つけやすい）。 */
    dribbleChanceVisionSpread: number;
    /**
     * ボールを受け取ってから最低何ターン連続保持するまでパス/シュート判断そのものを
     * 行わず、必ずドリブル継続にするか（aggressiveness = 0.5 のときの基準値）。0だと
     * 従来通り受け取った1フレーム目からパス判定する。役割分岐ではなく aggressiveness が
     * 高い選手ほど長く持ち運びたがる形にする。
     */
    minHoldTurnsBase: number;
    /** aggressiveness の偏差1あたり minHoldTurnsBase をどれだけ振るか（高いほど長く持つ）。 */
    minHoldTurnsAggroSpread: number;
    /** この距離 [m] 未満まで近づいたら目標地点に到達したとみなし、移動を止める（moveToward）。 */
    moveStopThreshold: number;
    /** パス初速に、パス距離 [m] 1mあたり何 m/s 上乗せするか。 */
    passSpeedDistanceFactor: number;
    /** パス候補がマーク済みとみなす距離を tackleDistance の何倍とするか。 */
    markedRadiusFactor: number;
    /**
     * ドリブル中（ボール保持しながらの移動）の最大減速率（0〜1）。passAccuracy=0のとき
     * 速度が (1 - この値) 倍になる。passAccuracy=1では減速なし。独走でそのままゴールまで
     * 運びきる展開を抑え、パスの相対的な魅力を上げる狙い。
     */
    dribbleSpeedPenaltyMax: number;
    /**
     * パス/シュートの機会がなくドリブル継続を選んだとき、前方（攻撃方向）に味方が
     * 誰もいない「孤立した」状態だと掛かる追加の減速率（0〜1）。1ならその場で完全停止、
     * 0なら減速なし。単独で敵陣深くまで一気に持ち込む不自然さ（味方がまだ追いついていない
     * のに全力で前進する）を、方向は変えずに速度だけで和らげる狙い（ユーザー指摘、2026-08-08）。
     */
    soloDribbleSpeedFactor: number;
    /**
     * 「前方に味方がいる」とみなす最小の前進差 [m]。この値未満の差はノイズとみなし
     * 味方がいないのと同じ扱いにする（僅差でチラつくのを防ぐ）。
     */
    soloDribbleSupportMargin: number;
    /** 非保持時のポジショニングを力の合成で決めるための重み（マイルストーンH）。 */
    positioning: {
      /** ボールを追う度合い。home からの追従距離の上限は distance(home, ownGoal) * この係数。 */
      ballPullWeight: number;
      /** 味方が近づきすぎたときに離れる力の強さ [m]。 */
      repulsionWeight: number;
      /** この距離未満に味方がいると反発が働く [m]。 */
      minSpacing: number;
      /** ボール-自ゴール間の線上に吸着する強さ（0〜1のブレンド率）。 */
      coverWeight: number;
      /** 敵ボール保持者へ詰め寄る強さ（0〜1のブレンド率。aggressiveness と掛け合わせる）。 */
      pressWeight: number;
      /** この距離以内の敵ボール保持者にのみ詰め寄る [m]。 */
      pressDistance: number;
      /** 複数人で詰め寄るとき、敵保持者を中心に囲む半径 [m]。 */
      surroundRadius: number;
      /**
       * 毎ターン、実際に詰め寄るかどうかを確率で決める際の基準値（aggressiveness = 0.5 のときの確率）。
       * 役割による分岐ではなく、aggressiveness の違いがそのまま確率の差になる。
       */
      pressChanceBase: number;
      /** pressChanceBase から aggressiveness の偏差1あたりどれだけ確率を振るか（+/-方向）。 */
      pressChanceSpread: number;
      /** 受け手ポジション（ボールから攻撃ゴール方向）の距離を passDistance の何倍とするか。 */
      receivingDistanceFactor: number;
      /** 受け手ポジション付近の敵マーカーを回避判定する範囲を passDistance の何倍とするか。 */
      markerAvoidRangeFactor: number;
      /** マーカー回避時に横へずれる距離 [m]。 */
      markerAvoidStepDistance: number;
      /**
       * 受け手ポジションのy座標を homePos.y とブレンドする比率（0〜1）。x は昔から home.x と
       * 50/50でブレンドしていたが、yはボール基準の受け手候補地点（openSpot.y）をそのまま採用
       * していたため、非保持の選手全員が「ボールと同じ前進距離・同じ高さ」に並んでしまい、
       * 役割によらず常に同じ横一列の陣形に見える問題があった（ユーザー指摘、2026-08-08）。
       * 値を上げすぎると（0.3以上）受け手が前進しなくなり得点が壊滅する非線形な閾値があるため
       * 小さめの値に留める（詳細は `src/config/default.ts` のコメント参照）。
       */
      receivingHomeBlendY: number;
      /**
       * 味方保持中、受け手ポジションではなくボールより後方の「バックパス受け」を
       * 目指す基準確率（aggressiveness = 0.5 のときの確率）。役割分岐ではなく
       * aggressiveness の低さ（＝運ぶより繋ぎたい選手）がそのまま確率の差になる。
       * 前進した支援ポジションしか候補が生まれない構造だと、保持者が孤立していても
       * バックパスという選択肢自体が存在しなかった（ユーザー指摘、2026-08-08）。
       */
      backSupportChanceBase: number;
      /** aggressiveness の偏差1あたりバックサポート確率をどれだけ振るか（低いほど後方支援に回りやすい）。 */
      backSupportAggroSpread: number;
      /** バックサポート位置の、ボールから自ゴール方向への距離を passDistance の何倍とするか。 */
      backSupportDistanceFactor: number;
    };
    /** オフサイド判定（ステップ1: AI回避。ステップ2: 反則としてのターンオーバー処理）。 */
    offside: {
      /**
       * 受け手選定・受け手ポジショニングでオフサイドを回避しようとするか（ステップ1）。
       * 反則としてのターンオーバー（enforcementEnabled）とは独立に切り替えられる。
       * これが無効だと selectPassReceiver/computeTargetPosition が一切オフサイドを
       * 考慮せず、露骨にオフサイドの選手へパスを出してしまう（ユーザー指摘、2026-08-08）。
       */
      avoidanceEnabled: boolean;
      /**
       * オフサイドの反則を実際にターンオーバー（相手ボールに）として扱うか（ステップ2）。
       * avoidanceEnabled を有効にしても自然なオフサイド率は59〜68%と高く（詳細:
       * specification/features_positioning_redesign.md）、これを true にすると
       * 頻繁な反則停止で試合展開が崩れ平均得点がほぼ0まで崩壊することを確認済み
       * （2026-08-08 balance-check、15試合で総得点0）。受け手ポジショニングの
       * さらなる改善（自然なオフサイド率20%未満が目安）が前提のため、一旦 false のまま。
       */
      enforcementEnabled: boolean;
      /** 同一ラインとみなす許容誤差 [m]。 */
      lineToleranceMeters: number;
      /**
       * 受け手ポジションの前進距離の上限を「ボールからゴールまでの残り距離」の何倍とするか
       * （方式A: 受け手ポジショニング再設計。`specification/features_positioning_redesign.md`）。
       * 相手の実位置を参照しないため、相手守備との相互フィードバックループを起こさない。
       */
      forwardReachFraction: number;
      /**
       * 方式Aの上限内で、相手DFとの到達時間比較（distance/speed）によりさらに前進距離を
       * 絞り込む（方式C）。この値は「自分の到達時間 <= 相手最速到達者の到達時間 + この値」
       * を安全とみなす際の余裕 [秒]。0なら同着まで許容、正の値ほど慎重になる。
       */
      arrivalSafetyMarginSeconds: number;
      /** 前進距離をサンプリングする段階数（多いほど滑らかだが計算コストが増える）。 */
      arrivalSampleSteps: number;
      /**
       * 方式E（統一スコアリング。`specification/features_positioning_redesign.md`）。
       * 「ある地点がパスを受ける/そこへ動く価値としてどれだけ良いか」を単一のスコア関数
       * （`scoreReceivingSpot`、`src/game/player.ts`）で評価し、`selectPassReceiver`（誰に
       * パスするか）と `computeTargetPosition`（どこへ動くか）の両方がこれを共有する。
       * 方式A〜Dは「安全な位置を計算する側」だけを改善しており、「受け手を選ぶ側」
       * （旧: `marked ? -1000 : 0) - distToGoal`）とは無関係に動いていたため、位置取りを
       * 改善しても自然なオフサイド率が下がりきらなかった。この断絶を解消する。
       */
      kpp: {
        /** 前進度（0〜1、maxDistanceに対する比率）への報酬の重み。大きいほど積極的に前へ出る。 */
        forwardWeight: number;
        /** オフサイドラインを超過した距離[m]あたりのペナルティの重み。 */
        offsideOvershootWeight: number;
        /**
         * 相手DF最速到達者に対する到達時間の遅れ[秒]（`arrivalSafetyMarginSeconds`超過分）
         * あたりのペナルティの重み。`computeTargetPosition`（自分がそこへ動けるか）にのみ
         * 使う個人固有の項のため、共有スコア関数 `scoreReceivingSpot` には含めない。
         */
        arrivalDeficitWeight: number;
        /**
         * 最も近い敵選手が `tackleDistance * markedRadiusFactor` より近づいた分[m]あたりの
         * ペナルティの重み（旧: binaryな `marked` フラグを連続値化したもの）。
         */
        markingWeight: number;
      };
    };
  };
  team: {
    /** 役割ごとのデフォルト選手パラメータ。 */
    roleParams: Record<Role, PlayerParams>;
    /**
     * 役割ごとの定位置。自陣を基準にした比率で表す。
     * x: width/2 に対する比率（-1〜1）、y: length/2 に対する比率で -1 が自ゴール側、+1 が敵ゴール側。
     */
    formation: Record<Role, Vec2>;
    tactics: Record<TeamSide, TeamTactics>;
    names: Record<TeamSide, string>;
  };
  match: {
    /** 片方のハーフのターン数。前後半で合計 turnsPerHalf * 2 ターン。 */
    turnsPerHalf: number;
    /** GOAL_SCORED に留まるターン数。 */
    goalScoredTurns: number;
    /** RESTART_SETUP に留まるターン数。 */
    restartSetupTurns: number;
    /** KICKOFF に留まるターン数。 */
    kickoffTurns: number;
  };
  physics: {
    /** 1ターンの経過時間 [秒]。 */
    dt: number;
  };
  random: {
    /** 決定的シミュレーションのためのシード値。 */
    seed: number;
  };
}

export interface Renderer {
  init(): void;
  clear(): void;
  drawPitch(config: GameConfig): void;
  drawPlayers(players: Player[]): void;
  drawBall(ball: Ball): void;
  drawHud(state: GameState): void;
}
