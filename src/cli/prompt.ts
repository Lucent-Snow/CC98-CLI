import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";

class MuteableOutput extends Writable {
  muted = false;

  constructor(private readonly target: NodeJS.WriteStream) {
    super();
  }

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    if (!this.muted) {
      this.target.write(chunk, encoding);
    }
    callback();
  }
}

export async function promptText(label: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    return await rl.question(label);
  } finally {
    rl.close();
  }
}

export async function promptPassword(label: string): Promise<string> {
  if (!stdin.isTTY) {
    return promptText(label);
  }

  const output = new MuteableOutput(stdout);
  const rl = createInterface({ input: stdin, output, terminal: true });

  try {
    stdout.write(label);
    output.muted = true;
    const password = await rl.question("");
    output.muted = false;
    stdout.write("\n");
    return password;
  } finally {
    output.muted = false;
    rl.close();
  }
}

export async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}
