import { createInterface } from "node:readline";
import { checkForUpdate, detectInstallMethod, formatUpdateResult, performUpdate } from "../../update.js";

export async function updateCommand(args: string[]): Promise<void> {
  const [subcommand] = args;

  if (subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printUpdateHelp();
    return;
  }

  if (subcommand !== undefined) {
    throw new Error(`unknown update command: ${subcommand}. Run "cc98 update --help" for usage.`);
  }

  console.log("正在检查更新...");
  const result = await checkForUpdate();
  const installMethod = await detectInstallMethod();
  console.log(formatUpdateResult(result, installMethod));

  if (!result.updateAvailable) {
    return;
  }

  // 提示用户是否自动更新
  console.log("");
  const answer = await prompt("是否自动更新？(Y/n) ");
  if (answer === "" || answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
    console.log("");
    console.log("正在更新...");
    try {
      const output = await performUpdate(installMethod);
      console.log(output);
      console.log("");
      console.log("更新完成！请重新启动 cc98。");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`更新失败：${message}`);
      console.log("");
      console.log("请手动更新：");
      if (installMethod === "npm") {
        console.log("  npm install -g cc98-cli");
      } else if (installMethod === "bun") {
        console.log("  bun install -g cc98-cli");
      } else {
        console.log(`  ${result.latest?.url}`);
      }
    }
  } else {
    console.log("已取消更新。");
  }
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function printUpdateHelp(): void {
  console.log(`cc98 update

Usage:
  cc98 update               Check and install updates

Options:
  -h, --help                Show this help
`);
}
