pi-guard is a pi extension that adds permission gating for tools. It intercepts `tool_call` events and prompts the user before executing commands or file operations based on configurable rules.

**Default behavior:**
- `bash`: ask (except safe commands like ls, cat, git status/diff/log)
- `read`: allow (except *.env, *.pem)
- `edit`: ask
- `write`: ask

**Rule precedence (last match wins):** default → user config → project config → PI_GUARD env var → session rules

**Testing:** `npm test`
