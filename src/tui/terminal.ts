import { stdin, stdout } from "node:process";
import { ansi } from "./ansi.js";

export interface TerminalSize {
  columns: number;
  rows: number;
}

export type KeyHandler = (key: string) => void;
export type ResizeHandler = () => void;

export class Terminal {
  private previousRawMode = false;
  private previousPaused = true;
  private readonly keyHandlers = new Set<KeyHandler>();
  private readonly resizeHandlers = new Set<ResizeHandler>();

  enter(): void {
    this.previousRawMode = stdin.isRaw;
    this.previousPaused = stdin.isPaused();
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.setEncoding("utf8");
    stdout.write(ansi.hideCursor);
    stdin.on("data", this.handleData);
    stdout.on("resize", this.handleResize);
  }

  exit(): void {
    stdin.off("data", this.handleData);
    stdout.off("resize", this.handleResize);
    stdout.write(`${ansi.reset}${ansi.showCursor}`);
    if (stdin.isTTY) {
      stdin.setRawMode(this.previousRawMode);
    }
    if (this.previousPaused) {
      stdin.pause();
    }
  }

  size(): TerminalSize {
    return {
      columns: stdout.columns || Number(process.env.COLUMNS) || 80,
      rows: stdout.rows || Number(process.env.LINES) || 24
    };
  }

  render(text: string): void {
    stdout.write(`${ansi.clear}${ansi.home}${text}`);
  }

  onKey(handler: KeyHandler): () => void {
    this.keyHandlers.add(handler);
    return () => this.keyHandlers.delete(handler);
  }

  onResize(handler: ResizeHandler): () => void {
    this.resizeHandlers.add(handler);
    return () => this.resizeHandlers.delete(handler);
  }

  private readonly handleData = (chunk: Buffer | string): void => {
    const key = chunk.toString("utf8");
    for (const handler of this.keyHandlers) {
      if (key.length > 1 && !key.startsWith("\x1b")) {
        for (const char of key) {
          handler(char);
        }
      } else {
        handler(key);
      }
    }
  };

  private readonly handleResize = (): void => {
    for (const handler of this.resizeHandlers) {
      handler();
    }
  };
}
