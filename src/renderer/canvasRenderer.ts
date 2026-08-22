import type { Renderer, GameConfig, Player, Ball, GameState, Vec2 } from "../types";
import { currentScore } from "../game/match";
import { facingDirection } from "../game/player";

/** 論理サイズ(m)をピクセルへ変換する係数。index.html の canvas サイズ(600x400)は初期値の目安で、実際は init() が上書きする。 */
const SCALE = 11;

/** 選手マーカーは視認性のため、実際の衝突判定半径より大きく描画する。 */
const PLAYER_MARKER_SCALE = 2;

/** ボールも同様に、実際の半径より大きく描画する（最小ピクセル数も合わせて引き上げる）。 */
const BALL_MARKER_SCALE = 2;
const BALL_MIN_RADIUS_PX = 6;

const TEAM_COLOR: Record<"A" | "B", string> = {
  A: "#2196f3",
  B: "#f44336",
};

export class CanvasRenderer implements Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: GameConfig;
  /** true の間、選手ごとの視野範囲（距離×角度の扇形）を薄く重ね描きする（テスト・調整用）。 */
  private debugVision = false;

  /** `canvas` から 2D コンテキストを取得して保持する。サイズ設定は `init()` が別途行う。 */
  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("2D canvas context is not available");
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.config = config;
  }

  /**
   * ゲーム座標（原点中央・y はゴールライン方向）をキャンバス座標（原点左上）へ変換する。
   *
   * ゲーム座標系自体は縦向き（y方向にゴール）のままだが、画面表示は横向き
   * （ゴールが左右）にしたいので、ここで x/y を入れ替えて描画する。
   */
  private toCanvas(pos: Vec2): Vec2 {
    return {
      x: this.canvas.width / 2 + pos.y * SCALE,
      y: this.canvas.height / 2 + pos.x * SCALE,
    };
  }

  /** 視野範囲のデバッグ表示をON/OFFする。`Renderer` インターフェースには含めない（`CanvasRenderer` 固有の機能）。 */
  setDebugVision(enabled: boolean): void {
    this.debugVision = enabled;
  }

  init(): void {
    this.canvas.width = this.config.pitch.length * SCALE;
    this.canvas.height = this.config.pitch.width * SCALE;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** ピッチ全体（緑地・外枠・ハーフウェイライン・センターサークル・両ゴール）を描画する。 */
  drawPitch(config: GameConfig): void {
    const { ctx, canvas } = this;

    ctx.fillStyle = "#2e8b3d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const topLeft = this.toCanvas({ x: -config.pitch.width / 2, y: -config.pitch.length / 2 });
    const w = config.pitch.length * SCALE;
    const h = config.pitch.width * SCALE;

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(topLeft.x, topLeft.y, w, h);

    // ハーフウェイライン（縦線）・センターサークル
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, topLeft.y);
    ctx.lineTo(canvas.width / 2, topLeft.y + h);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 6 * SCALE, 0, Math.PI * 2);
    ctx.stroke();

    // 両ゴール（ピッチ左右の端、goalWidth の幅で強調）。
    // ゲーム座標 y=-length/2（画面左）が Team A の守るゴール、y=+length/2（画面右）が
    // Team B の守るゴール（`Pitch.isInGoalA`/`isInGoalB`、docs/development_guide.md §座標系）。
    // どちらが自陣かひと目でわかるよう、ゴールをチームカラーで塗り分ける。
    const goalHalf = (config.pitch.goalWidth / 2) * SCALE;
    ctx.lineWidth = 4;
    for (const [x, color] of [
      [topLeft.x, TEAM_COLOR.A],
      [topLeft.x + w, TEAM_COLOR.B],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, canvas.height / 2 - goalHalf);
      ctx.lineTo(x, canvas.height / 2 + goalHalf);
      ctx.stroke();
    }

    this.drawAttackDirectionArrows(topLeft, w, h);
  }

  /**
   * どちらのチームがどちら向きに攻めているかを、ピッチ下端にチームカラーの矢印付き
   * ラベルで大きく表示する（ユーザー指摘：見た目だけでは攻撃方向がわかりにくい）。
   * Team A は +y（画面右）攻撃、Team B は -y（画面左）攻撃で、これは前後半を通して
   * 固定（`kickoffSide` が変わるだけでゴールの持ち主自体は入れ替わらない）。
   */
  private drawAttackDirectionArrows(topLeft: Vec2, w: number, h: number): void {
    const { ctx } = this;
    const y = topLeft.y + h - 14;

    ctx.font = "bold 24px sans-serif";
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = TEAM_COLOR.A;
    ctx.textAlign = "left";
    ctx.fillText("A →", topLeft.x + 12, y);

    ctx.fillStyle = TEAM_COLOR.B;
    ctx.textAlign = "right";
    ctx.fillText("← B", topLeft.x + w - 12, y);
  }

  /** 選手をチーム色の円で描画し、円の上に役割（FW/MF/DF）をラベル表示する。`setDebugVision(true)` 中は視野範囲も重ね描きする。 */
  drawPlayers(players: Player[]): void {
    const { ctx } = this;
    const radiusPx = this.config.player.radius * SCALE * PLAYER_MARKER_SCALE;

    if (this.debugVision) {
      for (const player of players) this.drawVisionCone(player);
    }

    for (const player of players) {
      const pos = this.toCanvas(player.pos);

      ctx.beginPath();
      ctx.fillStyle = TEAM_COLOR[player.team];
      ctx.arc(pos.x, pos.y, radiusPx, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(player.role, pos.x, pos.y - radiusPx - 2);
    }
  }

  /**
   * 選手1人の視野範囲（距離 `config.ai.visionDistance` × 角度 `player.params.vision`）を
   * 扇形で薄く描画する（デバッグ用）。中心軸は `facingDirection`（直近の移動方向、
   * 静止時は攻撃方向）。ゲーム座標の (dx, dy) は `toCanvas` と同じ x/y 入れ替えで
   * キャンバス方向 (dy, dx) に変換してから角度を求める。
   */
  private drawVisionCone(player: Player): void {
    const { ctx } = this;
    const pos = this.toCanvas(player.pos);
    const facing = facingDirection(player);
    const centerAngle = Math.atan2(facing.x, facing.y);
    const halfAngleRad = (player.params.vision / 2) * (Math.PI / 180);
    const radiusPx = this.config.ai.visionDistance * SCALE;

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.arc(pos.x, pos.y, radiusPx, centerAngle - halfAngleRad, centerAngle + halfAngleRad);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 235, 59, 0.15)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 235, 59, 0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** ボールを白丸で描画する。半径は物理サイズ(m)基準だが、小さすぎて見えなくならないよう最小ピクセル数を保証する。 */
  drawBall(ball: Ball): void {
    const { ctx } = this;
    const pos = this.toCanvas(ball.pos);
    const radiusPx = Math.max(BALL_MIN_RADIUS_PX, this.config.ball.radius * SCALE * BALL_MARKER_SCALE);

    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.arc(pos.x, pos.y, radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /** スコア・ターン数・フェーズ・前後半をキャンバス左上にテキストで表示する。 */
  drawHud(state: GameState): void {
    const { ctx } = this;
    const score = currentScore(state);

    ctx.fillStyle = "#000000";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Team A ${score.A} - ${score.B} Team B`, 8, 16);
    ctx.fillText(`Turn ${state.turn}  ${state.phase}  Half ${state.half}`, 8, 32);

    this.drawMessageBanner(state);
  }

  /**
   * ゴール／オフサイドの反則が起きたことを画面で分かるようにする（ユーザー要望）。
   * GOAL_SCORED で「ゴール！」、OFFSIDE_STOP で「オフサイド」、OFFSIDE_RESUME で
   * 「プレー再開」を画面中央に大きく表示する。それ以外のフェーズでは何も描画しない。
   * 実際の表示時間（現実時間で約5秒）は main.ts 側の壁時計ベースの一時停止で管理する
   * （シミュレーションのターン数・speedMultiplierに左右されないようにするため）。
   */
  private drawMessageBanner(state: GameState): void {
    const text =
      state.phase === "GOAL_SCORED"
        ? "ゴール！"
        : state.phase === "OFFSIDE_STOP"
          ? "オフサイド"
          : state.phase === "OFFSIDE_RESUME"
            ? "プレー再開"
            : null;
    if (text === null) return;

    const { ctx, canvas } = this;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, canvas.height / 2 - 30, canvas.width, 60);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }
}
