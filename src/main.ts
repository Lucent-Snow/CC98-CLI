#!/usr/bin/env node

import { runCli } from "./cli/router.js";
import { runTui } from "./tui/app.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await runTui();
    return;
  }

  await runCli(args);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`cc98: ${message}`);
  process.exitCode = 1;
});
