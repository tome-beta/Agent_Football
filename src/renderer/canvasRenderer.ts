import type { Renderer, GameConfig, Player, Ball, GameState, Vec2 } from "../types";
import { currentScore } from "../game/match";

/** 論理サイズ(m)をピクセルへ変換する係数。index.html の canvas サイズ(600x400)と対応する。 */
const SCALE = 8;

const TEAM_COLOR: Record<"A" | "B", string> = {
  A: "#2196f3",
  B: "#f44336",
};

export class CanvasRenderer implements Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: GameConfig;

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

    // 両ゴール（ピッチ左右の端、goalWidth の幅で黄色く強調）
    const goalHalf = (config.pitch.goalWidth / 2) * SCALE;
    ctx.strokeStyle = "#ffeb3b";
    ctx.lineWidth = 4;
    for (const x of [topLeft.x, topLeft.x + w]) {
      ctx.beginPath();
      ctx.moveTo(x, canvas.height / 2 - goalHalf);
      ctx.lineTo(x, canvas.height / 2 + goalHalf);
      ctx.stroke();
    }
  }

  /** 選手をチーム色の円で描画し、円の上に役割（FW/MF/DF）をラベル表示する。 */
  drawPlayers(players: Player[]): void {
    const { ctx } = this;
    const radiusPx = this.config.player.radius * SCALE;

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

  /** ボールを白丸で描画する。半径は物理サイズ(m)基準だが、小さすぎて見えなくならないよう最小3pxを保証する。 */
  drawBall(ball: Ball): void {
    const { ctx } = this;
    const pos = this.toCanvas(ball.pos);
    const radiusPx = Math.max(3, this.config.ball.radius * SCALE);

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
  }
}
