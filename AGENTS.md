pi-guard is a pi extension that adds permission gating for tools. It intercepts `tool_call` events and prompts the user before executing commands or file operations based on configurable rules.

**Default behavior:** see `src/defaults.ts`

**Rule precedence (last match wins):** default → user config → project config → PI_GUARD env var → session rules

**Testing:** `npm run check` for static analysis (TypeScript), `npm test` for both checks and tests
