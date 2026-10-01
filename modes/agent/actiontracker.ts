import type { ActionLog, ActionStatus } from "./types";
import { isMutationType } from "./types";

export class ActionTracker {
  private actions: ActionLog[] = [];
  log(
    //basically a function to log actions, it takes an entry of type ActionLog but omits the id and timestamp properties, which are optional in this case
    entry: Omit<ActionLog, "id" | "timestamp"> & {
      id?: string;
      timestamp?: Date;
    },
  ): ActionLog {
    const action: ActionLog = {
      id: entry.id || `action_${this.actions.length}`,
      timestamp: entry.timestamp || new Date(),
      type: entry.type,
      path: entry.path,
      details: { ...entry.details },
      status: entry.status,
      userApproved: entry.userApproved,
    };
    this.actions.push(action);
    return action;
  }
  getActions(): readonly ActionLog[] {
    return this.actions;
  }
  getPendingMutations(): ActionLog[] {
    return this.actions.filter(
      (action) => action.status === "pending" && isMutationType(action.type),
    );
  }
  updateStatus(id: string, status: ActionStatus, userApproved?: boolean): void {
    const a = this.actions.find((x) => x.id === id);
    if (!a) return;
    a.status = status;
    if (userApproved !== undefined) a.userApproved = userApproved;
  }
}
