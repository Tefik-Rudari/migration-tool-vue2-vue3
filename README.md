# Vue 2 → Vue 3 Migration Tool

AI-powered CLI tool to help migrate Vue 2 projects to Vue 3, with support for Vue Router, Vuex, Vuetify, and more.

## Features

- 🤖 **AI-Powered Codemods**: Automatically rewrite Vue components using OpenAI
- 🔍 **Smart Detection**: Identifies your build tool (Vite/Webpack/Vue CLI), package manager, and dependencies
- 📦 **Dependency Management**: Updates 30+ packages to Vue 3 compatible versions
- ⚙️ **Modular Steps**: Run only what you need with `--skip` and `--only` flags
- 📋 **Custom Rules**: Bring your own migration rules or use built-in ones
- 🎯 **Vuetify 3 Support**: Special handling for Vuetify 2 → 3 migrations
- 🔒 **Git Safe**: Checks git status, creates backups before changes

## Prerequisites

- **Node.js**: 16+ (Vue 3 requirement)
- **Git**: Project must be in a git repository
- **OpenAI API Key**: Required for AI codemods (optional for dependency updates)

## Quick Start

Run directly with npx (no installation needed):

```bash
npx vue3-migration-tool
```

Or install globally:

```bash
npm install -g vue3-migration-tool
vue3-migrate
```

## Configuration

### 1. OpenAI API Key (Required for AI Codemods)

The tool uses OpenAI for intelligent code transformations. Set your API key:

```bash
# Option 1: Environment variable (recommended)
export OPENAI_API_KEY="sk-..."

# Option 2: .env file in your project root
echo "OPENAI_API_KEY=sk-..." > .env
```

Get your API key from: https://platform.openai.com/api-keys

### 2. AI Model Configuration (Optional)

Choose which OpenAI model to use:

```bash
# Default: gpt-4o-mini (fast, cost-effective)
export OPENAI_MODEL="gpt-4o-mini"

# For higher quality: gpt-4o or gpt-4-turbo
export OPENAI_MODEL="gpt-4o"
```

**Model Recommendations:**
- `gpt-4o-mini`: Fast and cheap, good for most projects (~$0.15 per 1M input tokens)
- `gpt-4o`: Better quality, more expensive (~$5 per 1M input tokens)
- `gpt-4-turbo`: Balanced performance and cost

### 3. Custom Migration Rules (Optional)

The tool includes comprehensive migration rules. To customize:

```bash
# Use your own rules file
vue3-migrate --rules ./my-migration-rules.md

# Or set environment variable
export MIGRATION_RULES_PATH="./my-rules.md"
```

**Rules Discovery Order:**
1. `--rules` CLI flag
2. `MIGRATION_RULES_PATH` environment variable
3. `MIGRATION_RULES.md` in project root
4. Built-in package rules (fallback)

## Usage

### Basic Migration

Run all steps interactively:

```bash
vue3-migrate
```

This will:
1. ✅ Check git status and current branch
2. 🔍 Scan project and detect versions
3. 📦 Update dependencies to Vue 3
4. 🤖 Offer AI codemods (optional)

### AI Codemods Only

Migrate specific files or folders:

```bash
# Migrate entire src directory
vue3-migrate ai src/

# Migrate specific files
vue3-migrate ai src/App.vue src/components/

# With options
vue3-migrate ai src/ --mode auto --commit --dry-run
```

**AI Codemod Options:**
- `--mode <mode>`: How to apply changes
  - `auto`: Apply automatically (default)
  - `ask`: Prompt for each file
  - `report`: Show changes without applying
- `--commit`: Git commit each changed file
- `--dry-run`: Show what would change without writing
- `--max-lines <n>`: Skip patches larger than N lines (default: 400)
- `--min-confidence <n>`: Minimum confidence threshold 0-1
- `--rules <path>`: Custom migration rules file

### Selective Step Execution

Skip or run specific steps:

```bash
# Skip dependency updates (just scan)
vue3-migrate --skip update-dependencies

# Only run scan step
vue3-migrate --only scan

# Skip multiple steps
vue3-migrate --skip preflight,update-dependencies
```

**Available Steps:**
- `preflight`: Git checks and project validation
- `scan`: Detect versions, build tool, TypeScript
- `update-dependencies`: Update package.json and install

