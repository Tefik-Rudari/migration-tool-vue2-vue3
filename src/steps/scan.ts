import fs from "fs";
import path from "path";
import { globby } from 'globby';
import chalk from "chalk";
import type { RunContext } from "../core/types.js";
import { resolvePackageManager } from "../core/pm.js";

export async function scan(ctx: RunContext) {
  console.log(chalk.cyan("\n🔎 Scanning project…"));

  const root = (ctx.root = process.cwd());
  const pkgPath = path.join(root, "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.log(chalk.red("❌ package.json not found at project root."));
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  // 🔁 NEW: resolve actual PM by lockfiles + installed binaries (+ prompt or default)
  ctx.pm = await resolvePackageManager({
    root,
    nonInteractive: ctx.nonInteractive,
  });
  console.log("📦 Package manager:", ctx.pm);

  const vue = deps["vue"];
  const router = deps["vue-router"];
  const vuex = deps["vuex"];
  const vuetify = deps["vuetify"];

  console.log("🔗 Detected versions:");
  console.log("  • vue:", vue ?? "(not found)");
  console.log("  • vue-router:", router ?? "(not found)");
  console.log("  • vuex:", vuex ?? "(not found)");
  console.log("  • vuetify:", vuetify ?? "(not found)");

  const files = await globby(["src/**/*.{vue,ts,js}"], { gitignore: true });
  console.log("🗂  Source files found:", files.length);

  const blockers: string[] = [];
  if (typeof vuetify === "string" && /^2\./.test(vuetify)) {
    blockers.push("Vuetify 2 detected → run Vuetify migration after core Vue 3 migration.");
  }
  if (vue && !/^2\./.test(String(vue))) {
    console.log(chalk.yellow("ℹ️  Vue is not 2.x; core migration may be partially applied or different."));
  }

  ctx.scan = { files, deps, blockers, vue, router, vuex, vuetify };
}
