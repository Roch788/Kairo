import chalk from "chalk";
import { confirm, isCancel, select, text } from "@clack/prompts";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { getAgentModel } from "../../ai/ai.config";
import { ActionTracker } from "../agent/actiontracker";
import { ToolExecutor } from "../agent/toolexecutor";
import { defaultAgentConfig } from "../agent/types.ts";
import { createAgentTools } from "../agent/agenttools.ts";
import { renderTerminalMarkdown } from "../../terminalUI(tui)/terminal-md.ts";
import { runApprovalFlow } from "../agent/approval.ts";
import { generatePlan } from "./planner.ts";
import { printPlan, selectSteps } from "./selection.ts";
import type { Plan, PlanStep } from "./types.ts";
import { createWebTools } from "./webtools.ts";
function stepPrompt(goal: string, step: PlanStep): string {
  return [`Goal: ${goal}`, `Step: ${step.title}`, step.description].join("\n");
}

export async function runPlanMode(): Promise<void> {
  console.log(chalk.bold("\n🧭 Plan Mode\n"));

  const goal = await text({ message: "What is your goal?" });
  if (isCancel(goal) || !goal.trim()) return;

  const plan = await generatePlan(goal);
  printPlan(plan);
  const selectedSteps = await selectSteps(plan);
  if (selectedSteps.length === 0) {
    console.log(chalk.red("No steps selected. Exiting Plan Mode."));
    return;
  }
  const proceed = await confirm({
    message: `Execute ${selectedSteps.length} selected steps?`,
    initialValue: true,
  });
  const config = defaultAgentConfig();
  const tracker = new ActionTracker();
  const executor = new ToolExecutor(tracker, config);
  //todo:add web tools
  const tools = {
    ...createAgentTools(executor),
    ...createWebTools(tracker),
  };
  for (const step of selectedSteps) {
    console.log(chalk.bold.blueBright(`\nExecuting Step: ${step.title}\n`));
    const agent = new ToolLoopAgent({
      model: await getAgentModel(),
      stopWhen: stepCountIs(30),
      tools,
    });
    const r = await agent.generate({ prompt: stepPrompt(plan.goal, step) });
    if (r.text) {
      return console.log(renderTerminalMarkdown(r.text));
    }
  }
  const ok = await runApprovalFlow(tracker);
  if (!ok) {
    console.log(chalk.red("Plan execution not approved. Exiting Plan Mode."));
    return executor.clearStaging();
  }
  const { errors } = executor.applyApprovedFromTracker();
  if (errors.length) {
    console.log(chalk.red("\nSome operations reported errors:\n"));
    for (const e of errors) console.log(chalk.red(`  • ${e}`));
  } else {
    console.log(chalk.green("\n✓ Applied.\n"));
  }
  executor.clearStaging();
}
