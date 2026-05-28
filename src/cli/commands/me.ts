import { createCliContext } from "../context.js";
import { extractAccountOption } from "../options.js";
import { printJson } from "../parse.js";

export async function meCommand(args: string[] = []): Promise<void> {
  const accountOption = extractAccountOption(args);
  const [subcommand] = accountOption.args;
  const { client } = await createCliContext({ account: accountOption.account });

  if (subcommand === "signin") {
    printJson(await client.signin());
    return;
  }

  if (subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    console.log(`cc98 me

Usage:
  cc98 me              Show current user profile
  cc98 me signin       Sign in daily
`);
    return;
  }

  const me = await client.getMe();
  printJson(me);
}
