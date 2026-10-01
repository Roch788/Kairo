import chalk from "chalk";
import { confirm, isCancel, text } from "@clack/prompts";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { z } from "zod";

import { getAgentModel } from "../../ai/ai.config";
import { ActionTracker } from "../agent/actiontracker";
import { ToolExecutor } from "../agent/toolexecutor";
import { defaultAgentConfig } from "../agent/types.ts";

import { renderTerminalMarkdown } from "../../terminalUI(tui)/terminal-md.ts";
import { runApprovalFlow } from "../agent/approval.ts";
import { create } from "node:domain";
import { createWebTools } from "../plan/webtools.ts";
function createAskTools(executor: ToolExecutor) {
  return {
    read_file: tool({
      description:
        "Read a file from the codebase.Use a relative path from the codebase root.",
      inputSchema: z.object({
        path: z.string().describe("Relative path to the file to read."),
      }),
      execute: async ({ path: p }) => executor.readFile(p),
    }),
    list_files: tool({
      description: "List files and directories under a path.",
      inputSchema: z.object({
        path: z.string(),
        recursive: z.boolean().optional().default(false),
      }),
      execute: async ({ path: p, recursive }) =>
        executor.listFiles(p, recursive),
    }),
    search_files: tool({
      description:
        'Find files matching a glob pattern (e.g. "*.ts", "**/*.md"). Optional content substring filter.',
      inputSchema: z.object({
        root: z.string().describe("Directory to search, relative to root"),
        pattern: z
          .string()
          .describe("Glob-like pattern using * and ** (forward slashes)"),
        content_contains: z.string().optional(),
      }),
      execute: async ({ root, pattern, content_contains }) =>
        executor.searchFiles(root, pattern, content_contains),
    }),

    analyze_codebase: tool({
      description:
        "Summarize structure: file counts, size, extensions. Read-only.",
      inputSchema: z.object({
        path: z.string().default("."),
      }),
      execute: async ({ path: p }) => executor.analyzeCodebase(p),
    }),
    list_skills: tool({
      description:
        "List absolute paths to SKILL.md files under configured skill directories (Cursor / Claude).",
      inputSchema: z.object({}),
      execute: async () => executor.listSkills(),
    }),

    read_skill: tool({
      description:
        "Read a SKILL.md file. Path must be absolute and under skill roots, or use a path returned by list_skills.",
      inputSchema: z.object({
        path: z.string(),
      }),
      execute: async ({ path: p }) => executor.readSkill(p),
    }),
  };
}
function asMd(question: string, answer: string): string {
  return `# Question\n\n${question}\n\n# Answer\n\n${answer}\n`;
}
export async function runAskMode() {
  console.log(chalk.bold.blueBright("Running in Ask Mode..."));
  const question = await text({ message: "What is your question?" });
  if (isCancel(question) || question.trim() === "") {
    console.log(chalk.red("Ask mode cancelled."));
    return;
  }
  const config = defaultAgentConfig();
  config.tools.allowFileCreation = true;
  config.tools.allowFileModification = false;
  config.tools.allowFolderCreation = false;
  config.tools.allowShellExecution = false;

  const tracker = new ActionTracker();
  const executor = new ToolExecutor(tracker, config);
  //web search tool to be added(firecrawl)

  const tools = {
    ...createAskTools(executor), // ... it is spread operator to include all tools from createAskTools
    ...createWebTools(tracker),
  };
  const agent = new ToolLoopAgent({
    model: await getAgentModel(),
    stopWhen: stepCountIs(10),
    tools,
  });
  const result = await agent.generate({ prompt: question.trim() });
  const answer = result.text ? result.text.trim() : "No answer generated.";
  console.log("\n" + renderTerminalMarkdown(answer) + "\n");
  const wantsSave = await confirm({
    message: "Do you want to save the answer to a file?",
    initialValue: false,
  });
  if (isCancel(wantsSave) || !wantsSave) {
    console.log(chalk.red("Answer not saved."));
    return;
  }
  const fileName = await text({
    message: "Enter the file name to save the answer:",
    initialValue: "answer.txt",
    validate: (value) => {
      const s = (value ?? "").trim();
      if (!s) return "File name cannot be empty.";
      if (s.includes("..") || s.includes("/") || s.includes("\\")) {
        return "File name cannot contain path traversal characters.";
      }
      if (
        !s.toLowerCase().endsWith(".txt") &&
        !s.toLowerCase().endsWith(".md")
      ) {
        return "File name must end with .txt or .md.";
      }
      if (value && value.trim() === "") {
        return "File name cannot be empty.";
      }
    },
  });
  if (isCancel(fileName) || fileName.trim() === "") {
    console.log(chalk.red("File name not provided. Answer not saved."));
    return;
  }
  executor.createFile(fileName, asMd(question, answer));
  const ok = await runApprovalFlow(tracker);
  if (!ok) {
    console.log(chalk.red("Approval flow failed. Answer not saved."));
    return executor.clearStaging();
  }
  executor.applyApprovedFromTracker();
  console.log(chalk.green(`Answer saved to ${fileName}`));
  executor.clearStaging();
}
