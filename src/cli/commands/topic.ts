import { createCliContext } from "../context.js";
import { extractAccountOption } from "../options.js";
import {
  extractPageOptions,
  parseIds,
  parseNonNegativeInteger,
  parsePositiveInteger,
  printJson
} from "../parse.js";

interface TopicReadOptions {
  from: number;
  size: number;
  metaOnly: boolean;
  postsOnly: boolean;
}

export async function topicCommand(args: string[]): Promise<void> {
  const accountOption = extractAccountOption(args);
  const [subcommandOrId, ...rest] = accountOption.args;

  if (!subcommandOrId || subcommandOrId === "--help" || subcommandOrId === "-h" || subcommandOrId === "help") {
    printTopicHelp();
    return;
  }

  const { client } = createCliContext({ account: accountOption.account });

  if (/^\d+$/.test(subcommandOrId)) {
    const topicId = parsePositiveInteger(subcommandOrId, "topic-id");
    const options = parseTopicReadOptions(rest);

    if (options.metaOnly && options.postsOnly) {
      throw new Error("cannot use --meta and --posts together");
    }

    if (options.metaOnly) {
      printJson(await client.getTopic(topicId));
      return;
    }

    if (options.postsOnly) {
      printJson(await client.getTopicPosts(topicId, options.from, options.size));
      return;
    }

    const [topic, posts] = await Promise.all([
      client.getTopic(topicId),
      client.getTopicPosts(topicId, options.from, options.size)
    ]);

    printJson({
      topic,
      posts,
      page: {
        from: options.from,
        size: options.size,
        count: posts.length
      }
    });
    return;
  }

  switch (subcommandOrId) {
    case "new": {
      const page = extractPageOptions(rest, { size: 20 });
      printJson(await client.getNewTopics(page.from, page.size));
      return;
    }
    case "random": {
      const size = parseSizeOnly(rest, 10);
      printJson(await client.getRandomTopics(size));
      return;
    }
    case "recent": {
      const { userId, args: pageArgs } = extractUserOption(rest);
      const page = extractPageOptions(pageArgs, { size: 11 });
      printJson(await client.getRecentTopics(userId, page.from, page.size));
      return;
    }
    case "is-favorite": {
      const topicId = parsePositiveInteger(rest[0], "topic-id");
      printJson(await client.isTopicFavorite(topicId));
      return;
    }
    case "vote": {
      const topicId = parsePositiveInteger(rest[0], "topic-id");
      printJson(await client.getTopicVote(topicId));
      return;
    }
    case "basic":
      printJson(await client.getBasicTopics(parseIds(rest)));
      return;
    case "search": {
      const page = extractPageOptions(rest, { size: 20 });
      const keyword = page.rest.join(" ").trim();
      if (!keyword) {
        throw new Error("usage: cc98 topic search <keyword> [--from n] [--size n]");
      }
      printJson(await client.searchTopics(keyword, page.from, page.size));
      return;
    }
    case "create": {
      const boardId = parsePositiveInteger(rest[0], "board-id");
      const title = rest[1];
      const content = rest.slice(2).join(" ");
      if (!title || !content) {
        throw new Error("usage: cc98 topic create <board-id> <title> <content>");
      }
      printJson(await client.createTopic(boardId, title, content));
      return;
    }
    case "reply": {
      const topicId = parsePositiveInteger(rest[0], "topic-id");
      const content = rest.slice(1).join(" ");
      if (!content) {
        throw new Error("usage: cc98 topic reply <topic-id> <content>");
      }
      printJson(await client.replyTopic(topicId, content));
      return;
    }
    case "favorite": {
      const action = rest[0];
      if (action === "add" || action === "remove") {
        const topicId = parsePositiveInteger(rest[1], "topic-id");
        const groupId = rest[2] ? parseNonNegativeInteger(rest[2], "group-id") : 0;
        if (action === "add") {
          printJson(await client.addFavorite(topicId, groupId));
        } else {
          printJson(await client.removeFavorite(topicId));
        }
        return;
      }
      // 原有的 favorite 列表逻辑
      const favoriteOptions = parseFavoriteOptions(rest);
      printJson(await client.getFavoriteTopics(
        favoriteOptions.from,
        favoriteOptions.size,
        favoriteOptions.order,
        favoriteOptions.groupId
      ));
      return;
    }
    default:
      throw new Error(`unknown topic command: ${subcommandOrId}`);
  }
}

function parseTopicReadOptions(args: string[]): TopicReadOptions {
  let from = 0;
  let size = 10;
  let metaOnly = false;
  let postsOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--meta") {
      metaOnly = true;
      continue;
    }

    if (arg === "--posts") {
      postsOnly = true;
      continue;
    }

    if (arg === "--from") {
      from = parseNonNegativeInteger(args[index + 1], "--from");
      index += 1;
      continue;
    }

    if (arg === "--size") {
      size = parsePositiveInteger(args[index + 1], "--size");
      index += 1;
      continue;
    }

    throw new Error(`unknown topic option: ${arg}`);
  }

  return { from, size, metaOnly, postsOnly };
}

function parseSizeOnly(args: string[], defaultSize: number): number {
  if (args.length === 0) {
    return defaultSize;
  }

  if (args[0] === "--size") {
    return parsePositiveInteger(args[1], "--size");
  }

  throw new Error(`unknown option: ${args[0]}`);
}

function extractUserOption(args: string[]): { userId?: number; args: string[] } {
  const rest: string[] = [];
  let userId: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--me") {
      userId = undefined;
      continue;
    }

    if (arg === "--user") {
      userId = parsePositiveInteger(args[index + 1], "--user");
      index += 1;
      continue;
    }

    rest.push(arg);
  }

  return { userId, args: rest };
}

function parseFavoriteOptions(args: string[]): { from: number; size: number; order: number; groupId: number } {
  let from = 0;
  let size = 11;
  let order = 1;
  let groupId = 0;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--from") {
      from = parseNonNegativeInteger(args[index + 1], "--from");
      index += 1;
      continue;
    }

    if (arg === "--size") {
      size = parsePositiveInteger(args[index + 1], "--size");
      index += 1;
      continue;
    }

    if (arg === "--order") {
      order = parseNonNegativeInteger(args[index + 1], "--order");
      index += 1;
      continue;
    }

    if (arg === "--group") {
      groupId = parseNonNegativeInteger(args[index + 1], "--group");
      index += 1;
      continue;
    }

    throw new Error(`unknown topic favorite option: ${arg}`);
  }

  return { from, size, order, groupId };
}

function printTopicHelp(): void {
  console.log(`cc98 topic

Usage:
  cc98 topic <topic-id> [--from n] [--size n]
  cc98 topic <topic-id> --meta
  cc98 topic <topic-id> --posts
  cc98 topic new [--from n] [--size n]
  cc98 topic random [--size n]
  cc98 topic recent [--me | --user id] [--from n] [--size n]
  cc98 topic favorite [--group id] [--order n] [--from n] [--size n]
  cc98 topic favorite add <topic-id> [group-id]
  cc98 topic favorite remove <topic-id>
  cc98 topic is-favorite <topic-id>
  cc98 topic vote <topic-id>
  cc98 topic basic <ids...>
  cc98 topic search <keyword> [--from n] [--size n]
  cc98 topic create <board-id> <title> <content>
  cc98 topic reply <topic-id> <content>

Output:
  Default output is JSON.
`);
}