### Dry Run Mode

Preview changes without modifying files:

```bash
# See what would change
vue3-migrate --dry-run

# Test AI codemods
vue3-migrate ai src/ --dry-run
```

### Non-Interactive Mode

Auto-accept all prompts:

```bash
vue3-migrate --yes
```

### Disable @vue/compat

Skip adding the Vue 3 compatibility build:

```bash
vue3-migrate --no-compat
```

## CLI Reference

### Main Command

```bash
vue3-migrate [options]
```

**Options:**
- `--dry-run`: Preview changes without writing files
- `--no-compat`: Don't add @vue/compat migration build
- `--yes`: Non-interactive mode (auto-accept prompts)
- `--rules <path>`: Path to custom MIGRATION_RULES.md
- `--skip <steps>`: Skip steps (comma-separated)
- `--only <steps>`: Only run these steps (comma-separated)
- `-h, --help`: Show help

### AI Subcommand

```bash
vue3-migrate ai [targets...] [options]
```

**Arguments:**
- `[targets...]`: Files or folders to migrate (default: `src/`)

**Options:**
- `--mode <mode>`: auto|ask|report (default: auto)
- `--commit`: Git commit each changed file
- `--max-lines <n>`: Skip large patches (default: 400)
- `--min-confidence <n>`: Confidence threshold 0-1
- `--verify-retries <n>`: Number of verification retries
- `--dry-run`: Preview without writing
- `--rules <path>`: Custom migration rules

## Migration Steps Explained

### Step 1: Preflight

Validates your environment:
- ✅ Confirms project is in a git repository
- 📋 Shows current branch
- ⚠️ Warns about uncommitted changes

**Why?** Ensures you can rollback if needed.

### Step 2: Scan

Detects your project configuration:
- 📦 **Package Manager**: npm, yarn, or pnpm
- 🔧 **Build Tool**: Vite, Vue CLI, Webpack, or custom
- 📘 **TypeScript**: Detected or not
- 📦 **Dependencies**: Vue, Vue Router, Vuex, Vuetify versions
- 🚪 **Entry Point**: Locates main.js/main.ts
- ⚠️ **Blockers**: Identifies potential migration issues

**Example Output:**
```
📦 Package manager: npm
🔗 Detected versions:
  • vue: ^2.7.14
  • vue-router: ^3.6.5
  • vuex: ^3.6.2
  • vuetify: ^2.6.10
🗂  Source files found: 142
🔧 Build tool: vue-cli
📘 TypeScript: Yes
🚪 Entry point: src/main.ts
```

### Step 3: Update Dependencies

Updates your package.json:
- ⬆️ **Vue Core**: vue@3.5.18, vue-router@^4.4.0, vuex@^4.1.0
- 🔧 **Build Tools**: @vue/cli-service@^5.0.0 (if using Vue CLI)
- 🎨 **Vuetify**: Upgrades to v3.7.0
- 🧪 **Testing**: Updates Jest, vue-jest → @vue/vue3-jest
- 🗑️ **Removes**: Vue 2-only packages (vue-template-compiler, etc.)
- 💾 **Backup**: Creates timestamped package.json backup

**Optional**: Adds `@vue/compat` for gradual migration.

### Step 4: AI Codemods (Optional)

Uses OpenAI to rewrite components:
- 🤖 **Script Migration**: Converts to `<script setup lang="ts">`
- 🎨 **Template Updates**: Vuetify 2 → 3 components
- 📊 **Confidence Scoring**: Each change has confidence rating
- ⏱️ **Time Estimates**: Shows progress with time remaining
- ✅ **Verification**: Validates syntax before writing

## Examples

### Example 1: First-Time Migration

```bash
# Set API key
export OPENAI_API_KEY="sk-..."

# Run full migration
npx vue3-migration-tool

# Review changes, then test
npm run dev
```

### Example 2: Incremental Migration

```bash
# Just update dependencies
vue3-migrate --skip ai

# Later, migrate one folder at a time
vue3-migrate ai src/components/auth/ --commit
vue3-migrate ai src/components/dashboard/ --commit
```

### Example 3: Custom Rules for Company

