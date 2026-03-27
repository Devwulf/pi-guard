import { parse as parseBash } from "unbash";
import type { Script } from "unbash";
import type { Matcher, MatcherType, Action, ToolCallInput } from "./types.ts";
import { resolveBashAction, resolveGlobAction, resolveExactAction } from "./matching.ts";
import { extractAllCommandsFromAST } from "./extract.ts";
import { getCommandName, getCommandArgs } from "./resolve.ts";

/** Extract the value to match from a tool call based on the matcher's param. */
export function extractInput(toolCall: ToolCallInput, matcher: Matcher): string | undefined {
  const value = toolCall[matcher.param];
  if (typeof value === "string") return value;
  return undefined;
}

/** Match a tool call against rules using the specified matcher type. */
export function matchWithMatcher(
  input: string,
  matcherType: MatcherType,
  rules: Record<string, Action>,
): Action | undefined {
  switch (matcherType) {
    case "bash":
      // For bash matching, we need to parse the command first
      // This is handled separately in the main hook due to complexity
      throw new Error("Bash matching requires parsed commands - use matchBashCall instead");
    case "glob":
      return resolveGlobAction(input, rules);
    case "exact":
      return resolveExactAction(input, rules);
  }
}

/** Bash-specific matching that parses the command and checks all extracted commands. */
export function matchBashCall(
  rawCmd: string,
  rules: Record<string, Action>,
): { action: Action | undefined; unauthorizedCommands: CommandInfo[] } {
  let ast: Script;
  try {
    ast = parseBash(rawCmd);
  } catch {
    return { action: undefined, unauthorizedCommands: [{ raw: rawCmd, name: "", args: [] }] };
  }

  const allCommands = extractAllCommandsFromAST(ast, rawCmd);
  if (allCommands.length === 0) {
    return { action: "allow", unauthorizedCommands: [] };
  }

  const unauthorizedCommands: CommandInfo[] = [];

  for (const cmd of allCommands) {
    const name = getCommandName(cmd);
    const args = getCommandArgs(cmd);
    const action = resolveBashAction(name, args, rules);
    if (action !== "allow") {
      unauthorizedCommands.push({ raw: cmd.source.slice(cmd.node.pos, cmd.node.end), name, args });
    }
  }

  if (unauthorizedCommands.length === 0) {
    return { action: "allow", unauthorizedCommands: [] };
  }

  return { action: undefined, unauthorizedCommands };
}

export interface CommandInfo {
  raw: string;
  name: string;
  args: string[];
}