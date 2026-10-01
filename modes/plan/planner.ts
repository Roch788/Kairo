import {
  Output,
  extractJsonMiddleware,
  generateText,
  stepCountIs,
  tool,
  wrapLanguageModel,
} from "ai";
import chalk from "chalk";
import { z } from "zod";
import { getAgentModel } from "../../ai/ai.config";
import { ActionTracker } from "../agent/actiontracker";
import { ToolExecutor } from "../agent/toolexecutor";
import { defaultAgentConfig } from "../agent/types.ts";
import type { Plan, PlanStep } from "./types.ts";
import { createWebTools } from "./webtools.ts";
const planSchema = z.object({
  researchSummary: z.string().optional(),
  steps: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        hints: z.array(z.string()).optional(),
        complexity: z.enum(["low", "medium", "high"]).optional(),
      }),
    )
    .min(1, "At least one step is required.")
    .max(15, "A maximum of 10 steps is allowed."),
});

function readOnlyTools(executor: ToolExecutor) {
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
const PLAN_PROMPT = (codebase: string, hasWeb: boolean) =>
  [
    "You are a Plan-Mode planner. You DO NOT modify files.",
    `Workspace: ${codebase}`,
    "Use read-only tools for codebase/skills research.",
    hasWeb
      ? "Web tools are available (web_search/web_crawl/fetch_url). Use only when needed."
      : "Web tools are unavailable (no FIRECRAWL_API_KEY).",
    "Output must match the provided JSON schema.",
    "Keep it short: 1–15 steps.",
  ].join("\n");

export async function generatePlan(goal: string) {
  const config = defaultAgentConfig();
  const tracker = new ActionTracker();
  const executor = new ToolExecutor(tracker, config);
  const hasWeb = process.env.FIRECRAWL_API_KEY?.trim() ? true : false;
  const model = wrapLanguageModel({
    model: await getAgentModel(),
    middleware: extractJsonMiddleware(),
  });
  //todo: add web search tool
  const tools = { ...readOnlyTools(executor) ,...hasWeb?createWebTools(tracker):{}};
  console.log(chalk.bold.blueBright("Generating plan..."));
  const result = await generateText({
    model,
    tools,
    stopWhen: stepCountIs(20),
    system: PLAN_PROMPT(config.codebasePath, hasWeb),
    prompt: "user goal: " + goal,
    output: Output.object({ schema: planSchema }),
  });
  const validate = planSchema.parse(result.output);
  const steps: PlanStep[] = validate.steps.map((step, index) => ({
    id: `step-${index + 1}`,
    title: step.title,
    description: step.description,
    hints: step.hints,
    complexity: step.complexity,
  }));
  return { goal, researchSummary: validate.researchSummary, steps };
}
