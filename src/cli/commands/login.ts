import { createCliContext } from "../context.js";
import { extractAccountOption } from "../options.js";
import { promptPassword, promptText, readStdinText } from "../prompt.js";

interface LoginOptions {
  account?: string;
  username?: string;
  passwordStdin: boolean;
  help: boolean;
}

export async function loginCommand(args: string[] = []): Promise<void> {
  const options = parseLoginArgs(args);
  if (options.help) {
    printLoginHelp();
    return;
  }

  const { client, tokenStore } = createCliContext();
  const username = options.username ?? (await promptText("CC98 username: ")).trim();
  const password = options.passwordStdin
    ? (await readStdinText()).trimEnd()
    : await promptPassword("CC98 password: ");

  if (!username) {
    throw new Error("username cannot be empty");
  }

  try {
    const token = await client.loginWithPassword(username, password);
    const me = await client.getMeWithAccessToken(token.accessToken);
    const account = options.account ?? getDefaultAccountName(me, username);
    await tokenStore.saveAccount(account, {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      userId: typeof me.id === "number" ? me.id : undefined,
      username,
      displayName: typeof me.name === "string" ? me.name : undefined
    });
    const name = typeof me.name === "string" ? me.name : username;
    const id = typeof me.id === "number" ? `#${me.id}` : "";
    console.log(`logged in as ${name}${id ? ` ${id}` : ""} (${account})`);
  } catch (error) {
    throw normalizeLoginError(error);
  }
}

function parseLoginArgs(args: string[]): LoginOptions {
  const accountOption = extractAccountOption(args);
  const options: LoginOptions = {
    account: accountOption.account,
    passwordStdin: false,
    help: false
  };

  for (let index = 0; index < accountOption.args.length; index += 1) {
    const arg = accountOption.args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--password-stdin") {
      options.passwordStdin = true;
      continue;
    }

    if (arg === "--username" || arg === "-u") {
      const value = accountOption.args[index + 1];
      if (!value) {
        throw new Error(`missing value for ${arg}`);
      }
      options.username = value;
      index += 1;
      continue;
    }

    throw new Error(`unknown login option: ${arg}`);
  }

  return options;
}

function printLoginHelp(): void {
  console.log(`cc98 login

Usage:
  cc98 login
  cc98 login -u <username>
  cc98 login --account <account>
  printf '%s' "$CC98_PASSWORD" | cc98 login -u <username> --password-stdin

Options:
  -u, --username <name>     Provide the CC98 username
  -a, --account <account>   Save as this local account name
  --password-stdin          Read password from stdin
  -h, --help                Show this help
`);
}

function getDefaultAccountName(me: Record<string, unknown>, username: string): string {
  if (typeof me.name === "string" && me.name.trim()) {
    return me.name.trim();
  }

  if (typeof me.id === "number") {
    return String(me.id);
  }

  return username;
}

function normalizeLoginError(error: unknown): Error {
  if (error instanceof Error) {
    return new Error(`login failed: ${error.message}`);
  }
  return new Error(`login failed: ${String(error)}`);
}
