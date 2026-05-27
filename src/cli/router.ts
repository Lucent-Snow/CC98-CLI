import { accountCommand } from "./commands/account.js";
import { boardCommand } from "./commands/board.js";
import { cacheCommand } from "./commands/cache.js";
import { forumCommand } from "./commands/forum.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { messageCommand } from "./commands/message.js";
import { meCommand } from "./commands/me.js";
import { noticeCommand } from "./commands/notice.js";
import { postCommand } from "./commands/post.js";
import { extractAccountOption } from "./options.js";
import { searchCommand } from "./commands/search.js";
import { topicCommand } from "./commands/topic.js";
import { updateCommand } from "./commands/update.js";
import { userCommand } from "./commands/user.js";
import { runTui } from "../tui/app.js";
import { appName, appVersion } from "../version.js";

type CommandHandler = (args: string[]) => Promise<void> | void;

const commands: Record<string, CommandHandler> = {
  account: accountCommand,
  board: boardCommand,
  cache: cacheCommand,
  forum: forumCommand,
  login: loginCommand,
  logout: logoutCommand,
  message: messageCommand,
  me: meCommand,
  notice: noticeCommand,
  post: postCommand,
  search: searchCommand,
  topic: topicCommand,
  tui: runTui,
  update: updateCommand,
  user: userCommand
};

export async function runCli(args: string[]): Promise<void> {
  const accountOption = extractAccountOption(args);
  const [command, ...rest] = accountOption.args;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(`${appName} ${appVersion}`);
    return;
  }

  const handler = commands[command];
  if (!handler) {
    throw new Error(`unknown command: ${command}. Run "cc98 --help" for usage.`);
  }

  const commandArgs = accountOption.account && command !== "account"
    ? [...rest, "--account", accountOption.account]
    : rest;

  await handler(commandArgs);
}

function printHelp(): void {
  console.log(`cc98

Usage:
  cc98                      Open the TUI
  cc98 tui                  Open the TUI explicitly
  cc98 login                Sign in and save tokens
  cc98 account list         List local accounts
  cc98 account use <name>   Set current account
  cc98 logout               Remove saved tokens
  cc98 me                   Show current user profile
  cc98 me signin            Sign in daily
  cc98 forum index          Read forum index config
  cc98 forum boards         Read all boards
  cc98 board <board-id>     List topics in a board
  cc98 board favorite add|remove <board-id>
  cc98 topic <topic-id>     Read a topic
  cc98 topic create <board-id> <title> <content>
  cc98 topic reply <topic-id> <content>
  cc98 topic favorite add|remove <topic-id>
  cc98 user profile <id>    Read user profile
  cc98 user follow|unfollow <id>
  cc98 message unread       Read unread counts
  cc98 message send <user-id> <content>
  cc98 notice system        Read system notices
  cc98 post like|dislike <post-id>
  cc98 search <keyword>     Search topics
  cc98 cache stats          Show cache statistics
  cc98 cache cleanup        Remove expired cache entries
  cc98 cache clear          Clear all cache
  cc98 update               Check the latest GitHub Release

Options:
  -a, --account <name>      Use this account for supported commands
  -h, --help                Show this help
  -v, --version             Show version
`);
}
