import { createCliContext } from "../context.js";
import { extractAccountOption } from "../options.js";
import { parseInteger, parsePositiveInteger, printJson } from "../parse.js";

export async function postCommand(args: string[]): Promise<void> {
  const accountOption = extractAccountOption(args);
  const [subcommand, ...rest] = accountOption.args;
  const { client } = createCliContext({ account: accountOption.account });

  switch (subcommand) {
    case undefined:
    case "--help":
    case "-h":
    case "help":
      printPostHelp();
      return;
    case "reaction-state": {
      const postId = parsePositiveInteger(rest[0], "post-id");
      printJson(await client.getPostReactionState(postId));
      return;
    }
    case "rate-reasons": {
      const type = parseInteger(rest[0], "type");
      printJson(await client.getPostRateReasons(type));
      return;
    }
    default:
      throw new Error(`unknown post command: ${subcommand}`);
  }
}

function printPostHelp(): void {
  console.log(`cc98 post

Usage:
  cc98 post reaction-state <post-id>
  cc98 post rate-reasons <type>
`);
}
