import { createCliContext } from "../context.js";
import { extractAccountOption } from "../options.js";
import { extractPageOptions, printJson } from "../parse.js";

type NoticeType = "system" | "at" | "reply";

export async function noticeCommand(args: string[]): Promise<void> {
  const accountOption = extractAccountOption(args);
  const [typeArg, ...rest] = accountOption.args;

  if (!typeArg || typeArg === "--help" || typeArg === "-h" || typeArg === "help") {
    printNoticeHelp();
    return;
  }

  if (!isNoticeType(typeArg)) {
    throw new Error("usage: cc98 notice <system|at|reply> [--from n] [--size n]");
  }

  const page = extractPageOptions(rest, { size: 10 });
  const { client } = await createCliContext({ account: accountOption.account });
  printJson(await client.getNotices(typeArg, page.from, page.size));
}

function isNoticeType(value: string): value is NoticeType {
  return value === "system" || value === "at" || value === "reply";
}

function printNoticeHelp(): void {
  console.log(`cc98 notice

Usage:
  cc98 notice system [--from n] [--size n]
  cc98 notice at [--from n] [--size n]
  cc98 notice reply [--from n] [--size n]
`);
}
