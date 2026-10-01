import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import type { ActionLog, AgentConfig } from "./types";
import { ActionTracker } from "./actiontracker";

const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdx",
  ".css",
  ".html",
  ".yml",
  ".yaml",
  ".toml",
  ".txt",
]);
function isProbablyTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXT.has(ext)) return true;
  return false;
}

export class ToolExecutor {
  private overlay = new Map<string, string>(); //it is used to store the modified content of files that are being tracked by the ActionTracker. The key is the file path, and the value is the modified content of the file.
  private deleted = new Set<string>(); //it is used to store the paths of files that have been deleted. The set contains the file paths of the deleted files.
  private readonly norm = (rel: string) =>
    path.posix.normalize(rel.split(path.sep).join("/")).replace(/^\.\//, ""); //it is used to normalize file paths. It takes a relative file path as input and returns a normalized version of the path. The normalization process involves converting backslashes to forward slashes, removing any leading "./" from the path, and ensuring that the path is in a consistent format.
  constructor(
    private readonly tracker: ActionTracker,
    private readonly config: AgentConfig,
  ) {}
  //resolvesafe is used to resolve a relative file path to an absolute path based on the codebasePath specified in the AgentConfig. It ensures that the resolved path does not escape the workspace directory. If the resolved path is outside the workspace, it throws an error.
  private resolveSafe(rel: string): string {
    //returns the absolute path of a file relative to the codebasePath specified in the AgentConfig. It ensures that the resolved path does not escape the workspace directory. If the resolved path is outside the workspace, it throws an error.
    const abs = path.resolve(this.config.codebasePath, rel);
    const root = path.resolve(this.config.codebasePath);
    const relCheck = path.relative(root, abs);
    if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
      throw new Error(`Path escapes workspace: ${rel}`);
    }
    return abs;
  }
  private excluded(relPath: string): boolean {
    //it checks if a given relative file path should be excluded based on the excludePatterns specified in the AgentConfig. It returns true if the file path matches any of the exclude patterns, indicating that the file should be excluded from processing.
    const norm = this.norm(relPath);
    const segments = norm.split("/");
    const base = segments[segments.length - 1] ?? "";

    for (const pat of this.config.excludePatterns) {
      if (pat === "*.log" && base.endsWith(".log")) return true;
      if (pat === ".env*" && base.startsWith(".env")) return true;
      if (pat.includes("*")) continue;
      if (segments.includes(pat) || norm === pat || norm.startsWith(`${pat}/`))
        return true;
    }
    return false;
  }
  //assertNotExcluded is used to check if a given relative file path is excluded based on the excludePatterns specified in the AgentConfig. If the file path is excluded, it throws an error with a message indicating that the operation (op) cannot be performed on the excluded path.
  private assertNotExcluded(rel: string, op: string): void {
    //it checks if a given relative file path is excluded based on the excludePatterns specified in the AgentConfig. If the file path is excluded, it throws an error with a message indicating that the operation (op) cannot be performed on the excluded path.
    if (this.excluded(rel)) {
      throw new Error(`${op}: path is excluded by policy: ${rel}`);
    }
  }
  getEffectiveText(rel: string): string | undefined {
    //gives priority to the overlay content if it exists, then checks if the file has been marked as deleted, and finally checks if the file exists on disk and is a text file. If none of these conditions are met, it returns undefined.
    const key = this.norm(rel);
    if (this.deleted.has(key)) return undefined;
    if (this.overlay.has(key)) return this.overlay.get(key);
    const abs = this.resolveSafe(rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return undefined;
    return fs.readFileSync(abs, "utf8");
  }
  //readFile is used to read the content of a file specified by a relative path (rel).
  //  It first checks if the file is excluded based on the excludePatterns in the AgentConfig. 
  // If the file is not excluded, it resolves the absolute path of the file and checks if it exists and 
  // is a regular file. If the file is too large (exceeds maxFileSizeToRead), it throws an error. 
  // Otherwise, it reads the content of the file as a UTF-8 string, logs the action using the ActionTracker, and returns the content.
  readFile(rel: string): string {
    this.assertNotExcluded(rel, "read_file");
    const abs = this.resolveSafe(rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error(`File not found: ${rel}`);
    }
    const st = fs.statSync(abs);
    if (st.size > this.config.maxFileSizeToRead) {
      throw new Error(`File too large: ${rel}`);
    }
    const text = fs.readFileSync(abs, "utf8");
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rel),
      details: { after: text, toolName: "read_file" },
      status: "executed",
    });
    return text;
  }
  
