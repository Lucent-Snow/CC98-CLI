import { createCliContext } from "../context.js";
import { extractAccountOption } from "../options.js";

export async function meCommand(args: string[] = []): Promise<void> {
  const { account } = extractAccountOption(args);
  const { client } = createCliContext({ account });
  const me = await client.getMe();
  console.log(JSON.stringify(me, null, 2));
}
