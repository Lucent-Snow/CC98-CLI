import { createCliContext } from "../context.js";
import { extractAccountOption } from "../options.js";
import { printJson } from "../parse.js";

export async function forumCommand(args: string[]): Promise<void> {
  const accountOption = extractAccountOption(args);
  const [subcommand] = accountOption.args;
  const { client } = createCliContext({ account: accountOption.account });

  switch (subcommand) {
    case undefined:
    case "--help":
    case "-h":
    case "help":
      printForumHelp();
      return;
    case "index":
      printJson(await client.getForumIndex());
      return;
    case "boards":
    case "all-boards":
      printJson(await client.getAllBoards());
      return;
    case "card-stat":
      printJson(await client.getCardStat());
      return;
    default:
      throw new Error(`unknown forum command: ${subcommand}`);
  }
}

function printForumHelp(): void {
  console.log(`cc98 forum

Usage:
  cc98 forum index
  cc98 forum boards
  cc98 forum card-stat
`);
}
