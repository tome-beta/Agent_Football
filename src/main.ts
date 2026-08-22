import { loadConfig } from "./simulation";
import { CanvasRenderer } from "./renderer";
import { Simulator, ConsoleLogger } from "./simulation";
import { defaultConfig } from "./config/default";
import type { GameConfig, PlayerParams, Role } from "./types";

const ROLES: Role[] = ["FW", "MF", "DF"];

/** [パラメータキー, ラベル, min, max, step] */
const PARAM_SLIDERS: Array<[keyof PlayerParams, string, number, number, number]> = [
  ["speed", "スピード", 3, 9, 0.1],
  ["passAccuracy", "キック(パス精度)", 0, 1, 0.05],
  ["shootPower", "キック(シュート威力)", 0, 1, 0.05],
  ["vision", "視野(度)", 40, 160, 5],
  ["mental", "メンタル", 0, 1, 0.05],
  ["technique", "テクニック", 0, 1, 0.05],
  ["stamina", "スタミナ(未使用)", 0, 1, 0.05],
  ["physical", "フィジカル(未使用)", 0, 1, 0.05],
  ["jump", "ジャンプ(未使用)", 0, 1, 0.05],
];

/** 役割(FW/MF/DF)ごとに `PARAM_SLIDERS` のスライダー行を組み立てて `root` に追加し、入力要素への参照を返す。 */
function buildControls(root: HTMLElement): Record<Role, Record<keyof PlayerParams, HTMLInputElement>> {
  const inputs = {} as Record<Role, Record<keyof PlayerParams, HTMLInputElement>>;

  for (const role of ROLES) {
    const group = document.createElement("div");
    group.className = "role-group";

    const heading = document.createElement("h3");
    heading.textContent = role;
    group.appendChild(heading);

    const roleInputs = {} as Record<keyof PlayerParams, HTMLInputElement>;

    for (const [key, label, min, max, step] of PARAM_SLIDERS) {
      const row = document.createElement("div");
      row.className = "param-row";

      const labelEl = document.createElement("label");
      labelEl.textContent = label;

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(defaultConfig.team.roleParams[role][key]);

      const output = document.createElement("output");
      output.textContent = input.value;
      input.addEventListener("input", () => {
        output.textContent = input.value;
      });

      row.appendChild(labelEl);
      row.appendChild(input);
      row.appendChild(output);
      group.appendChild(row);

      roleInputs[key] = input;
    }

    inputs[role] = roleInputs;
    root.appendChild(group);
  }

  return inputs;
}

/** スライダーの現在値から役割別 `roleParams` を作り、デフォルト設定に重ねた `GameConfig` を返す。 */
function readConfigFromControls(
  inputs: Record<Role, Record<keyof PlayerParams, HTMLInputElement>>
): GameConfig {
  const roleParams = {} as Record<Role, PlayerParams>;
  for (const role of ROLES) {
    roleParams[role] = {
      speed: Number(inputs[role].speed.value),
      passAccuracy: Number(inputs[role].passAccuracy.value),
      shootPower: Number(inputs[role].shootPower.value),
      vision: Number(inputs[role].vision.value),
      mental: Number(inputs[role].mental.value),
      technique: Number(inputs[role].technique.value),
      stamina: Number(inputs[role].stamina.value),
      physical: Number(inputs[role].physical.value),
      jump: Number(inputs[role].jump.value),
    };
  }

  return loadConfig({
    team: {
      roleParams,
      formation: defaultConfig.team.formation,
      tactics: defaultConfig.team.tactics,
      names: defaultConfig.team.names,
    },
  });
}

