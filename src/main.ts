import { loadConfig } from "./simulation";
import { CanvasRenderer } from "./renderer";
import { Simulator, ConsoleLogger } from "./simulation";

function main() {
  const canvasElement = document.getElementById("game") as HTMLCanvasElement | null;
  if (!canvasElement) {
    throw new Error("Canvas element not found");
  }

  const config = loadConfig();
  const renderer = new CanvasRenderer(canvasElement, config);
  const logger = new ConsoleLogger();

  const simulator = new Simulator(config, renderer, logger);

  function loop() {
    simulator.step();
    if (simulator.state.phase !== "MATCH_END") {
      requestAnimationFrame(loop);
    }
  }

  loop();
}

main();
