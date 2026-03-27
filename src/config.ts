import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { GuardConfig, Matchers, Action, ToolRules, Rules } from "./types.ts";

const AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
const SETTINGS_PATH = path.join(AGENT_DIR, "settings.json");

/** Built-in matchers for core tools. */
export const DEFAULT_MATCHERS: Matchers = {
  bash: { param: "command", type: "bash" },
  read: { param: "path", type: "glob" },
  edit: { param: "path", type: "glob" },
  write: { param: "path", type: "glob" },
};

/** Default rules - permissive for reading, restrictive for writing. */
export const DEFAULT_RULES: Record<string, ToolRules> = {
  bash: {
    "*": "ask",
    cat: "allow",
    cd: "allow",
    echo: "allow",
    find: "allow",
    grep: "allow",
    head: "allow",
    ls: "allow",
    pwd: "allow",
    rg: "allow",
    "git blame": "allow",
    "git branch --show-current": "allow",
    "git diff": "allow",
    "git log": "allow",
    "git show": "allow",
    "git status": "allow",
  },
  read: {
    "*": "allow",
    "*.env": "deny",
    "*.pem": "deny",
  },
  edit: {
    "*": "ask",
  },
  write: {
    "*": "ask",
  },
};

const DEFAULT_CONFIG: GuardConfig = {
  enabled: true,
  matchers: DEFAULT_MATCHERS,
  rules: DEFAULT_RULES,
};

const SAFE_FALLBACK_CONFIG: GuardConfig = {
  enabled: true,
  rules: {},
};

interface LoadedConfigResult {
  config: GuardConfig;
  warning?: string;
}

export function buildEffectiveRules(
  userRules: Rules,
  projectRules: Rules,
  sessionRules: Rules,
  envRules: Rules | undefined,
): Rules {
  // Handle the case where rules is a single action (applies to all tools)
  if (typeof userRules === "string" || typeof projectRules === "string" || typeof sessionRules === "string" || typeof envRules === "string") {
    // If any layer is a single action, that wins
    if (typeof envRules === "string") return envRules;
    if (typeof sessionRules === "string") return sessionRules;
    if (typeof projectRules === "string") return projectRules;
    if (typeof userRules === "string") return userRules;
  }

  // Merge object-based rules
  const merged: Record<string, ToolRules> = { ...DEFAULT_RULES };

  for (const layer of [userRules, projectRules, sessionRules, envRules]) {
    if (!layer || typeof layer === "string") continue;
    for (const [tool, rules] of Object.entries(layer)) {
      if (typeof rules === "string") {
        merged[tool] = rules;
      } else {
        merged[tool] = { ...merged[tool] as Record<string, Action>, ...rules };
      }
    }
  }

  return merged;
}

/** Load project-level guard config from .pi/settings.json in the given directory. */
function loadProjectConfig(cwd: string): LoadedConfigResult | null {
  const projectSettingsPath = path.join(cwd, ".pi", "settings.json");
  if (!fs.existsSync(projectSettingsPath)) {
    return null;
  }
  try {
    const data = fs.readFileSync(projectSettingsPath, "utf-8");
    const parsed = JSON.parse(data);
    const result = getGuardConfigFromSettings(parsed);
    return result;
  } catch {
    return {
      config: { ...SAFE_FALLBACK_CONFIG },
      warning: "Failed to parse project .pi/settings.json; using safe fallback.",
    };
  }
}

export function validateToolRules(input: unknown): { rules: Record<string, Action>; warnings: string[] } {
  const warnings: string[] = [];
  const rules: Record<string, Action> = {};

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { rules, warnings: ['rules must be an object mapping patterns to "allow", "ask", or "deny"'] };
  }

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof key === "string" && key.trim().length > 0 && (value === "allow" || value === "ask" || value === "deny")) {
      rules[key] = value;
    } else {
      warnings.push(`Invalid rule: "${key}" -> "${value}"`);
    }
  }

  return { rules, warnings };
}