//createFile is used to create a new file specified by a relative path (rel) with the provided content.
  createFile(rel: string, content: string): string {
    if (!this.config.tools.allowFileCreation)
      throw new Error("File creation disabled");
    this.assertNotExcluded(rel, "create_file");
    const key = this.norm(rel);
    const abs = this.resolveSafe(rel);
    if (fs.existsSync(abs) && !this.deleted.has(key)) {
      throw new Error(`create_file: already exists: ${rel}`);
    }
    this.deleted.delete(key);
    this.overlay.set(key, content);
    this.tracker.log({
      type: "file_create",
      path: key,
      details: { after: content },
      status: "pending",
    });
    return `Staged new file: ${key}`;
  }
//it is used to modify the content of an existing file specified by a relative path (rel)
//  with the provided new content. It first checks if file modification is allowed based on the AgentConfig.
//  Then, it verifies that the file is not excluded and retrieves the current content of the file.'
//  If the file does not exist, it throws an error. Finally, it updates the overlay with the new content, 
// logs the action using the ActionTracker, and returns a message indicating that the update has been staged.
  modifyFile(rel: string, content: string): string {
    if (!this.config.tools.allowFileModification)
      throw new Error("File modification disabled");
    this.assertNotExcluded(rel, "modify_file");
    const before = this.getEffectiveText(rel);
    if (before === undefined)
      throw new Error(`modify_file: file not found: ${rel}`);
    const key = this.norm(rel);
    this.overlay.set(key, content);
    this.tracker.log({
      type: "file_modify",
      path: key,
      details: { before, after: content },
      status: "pending",
    });
    return `Staged update: ${key}`;
  }
