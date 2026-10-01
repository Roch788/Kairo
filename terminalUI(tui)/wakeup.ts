import { select, isCancel } from "@clack/prompts";
import chalk from "chalk";
import figlet from "figlet";
import { runCliMode } from "../modes/cli.ts";
import { runTelegramMode } from "../modes/telegram/index.ts";
const BANNER_FONT = "ANSI Shadow";
const SHADOW = chalk.hex("#5b49de");
const FACE = chalk.hex("#e8dcf8").bold;
function printBannerWithShadow(ascii: string) {
  const bannerLines = ascii.replace(/\s+$/, "").split("\n");
  const maxLen = Math.max(...bannerLines.map((l) => l.length), 0);
  const rowWidth = maxLen + 2;

  for (const line of bannerLines) {
    console.log(SHADOW(("  " + line).padEnd(rowWidth)));
  }
  process.stdout.write(`\x1b[${bannerLines.length}A`);
  for (const line of bannerLines) {
    console.log(FACE(line.padEnd(rowWidth)));
  }
  console.log();
}

export async function runWakeup() {
  let ascii: string;
  try {
    ascii = figlet.textSync("Kairo", { font: BANNER_FONT });
  } catch (e) {
    ascii = figlet.textSync("Kairo", { font: "Standard" });
  }
  printBannerWithShadow(ascii);

  const mode = await select({
    message: "which mode you want to proceed with?",
    options: [
      { value: "cli", label: "CLI Mode" },
      { value: "telegram", label: "Telegram Mode" },
      { value: "exit", label: "Exit" },
    ],
  });
  if (mode === "exit" || isCancel(mode)) {
    console.log(chalk.red("Operation exited."));
    process.exit(0);
  }
  if (mode === "cli") {
    console.log(
      chalk.dim(
        "You have selected CLI mode. Proceeding with CLI operations...",
      ),
    );
    await runCliMode();
  }
  if (mode === "telegram") {
   runTelegramMode();
  }
}
