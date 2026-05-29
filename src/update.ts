import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { appName, appVersion, repositoryName, repositoryOwner, repositoryUrl } from "./version.js";

export interface ReleaseInfo {
  version: string;
  tagName: string;
  name: string;
  url: string;
  body: string;
  publishedAt?: string;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latest?: ReleaseInfo;
  updateAvailable: boolean;
  message: string;
}

interface GitHubReleaseResponse {
  tag_name?: string;
  name?: string;
  html_url?: string;
  body?: string;
  published_at?: string;
}

const latestReleaseApiUrl = `https://api.github.com/repos/${repositoryOwner}/${repositoryName}/releases/latest`;

export type InstallMethod = "npm" | "bun" | "source" | "unknown";

export async function detectInstallMethod(): Promise<InstallMethod> {
  // 检查是否是 npm 全局安装
  try {
    const npmGlobalDir = await execCommand("npm", ["root", "-g"]);
    const currentFile = new URL(import.meta.url).pathname;
    if (currentFile.includes(npmGlobalDir.trim())) {
      return "npm";
    }
  } catch {
    // ignore
  }

  // 检查是否是 bun 全局安装
  try {
    const bunGlobalDir = await execCommand("bun", ["pm", "ls", "-g"]);
    if (bunGlobalDir.includes(appName)) {
      return "bun";
    }
  } catch {
    // ignore
  }

  // 检查 package.json 是否存在（源码安装）
  try {
    const currentDir = new URL("../..", import.meta.url).pathname;
    await readFile(join(currentDir, "package.json"), "utf-8");
    return "source";
  } catch {
    // ignore
  }

  return "unknown";
}

export async function performUpdate(method: InstallMethod): Promise<string> {
  switch (method) {
    case "npm":
      return execCommand("npm", ["install", "-g", `${appName}`]);
    case "bun":
      return execCommand("bun", ["install", "-g", `${appName}`]);
    case "source": {
      const currentDir = new URL("../..", import.meta.url).pathname;
      await execCommand("git", ["pull"], currentDir);
      await execCommand("npm", ["install"], currentDir);
      await execCommand("npm", ["run", "build"], currentDir);
      return "源码更新完成";
    }
    default:
      throw new Error("无法检测安装方式，请手动更新。");
  }
}

function execCommand(command: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const response = await fetch(latestReleaseApiUrl, {
    headers: {
      "accept": "application/vnd.github+json",
      "user-agent": `${appName}/${appVersion}`
    }
  });

  if (response.status === 404) {
    return {
      currentVersion: appVersion,
      updateAvailable: false,
      message: "还没有可用的 GitHub Release。"
    };
  }

  if (!response.ok) {
    throw new Error(`GitHub Release 请求失败：${response.status}`);
  }

  const release = await response.json() as GitHubReleaseResponse;
  const tagName = release.tag_name ?? "";
  const latestVersion = normalizeVersion(tagName);
  if (!latestVersion) {
    throw new Error("GitHub Release 没有有效版本号。");
  }

  const latest: ReleaseInfo = {
    version: latestVersion,
    tagName,
    name: release.name ?? tagName,
    url: release.html_url ?? `${repositoryUrl}/releases/tag/${tagName}`,
    body: release.body ?? "",
    publishedAt: release.published_at
  };
  const updateAvailable = compareVersions(latestVersion, appVersion) > 0;

  return {
    currentVersion: appVersion,
    latest,
    updateAvailable,
    message: updateAvailable
      ? `发现新版本 ${latest.tagName}，当前版本 v${appVersion}。`
      : `当前已是最新版本 v${appVersion}。`
  };
}

export function formatUpdateResult(result: UpdateCheckResult, installMethod?: InstallMethod): string {
  const lines = [result.message];

  if (result.latest) {
    lines.push(`最新版本：${result.latest.tagName}`);
    lines.push(`发布页面：${result.latest.url}`);
    if (result.updateAvailable) {
      if (installMethod && installMethod !== "unknown") {
        lines.push("");
        lines.push(`检测到安装方式：${installMethod}`);
      }
    }
  }

  return lines.join("\n");
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, "");
}

function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function versionParts(value: string): number[] {
  return normalizeVersion(value)
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}
