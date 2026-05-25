export const ansi = {
  clear: "\x1b[2J",
  home: "\x1b[H",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  reset: "\x1b[0m",
  inverse: "\x1b[7m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  underline: "\x1b[4m"
} as const;

export function moveTo(row: number, column: number): string {
  return `\x1b[${row};${column}H`;
}

export function fg(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function bg(r: number, g: number, b: number): string {
  return `\x1b[48;2;${r};${g};${b}m`;
}

export function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}
