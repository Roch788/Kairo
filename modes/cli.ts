import chalk from "chalk";
import { select, isCancel } from "@clack/prompts";
import {runAgentMode} from "./agent/orchestrator.ts";
import {runAskMode} from "./ask/orchestrator.ts";
import {runPlanMode} from "./plan/orchestrator.ts";
export async function runCliMode() {
  while (true) {
    const mode = await select({
      message: "Choose CLI sub-mode to proceed with",
      options: [
        { value: "agent", label: "Agent Mode" },
        { value: "plan", label: "Plan Mode" },
        { value: "ask", label: "Ask Mode" },
        { value: "back", label: "<- Back to main menu" },
      ],
    });
    if (isCancel(mode) || mode === "back") {
      console.log(chalk.red("Returning to main menu."));
      break;
    }
    if (mode === "agent") {
        await runAgentMode();
    }
    if (mode === "plan") {
        await runPlanMode();
    }
    if (mode === "ask") {
        await runAskMode();
    }

    if (mode !== "agent" && mode !== "plan" && mode !== "ask") {
      console.log(chalk.yellow(`\nInvalid selection: ${mode}. Please choose a valid option.\n`));
    }
  }
}
