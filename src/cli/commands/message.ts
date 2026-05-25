import { createCliContext } from "../context.js";
import { extractAccountOption } from "../options.js";
import { extractPageOptions, parsePositiveInteger, printJson } from "../parse.js";

export async function messageCommand(args: string[]): Promise<void> {
  const accountOption = extractAccountOption(args);
  const [subcommand, ...rest] = accountOption.args;
  const { client } = createCliContext({ account: accountOption.account });

  switch (subcommand) {
    case undefined:
    case "--help":
    case "-h":
    case "help":
      printMessageHelp();
      return;
    case "unread":
      printJson(await client.getUnreadCount());
      return;
    case "recent": {
      const page = extractPageOptions(rest, { size: 10 });
      printJson(await client.getRecentChats(page.from, page.size));
      return;
    }
    case "history": {
      const userId = parsePositiveInteger(rest[0], "user-id");
      const page = extractPageOptions(rest.slice(1), { size: 10 });
      printJson(await client.getChatHistory(userId, page.from, page.size));
      return;
    }
    default:
      throw new Error(`unknown message command: ${subcommand}`);
  }
}

function printMessageHelp(): void {
  console.log(`cc98 message

Usage:
  cc98 message unread
  cc98 message recent [--from n] [--size n]
  cc98 message history <user-id> [--from n] [--size n]
`);
}