export function validateLoadedGuardConfig(input: unknown): LoadedConfigResult {
  if (!input || typeof input !== "object") {
    return {
      config: { ...SAFE_FALLBACK_CONFIG },
      warning: "Invalid guard config shape; using safe fallback (enabled=true, rules={}).",
    };
  }

  const cfg = input as Record<string, unknown>;
  const warnings: string[] = [];

  let enabled = SAFE_FALLBACK_CONFIG.enabled;
  if (typeof cfg.enabled === "boolean") {
    enabled = cfg.enabled;
  } else if (cfg.enabled !== undefined) {
    warnings.push("enabled must be a boolean");
  }

  let matchers: Matchers | undefined = DEFAULT_MATCHERS;
  if (cfg.matchers !== undefined) {
    if (cfg.matchers && typeof cfg.matchers === "object" && !Array.isArray(cfg.matchers)) {
      const validMatchers: Matchers = {};
      for (const [tool, matcher] of Object.entries(cfg.matchers as Record<string, unknown>)) {
        if (
          matcher &&
          typeof matcher === "object" &&
          typeof (matcher as Record<string, unknown>).param === "string" &&
          ["bash", "glob", "exact"].includes((matcher as Record<string, unknown>).type as string)
        ) {
          validMatchers[tool] = {
            param: (matcher as Record<string, unknown>).param as string,
            type: (matcher as Record<string, unknown>).type as "bash" | "glob" | "exact",
          };
        } else {
          warnings.push(`Invalid matcher for tool "${tool}"`);
        }
      }
      matchers = validMatchers;
    } else {
      warnings.push("matchers must be an object mapping tool names to matcher configs");
    }
  }

  let rules: Rules = {};
  if (cfg.rules !== undefined) {
    if (typeof cfg.rules === "string" && (cfg.rules === "allow" || cfg.rules === "ask" || cfg.rules === "deny")) {
      rules = cfg.rules;
    } else if (cfg.rules && typeof cfg.rules === "object" && !Array.isArray(cfg.rules)) {
      const validRules: Record<string, ToolRules> = {};
      for (const [tool, toolRules] of Object.entries(cfg.rules as Record<string, unknown>)) {
        if (typeof toolRules === "string" && (toolRules === "allow" || toolRules === "ask" || toolRules === "deny")) {
          validRules[tool] = toolRules;
        } else if (toolRules && typeof toolRules === "object" && !Array.isArray(toolRules)) {
          const { rules: validated, warnings: toolWarnings } = validateToolRules(toolRules);
          validRules[tool] = validated;
          warnings.push(...toolWarnings.map(w => `Tool "${tool}": ${w}`));
        } else {
          warnings.push(`Invalid rules for tool "${tool}"`);
        }
      }
      rules = validRules;
    } else {
      warnings.push('rules must be a single action ("allow"/"ask"/"deny") or an object mapping tool names to rules');
    }
  }

  if (warnings.length > 0) {
    return {
      config: { enabled, matchers, rules },
      warning: `Invalid guard config fields (${warnings.join("; ")}); using safe values for invalid fields.`,
    };
  }

  return { config: { enabled, matchers, rules } };
}

export function getGuardConfigFromSettings(input: unknown): LoadedConfigResult {
  if (!input || typeof input !== "object") {
    return { config: DEFAULT_CONFIG };
  }

  const settings = input as Record<string, unknown>;

  if (!Object.hasOwn(settings, "guard")) {
    return { config: DEFAULT_CONFIG };
  }

  return validateLoadedGuardConfig(settings.guard);
}

/** Load environment rules from PI_GUARD env var. */
function loadEnvRules(): Rules | undefined {
  const env = process.env.PI_GUARD;
  if (!env) return undefined;

  try {
    const parsed = JSON.parse(env);
    if (typeof parsed === "string" && (parsed === "allow" || parsed === "ask" || parsed === "deny")) {
      return parsed;
    }
    if (typeof parsed === "object" && parsed !== null) {
      // Validate it's a valid rules object
      const result = validateLoadedGuardConfig({ rules: parsed });
      if (result.config.rules) {
        return result.config.rules;
      }
    }
  } catch {
    // Silently ignore invalid env var
  }

  return undefined;
}

export function loadConfig(): LoadedConfigResult {
  const envRules = loadEnvRules();

  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const data = fs.readFileSync(SETTINGS_PATH, "utf-8");
      const parsed = JSON.parse(data);
      const result = getGuardConfigFromSettings(parsed);

      // Merge env rules if present
      if (envRules) {
        result.config = {
          ...result.config,
          rules: buildEffectiveRules(
            result.config.rules,
            {},
            {},
            envRules,
          ),
        };
      }

      return result;
    } catch {
      return {
        config: { ...SAFE_FALLBACK_CONFIG, rules: envRules ?? SAFE_FALLBACK_CONFIG.rules },
        warning: "Failed to parse settings.json; using safe fallback (enabled=true, rules={}).",
      };
    }
  }

  return {
    config: {
      ...DEFAULT_CONFIG,
      rules: envRules ? buildEffectiveRules(DEFAULT_CONFIG.rules, {}, {}, envRules) : DEFAULT_CONFIG.rules,
    },
  };
}

export function saveConfig(config: GuardConfig) {
  try {
    fs.mkdirSync(AGENT_DIR, { recursive: true });

    let settings: Record<string, unknown> = {};
    if (fs.existsSync(SETTINGS_PATH)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    }

    settings.guard = {
      enabled: config.enabled,
      ...(config.matchers && Object.keys(config.matchers).length > 0 && { matchers: config.matchers }),
      rules: config.rules,
    };

    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save guard config to settings.json", e);
  }
}

export { loadProjectConfig, DEFAULT_CONFIG };