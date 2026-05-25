import { TokenStore } from "../../storage/token-store.js";

export async function accountCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  const tokenStore = new TokenStore();

  switch (subcommand) {
    case undefined:
    case "--help":
    case "-h":
    case "help":
      printAccountHelp();
      return;

    case "list": {
      const current = await tokenStore.getCurrentAccountName();
      const accounts = await tokenStore.listAccounts();
      console.log(JSON.stringify({
        current,
        accounts: accounts.map((account) => ({
          account: account.account,
          userId: account.userId,
          username: account.username,
          displayName: account.displayName,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
          current: account.account === current
        }))
      }, null, 2));
      return;
    }

    case "current": {
      const current = await tokenStore.getCurrentAccount();
      console.log(JSON.stringify(current ? {
        account: current.account,
        userId: current.userId,
        username: current.username,
        displayName: current.displayName,
        createdAt: current.createdAt,
        updatedAt: current.updatedAt
      } : null, null, 2));
      return;
    }

    case "use": {
      const account = rest[0];
      if (!account) {
        throw new Error("usage: cc98 account use <account>");
      }
      const record = await tokenStore.useAccount(account);
      console.log(JSON.stringify({
        current: record.account,
        userId: record.userId,
        username: record.username,
        displayName: record.displayName
      }, null, 2));
      return;
    }

    case "remove": {
      const account = rest[0];
      if (!account) {
        throw new Error("usage: cc98 account remove <account>");
      }
      await tokenStore.removeAccount(account);
      console.log(JSON.stringify({ removed: account }, null, 2));
      return;
    }

    default:
      throw new Error(`unknown account command: ${subcommand}`);
  }
}

function printAccountHelp(): void {
  console.log(`cc98 account

Usage:
  cc98 account list
  cc98 account current
  cc98 account use <account>
  cc98 account remove <account>

Options:
  -h, --help                Show this help
`);
}
