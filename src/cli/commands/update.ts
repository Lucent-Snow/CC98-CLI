import { checkForUpdate, formatUpdateResult } from "../../update.js";

export async function updateCommand(args: string[]): Promise<void> {
  const [subcommand] = args;

  if (subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printUpdateHelp();
    return;
  }

  if (subcommand !== undefined) {
    throw new Error(`unknown update command: ${subcommand}. Run "cc98 update --help" for usage.`);
  }

  const result = await checkForUpdate();
  console.log(formatUpdateResult(result));
}

function printUpdateHelp(): void {
  console.log(`cc98 update

Usage:
  cc98 update               Check the latest GitHub Release

Options:
  -h, --help                Show this help
`);
}
