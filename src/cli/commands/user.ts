import { createCliContext } from "../context.js";
import { extractAccountOption } from "../options.js";
import { extractPageOptions, parseIds, parsePositiveInteger, printJson } from "../parse.js";

export async function userCommand(args: string[]): Promise<void> {
  const accountOption = extractAccountOption(args);
  const [subcommand, ...rest] = accountOption.args;
  const { client } = createCliContext({ account: accountOption.account });

  switch (subcommand) {
    case undefined:
    case "--help":
    case "-h":
    case "help":
      printUserHelp();
      return;
    case "me":
      printJson(await client.getMe());
      return;
    case "profile": {
      const userId = parsePositiveInteger(rest[0], "user-id");
      printJson(await client.getUserProfile(userId));
      return;
    }
    case "basic":
      printJson(await client.getBasicUsers(parseIds(rest)));
      return;
    case "list":
      printJson(await client.getUsers(parseIds(rest)));
      return;
    case "followers": {
      const page = extractPageOptions(rest, { size: 10 });
      printJson(await client.getFriendIds("follower", page.from, page.size));
      return;
    }
    case "followees": {
      const page = extractPageOptions(rest, { size: 10 });
      printJson(await client.getFriendIds("followee", page.from, page.size));
      return;
    }
    case "moment": {
      const page = extractPageOptions(rest, { size: 20 });
      printJson(await client.getMoment(page.from, page.size));
      return;
    }
    case "favorite-updates": {
      const page = extractPageOptions(rest, { size: 20 });
      printJson(await client.getFavoriteUpdates(page.from, page.size));
      return;
    }
    case "favorite-groups":
      printJson(await client.getFavoriteGroups());
      return;
    case "search": {
      const name = rest.join(" ").trim();
      if (!name) {
        throw new Error("usage: cc98 user search <name>");
      }
      printJson(await client.searchUsers(name));
      return;
    }
    case "unread":
      printJson(await client.getUnreadCount());
      return;
    case "browse-history": {
      const page = extractPageOptions(rest, { size: 11 });
      printJson(await client.getBrowseHistory(page.from, page.size));
      return;
    }
    case "follow": {
      const userId = parsePositiveInteger(rest[0], "user-id");
      printJson(await client.followUser(userId));
      return;
    }
    case "unfollow": {
      const userId = parsePositiveInteger(rest[0], "user-id");
      printJson(await client.unfollowUser(userId));
      return;
    }
    default:
      throw new Error(`unknown user command: ${subcommand}`);
  }
}

function printUserHelp(): void {
  console.log(`cc98 user

Usage:
  cc98 user me
  cc98 user profile <user-id>
  cc98 user basic <ids...>
  cc98 user list <ids...>
  cc98 user followers [--from n] [--size n]
  cc98 user followees [--from n] [--size n]
  cc98 user moment [--from n] [--size n]
  cc98 user favorite-updates [--from n] [--size n]
  cc98 user favorite-groups
  cc98 user search <name>
  cc98 user unread
  cc98 user browse-history [--from n] [--size n]
  cc98 user follow <user-id>
  cc98 user unfollow <user-id>
`);
}
