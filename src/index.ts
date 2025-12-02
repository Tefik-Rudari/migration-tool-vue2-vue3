#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Command } from "commander";
import { runAll } from "./runner.js";
import { aiCodemods } from "./steps/ai-codemods.js";
import type { RunContext } from "./core/types.js";
import chalk from "chalk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readToolVersion(): string | null {
  try {
    const pkgPath = path.resolve(__dirname, "../package.json");
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version || null;
  } catch {
    return null;
  }
}

function logToolVersion() {
  const ver = readToolVersion();
  if (ver) console.log(chalk.gray(`vue3-migrate version ${ver}`));
}

function parseEnvInt(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Allow passing a custom migration rules file at runtime
const rawArgv = process.argv.slice(2);
let rulesArg = '';
for (let i = 0; i < rawArgv.length; i++) {
  const a = rawArgv[i];
  if (a === '--rules' && rawArgv[i + 1]) { rulesArg = rawArgv[i + 1]; break; }
  const m = a.match(/^--rules=(.+)$/);
  if (m) { rulesArg = m[1]; break; }
}
if (rulesArg) {
  process.env.MIGRATION_RULES_PATH = rulesArg;
  console.log(`[migrate-tool] Using rules file: ${rulesArg}`);
}

const program = new Command();

program
  .name("vue3-migrate")
  .description("Vue 2 → Vue 3 migration tool (multi-step, interactive)")
  .option("--dry-run", "Plan only; do not write files or install packages")
  .option("--no-compat", "Do NOT add @vue/compat migration build")
  .option("--yes", "Non-interactive: auto-continue all prompts")
  .option("--rules <path>", "Path to custom MIGRATION_RULES.md (defaults to built-in)")
  .option("--skip <steps>", "Skip specific steps (comma-separated: preflight,deps,vite)")
  .option("--only <steps>", "Only run specific steps (comma-separated)")
  .action(async (opts) => {
    logToolVersion();
    const ctx: RunContext & any = {
      root: process.cwd(),
      pm: "npm",
      dryRun: !!opts.dryRun,
      compat: opts.compat !== false,
      nonInteractive: !!opts.yes,
      rulesPath: opts.rules,
      skipSteps: opts.skip ? opts.skip.split(",").map((s: string) => s.trim()) : undefined,
      onlySteps: opts.only ? opts.only.split(",").map((s: string) => s.trim()) : undefined,
      aiMaxSourceLines: parseEnvInt("AI_MAX_SOURCE_LINES"),
      scan: undefined,
    };
    await runAll(ctx);
  });

// NEW: AI subcommand — run AI on selected files/folders, auto-commit optionally.
program
  .command("ai")
  .description("AI-assisted codemods on selected files/folders")
  .argument("[targets...]", "Files or folders/globs to rewrite (e.g., src/components src/App.vue)")
  .option("--mode <mode>", "auto|ask|report", "auto")
  .option("--commit", "git commit each changed file", false)
  .option("--max-lines <n>", "skip patches changing more than N lines", (v) => parseInt(v, 10), 400)
  .option("--min-confidence <n>", "minimum confidence threshold (0-1)", (v) => parseFloat(v))
  .option("--verify-retries <n>", "number of verifier retries", (v) => parseInt(v, 10))
  .option("--dry-run", "show what would change, do not write", false)
  .option("--rules <path>", "Path to MIGRATION_RULES.md (used by AI layer)")
  .action(async (targets: string[], opts) => {
    logToolVersion();
    const ctx: RunContext & any = {
      root: process.cwd(),
      pm: "npm",
      dryRun: !!opts.dryRun,
      compat: true,
      nonInteractive: true,
      scan: undefined,
      aiTargets: targets?.length ? targets : ["src"],
      aiMode: (opts.mode || "auto") as any,
      aiCommit: !!opts.commit,
      aiMaxLines: Number.isFinite(opts.maxLines) ? opts.maxLines : 400,
      aiMinConfidence: Number.isFinite(opts.minConfidence) ? opts.minConfidence : undefined,
      aiVerifyRetries: Number.isFinite(opts.verifyRetries) ? opts.verifyRetries : undefined,
      aiMaxSourceLines: parseEnvInt("AI_MAX_SOURCE_LINES"),
    };
    await aiCodemods(ctx);
  });

program.parseAsync();
