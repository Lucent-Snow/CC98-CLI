import { createCliContext } from "../context.js";
import { extractAccountOption } from "../options.js";

export async function searchCommand(args: string[]): Promise<void> {
  const accountOption = extractAccountOption(args);
  const keyword = accountOption.args.join(" ").trim();
  if (!keyword) {
    throw new Error("usage: cc98 search <keyword>");
  }

  const { client } = createCliContext({ account: accountOption.account });
  const result = await client.searchTopics(keyword);
  console.log(JSON.stringify(result, null, 2));
}