//used to delete file in the codebase. It first checks if file modification is allowed based 
// on the AgentConfig. Then, it verifies that the file is not excluded and retrieves the current 
// content of the file. If the file does not exist, it throws an error. 
// Finally, it removes the file from the overlay, adds it to the deleted set, 
// logs the action using the ActionTracker, and returns a message indicating that the deletion
//  has been staged.
  deleteFile(rel: string): string {
    if (!this.config.tools.allowFileModification)
      throw new Error("File deletion disabled");
    this.assertNotExcluded(rel, "delete_file");
    const before = this.getEffectiveText(rel);
    if (before === undefined)
      throw new Error(`delete_file: file not found: ${rel}`);
    const key = this.norm(rel);
    this.overlay.delete(key);
    this.deleted.add(key);
    this.tracker.log({
      type: "file_delete",
      path: key,
      details: { before },
      status: "pending",
    });
    return `Staged delete: ${key}`;
  }
  //it is different from createFile in that it is used to create a new folder (directory) specified by a relative path (rel). It first checks if folder creation is allowed based on the AgentConfig. Then, it verifies that the folder is not excluded. If the folder is allowed, it logs the action using the ActionTracker and returns a message indicating that the folder creation has been staged.
  createFolder(rel: string): string {
    if (!this.config.tools.allowFolderCreation)
      throw new Error("Folder creation disabled");
    this.assertNotExcluded(rel, "create_folder");
    const key = this.norm(rel);
    this.tracker.log({
      type: "folder_create",
      path: key,
      details: { after: key },
      status: "pending",
    });
    return `Staged folder: ${key}`;
  }
  //used to list the files and directories within a specified relative path (rel). It first checks if the path is excluded based on the excludePatterns in the AgentConfig. If the path is not excluded, it resolves the absolute path and checks if it exists. If it does, it recursively walks through the directory structure (if recursive is true) and collects the file and directory names. The results are sorted and logged using the ActionTracker before being returned as a string.
  listFiles(rel: string, recursive: boolean): string {
    this.assertNotExcluded(rel, "list_files");
    const abs = this.resolveSafe(rel);
    if (!fs.existsSync(abs)) throw new Error(`list_files: not found: ${rel}`);

    const lines: string[] = [];
    const walk = (dir: string, prefix: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        const relP = path.relative(this.config.codebasePath, full);
        if (this.excluded(relP)) continue;
        if (ent.isDirectory()) {
          lines.push(`${prefix}${ent.name}/`);
          if (recursive) walk(full, `${prefix}${ent.name}/`);
        } else {
          lines.push(`${prefix}${ent.name}`);
        }
      }
    };
    if (fs.statSync(abs).isDirectory()) walk(abs, "");
    else lines.push(path.relative(this.config.codebasePath, abs));
    const out = lines.sort().join("\n");
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rel),
      details: { after: out, toolName: "list_files" },
      status: "executed",
    });
    return out || "(empty)";
  }
  //it is used to search for files within a specified root relative path (rootRel) that match a given glob pattern (globPattern). Optionally, it can also filter the results based on a content query (contentQuery). It first checks if the root path is excluded based on the excludePatterns in the AgentConfig. If not excluded, it resolves the absolute path and checks if it exists. It then recursively walks through the directory structure, matching files against the glob pattern and content query. The results are collected, sorted, and logged using the ActionTracker before being returned as a string.
  searchFiles(
    rootRel: string,
    globPattern: string,
    contentQuery?: string,
  ): string {
    this.assertNotExcluded(rootRel, "search_files");
    const rootAbs = this.resolveSafe(rootRel);
    if (!fs.existsSync(rootAbs))
      throw new Error(`search_files: root not found: ${rootRel}`);

    const results: string[] = [];
    const regexFromGlob = (g: string): RegExp => {
      const escaped = g
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "§§")
        .replace(/\*/g, "[^/\\\\]*")
        .replace(/§§/g, ".*")
        .replace(/\?/g, ".");
      return new RegExp(`^${escaped}$`, "i");
    };
    const nameRe = regexFromGlob(globPattern.replace(/\\/g, "/"));

    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const relP = path
          .relative(this.config.codebasePath, full)
          .split(path.sep)
          .join("/");
        if (this.excluded(relP)) continue;
        if (ent.isDirectory()) walk(full);
        else if (nameRe.test(relP) || nameRe.test(ent.name)) {
          if (contentQuery) {
            if (!isProbablyTextFile(full)) continue;
            const text = fs.readFileSync(full, "utf8");
            if (!text.includes(contentQuery)) continue;
          }
          results.push(relP);
        }
      }
    };

    if (fs.statSync(rootAbs).isDirectory()) walk(rootAbs);
    else {
      const relP = path
        .relative(this.config.codebasePath, rootAbs)
        .split(path.sep)
        .join("/");
      results.push(relP);
    }

    const out = [...new Set(results)].sort().join("\n");
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rootRel),
      details: { after: out || "(no matches)", toolName: "search_files" },
      status: "executed",
    });
    return out || "(no matches)";
  }
  //ye hame codebase ko analyze karne ke liye use hota h. It takes a relative path (rootRel) as input and analyzes the codebase starting from that path. It counts the number of files and directories within the specified root path, excluding any paths that match the excludePatterns in the AgentConfig. The results are logged using the ActionTracker and returned as a summary string indicating the number of files and directories found.
  analyzeCodebase(rootRel: string): string {
    const rootAbs = this.resolveSafe(rootRel);
    if (!fs.existsSync(rootAbs))
      throw new Error(`analyze_codebase: not found: ${rootRel}`);

    let files = 0;
    let dirs = 0;
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const relP = path.relative(this.config.codebasePath, full);
        if (this.excluded(relP)) continue;
        if (ent.isDirectory()) {
          dirs++;
          walk(full);
        } else {
          files++;
        }
      }
    };
    if (fs.statSync(rootAbs).isDirectory()) walk(rootAbs);
    else files = 1;

    const summary = `Files: ${files} | Directories: ${dirs}`;
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rootRel),
      details: { after: summary, toolName: "analyze_codebase" },
      status: "executed",
    });
    return summary;
  }
  //queue shell use hota hai for shell command execution. It takes a shell command as input and checks if shell execution is allowed based on the AgentConfig. If allowed, it logs the action using the ActionTracker with the command details and returns a message indicating that the shell command has been queued for execution.
  queueShell(command: string): string {
    if (!this.config.tools.allowShellExecution)
      throw new Error("Shell execution disabled");
    this.tracker.log({
      type: "tool_execute",
      path: "shell",
      details: { command, toolName: "execute_shell" },
      status: "pending",
    });
    return `Shell queued: ${command}`;
  }
  //skill roots basically for ai hai matlab ye function skill roots ko return karta h. It retrieves the skill roots from the environment variable SKILLS_DIRS, if set, and adds them to an array. It also includes default skill root paths based on the user's home directory. The resulting array of skill root paths is returned.
  skillRoots(): string[] {
    const extra =
      process.env.SKILLS_DIRS?.split(/[;]/)
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    return [
      ...extra,
      path.join(homedir(), ".cursor/skills-cursor"),
      path.join(homedir(), ".claude/skills"),
    ];
  }
  //it is used to list the skills available in the skill roots. It iterates through the skill roots, checking if each root exists. If it does, it recursively walks through the directory structure, looking for files named "SKILL.md". The paths of these skill files are collected, sorted, and logged using the ActionTracker before being returned as a string.
  listSkills(): string {
    const lines: string[] = [];
    for (const root of this.skillRoots()) {
      if (!fs.existsSync(root)) continue;
      const walk = (dir: string) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) walk(full);
          else if (ent.name === "SKILL.md") lines.push(full);
        }
      };
      walk(root);
    }
    const out = lines.sort().join("\n");
    this.tracker.log({
      type: "code_analysis",
      path: "skills",
      details: { after: out || "(none)", toolName: "list_skills" },
      status: "executed",
    });
    return out || "(none)";
  }
  //it is read skill function basically for reading skill file. It takes a skill path as input and checks if the skill file is within the allowed skill roots. If the skill file is allowed, it reads the content of the skill file as a UTF-8 string, logs the action using the ActionTracker, and returns the content.
  readSkill(skillPath: string): string {
    const abs = path.isAbsolute(skillPath)
      ? path.normalize(skillPath)
      : path.normalize(path.resolve(this.config.codebasePath, skillPath));
    const allowed = this.skillRoots().some((root) => {
      const r = path.resolve(root);
      return abs === r || abs.startsWith(r + path.sep);
    });
    if (!allowed) throw new Error("read_skill: outside skill roots");
    const text = fs.readFileSync(abs, "utf8");
    this.tracker.log({
      type: "code_analysis",
      path: abs,
      details: { after: text, toolName: "read_skill" },
      status: "executed",
    });
    return text;
  }
  //it is used to apply the approved actions from the ActionTracker to the actual codebase. 
  // It iterates through the logged actions, checking for approved folder creation, 
  // file creation/modification/deletion, and tool execution actions. 
  // For each approved action, it performs the corresponding operation on the file system 
  // (creating folders, writing files, deleting files, executing shell commands). 
  // Any errors encountered during these operations are collected and returned as 
  // an array of error messages.
  //for example, if a folder creation action is approved, it will create the folder on the file system.
  applyApprovedFromTracker(): { errors: string[] } {
    const errors: string[] = [];
    const all = [...this.tracker.getActions()];

    for (const a of all.filter(
      (x) => x.type === "folder_create" && x.status === "approved",
    )) {
      try {
        fs.mkdirSync(this.resolveSafe(a.path), { recursive: true });
      } catch (e) {
        errors.push(String(e));
      }
    }

    const fileOps = all
      .filter(
        (a) =>
          (a.type === "file_create" ||
            a.type === "file_modify" ||
            a.type === "file_delete") &&
          a.status === "approved",
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const lastByPath = new Map<string, ActionLog>();
    for (const a of fileOps) lastByPath.set(this.norm(a.path), a);

    for (const [p, a] of lastByPath) {
      try {
        if (a.type === "file_delete")
          fs.rmSync(this.resolveSafe(p), { force: true });
        else {
          const target = this.resolveSafe(p);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, a.details.after ?? "", "utf8");
        }
      } catch (e) {
        errors.push(String(e));
      }
    }

    for (const a of all.filter(
      (x) => x.type === "tool_execute" && x.status === "approved",
    )) {
      const cmd = a.details.command;
      if (!cmd) continue;
      const r = spawnSync(cmd, {
        shell: true,
        cwd: this.config.codebasePath,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      if (r.status && r.status !== 0)
        errors.push(`shell exit ${r.status}: ${cmd}`);
    }

    return { errors };
  }
  //it is used to clear the staging area for file modifications and deletions. It clears the overlay map, which stores the modified content of files, and the deleted set, which tracks the paths of deleted files. This effectively resets the state of the ToolExecutor, removing any staged changes that have not yet been applied to the codebase.
  clearStaging(): void {
    this.overlay.clear();
    this.deleted.clear();
  }
}
