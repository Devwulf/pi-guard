import type { Action } from "./types.ts";

/**
 * Check if `needle` tokens appear in order within `haystack`.
 * Used for bash command matching where rule tokens must appear in order,
 * but extra flags or positional args anywhere in the sequence are permitted.
 */
export function isSubsequence(needle: string[], haystack: string[]): boolean {
  let ni = 0;
  for (let hi = 0; hi < haystack.length && ni < needle.length; hi++) {
    if (haystack[hi] === needle[ni]) ni++;
  }
  return ni === needle.length;
}

/**
 * Match a glob pattern against a string.
 * - `*` matches anything except `/`
 * - `**` matches anything including `/`
 * - `?` matches single character
 * - `~` at start expands to home directory
 */
export function globMatch(pattern: string, input: string): boolean {
  // Expand ~ at the start
  if (pattern.startsWith("~")) {
    const home = process.env.HOME ?? "";
    pattern = home + pattern.slice(1);
  }
  if (input.startsWith("~")) {
    const home = process.env.HOME ?? "";
    input = home + input.slice(1);
  }

  // Convert glob pattern to regex
  let regex = "^";
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i]!;
    if (char === "*" && pattern[i + 1] === "*") {
      // ** matches anything including /
      regex += ".*";
      i += 2;
    } else if (char === "*") {
      // * matches anything except /
      regex += "[^/]*";
      i++;
    } else if (char === "?") {
      // ? matches single character
      regex += ".";
      i++;
    } else if (char === "[" ) {
      // Character class
      let j = i + 1;
      while (j < pattern.length && pattern[j] !== "]") {
        j++;
      }
      regex += pattern.slice(i, j + 1);
      i = j + 1;
    } else {
      // Escape regex special characters
      if (/[.^$+{}()|\\]/.test(char)) {
        regex += "\\" + char;
      } else {
        regex += char;
      }
      i++;
    }
  }
  regex += "$";

  try {
    return new RegExp(regex).test(input);
  } catch {
    return false;
  }
}

/**
 * Resolve the action for a bash command against a rules map.
 *
 * Rules are evaluated in insertion order; last match wins.
 * The special pattern "*" matches any command.
 *
 * Matching uses subsequence logic:
 * - "git" → matches all git commands (base command match)
 * - "git status" → matches `git status`, `git status --short`, etc.
 * - "git branch --show-current" → matches `git branch --show-current`,
 *   `git branch -v --show-current`, etc.
 *
 * Returns undefined if no rule matches.
 */
export function resolveBashAction(
  commandName: string,
  commandArgs: string[],
  rules: Record<string, Action>,
): Action | undefined {
  let result: Action | undefined;

  for (const [pattern, action] of Object.entries(rules)) {
    if (pattern === "*") {
      result = action;
      continue;
    }

    const tokens = pattern.split(" ");
    const patternName = tokens[0]!;
    const patternArgs = tokens.slice(1);

    if (patternName !== commandName) continue;

    if (patternArgs.length === 0 || isSubsequence(patternArgs, commandArgs)) {
      result = action;
    }
  }

  return result;
}

/**
 * Resolve the action for a glob-based tool (read, edit, write) against a rules map.
 *
 * Rules are evaluated in insertion order; last match wins.
 * The special pattern "*" matches any path.
 *
 * Returns undefined if no rule matches.
 */
export function resolveGlobAction(
  input: string,
  rules: Record<string, Action>,
): Action | undefined {
  let result: Action | undefined;

  for (const [pattern, action] of Object.entries(rules)) {
    if (pattern === "*") {
      result = action;
      continue;
    }

    if (globMatch(pattern, input)) {
      result = action;
    }
  }

  return result;
}

/**
 * Resolve the action for an exact-match tool against a rules map.
 *
 * Rules are evaluated in insertion order; last match wins.
 * The special pattern "*" matches any value.
 *
 * Returns undefined if no rule matches.
 */
export function resolveExactAction(
  input: string,
  rules: Record<string, Action>,
): Action | undefined {
  let result: Action | undefined;

  for (const [pattern, action] of Object.entries(rules)) {
    if (pattern === "*") {
      result = action;
      continue;
    }

    if (pattern === input) {
      result = action;
    }
  }

  return result;
}