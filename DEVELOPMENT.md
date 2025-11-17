# Development Guide

Guide for contributors and developers working on the Vue 2 → Vue 3 migration tool.

## Table of Contents

- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Development Setup](#development-setup)
- [Adding New Steps](#adding-new-steps)
- [Understanding the AI System](#understanding-the-ai-system)
- [Testing](#testing)
- [Contributing](#contributing)

## Architecture

### High-Level Overview

```
┌─────────────────┐
│   CLI (index.ts)│
│   Commander.js  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Runner         │
│  - Orchestrates │
│  - Filters steps│
│  - Handles flags│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Steps                              │
│  ┌──────────┐ ┌──────┐ ┌────────┐ │
│  │Preflight │→│ Scan │→│UpdateDeps│
│  └──────────┘ └──────┘ └────────┘ │
│                                     │
│  Optional: ┌──────────┐            │
│           │AI Codemods│            │
│           └──────────┘             │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Core Utilities │
│  - UI (banners) │
│  - PM detection │
│  - AI bridge    │
│  - Types        │
└─────────────────┘
```

### Design Principles

1. **Modularity**: Each step is independent and optional
2. **Detection Over Assumption**: Scan before modifying
3. **Safety First**: Dry run, backups, git checks
4. **Flexibility**: CLI flags for every option
5. **Progressive Enhancement**: Works without AI, better with it

## Project Structure

```
vue3-migration-tool/
├── src/
│   ├── core/              # Core utilities
│   │   ├── ai.ts          # OpenAI integration
│   │   ├── pm.ts          # Package manager detection
│   │   ├── types.ts       # TypeScript definitions
│   │   └── ui.ts          # Terminal UI helpers
│   ├── steps/             # Migration steps
│   │   ├── preflight.ts   # Git validation
│   │   ├── scan.ts        # Project detection
│   │   ├── update-deps.ts # Dependency updates
│   │   ├── ai-codemods.ts # AI transformations
│   │   └── codemods.ts    # AST-based transforms
│   ├── index.ts           # CLI entry point
│   └── runner.ts          # Step orchestration
├── dist/                  # Compiled output
├── MIGRATION_RULES.md     # AI prompt rules
├── package.json
└── tsconfig.json
```

## Development Setup

### Prerequisites

- Node.js 16+
- npm, yarn, or pnpm
- Git
- OpenAI API key (for testing AI features)

### Clone and Install

```bash
# Clone repository
git clone https://github.com/Tefik-Rudari/migration-tool-vue2-vue3.git
cd vue3-migration-tool

# Install dependencies
npm install

# Create .env for testing
echo "OPENAI_API_KEY=sk-..." > .env
```

### Development Commands

```bash
# Run in development mode (ts-node)
npm run dev

# Build TypeScript
npm run build

# Link for local testing
npm link

# Test on another project
cd /path/to/test-project
vue3-migrate --help
```

### Project Commands

```bash
# Build
npm run build

# Development run (no build)
npm run dev -- --help

# Clean dist
rm -rf dist/

# Rebuild
npm run build
```

## Adding New Steps

Steps are modular units of work that can be run independently.

### Step Interface

```typescript
// src/core/types.ts
export type Step = {
  name: string;                // Display name
  description: string;         // What it does
  run: (ctx: RunContext) => Promise<void>;
  optional?: boolean;          // Can be skipped
  shouldRun?: (ctx: RunContext) => boolean | Promise<boolean>;
};
```

### Creating a New Step

#### Example: Update Main Entry Point

**1. Create step file: `src/steps/update-main.ts`**

```typescript
import fs from "fs";
import path from "path";
import chalk from "chalk";
import type { RunContext } from "../core/types.js";

export async function updateMain(ctx: RunContext) {
  console.log(chalk.cyan("\n🚀 Updating main entry point…"));

  // Check if main.js/ts exists
  if (!ctx.scan?.hasMainJs) {
    console.log(chalk.yellow("⚠️  No main entry point found. Skipping."));
    return;
  }

  const mainPath = path.join(ctx.root, ctx.scan.hasMainJs);
  const content = fs.readFileSync(mainPath, "utf-8");

  // Detect Vue 2 pattern
  if (!content.includes("new Vue(")) {
    console.log(chalk.gray("ℹ️  Entry point already migrated or custom. Skipping."));
    return;
  }

  if (ctx.dryRun) {
    console.log(chalk.yellow("🧪 Dry run: would update main entry point"));
    return;
  }

  // Transform: new Vue() → createApp()
  let updated = content;

  // Add import
  updated = updated.replace(
    /import Vue from ['"]vue['"]/,
    "import { createApp } from 'vue'"
  );

  // Replace new Vue()
  updated = updated.replace(
    /new Vue\(([\s\S]*?)\)\.\$mount\(['"]#app['"]\)/,
    "createApp($1).mount('#app')"
  );

  // Write file
  fs.writeFileSync(mainPath, updated, "utf-8");
  console.log(chalk.green(`✅ Updated ${ctx.scan.hasMainJs}`));
}
```

**2. Register step in `src/runner.ts`**

```typescript
import { updateMain } from "./steps/update-main.js";

export async function runAll(ctx: RunContext) {
  const allSteps: Step[] = [
    { name: "Preflight", description: "Verify git state", run: preflight },
    { name: "Scan", description: "Detect project config", run: scan },
    { name: "Update Dependencies", description: "Update package.json", run: updateDeps },

    // Add new step
    {
      name: "Update Main Entry",
      description: "Migrate main.js to createApp()",
      run: updateMain,
      optional: true,
      shouldRun: (ctx) => !!ctx.scan?.hasMainJs // Only if main.js exists
    },
  ];
  // ... rest of runner logic
}
```

**3. Test the new step**

```bash
# Build
npm run build

# Test on a Vue 2 project
cd /path/to/vue2-project
vue3-migrate --only update-main-entry

# Or skip it
vue3-migrate --skip update-main-entry
```

### Step Best Practices

#### ✅ Do

- **Check context**: Use `ctx.scan` for project info
- **Handle dry run**: Check `ctx.dryRun` before writing
- **Log progress**: Use chalk for colored output
- **Create backups**: Before modifying critical files
- **Handle errors**: Try/catch with helpful messages
- **Skip gracefully**: Exit early if preconditions not met

#### ❌ Don't

- **Assume files exist**: Always check before reading
- **Modify without backup**: Use `package.backup.*.json` pattern
- **Ignore dry run**: Users expect preview mode to work
- **Silent failures**: Always log what happened
- **Hardcode paths**: Use `ctx.root` for absolute paths

### Optional Step Execution

Steps can be conditional:

```typescript
{
  name: "Update Vite Config",
  description: "Migrate vite.config for Vue 3",
  run: updateViteConfig,
  optional: true,
  shouldRun: (ctx) => ctx.scan?.buildTool === "vite"
}
```

**shouldRun logic:**
- Return `true`: Step will run
- Return `false`: Step skipped with message
- Async allowed: `async (ctx) => await checkSomething()`

## Understanding the AI System

The AI system uses OpenAI to transform Vue components.

### Architecture

```
┌──────────────────┐
│ ai-codemods.ts   │  Orchestrates file processing
│ - Finds files    │
│ - Estimates time │
│ - Handles retries│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ ai.ts            │  OpenAI API bridge
│ - Loads rules    │
│ - Builds prompt  │
│ - Calls API      │
│ - Parses response│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ MIGRATION_RULES  │  Guides AI transformations
│ - Patterns       │
│ - Examples       │
│ - Best practices │
└──────────────────┘
```

### How AI Transforms Work

**1. File Discovery**

```typescript
// src/steps/ai-codemods.ts
const files = await globby(targets, {
  gitignore: true,
  extensions: ['vue', 'ts', 'js']
});
```

**2. Load Migration Rules**

```typescript
// src/core/ai.ts
// Tries multiple paths
const possiblePaths = [
  ctx.rulesPath,                    // --rules flag
  process.env.MIGRATION_RULES_PATH, // env var
  path.resolve(process.cwd(), 'MIGRATION_RULES.md'), // project root
  path.resolve(__dirname, '../../MIGRATION_RULES.md') // built-in
];
```

**3. Build Prompt**

```typescript
const system = [
  `PROJECT RULES:\n${rulesText}`,
  'You are a senior Vue engineer...',
  'Update BOTH script and template...',
  // Specific migrations
].join('\n');

const user = `File: ${input.filePath}\n\n${input.code}`;
```

**4. Call OpenAI API**

```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  })
});
```

**5. Parse Response**

```typescript
// Extract code, confidence, rationale
const { code, rationale, confidence } = parseAIResponse(response);

// Validate syntax
if (!isValidVueFile(code)) {
  throw new Error('Invalid Vue syntax');
}
```

**6. Write File**

```typescript
if (ctx.dryRun) {
  console.log('Would write:', filePath);
} else {
  fs.writeFileSync(filePath, code, 'utf-8');
  if (ctx.aiCommit) {
    await execa('git', ['commit', '-m', `migrate: ${filePath}`]);
  }
}
```

### Customizing AI Behavior

#### Modify System Prompt

Edit `src/core/ai.ts`:

```typescript
const system = [
  rulesForPrompt ? `PROJECT RULES:\n${rulesForPrompt}` : '',
  'You are a senior Vue engineer...',

  // Add custom instructions
  'IMPORTANT: Always use our company composables:',
  '- useAuth() for authentication',
  '- useApiClient() for API calls',
  '- useNotify() for notifications',

  'Required migrations:',
  // ... existing rules
].filter(Boolean).join('\n\n');
```

#### Add New Model Providers

Currently supports OpenAI. To add others (Anthropic, Cohere, etc.):

**1. Create new file: `src/core/ai-anthropic.ts`**

```typescript
export async function aiRewriteFileAnthropic(
  ctx: RunContext,
  input: AIRewriteInput
): Promise<AIRewriteResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  // ... similar to openai implementation
}
```

**2. Add provider selection**

```typescript
// src/core/ai.ts
export async function aiRewriteFile(
  ctx: RunContext,
  input: AIRewriteInput
): Promise<AIRewriteResult | null> {
  const provider = process.env.AI_PROVIDER || 'openai';

  switch (provider) {
    case 'openai':
      return aiRewriteFileOpenAI(ctx, input);
    case 'anthropic':
      return aiRewriteFileAnthropic(ctx, input);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}
```

### Smart Rules Selection

To reduce token usage, the tool can send only relevant sections:

```typescript
// src/core/ai.ts
function extractSmartRules(rulesText: string, filePath: string): string {
  // Sections to always include
  const wantTitles = new Set([
    'Hard rules',
    'Vuetify 3 mappings',
    'v-model & emits mapping',
    // ...
  ]);

  // Parse markdown, filter sections
  const sections = parseMarkdownSections(rulesText);
  const filtered = sections.filter(s => wantTitles.has(s.title));

  return filtered.join('\n\n');
}
```

**To add file-type specific rules:**

```typescript
// Example: Include TypeScript rules only for .ts files
if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
  wantTitles.add('TypeScript & props hygiene');
}

// Include Vuex rules only if file mentions store
if (fileContent.includes('store') || fileContent.includes('Vuex')) {
  wantTitles.add('Vuex migration rules');
}
```

## Testing

### Manual Testing

```bash
# 1. Build the tool
npm run build

# 2. Link globally
npm link

# 3. Create a test Vue 2 project
mkdir test-project
cd test-project
npm init -y
npm install vue@2 vue-router@3 vuex@3

# 4. Create sample files
mkdir -p src/components
echo '<template><div>{{ msg }}</div></template>' > src/App.vue

# 5. Run tool
vue3-migrate --dry-run

# 6. Check output
cat package.json
```

### Testing Individual Steps

```bash
# Test scan only
vue3-migrate --only scan

# Test with custom rules
vue3-migrate ai src/App.vue --rules ./test-rules.md --dry-run
```

### Automated Testing

Currently manual. Future: Add Jest tests.

**Example test structure:**

```typescript
// tests/steps/scan.test.ts
import { scan } from '../src/steps/scan';
import { RunContext } from '../src/core/types';

describe('scan step', () => {
  it('detects Vue 2 project', async () => {
    const ctx: RunContext = {
      root: '/path/to/vue2-project',
      // ...
    };

    await scan(ctx);

    expect(ctx.scan?.vue).toMatch(/^2\./);
    expect(ctx.scan?.buildTool).toBe('vue-cli');
  });
});
```

### Testing AI Transformations

```bash
# Test with dry run
vue3-migrate ai src/components/Button.vue --dry-run --mode report

# Test with low confidence threshold
vue3-migrate ai src/ --min-confidence 0.95 --mode ask

# Test with custom rules
vue3-migrate ai src/ --rules ./test-rules.md --dry-run
```

## Contributing

### Getting Started

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/my-new-step
   ```
3. **Make changes**
4. **Test locally**
   ```bash
   npm run build
   npm link
   # Test on a real project
   ```
5. **Commit with clear messages**
   ```bash
   git commit -m "feat: add main.js update step"
   ```
6. **Push and create PR**

### Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new step for router migration
fix: handle missing package.json gracefully
docs: update README with new flags
refactor: extract common file operations
test: add tests for scan step
chore: update dependencies
```

### Pull Request Guidelines

**PR Title:** Clear and descriptive
```
feat: Add main.js entry point update step
```

**PR Description:**
- What: Describe the change
- Why: Explain the motivation
- How: Technical approach
- Testing: How you tested it

**Example:**

```markdown
## What
Adds a new step to automatically update main.js from Vue 2 (`new Vue()`) to Vue 3 (`createApp()`).

## Why
Currently users must manually update the entry point, which is error-prone and a common blocker.

## How
- Created `update-main.ts` step
- Detects `new Vue()` pattern
- Transforms to `createApp()`
- Updates imports
- Handles edge cases (render function, etc.)

## Testing
- Tested on 5 real Vue 2 projects
- All successfully migrated
- Dry run works correctly
- Skips if already migrated
```

### Code Style

- **TypeScript**: Use proper types, avoid `any`
- **Formatting**: Prettier (run `npm run format` if added)
- **Naming**: Descriptive variable names
- **Comments**: Explain "why", not "what"

### Adding Dependencies

1. **Check necessity**: Can we do without it?
2. **Check size**: Keep bundle small
3. **Check maintenance**: Actively maintained?
4. **Add to package.json**:
   ```bash
   npm install <package>
   ```
5. **Document usage**: Update README if user-facing

### Documentation

When adding features:
1. **Update README.md**: User-facing docs
2. **Update CONFIGURATION.md**: If adding config options
3. **Update this file**: If architectural changes
4. **Add JSDoc comments**: For public functions

Example:

```typescript
/**
 * Updates the main entry point from Vue 2 to Vue 3.
 *
 * Transforms:
 * - `new Vue()` → `createApp()`
 * - `import Vue` → `import { createApp }`
 * - `$mount('#app')` → `.mount('#app')`
 *
 * @param ctx - Migration context with project info
 * @returns Promise that resolves when complete
 */
export async function updateMain(ctx: RunContext): Promise<void> {
  // ...
}
```

## Architecture Decisions

### Why Commander.js?

- Industry standard CLI framework
- Subcommands support (`vue3-migrate ai`)
- Automatic help generation
- Type-safe with TypeScript

### Why Modular Steps?

- Users can skip irrelevant steps
- Easy to add new steps
- Testable in isolation
- Clear progress indication

### Why OpenAI?

- Best-in-class code understanding
- Handles complex transformations
- Contextual awareness
- Constantly improving

**Alternatives considered:**
- AST-based transforms: Too rigid, misses edge cases
- Regex: Fragile, error-prone
- Manual: Not scalable

### Why Include Migration Rules?

- Makes AI behavior predictable
- Easy to customize per project
- Sharable across teams
- Version controlled

## Future Improvements

### Planned Features

- [ ] Main.js/main.ts auto-update step
- [ ] Vue config / Vite config updates
- [ ] Router createRouter() migration
- [ ] Vuex createStore() migration
- [ ] Test file migrations
- [ ] Progress bar for AI codemods
- [ ] Confidence reporting summary
- [ ] Alternative AI providers (Anthropic, local LLMs)
- [ ] Automated testing suite
- [ ] VSCode extension

### Ideas Welcome

Open an issue with:
- Feature description
- Use case / motivation
- Proposed implementation (optional)

## Resources

- [Vue 3 Migration Guide](https://v3-migration.vuejs.org/)
- [Vuetify 3 Migration](https://vuetifyjs.com/en/getting-started/upgrade-guide/)
- [OpenAI API Docs](https://platform.openai.com/docs/api-reference)
- [Commander.js Docs](https://github.com/tj/commander.js)

## Questions?

- 💬 [Discussions](https://github.com/Tefik-Rudari/migration-tool-vue2-vue3/discussions)
- 🐛 [Issues](https://github.com/Tefik-Rudari/migration-tool-vue2-vue3/issues)
- 📧 Email: your-email@example.com
