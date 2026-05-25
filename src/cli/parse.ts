export function parseInteger(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`missing or invalid value for ${name}`);
  }
  return parsed;
}

export function parsePositiveInteger(value: string | undefined, name: string): number {
  const parsed = parseInteger(value, name);
  if (parsed <= 0) {
    throw new Error(`missing or invalid value for ${name}`);
  }
  return parsed;
}

export function parseNonNegativeInteger(value: string | undefined, name: string): number {
  const parsed = parseInteger(value, name);
  if (parsed < 0) {
    throw new Error(`missing or invalid value for ${name}`);
  }
  return parsed;
}

export function parseIds(values: string[], name = "ids"): number[] {
  const ids = values.flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => parsePositiveInteger(value, name));

  if (ids.length === 0) {
    throw new Error(`missing ${name}`);
  }

  return ids;
}

export interface PageOptions {
  from: number;
  size: number;
  rest: string[];
}

export function extractPageOptions(args: string[], defaults: { from?: number; size?: number } = {}): PageOptions {
  const rest: string[] = [];
  let from = defaults.from ?? 0;
  let size = defaults.size ?? 20;

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

    rest.push(arg);
  }

  return { from, size, rest };
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
