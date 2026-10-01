import chalk from "chalk";
import { isCancel, text } from "@clack/prompts";
import { defaultAgentConfig } from "./types";
import { ActionTracker } from "./actiontracker";
import { ToolExecutor } from "./toolexecutor";
import { createAgentTools } from "./agenttools";
import { ToolLoopAgent } from "ai";
import { stepCountIs } from "ai";
import { getAgentModel } from "../../ai/ai.config";
import { renderTerminalMarkdown } from "../../terminalUI(tui)/terminal-md";
import { runApprovalFlow } from "./approval";
export async function runAgentMode() {
  console.log(chalk.bold("\n 🤖 Agent Mode \n").bold);
  const goal = await text({
    message: "What would you like the agent to do",
    placeholder: "Concreate task for codebase...",
  });

  if (isCancel(goal) || !goal.trim()) return;

  const config = defaultAgentConfig();
  const tracker = new ActionTracker();
  const executor = new ToolExecutor(tracker, config);
  const tools = createAgentTools(executor);
  const agent = new ToolLoopAgent({
    model: await getAgentModel(),
    stopWhen: stepCountIs(40),
    instructions: [
      `Workspace root: ${config.codebasePath}`,
      "All mutations are staged until approval.",
    ].join("\n"),
    tools,
  });
  const result = await agent.generate({
    prompt: goal.trim(),
    onStepFinish: ({ toolCalls }) => {
      for (const tc of toolCalls) {
        const preview = JSON.stringify(tc.input).slice(0, 160);
        console.log(
          chalk.green("  ✓"),
          chalk.bold(String(tc.toolName)),
          chalk.dim(preview + (preview.length >= 160 ? "..." : "")),
        );
      }
    },
  });
  //result.text?.trim() is the final output of the agent after all steps have been executed. It may contain a summary or conclusion based on the agent's actions and findings. If it is not empty, we render it as terminal markdown for better readability and display it in the console.
  if (result.text?.trim())
    console.log(renderTerminalMarkdown(result.text.trim()));
  const ok = await runApprovalFlow(tracker);
  if (!ok) {
    return executor.clearStaging();
  }
  const { errors } = executor.applyApprovedFromTracker();
  if (errors.length > 0) {
    console.log(chalk.red("Errors occurred while applying changes:"));
    for (const err of errors) {
      console.log(chalk.red("  -"), err);
    }
  } else {
    chalk.green("All approved changes have been successfully applied.");
  }
  executor.clearStaging();
}