```bash
# Create company-specific rules
cp MIGRATION_RULES.md ./company-migration-rules.md
# Edit file with your patterns...

# Use custom rules
vue3-migrate --rules ./company-migration-rules.md ai src/
```

### Example 4: Preview Before Applying

```bash
# Scan only
vue3-migrate --only scan

# Dry run everything
vue3-migrate --dry-run

# Test AI on one file
vue3-migrate ai src/App.vue --dry-run --mode report
```

## Troubleshooting

### "OPENAI_API_KEY is not set"

**Solution:** Set your API key:
```bash
export OPENAI_API_KEY="sk-..."
```

Or create a `.env` file:
```
OPENAI_API_KEY=sk-...
```

### "Not a git repo"

**Solution:** Initialize git first:
```bash
git init
git add .
git commit -m "Initial commit before migration"
```

### "npm install failed with ERESOLVE"

**Solution:** The tool automatically retries with `--legacy-peer-deps`. If it still fails:
```bash
npm install --legacy-peer-deps
```

### AI codemods producing incorrect code

**Solutions:**
1. **Use better model**: `export OPENAI_MODEL="gpt-4o"`
2. **Custom rules**: Add your patterns to MIGRATION_RULES.md
3. **Lower confidence threshold**: Files below threshold won't auto-apply
4. **Manual review**: Use `--mode ask` or `--mode report`

### Large files timing out

**Solution:** Increase max lines or skip large files:
```bash
vue3-migrate ai src/ --max-lines 800
```

### Build tool not detected

**Solution:** The tool looks for:
- Vite: `vite.config.js/ts` or `"vite"` in dependencies
- Vue CLI: `vue.config.js` or `"@vue/cli-service"` in dependencies
- Webpack: `"webpack"` in dependencies

If custom, you may need to update configs manually.

## Custom Migration Rules

The tool uses `MIGRATION_RULES.md` to guide AI transformations. You can:

### View Built-in Rules

```bash
# After installing
cat node_modules/vue3-migration-tool/MIGRATION_RULES.md
```

### Create Custom Rules

1. Copy built-in rules to your project:
```bash
cp node_modules/vue3-migration-tool/MIGRATION_RULES.md ./my-rules.md
```

2. Edit `my-rules.md` with your patterns:
```markdown
## Custom Patterns

- Replace `this.$myPlugin` with `useMyPlugin()` composable
- Update custom component props: `old-prop` → `newProp`
- Use company authentication helpers instead of direct API calls
```

3. Use your rules:
```bash
vue3-migrate --rules ./my-rules.md ai src/
```

### Rules Best Practices

- ✅ **Be specific**: Include code examples
- ✅ **Show before/after**: Clear transformations
- ✅ **Document edge cases**: Handle special situations
- ✅ **Prioritize patterns**: Put most important rules first
- ✅ **Test incrementally**: Validate on small files first

## What This Tool Doesn't Do

- ❌ **Modify build configs**: You may need to update `vite.config.js`, `vue.config.js` manually
- ❌ **Update main.js**: Entry point still needs manual migration (`new Vue()` → `createApp()`)
- ❌ **Migrate tests**: Test files require separate attention
- ❌ **Update deployment**: CI/CD configs may need Node version updates
- ❌ **Handle custom plugins**: Third-party plugins need manual review

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (required for AI) | - |
| `OPENAI_MODEL` | Model to use | `gpt-4o-mini` |
| `MIGRATION_RULES_PATH` | Path to custom rules file | Built-in rules |
| `AI_RULES_MODE` | Rules mode: `smart` or `full` | `smart` |

## Contributing

See [DEVELOPMENT.md](./DEVELOPMENT.md) for contributor guide.

## License

MIT

## Support

- 🐛 **Issues**: https://github.com/Tefik-Rudari/migration-tool-vue2-vue3/issues
- 📖 **Docs**: https://github.com/Tefik-Rudari/migration-tool-vue2-vue3
- 💬 **Discussions**: https://github.com/Tefik-Rudari/migration-tool-vue2-vue3/discussions

## Acknowledgments

Built with:
- [Commander.js](https://github.com/tj/commander.js) - CLI framework
- [OpenAI API](https://platform.openai.com/) - AI transformations
- [Chalk](https://github.com/chalk/chalk) - Terminal styling
- [Ora](https://github.com/sindresorhus/ora) - Spinners
