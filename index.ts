#!/usr/bin/env bun
import { Command } from "commander";
import chalk from "chalk";
import { runWakeup } from "./terminalUI(tui)/wakeup";

const program = new Command();

program
  .name("Kairo")
  .description(
    chalk.hex("#e8dcf8")(
      "Your AI-powered coding assistant — ask questions, plan features, and execute changes right from the terminal or Telegram."
    )
  )
  .version("0.1.0")
  .addHelpText(
    "beforeAll",
    chalk.hex("#5b49de").bold("\n  ⚡ Kairo") +
      chalk.dim("  —  AI coding assistant\n")
  )
  .addHelpText(
    "after",
    "\n" +
      chalk.dim("  Examples:\n") +
      chalk.hex("#e8dcf8")("    $ Kairo wakeup") +
      chalk.dim("          Launch the interactive mode picker\n")
  );

program
  .command("wakeup")
  .description("launch Kairo and pick your mode (CLI or Telegram)")
  .action(async () => {
    await runWakeup();
  });

await program.parseAsync(process.argv);
