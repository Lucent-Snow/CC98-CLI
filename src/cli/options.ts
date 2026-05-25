export interface AccountOptionResult {
  account?: string;
  args: string[];
}

export function extractAccountOption(args: string[]): AccountOptionResult {
  const nextArgs: string[] = [];
  let account: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--account" || arg === "-a") {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`missing value for ${arg}`);
      }
      account = value;
      index += 1;
      continue;
    }

    nextArgs.push(arg);
  }

  return {
    account,
    args: nextArgs
  };
}
