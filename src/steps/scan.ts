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

  // Detect build tool
  let buildTool: "vite" | "webpack" | "vue-cli" | "unknown" = "unknown";
  const hasViteConfig = fs.existsSync(path.join(root, "vite.config.js")) || fs.existsSync(path.join(root, "vite.config.ts"));
  const hasVueConfig = fs.existsSync(path.join(root, "vue.config.js"));

  if (deps["vite"] || hasViteConfig) buildTool = "vite";
  else if (deps["@vue/cli-service"] || hasVueConfig) buildTool = "vue-cli";
  else if (deps["webpack"]) buildTool = "webpack";

  // Detect TypeScript
  const hasTypeScript = !!(deps["typescript"] || fs.existsSync(path.join(root, "tsconfig.json")));

  // Find main entry point
  let hasMainJs = "";
  const mainPaths = ["src/main.ts", "src/main.js", "main.ts", "main.js"];
  for (const p of mainPaths) {
    if (fs.existsSync(path.join(root, p))) {
      hasMainJs = p;
      break;
    }
  }

  console.log("🔧 Build tool:", chalk.bold(buildTool));
  console.log("📘 TypeScript:", hasTypeScript ? "Yes" : "No");
  if (hasMainJs) console.log("🚪 Entry point:", chalk.bold(hasMainJs));

  const blockers: string[] = [];
  if (typeof vuetify === "string" && /^2\./.test(vuetify)) {
    blockers.push("Vuetify 2 detected → run Vuetify migration after core Vue 3 migration.");
  }
  if (vue && !/^2\./.test(String(vue))) {
    console.log(chalk.yellow("ℹ️  Vue is not 2.x; core migration may be partially applied or different."));
  }

  ctx.scan = {
    files,
    deps,
    blockers,
    vue,
    router,
    vuex,
    vuetify,
    buildTool,
    hasTypeScript,
    hasMainJs,
    hasVueConfig,
    hasViteConfig
  };
}
