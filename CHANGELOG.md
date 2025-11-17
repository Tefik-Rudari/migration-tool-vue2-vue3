# Changelog

All notable changes to the Vue 2 → Vue 3 Migration Tool.

## [1.0.0] - 2024-11-17

### Added

#### Core Features
- **Modular step system** with optional and conditional execution
- **CLI flags** for flexible workflow control (`--skip`, `--only`, `--rules`)
- **Smart project detection** (build tool, TypeScript, entry point)
- **Custom migration rules** support with multiple discovery paths
- **Comprehensive documentation** (README, CONFIGURATION, DEVELOPMENT)

#### CLI Options
- `--rules <path>`: Use custom MIGRATION_RULES.md file
- `--skip <steps>`: Skip specific migration steps
- `--only <steps>`: Run only specified steps
- `--dry-run`: Preview changes without modifying files
- `--yes`: Non-interactive mode for automation
- `--no-compat`: Skip adding @vue/compat

#### AI Codemods
- OpenAI integration for intelligent code transformations
- Model selection via `OPENAI_MODEL` environment variable
- Time estimation and progress tracking
- Confidence scoring for each transformation
- Automatic syntax verification

#### Detection
- **Build tool**: Vite, Vue CLI, Webpack, or unknown
- **TypeScript**: Automatic detection
- **Entry point**: Finds main.js/main.ts
- **Package manager**: npm, yarn, or pnpm
- **Dependencies**: Vue, Router, Vuex, Vuetify versions

#### Migration Steps
1. **Preflight**: Git validation and status checks
2. **Scan**: Project detection and analysis
3. **Update Dependencies**: 30+ package updates for Vue 3
4. **AI Codemods**: Optional intelligent transformations

#### Configuration
- Environment variable support (`.env` file)
- OpenAI API key configuration
- Model selection (gpt-4o-mini, gpt-4o, gpt-4-turbo)
- Custom rules discovery system

#### Documentation
- **README.md**: Complete user guide with examples
- **CONFIGURATION.md**: Detailed environment setup
- **DEVELOPMENT.md**: Contributor guide and architecture
- **CHANGELOG.md**: Version history

### Changed
- Updated package.json for npm publication
- Binary command renamed: `v23-migrate` → `vue3-migrate`
- Enhanced scan step with detailed detection
- Improved migration rules discovery logic

### Fixed
- Added missing `dotenv` dependency
- Fixed step filtering logic
- Corrected TypeScript types for optional fields

## [Unreleased]

### Planned
- Main.js/main.ts automatic update step
- Vite/Vue config migration steps
- Router createRouter() transformation
- Vuex createStore() transformation
- Test file migrations
- Progress bar for AI codemods
- Summary report at completion
- Alternative AI providers (Anthropic, local LLMs)
- VSCode extension

## Migration Guide

### From Pre-1.0

If you were using an earlier version:

1. **Update command name**: `v23-migrate` → `vue3-migrate`
2. **New CLI flags available**: Use `--skip`, `--only`, `--rules`
3. **Custom rules**: Place `MIGRATION_RULES.md` in project root or use `--rules` flag
4. **Environment**: Set `OPENAI_MODEL` to choose AI model

### Breaking Changes

- Binary command name changed from `v23-migrate` to `vue3-migrate`
- Step names normalized (spaces → hyphens for CLI)

## Notes

- **OpenAI API key required** for AI codemods (not for dependency updates)
- **Node.js 16+** required (Vue 3 requirement)
- **Git repository required** for safety checks
- See CONFIGURATION.md for complete setup guide
