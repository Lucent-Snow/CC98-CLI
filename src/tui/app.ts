import { Cc98Client } from "../api/client.js";
import { TokenStore } from "../storage/token-store.js";
import { CachedCc98Client } from "./cached-client.js";
import { TuiController } from "./controller.js";
import { draw } from "./renderer.js";
import { createInitialState } from "./state/store.js";
import { Terminal } from "./terminal.js";

export async function runTui(): Promise<void> {
  const terminal = new Terminal();
  const tokenStore = new TokenStore();
  const client = new CachedCc98Client(new Cc98Client({ tokenStore }));
  const state = createInitialState();
  let exitRequested = false;

  terminal.enter();

  try {
    await new Promise<void>((resolve) => {
      let closed = false;
      let currentAbort: AbortController | undefined;

      const abortCurrent = () => currentAbort?.abort();
      const nextSignal = () => {
        abortCurrent();
        currentAbort = new AbortController();
        return currentAbort.signal;
      };
      const render = () => {
        if (!closed) {
          terminal.render(draw(state, terminal.size()));
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        exitRequested = true;
        abortCurrent();
        offKey();
        offResize();
        resolve();
      };

      const controller = new TuiController(state, client, tokenStore, render, close, nextSignal, abortCurrent);
      const offResize = terminal.onResize(render);
      const offKey = terminal.onKey((key) => controller.handleKey(key));

      render();
      void controller.load();
    });
  } finally {
    terminal.exit();
    process.stdout.write("\n");
    if (exitRequested) {
      process.exit(0);
    }
  }
}
