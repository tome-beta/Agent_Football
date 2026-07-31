import { loadConfig } from "./simulation";
// CanvasRenderer を巻き込まないよう、renderer/index.ts ではなく実装ファイルを直接 import する。
import { NullRenderer } from "./renderer/nullRenderer";
import { Simulator, ConsoleLogger } from "./simulation";

/** Node ヘッドレス実行のエントリポイント（`npm run headless`）。描画なしで1試合を最後まで走らせる。 */
async function main() {
  const config = loadConfig();
  const renderer = new NullRenderer();
  const logger = new ConsoleLogger();

  const simulator = new Simulator(config, renderer, logger);
  simulator.run();
}

main().catch((err) => {
  console.error("Headless execution error:", err);
});
