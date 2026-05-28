import { createCliContext } from "../context.js";
import { extractAccountOption } from "../options.js";

export async function logoutCommand(args: string[] = []): Promise<void> {
  const { account, args: rest } = extractAccountOption(args);

  if (rest.includes("--all")) {
    const { tokenStore } = await createCliContext();
    await tokenStore.clear();
    console.log(JSON.stringify({ loggedOut: "all" }, null, 2));
    return;
  }

  const { tokenStore } = await createCliContext({ account });
  const current = await tokenStore.getCurrentAccountName();
  if (!current) {
    console.log(JSON.stringify({ loggedOut: null }, null, 2));
    return;
  }

  await tokenStore.removeAccount(current);
  console.log(JSON.stringify({ loggedOut: current }, null, 2));
}
