# Configuration Guide

Complete reference for configuring the Vue 2 → Vue 3 migration tool.

## Table of Contents

- [Environment Variables](#environment-variables)
- [OpenAI Configuration](#openai-configuration)
- [Migration Rules](#migration-rules)
- [Project Detection](#project-detection)
- [Advanced Options](#advanced-options)

## Environment Variables

All configuration can be done via environment variables or CLI flags.

### Required for AI Codemods

#### `OPENAI_API_KEY`

Your OpenAI API key. Required for AI-powered transformations.

```bash
# Linux/macOS
export OPENAI_API_KEY="sk-proj-..."

# Windows (PowerShell)
$env:OPENAI_API_KEY="sk-proj-..."

# .env file (recommended for projects)
OPENAI_API_KEY=sk-proj-...
```

**Get your key:** https://platform.openai.com/api-keys

**Security Notes:**
- ⚠️ **Never commit** `.env` files with API keys
- ✅ Add `.env` to `.gitignore`
- ✅ Use different keys for dev/prod
- ✅ Rotate keys periodically

### Optional Configuration

#### `OPENAI_MODEL`

Which OpenAI model to use for code transformations.

```bash
# Default (recommended for most projects)
export OPENAI_MODEL="gpt-4o-mini"

# Higher quality, slower, more expensive
export OPENAI_MODEL="gpt-4o"

# Legacy models
export OPENAI_MODEL="gpt-4-turbo"
```

**Model Comparison:**

| Model | Speed | Quality | Cost per 1M tokens | Best For |
|-------|-------|---------|-------------------|----------|
| `gpt-4o-mini` | ⚡⚡⚡ Fast | ⭐⭐⭐ Good | ~$0.15 input | Most projects |
| `gpt-4o` | ⚡⚡ Medium | ⭐⭐⭐⭐⭐ Excellent | ~$5 input | Complex codebases |
| `gpt-4-turbo` | ⚡⚡ Medium | ⭐⭐⭐⭐ Great | ~$10 input | Legacy option |

**Recommendations:**
- **Small projects (<50 files)**: `gpt-4o` for best quality
- **Medium projects (50-200 files)**: `gpt-4o-mini` for speed/cost balance
- **Large projects (200+ files)**: `gpt-4o-mini` with manual review
- **Critical components**: Use `gpt-4o` selectively on important files

#### `MIGRATION_RULES_PATH`

Path to your custom migration rules overlay file.

```bash
export MIGRATION_RULES_PATH="./my-migration-rules.md"
```

The built-in rules shipped with the package are always loaded first. This file is appended after the built-in rules so you can add project-specific conventions without replacing the generic base prompt.

**Alternative:** Use `--rules` CLI flag:
```bash
vue3-migrate --rules ./my-rules.md
```

#### `AI_RULES_MODE`

How much of the migration rules to send to the AI.

```bash
# Default: Smart selection (only relevant sections)
export AI_RULES_MODE="smart"

# Send entire rules file (more context, slower)
export AI_RULES_MODE="full"
```

**Smart Mode:**
- Selects relevant sections based on file type
- Reduces token usage (~70% smaller)
- Faster responses
- Recommended for most cases

**Full Mode:**
- Sends complete rules file
- More context for complex patterns
- Higher token cost
- Use when smart mode misses patterns

#### `AI_MAX_SOURCE_LINES`

Upper bound for how many lines of a file are sent to the AI. Files at or above this line count are skipped to keep prompts small.

```bash
# Default
export AI_MAX_SOURCE_LINES=800

# Increase only when you need to migrate very large components
export AI_MAX_SOURCE_LINES=1200
```

**Why set this?**
- Avoids slow, expensive prompts on very large SFCs
- Helps maintain higher confidence scores on the migrated output
- Keeps the CLI responsive when scanning big folders

## OpenAI Configuration

### Setting Up API Access

1. **Create Account**: https://platform.openai.com/signup
2. **Add Payment Method**: https://platform.openai.com/account/billing
3. **Generate API Key**: https://platform.openai.com/api-keys
4. **Set Usage Limits**: Recommended to prevent surprise bills

### Cost Estimation

Typical costs for migrating a Vue 2 project:

| Project Size | Files | Avg Cost (gpt-4o-mini) | Avg Cost (gpt-4o) |
|--------------|-------|------------------------|-------------------|
| Small | 10-50 | $0.50 - $2 | $15 - $60 |
| Medium | 50-200 | $2 - $8 | $60 - $240 |
| Large | 200-500 | $8 - $20 | $240 - $600 |
| Enterprise | 500+ | $20+ | $600+ |

**Factors affecting cost:**
- File size (larger files = more tokens)
- Complexity (complex patterns = more retries)
- Custom rules size (larger rules = more context)
- Model choice (gpt-4o is ~30x more expensive)

### Cost Optimization Tips

1. **Start Small**: Test on a few files first
```bash
vue3-migrate ai src/components/Button.vue --dry-run
```

2. **Use gpt-4o-mini by default**: Switch to gpt-4o only when needed
```bash
export OPENAI_MODEL="gpt-4o-mini"
```

3. **Filter files**: Only migrate files that need AI help
```bash
# Skip already-migrated files
vue3-migrate ai src/legacy-components/
```

4. **Smart Rules Mode**: Reduces token usage
```bash
export AI_RULES_MODE="smart"
```

5. **Set Line Guards**: Skip huge files that cost a lot
```bash
export AI_MAX_SOURCE_LINES=800   # skip sending very large files to the AI
vue3-migrate ai src/ --max-lines 400
```

6. **Batch by confidence**: Review low-confidence changes manually
```bash
vue3-migrate ai src/ --min-confidence 0.85
```

## Migration Rules

The tool uses a Markdown file to guide AI transformations.

### Built-in Rules

The package includes comprehensive rules covering:
- ✅ Vue 2 → Vue 3 core migrations
- ✅ Composition API patterns
- ✅ Vuetify 2 → 3 transformations
- ✅ Router & Vuex updates
- ✅ TypeScript best practices
- ✅ Common library updates

**Location:** `node_modules/vue3-migration-tool/MIGRATION_RULES.md`

### Rules Discovery

The tool builds the AI prompt from two sources:

1. **Built-in rules** (always loaded)
   ```
   node_modules/vue3-migration-tool/MIGRATION_RULES.md
   ```

2. **Optional custom overlay** via CLI flag
   ```bash
   vue3-migrate --rules ./custom-rules.md
   ```

3. **Optional custom overlay** via environment variable
   ```bash
   export MIGRATION_RULES_PATH="./custom-rules.md"
   ```

If both `--rules` and `MIGRATION_RULES_PATH` are provided, the CLI flag wins.

### Creating Custom Rules

#### Step 1: Create a Small Overlay File

```bash
# Keep this file focused on project-specific conventions
touch ./MIGRATION_RULES.md
```

#### Step 2: Add Custom Patterns

Edit `MIGRATION_RULES.md`:

```markdown
## Company-Specific Patterns

### Authentication Helpers

- Replace direct auth imports with `useAuth()` from `@/composables/useAuth`.

### API Client

- Use `useApiClient()` from `@/composables/useApiClient` instead of direct `axios` imports.
```

#### Step 3: Run With the Overlay

```bash
vue3-migrate ai src/ --rules ./MIGRATION_RULES.md
```

### Overlay Best Practices

- Keep the custom file short and project-specific.
- Use it for local conventions like auth, HTTP, i18n, analytics, store wrappers, or internal component adapters.
- Do not copy the entire built-in rules file unless you intentionally want to maintain a fork of the default guidance.
- When a custom overlay conflicts with the built-in defaults, the custom overlay should be considered authoritative.

#### Step 4: Test Rules

```bash
# Test on one file
vue3-migrate ai src/components/Auth.vue --dry-run --rules ./MIGRATION_RULES.md

# Review output
# If good, apply to all files
vue3-migrate ai src/ --rules ./MIGRATION_RULES.md
```

### Rules Best Practices

#### ✅ Do

- **Be specific**: Include exact code patterns
- **Show examples**: Before/after code blocks
- **Explain why**: Add context for complex changes
- **Prioritize**: Put most common patterns first
- **Test incrementally**: Validate on small files
- **Version control**: Track changes to rules file

#### ❌ Don't

- **Be vague**: "Update components" is not helpful
- **Conflicting rules**: Ensure patterns don't contradict
- **Too many rules**: Focus on project-specific patterns
- **Forget edge cases**: Handle null/undefined states
- **Skip validation**: Always test before bulk applying

### Example Custom Rules File

```markdown
# My Project Migration Rules

## Quick Reference
- Use `useAuth()` instead of `this.$auth`
- Use `useNotify()` instead of `this.$notify`
- Replace all `axios` with `useApiClient()`

## Authentication Pattern

Replace Vuex auth with composable:

Before:
```typescript
computed: {
  isAuthenticated() {
    return this.$store.getters['auth/isAuthenticated']
  }
}
```

After:
```typescript
import { useAuth } from '@/composables/useAuth'
const { isAuthenticated } = useAuth()
```

## Notification Pattern

Replace $notify plugin with composable:

Before:
```typescript
this.$notify.success('Saved!')
```

After:
```typescript
import { useNotify } from '@/composables/useNotify'
const notify = useNotify()
notify.success('Saved!')
```

## API Client Pattern

Replace axios with company client:

Before:
```typescript
import axios from 'axios'
const res = await axios.post('/api/users', data)
```

After:
```typescript
import { useApiClient } from '@/composables/useApiClient'
const api = useApiClient()
const res = await api.users.create(data)
```
```

## Project Detection

The tool automatically detects your project configuration.

### Package Manager

Detected by:
1. Lock files: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
2. Installed binaries: `npm`, `yarn`, `pnpm` in PATH
3. User prompt (if ambiguous)

**Override:**
```bash
# Not currently exposed via CLI
# Edit src/core/pm.ts if needed
```

### Build Tool

Detected by:
- **Vite**: `vite` in dependencies or `vite.config.js/ts` exists
- **Vue CLI**: `@vue/cli-service` in dependencies or `vue.config.js` exists
- **Webpack**: `webpack` in dependencies
- **Unknown**: None of the above

**Output example:**
```
🔧 Build tool: vite
```

### TypeScript

Detected by:
- `typescript` in dependencies
- `tsconfig.json` exists

**Output example:**
```
📘 TypeScript: Yes
```

### Entry Point

Searches for:
1. `src/main.ts`
2. `src/main.js`
3. `main.ts`
4. `main.js`

**Output example:**
```
🚪 Entry point: src/main.ts
```

### Dependencies

Scans `package.json` for:
- `vue` (version)
- `vue-router` (version)
- `vuex` (version)
- `vuetify` (version)
- Other Vue ecosystem packages

## Advanced Options

### Selective Step Execution

Control which migration steps run.

#### Skip Steps

```bash
# Skip preflight checks (not recommended)
vue3-migrate --skip preflight

# Skip dependency updates (manual update)
vue3-migrate --skip update-dependencies

# Skip multiple steps
vue3-migrate --skip preflight,update-dependencies
```

#### Run Only Specific Steps

```bash
# Only scan (no changes)
vue3-migrate --only scan

# Only update dependencies
vue3-migrate --only update-dependencies
```

**Available Steps:**
- `preflight`: Git validation
- `scan`: Project detection
- `update-dependencies`: Package.json updates

**Step Names:**
- Case insensitive
- Spaces converted to hyphens
- Both formats work: `"Update Dependencies"` = `"update-dependencies"`

### Dry Run Mode

Preview all changes without modifying files:

```bash
# Dry run full migration
vue3-migrate --dry-run

# Dry run AI codemods
vue3-migrate ai src/ --dry-run
```

**What happens in dry run:**
- ✅ Shows what files would be modified
- ✅ Displays dependency changes
- ✅ Runs AI transformations
- ❌ Doesn't write to disk
- ❌ Doesn't install packages
- ❌ Doesn't commit to git

### Non-Interactive Mode

Auto-accept all prompts (for CI/CD):

```bash
vue3-migrate --yes
```

**Use cases:**
- Automated pipelines
- Batch processing
- Testing scripts

**Warning:** Review changes carefully in non-interactive mode!

### AI Codemod Options

Fine-tune AI behavior:

#### Mode

```bash
# Auto-apply (default)
vue3-migrate ai src/ --mode auto

# Prompt for each file
vue3-migrate ai src/ --mode ask

# Show changes only (no write)
vue3-migrate ai src/ --mode report
```

#### Confidence Threshold

```bash
# Only apply high-confidence changes
vue3-migrate ai src/ --min-confidence 0.9

# More permissive (default: no threshold)
vue3-migrate ai src/ --min-confidence 0.7
```

#### Max Lines

```bash
# Skip large files
vue3-migrate ai src/ --max-lines 300

# Allow larger files
vue3-migrate ai src/ --max-lines 800
```

#### Auto-commit

```bash
# Commit each file after migration
vue3-migrate ai src/ --commit

# Commit message format:
# "migrate: [filename] to Vue 3"
```

#### Retries

```bash
# More retry attempts for verification
vue3-migrate ai src/ --verify-retries 5
```

## Configuration Files

### .env File

Create `.env` in project root:

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini

# Migration Rules
MIGRATION_RULES_PATH=./custom-rules.md

# AI Behavior
AI_RULES_MODE=smart
```

### .gitignore

Always ignore sensitive files:

```bash
# Environment
.env
.env.local
.env.*.local

# Backups
package.backup.*.json

# NPM
node_modules/
*.log
```

### package.json Scripts

Add convenience scripts:

```json
{
  "scripts": {
    "migrate": "vue3-migrate",
    "migrate:scan": "vue3-migrate --only scan",
    "migrate:deps": "vue3-migrate --only update-dependencies",
    "migrate:ai": "vue3-migrate ai src/",
    "migrate:dry": "vue3-migrate --dry-run"
  }
}
```

Usage:
```bash
npm run migrate:scan
npm run migrate:ai
```

## Troubleshooting Configuration

### API Key Not Working

```bash
# Check if set
echo $OPENAI_API_KEY

# Test with OpenAI CLI (if installed)
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**Common issues:**
- Key has extra spaces
- Key is incorrect format (should start with `sk-`)
- Key is expired or revoked
- Billing not set up on OpenAI account

### Rules File Not Found

```bash
# Check current location
pwd

# List files
ls -la MIGRATION_RULES.md

# Verify path
vue3-migrate ai --rules ./MIGRATION_RULES.md --dry-run
```

**The tool will show:**
```
📖 Loaded built-in migration rules
📖 Loaded custom migration rules overlay: /absolute/path/to/MIGRATION_RULES.md
```

### Model Not Available

```bash
# Check available models at
# https://platform.openai.com/docs/models

# Try alternative
export OPENAI_MODEL="gpt-4o"
```

## Next Steps

- 📖 [Main README](./README.md) - Usage guide
- 🛠️ [DEVELOPMENT.md](./DEVELOPMENT.md) - Contributor guide
- 🐛 [Report Issues](https://github.com/Tefik-Rudari/migration-tool-vue2-vue3/issues)
