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

export function formatUpdateResult(result: UpdateCheckResult): string {
  const lines = [
    result.message
  ];

  if (result.latest) {
    lines.push(`最新版本：${result.latest.tagName}`);
    lines.push(`发布页面：${result.latest.url}`);
    if (result.updateAvailable) {
      lines.push("更新方式：npm install -g cc98-cli");
    }
    const body = result.latest.body.trim();
    if (body) {
      lines.push("");
      lines.push("更新内容：");
      lines.push(body);
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