/** ブラウザ実行のエントリポイント（`index.html` から読み込まれる）。DOM 構築・操作パネルの配線・試合ループの起動を行う。 */
function main() {
  const canvasElement = document.getElementById("game") as HTMLCanvasElement | null;
  const roleGroupsRoot = document.getElementById("role-groups");
  const toggleBtn = document.getElementById("toggleBtn") as HTMLButtonElement | null;
  const speedBtn = document.getElementById("speedBtn") as HTMLButtonElement | null;
  const restartBtn = document.getElementById("restartBtn") as HTMLButtonElement | null;
  const debugVisionToggle = document.getElementById("debugVisionToggle") as HTMLInputElement | null;
  if (!canvasElement || !roleGroupsRoot || !toggleBtn || !speedBtn || !restartBtn || !debugVisionToggle) {
    throw new Error("Required DOM elements not found");
  }

  const inputs = buildControls(roleGroupsRoot);

  const renderer = new CanvasRenderer(canvasElement, defaultConfig);
  renderer.init();

  let simulator = new Simulator(loadConfig(), renderer, new ConsoleLogger());
  let running = true;
  // requestAnimationFrame の連鎖が現在生きているか。MATCH_END で連鎖が止まるので、
  // 再スタート時にもう一度動かす必要があるかどうかの判定に使う。
  let loopAlive = false;
  // 1ターン = physics.dt(0.1秒) をrAF(約60fps)毎に1回進めると、体感速度が6倍速相当になり
  // 速すぎるため、速度倍率を導入する（デフォルト1倍、ボタンで0.5倍に切り替え）。
  // rAFの発火間隔を変えるのではなく、進めるターン数を間引くことで実装する。
  let speedMultiplier = 1;
  let stepAccumulator = 0;

  // ゴール／オフサイドの演出フェーズは、シミュレーションのターン数やspeedMultiplierに
  // 左右されず常に現実時間で約5秒表示したい（ユーザー要望）。このフェーズの間だけ
  // simulator.step() の呼び出しを壁時計（rAFのタイムスタンプ）で止めることで実現する。
  const MESSAGE_PHASES = new Set<string>(["GOAL_SCORED", "OFFSIDE_STOP", "OFFSIDE_RESUME"]);
  const MESSAGE_HOLD_MS = 2000;
  let lastMessagePhase: string | null = null;
  let messageHoldUntil = 0;

  // rAF の連鎖自体は一時停止中も止めない。running フラグで simulator.step() の
  // 実行だけを止めることで、一時停止/再開の反映タイミングが requestAnimationFrame の
  // ID管理に依存しないようにする（前回の実装は rafId が非null のままの一瞬に
  // 再開を押すと反映されないことがあった）。
  function loop(now: number) {
    if (running) {
      if (MESSAGE_PHASES.has(simulator.state.phase)) {
        if (simulator.state.phase !== lastMessagePhase) {
          lastMessagePhase = simulator.state.phase;
          messageHoldUntil = now + MESSAGE_HOLD_MS;
        }
        if (now >= messageHoldUntil) {
          simulator.step();
        }
      } else {
        lastMessagePhase = null;
        stepAccumulator += speedMultiplier;
        while (stepAccumulator >= 1) {
          simulator.step();
          stepAccumulator -= 1;
          if (simulator.state.phase === "MATCH_END") break;
          if (MESSAGE_PHASES.has(simulator.state.phase)) break;
        }
      }
    }
    if (simulator.state.phase === "MATCH_END") {
      loopAlive = false;
      return;
    }
    requestAnimationFrame(loop);
  }

  function ensureLoopAlive() {
    if (!loopAlive) {
      loopAlive = true;
      requestAnimationFrame(loop);
    }
  }

  toggleBtn.addEventListener("click", () => {
    running = !running;
    toggleBtn.textContent = running ? "一時停止" : "再開";
  });

  speedBtn.addEventListener("click", () => {
    speedMultiplier = speedMultiplier === 1 ? 0.5 : 1;
    speedBtn.textContent = speedMultiplier === 1 ? "0.5倍速にする" : "等倍速に戻す";
  });

  debugVisionToggle.addEventListener("change", () => {
    renderer.setDebugVision(debugVisionToggle.checked);
  });

  restartBtn.addEventListener("click", () => {
    const config = readConfigFromControls(inputs);
    simulator = new Simulator(config, renderer, new ConsoleLogger());
    running = true;
    stepAccumulator = 0;
    lastMessagePhase = null;
    messageHoldUntil = 0;
    toggleBtn.textContent = "一時停止";
    ensureLoopAlive();
  });

  ensureLoopAlive();
}

main();
