# Agent Guide

Quick reference for AI agents working on this codebase.

**⚠️ CRITICAL: When you make ANY code changes, you MUST update the relevant documentation files (README.md, CONFIGURATION.md, DEVELOPMENT.md, MIGRATION_RULES.md, CHANGELOG.md, or this file). Documentation updates are NOT optional.**

## What This Tool Is

**vue3-migration-tool** - Published to npm, used via `npm install -g vue3-migration-tool` or `npx vue3-migration-tool`.

An AI-powered CLI that automates Vue 2 → Vue 3 migrations:
- Updates dependencies (Vue, Router, Vuex, Vuetify, etc.)
- AI codemods for Vue SFC transformations using OpenAI
- Multi-step interactive workflow with granular control

**Tech stack:** TypeScript ESM, Commander.js CLI, OpenAI API integration.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | CLI entry (Commander setup, flags) |
| `src/runner.ts` | Step orchestration and workflow |
| `src/core/types.ts` | TypeScript types (RunContext, Step) |
| `src/core/ai.ts` | OpenAI integration, rules extraction |
| `src/steps/deps-rules.ts` | Data-driven dependency update rules |
| `src/steps/ai-codemods.ts` | AI codemod execution logic |
| `MIGRATION_RULES.md` | AI prompt rules (shipped with package) |

## Architecture Quick Look

**Entry point:** `src/index.ts` defines two commands:
- `vue3-migrate` - Main workflow (preflight → scan → update deps → offer AI codemods)
- `vue3-migrate ai [targets]` - Direct AI codemods subcommand

**Steps system:** Each migration step implements:
```typescript
type Step = {
  name: string;
  description: string;
  run: (ctx: RunContext) => Promise<void>;
  optional?: boolean;
  shouldRun?: (ctx: RunContext) => boolean | Promise<boolean>;
};
```

**Dependency rules:** Data-driven in `deps-rules.ts`:
```typescript
type DepRule = {
  name: string;                 // Package name
  action: "set" | "remove" | "replace" | "warn";
  version?: string;             // Target version
  requirePresence?: boolean;    // Only update if exists (default: true)
};
```

**AI codemods:** Send file + context + MIGRATION_RULES.md to OpenAI, validate syntax, apply changes.

## Rules for AI Agents

### Must Do

1. **Read first** - Always use Read tool before modifying files
2. **Minimal edits** - Only change what's explicitly requested
3. **ESM imports** - Use `.js` extensions (e.g., `import { foo } from "./bar.js"`)
4. **Type safety** - Add types to `core/types.ts`, use `RunContext` for step functions
5. **Update documentation** - ALWAYS update relevant .md files when making code changes:
   - `README.md` - User-facing features, CLI flags, usage examples
   - `CONFIGURATION.md` - New env vars or config options
   - `DEVELOPMENT.md` - Architecture changes, new patterns
   - `MIGRATION_RULES.md` - AI prompt rules and patterns
   - `CHANGELOG.md` - All changes with version bumps
   - `AGENTS.md` - Guidelines or key file changes

### Must Not Do

1. **Don't duplicate** - Check existing rules in `deps-rules.ts` before adding
2. **Don't over-engineer** - No unnecessary abstractions or features
3. **Don't break ESM** - All imports need `.js` extensions
4. **Don't skip safety** - Keep backups, git checks, `--dry-run` support
5. **Don't create unnecessary files** - Edit existing files when possible

### Common Tasks

**Add dependency rule:**
```typescript
// In src/steps/deps-rules.ts
{
  name: "package-name",
  action: "set",
  version: "^1.0.0",
  reason: "Short explanation",
  requirePresence: true  // Only update if already installed
}
```

**Add migration step:**
1. Create step in `src/steps/new-step.ts`
2. Register in `allSteps` array in `src/runner.ts`
3. Set `optional: true` if non-critical

**Modify AI prompts:**
- **Rules:** Edit `MIGRATION_RULES.md`
- **System prompt:** Edit `src/core/ai.ts` (lines ~180-222)
- **Smart extraction:** Edit `extractSmartRules()` in `src/core/ai.ts`

**Test locally:**
```bash
npm run build
cd /path/to/test-project
node /path/to/tool/dist/index.js --dry-run
```

## Project Context

**Published package:** Available on npm as `vue3-migration-tool`
**Binary:** `vue3-migrate` (via `package.json` bin field)
**Distribution:** `dist/` folder + `MIGRATION_RULES.md` shipped with package

**Key dependencies:**
- `commander`: CLI framework
- `execa`: Shell execution
- `chalk`: Terminal colors
- `@vue/compiler-sfc`: Vue syntax validation
- `@babel/parser`: JS/TS parsing
- `prettier`: Code formatting

## More Details

- **User docs:** See `README.md`
- **Configuration:** See `CONFIGURATION.md`
- **Development:** See `DEVELOPMENT.md`
- **Version history:** See `CHANGELOG.md`

## Quick Debugging

```bash
# Test with dry-run
vue3-migrate --dry-run

# Test AI codemods only
vue3-migrate ai src/App.vue --mode report

# Use better model
export OPENAI_MODEL=gpt-4o

# Full rules mode (no smart extraction)
export AI_RULES_MODE=full
```
