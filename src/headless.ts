import { loadConfig } from "./simulation";
import { NullRenderer } from "./renderer";
import { Simulator, ConsoleLogger } from "./simulation";

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
