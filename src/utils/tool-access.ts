// These annotations follow the MCP spec so clients can ask before a call that changes the account,
// and GARMIN_READ_ONLY hides those tools entirely.

export const WRITE_TOOLS: ReadonlySet<string> = new Set([
  "create_running_workout",
  "schedule_workout",
  "unschedule_workout",
  "delete_workout"
]);

export const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set([
  "unschedule_workout",
  "delete_workout"
]);

export function isReadOnlyMode(env: Record<string, string | undefined>): boolean {
  return /^(1|true|yes)$/i.test(env.GARMIN_READ_ONLY ?? "");
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export function annotationsFor(name: string): ToolAnnotations {
  if (!WRITE_TOOLS.has(name)) {
    return { readOnlyHint: true, openWorldHint: true };
  }
  return {
    readOnlyHint: false,
    destructiveHint: DESTRUCTIVE_TOOLS.has(name),
    idempotentHint: false,
    openWorldHint: true
  };
}

export function applyToolAccess<T extends { name: string }>(
  tools: T[],
  env: Record<string, string | undefined>
): Array<T & { annotations: ToolAnnotations }> {
  const filteredTools = isReadOnlyMode(env)
    ? tools.filter(tool => !WRITE_TOOLS.has(tool.name))
    : tools;

  return filteredTools.map(tool => ({
    ...tool,
    annotations: annotationsFor(tool.name)
  }));
}