import { createTwoFilesPatch } from "diff";
import type { ActionLog } from "./types";

export function formatPatch(
  filePath: string,
  before: string,
  after: string,
): string {
  //this is a function that takes a file path, a string representing the content of the file before changes, and a string representing the content of the file after changes. It returns a string representing the patch between the two versions of the file.
  //context is set to 3, which means that the patch will include 3 lines of context before and after each change.
  return createTwoFilesPatch(filePath, filePath, before, after, "", "", {
    context: 3,
  });
}
//in easy language, this function takes a file path and the content of the file before and after changes, and it generates a patch that shows the differences between the two versions of the file. The patch includes 3 lines of context before and after each change to help understand the changes better.
export function composeBeforeAfter(sorted: ActionLog[]): {
  before: string;
  after: string;
} {
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (last.type === "file_delete")
    return { before: last.details.before ?? "", after: "" };
  const before =
    first.type === "file_create" ? "" : (first.details.before ?? "");
  const after = last.details.after ?? "";
  return { before, after };
}
