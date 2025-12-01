# Vue 3 Migration Tool

AI-powered CLI tool to migrate Vue 2 projects to Vue 3, with support for Vue Router, Vuex, and Vuetify dependencies.

## Features

- AI-powered component transformations using OpenAI
- Smart project detection (build tool, TypeScript, dependencies)
- Automatic dependency updates (30+ packages including Vuetify)
- Modular steps with `--skip` and `--only` flags
- Custom migration rules support
- Git safety checks and backups

## Prerequisites

- Node.js 16+
- Git repository
- OpenAI API key (for AI codemods)

## Quick Start

```bash
npx vue3-migration-tool
```

Or install globally:

```bash
npm install -g vue3-migration-tool
vue3-migrate
```

## Configuration

### Environment Variables

Create a `.env` file in your project root or export variables:

```bash
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5
OPENAI_RATE_INPUT_PER1K=0.006
OPENAI_RATE_OUTPUT_PER1K=0.018
```

**Get your API key:** https://platform.openai.com/api-keys

**OpenAI pricing reference:** https://platform.openai.com/docs/pricing

**Note:** The tool reads `.env` files automatically via dotenv.

### Using CLI Flags

```bash
# Custom rules via flag
vue3-migrate --rules ./my-rules.md

# Combine with other options
vue3-migrate ai src/ --rules ./company-rules.md --mode ask
```

## Usage

### Basic Migration

```bash
vue3-migrate
```

Steps:
1. Check git status and current branch
2. Scan project and detect versions
3. Update dependencies to Vue 3
4. Offer AI codemods (optional)
5. Prints the installed `vue3-migrate` version at start so you know which release you’re running

### AI Codemods Only

```bash
# Migrate entire src directory
vue3-migrate ai src/

# Migrate specific files
vue3-migrate ai src/App.vue src/components/

# With options
vue3-migrate ai src/ --mode auto --commit --dry-run
```
If `OPENAI_API_KEY` is missing, AI codemods are skipped with a warning.

### Selective Step Execution

```bash
# Skip dependency updates
vue3-migrate --skip update-dependencies

# Only run scan
vue3-migrate --only scan

# Skip multiple steps
vue3-migrate --skip preflight,update-dependencies
```

### Other Options

```bash
# Preview changes without modifying files
vue3-migrate --dry-run

# Auto-accept all prompts
vue3-migrate --yes

# Skip @vue/compat
vue3-migrate --no-compat
```

## CLI Reference

### Main Command

```bash
vue3-migrate [options]
```

Options:
- `--dry-run` - Preview changes without writing files
- `--no-compat` - Don't add @vue/compat migration build
- `--yes` - Non-interactive mode
- `--rules <path>` - Path to custom MIGRATION_RULES.md
- `--skip <steps>` - Skip steps (comma-separated)
- `--only <steps>` - Only run these steps
- `-h, --help` - Show help

### AI Subcommand

```bash
vue3-migrate ai [targets...] [options]
```

Options:
- `--mode <mode>` - auto|ask|report (default: auto)
- `--commit` - Git commit each changed file
- `--max-lines <n>` - Skip patches larger than N lines (default: 400)
- `--min-confidence <n>` - Confidence threshold 0-1
- `--dry-run` - Preview without writing
- `--rules <path>` - Custom migration rules

## Migration Steps

### 1. Preflight
- Confirms project is in a git repository
- Shows current branch
- Warns about uncommitted changes

### 2. Scan
Detects:
- Package manager (npm, yarn, pnpm)
- Build tool (Vite, Vue CLI, Webpack)
- TypeScript usage
- Dependencies (Vue, Router, Vuex, Vuetify)
- Entry point (main.js/main.ts)
- Potential blockers

### 3. Update Dependencies
- Rule-driven updater: only touches packages present in your package.json, applies Vue 3–safe bumps/removals/replacements, and warns on legacy Vue 2-era libraries.
- Updates Vue core packages (vue, vue-router, vuex)
- Updates Vuetify package to v3 (if detected)
- Updates build tools and testing frameworks
- Removes Vue 2-only packages
- Creates package.json backup

