import { createCliContext } from "../context.js";
import { extractAccountOption } from "../options.js";
import { extractPageOptions, parsePositiveInteger, printJson } from "../parse.js";

export async function boardCommand(args: string[]): Promise<void> {
  const accountOption = extractAccountOption(args);
  const [subcommandOrId, ...rest] = accountOption.args;
  const { client } = await createCliContext({ account: accountOption.account });

  if (!subcommandOrId || subcommandOrId === "--help" || subcommandOrId === "-h" || subcommandOrId === "help") {
    printBoardHelp();
    return;
  }

  if (/^\d+$/.test(subcommandOrId)) {
    const boardId = parsePositiveInteger(subcommandOrId, "board-id");
    const page = extractPageOptions(rest, { size: 20 });
    printJson(await client.getBoardTopics(boardId, page.from, page.size));
    return;
  }

  switch (subcommandOrId) {
    case "list":
      printJson(await client.getAllBoards());
      return;
    case "info": {
      const boardId = parsePositiveInteger(rest[0], "board-id");
      printJson(await client.getBoardInfo(boardId));
      return;
    }
    case "topics": {
      const boardId = parsePositiveInteger(rest[0], "board-id");
      const { best, args: pageArgs } = extractBestOption(rest.slice(1));
      const page = extractPageOptions(pageArgs, { size: 20 });
      printJson(await client.getBoardTopics(boardId, page.from, page.size, best));
      return;
    }
    case "favorite": {
      const action = rest[0];
      const boardId = parsePositiveInteger(rest[1], "board-id");
      if (action === "add") {
        printJson(await client.addBoardFavorite(boardId));
      } else if (action === "remove") {
        printJson(await client.removeBoardFavorite(boardId));
      } else {
        throw new Error("usage: cc98 board favorite add|remove <board-id>");
      }
      return;
    }
    default:
      throw new Error(`unknown board command: ${subcommandOrId}`);
  }
}

function extractBestOption(args: string[]): { best: boolean; args: string[] } {
  const rest: string[] = [];
  let best = false;

  for (const arg of args) {
    if (arg === "--best") {
      best = true;
    } else {
      rest.push(arg);
    }
  }

  return { best, args: rest };
}

function printBoardHelp(): void {
  console.log(`cc98 board

Usage:
  cc98 board <board-id> [--from n] [--size n]
  cc98 board list
  cc98 board info <board-id>
  cc98 board topics <board-id> [--from n] [--size n] [--best]
  cc98 board favorite add|remove <board-id>
`);
}
