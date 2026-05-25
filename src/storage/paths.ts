import { homedir } from "node:os";
import { join } from "node:path";

const appDirName = ".cc98-cli";

export function getConfigDir(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  return xdgConfigHome ? join(xdgConfigHome, "cc98-cli") : join(homedir(), appDirName);
}

export function getTokenFilePath(): string {
  return join(getConfigDir(), "tokens.json");
}

export function getCacheDir(): string {
  return join(getConfigDir(), "cache");
}