### 4. AI Codemods (Optional)
- Converts to `<script setup lang="ts">`
- Transforms component templates based on MIGRATION_RULES.md
- Provides confidence scoring per file
- Validates syntax before writing

**Note:** Vuetify template migrations (components, props, slots) are handled by AI codemods based on the rules in MIGRATION_RULES.md. For complex Vuetify projects, manual review may be needed.

## Examples

### First-Time Migration

```bash
export OPENAI_API_KEY="sk-..."
npx vue3-migration-tool
npm run dev
```

### Incremental Migration

```bash
# Update dependencies only
vue3-migrate --skip ai

# Migrate one folder at a time
vue3-migrate ai src/components/auth/ --commit
vue3-migrate ai src/components/dashboard/ --commit
```

### Custom Rules

```bash
# Copy built-in rules
cp node_modules/vue3-migration-tool/MIGRATION_RULES.md ./my-rules.md

# Edit and use
vue3-migrate --rules ./my-rules.md ai src/
```

## Troubleshooting

**"OPENAI_API_KEY is not set"**
```bash
export OPENAI_API_KEY="sk-..."
```

**"Not a git repo"**
```bash
git init
git add .
git commit -m "Initial commit"
```

**"npm install failed with ERESOLVE"**

The tool automatically retries with `--legacy-peer-deps`.

**AI producing incorrect code**
- Use better model: `export OPENAI_MODEL="gpt-4o"`
- Add custom rules to MIGRATION_RULES.md
- Use `--mode ask` or `--mode report` for review

**Vuetify migrations incomplete**
- AI codemods handle common Vuetify patterns but not all edge cases
- Review the built-in MIGRATION_RULES.md for supported Vuetify transformations
- Add project-specific Vuetify patterns to custom rules
- Consider manual migration for complex Vuetify components
- Reference: https://vuetifyjs.com/en/getting-started/upgrade-guide/

## What This Tool Does and Doesn't Do

**Does:**
- ✅ Update Vue, Vue Router, Vuex dependencies to v3
- ✅ Update Vuetify dependency to v3
- ✅ AI-based component script transformations
- ✅ AI-based template updates (via MIGRATION_RULES.md)
- ✅ Remove Vue 2-only packages

**Doesn't:**
- ❌ Comprehensive Vuetify component migration (AI-assisted only)
- ❌ Update build configs (vite.config.js, vue.config.js)
- ❌ Update main.js entry point (new Vue() → createApp())
- ❌ Migrate test files
- ❌ Update CI/CD configs
- ❌ Guarantee 100% working migration without manual review

## Environment Variables Reference

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `OPENAI_API_KEY` | Yes (for AI) | OpenAI API key | - |
| `OPENAI_MODEL` | No | Model to use | `gpt-4o-mini` |
| `OPENAI_BASE_URL` | No | API endpoint URL | `https://api.openai.com/v1` |
| `OPENAI_RATE_INPUT_PER1K` | No | Input cost per 1K tokens (USD) | Auto-detect |
| `OPENAI_RATE_OUTPUT_PER1K` | No | Output cost per 1K tokens (USD) | Auto-detect |
| `MIGRATION_RULES_PATH` | No | Path to custom rules file | Built-in |
| `AI_RULES_MODE` | No | Rules mode: `smart` or `full` | `smart` |

**Example:**
```bash
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5
OPENAI_RATE_INPUT_PER1K=0.006
OPENAI_RATE_OUTPUT_PER1K=0.018
```

**Pricing:** https://platform.openai.com/docs/pricing

## Documentation

- [CONFIGURATION.md](./CONFIGURATION.md) - Detailed configuration guide
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Contributor guide

## Support

- Issues: https://github.com/Tefik-Rudari/migration-tool-vue2-vue3/issues
- Repository: https://github.com/Tefik-Rudari/migration-tool-vue2-vue3

## License

MIT
