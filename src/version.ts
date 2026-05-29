import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 从 package.json 读取版本，避免两处维护
const require = createRequire(import.meta.url);
const packageJson = require(join(__dirname, "../package.json"));

export const appName: string = packageJson.name;
export const appVersion: string = packageJson.version;
export const repositoryOwner = "Lucent-Snow";
export const repositoryName = "CC98-CLI";
export const repositoryUrl = `https://github.com/${repositoryOwner}/${repositoryName}`;
