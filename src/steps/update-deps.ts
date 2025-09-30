import fs from "fs";
import path from "path";
import chalk from "chalk";
import { execa } from "execa";
import type { RunContext } from "../core/types.js";

// Writes a dep range into deps/devDeps, keeping original bucket if present.
function setDepRange(pkg: any, name: string, range: string) {
  const inDeps = pkg.dependencies && Object.prototype.hasOwnProperty.call(pkg.dependencies, name);
  const inDev = pkg.devDependencies && Object.prototype.hasOwnProperty.call(pkg.devDependencies, name);

  if (inDeps || (!inDeps && !inDev)) {
    pkg.dependencies = pkg.dependencies || {};
    pkg.dependencies[name] = range;
  } else {
    pkg.devDependencies = pkg.devDependencies || {};
    pkg.devDependencies[name] = range;
  }
}

// Remove a dep from deps/devDeps if present (used for Vue 2-only packages)
function removeDep(pkg: any, name: string) {
  if (pkg.dependencies && pkg.dependencies[name]) delete pkg.dependencies[name];
  if (pkg.devDependencies && pkg.devDependencies[name]) delete pkg.devDependencies[name];
}
function hasDep(pkg: any, name: string) {
  return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

// Make a timestamped backup of package.json before edits.
function backupPackageJson(pkgPath: string) {
  const stamp = new Date().toISOString().replace(/[:]/g, "-");
  const backupPath = path.join(path.dirname(pkgPath), `package.backup.${stamp}.json`);
  const content = fs.readFileSync(pkgPath, "utf-8");
  fs.writeFileSync(backupPath, content, "utf-8");
  return backupPath;
}

// Try installing once; if npm fails with peer resolution (ERESOLVE),
// retry with --legacy-peer-deps. Yarn/pnpm do not need this.
async function installWithPeerRetry(pm: RunContext["pm"]) {
  if (pm === "npm") {
    try {
      await execa("npm", ["install"], { stdio: "inherit" });
      return;
    } catch {
      console.log(
        chalk.yellow("🔁 npm install failed. Retrying with --legacy-peer-deps to relax peer resolution…")
      );
      await execa("npm", ["install", "--legacy-peer-deps"], { stdio: "inherit" });
      return;
    }
  }
  // yarn / pnpm path (no special peer handling needed)
  await execa(pm, ["install"], { stdio: "inherit" });
}

export async function updateDeps(ctx: RunContext) {
  console.log(chalk.cyan("\n📦 Updating dependencies for Vue 3…"));

  const pkgPath = path.join(ctx.root, "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.log(chalk.red("❌ package.json not found at project root."));
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  // Backup before modifying
  const backup = backupPackageJson(pkgPath);
  console.log(chalk.gray(`🛟 Backup created: ${path.basename(backup)}`));

  const hasRouter = Boolean(deps["vue-router"]);
  const hasVuex = Boolean(deps["vuex"]);

  // --- Core Vue 3 pins/bumps ---
  // Exact pin keeps @vue/compat peers satisfied and reduces drift in migration.
  setDepRange(pkg, "vue", "3.5.18");
  if (hasRouter) setDepRange(pkg, "vue-router", "^4.4.0");
  if (hasVuex) setDepRange(pkg, "vuex", "^4.1.0");

  // Optional compat build unless --no-compat
  if (ctx.compat) setDepRange(pkg, "@vue/compat", "^3.5.18");

  // --- Class API (Vue 3-compatible with @vue/compat) ---
  if (hasDep(pkg, "vue-property-decorator") || hasDep(pkg, "vue-class-component")) {
    setDepRange(pkg, "vue-class-component", "^7.2.6");
    setDepRange(pkg, "vue-property-decorator", "^8.5.1");
    console.log(chalk.gray("🧭 Class API detected → pinned vue-class-component@^7.2.6 & vue-property-decorator@^8.5.1 (Vue 3 compat safe)."));
  }

  // --- Remove Vue 2–only packages that conflict with Vue 3 ---
  if (hasDep(pkg, "vue-template-compiler")) {
    removeDep(pkg, "vue-template-compiler");
    console.log(chalk.gray("🧹 Removed vue-template-compiler (Vue 2 only)."));
  }

  // --- Vue SFC transformer for Jest 29+ ---
  if (hasDep(pkg, "vue-jest")) {
    removeDep(pkg, "vue-jest");
    setDepRange(pkg, "@vue/vue3-jest", "^29.2.5");
    console.log(chalk.gray("🧭 Replaced vue-jest with @vue/vue3-jest for Jest 29."));
  } else if (hasDep(pkg, "@vue/vue3-jest")) {
    setDepRange(pkg, "@vue/vue3-jest", "^29.2.5");
  }

  // --- Font Awesome (Vue 3) ---
  // vue-fontawesome v0.x is Vue 2-only. Use v3 for Vue 3.
  if (hasDep(pkg, "@fortawesome/vue-fontawesome")) {
    setDepRange(pkg, "@fortawesome/vue-fontawesome", "^3.0.0");
    console.log(chalk.gray("🧭 FontAwesome: set @fortawesome/vue-fontawesome@^3 for Vue 3."));
  }

  // --- Vue 3 SFC compiler (ensure present) ---
  if (hasDep(pkg, "@vue/compiler-sfc")) {
    setDepRange(pkg, "@vue/compiler-sfc", "^3.5.0");
    console.log(chalk.gray("🧭 SFC compiler: set @vue/compiler-sfc@^3.5."));
  }

  // --- Vuetify 3 ---
  if (hasDep(pkg, "vuetify")) {
    setDepRange(pkg, "vuetify", "^3.7.0");
    console.log(chalk.gray("🧭 Vuetify: set v3.x for Vue 3."));
  }
  ["vuetify-loader", "vue-cli-plugin-vuetify"].forEach(n => {
    if (hasDep(pkg, n)) {
      removeDep(pkg, n);
      console.log(chalk.gray(`🧹 Removed ${n} (Vuetify 2 only).`));
    }
  });

  // --- i18n (Vue 3) ---
  if (hasDep(pkg, "vue-i18n")) {
    setDepRange(pkg, "vue-i18n", "^9.14.0"); // Vue 3 compatible
    console.log(chalk.gray("🧭 vue-i18n: bumped to ^9 for Vue 3."));
  }

  // --- vue-axios (works in Vue 3) ---
  if (hasDep(pkg, "vue-axios")) {
    setDepRange(pkg, "vue-axios", "^3.5.2"); // latest Vue 3 safe
    console.log(chalk.gray("🧭 vue-axios: bumped to latest Vue 3 compatible."));
  }

  // --- Axios ---
  if (hasDep(pkg, "axios")) {
    setDepRange(pkg, "axios", "^1.7.0");
    console.log(chalk.gray("🧭 axios: bumped to ^1.7.x (Promise-based HTTP for Vue 3)."));
  }

  // --- Charts (Vue 3) ---
  // chart.js v2 + vue-chartjs v3 are Vue 2 era. For Vue 3 use chart.js v4 + vue-chartjs v5.
  if (hasDep(pkg, "chart.js") || hasDep(pkg, "vue-chartjs")) {
    setDepRange(pkg, "chart.js", "^4.4.0");
    setDepRange(pkg, "vue-chartjs", "^5.3.0");
    console.log(chalk.gray("🧭 Charts: set chart.js@^4 + vue-chartjs@^5 for Vue 3."));
  }

  // --- vee-validate (Vue 3) ---
  if (hasDep(pkg, "vee-validate")) {
    setDepRange(pkg, "vee-validate", "^4.12.0");
    console.log(chalk.gray("🧭 vee-validate: bumped to ^4 (Vue 3). API updates required."));
  }

  // --- vuex-persistedstate ---
  if (hasDep(pkg, "vuex-persistedstate")) {
    setDepRange(pkg, "vuex-persistedstate", "^4.1.0");
    console.log(chalk.gray("🧭 vuex-persistedstate: bumped to ^4 for Vuex 4."));
  }

  // --- ESLint (Vue CLI 5 requires >=7) ---
  if (hasDep(pkg, "eslint")) {
    setDepRange(pkg, "eslint", "^8.0.0");
    console.log(chalk.gray("🧭 ESLint: bumped to ^8.0.0 for Vue CLI 5 compatibility."));
  }

  // --- vue-wait replacement ---
  // if (hasDep(pkg, "vue-wait")) {
  //   removeDep(pkg, "vue-wait");
  //   setDepRange(pkg, "vue-wait-next", "^1.0.0");
  //   console.log(chalk.gray("🧭 Replaced vue-wait → vue-wait-next for Vue 3."));
  // }

  for (const n of [
    "@vue/cli-service",
    "@vue/cli-plugin-babel",
    "@vue/cli-plugin-eslint",
    "@vue/cli-plugin-typescript",
    "@vue/cli-plugin-unit-jest",
    "@vue/cli-plugin-e2e-cypress",
    "@vue/babel-preset-app"
  ]) {
    if (hasDep(pkg, n)) setDepRange(pkg, n, "^5.0.0");
  }

  // NOTE: We do NOT auto-bump your Pro icon packs (5.x) here to avoid license/key churn.
  // v3 of vue-fontawesome works with FA 5 or 6. You can upgrade icon packs later if you want.

  // --- Informational notes for common Vue 2 libs (do not auto-replace) ---
  const maybeLegacy = [
    "vue-resource",
    "vue-analytics",
    "vue-clipboard2",
    "vue-fragment",
    "vue-meta",          // v3 has @vueuse/head or vueuse/head alternatives
  ].filter(n => hasDep(pkg, n));
  if (maybeLegacy.length) {
    console.log(chalk.yellow("⚠️  Legacy Vue 2 plugins detected:"));
    for (const n of maybeLegacy) console.log(`   • ${n}`);
    console.log(chalk.gray("   Review/replace these manually or via dedicated adapters."));
  }

  // Additional legacy/incompatible libs (Vue 2 era) — warn only
  const moreLegacy: string[] = [];
  if (hasDep(pkg, "vue-head")) moreLegacy.push("vue-head (use @unhead/vue)");
  if (hasDep(pkg, "vue-router-layout")) moreLegacy.push("vue-router-layout (consider route meta/layout wrappers)");
  if (hasDep(pkg, "vue-the-mask")) moreLegacy.push("vue-the-mask (use maska or vue-the-mask-next)");
  if (hasDep(pkg, "vue2-autocomplete-js")) moreLegacy.push("vue2-autocomplete-js (no Vue 3 release; replace)");
  if (moreLegacy.length) {
    console.log(chalk.yellow("⚠️  Vue 2-only or unmaintained packages detected:"));
    for (const n of moreLegacy) console.log(`   • ${n}`);
  }

  // --- ESLint plugin for Vue 3 ---
  if (hasDep(pkg, "eslint-plugin-vue")) {
    setDepRange(pkg, "eslint-plugin-vue", "^9.26.0");
    console.log(chalk.gray("🧭 eslint-plugin-vue: bumped to ^9 for Vue 3 templates."));
  }

  // Remove Vuetify 2 eslint plugin if present
  if (hasDep(pkg, "eslint-plugin-vuetify")) {
    removeDep(pkg, "eslint-plugin-vuetify");
    console.log(chalk.gray("🧹 Removed eslint-plugin-vuetify (Vuetify 2 only)."));
  }

  // --- TypeScript toolchain (align with ESLint 8 + CLI 5) ---
  if (hasDep(pkg, "typescript")) setDepRange(pkg, "typescript", "^5.5.4");
  if (hasDep(pkg, "@typescript-eslint/parser")) setDepRange(pkg, "@typescript-eslint/parser", "^6.21.0");
  if (hasDep(pkg, "@typescript-eslint/eslint-plugin")) setDepRange(pkg, "@typescript-eslint/eslint-plugin", "^6.21.0");
  if (hasDep(pkg, "@types/node")) setDepRange(pkg, "@types/node", "^18.19.0");

  // --- Jest stack compatible with Vue 3 ---
  if (hasDep(pkg, "jest")) setDepRange(pkg, "jest", "^29.7.0");
  if (hasDep(pkg, "ts-jest")) setDepRange(pkg, "ts-jest", "^29.2.5");
  if (hasDep(pkg, "@types/jest")) setDepRange(pkg, "@types/jest", "^29.5.12");
  // SFC transformer handled earlier (@vue/vue3-jest)

  // --- Webpack pins from Vue 2 era — remove to avoid conflicts with CLI 5 (Webpack 5) ---
  ["webpack", "webpack-bundle-analyzer", "webpack-chain"].forEach(n => {
    if (hasDep(pkg, n)) {
      removeDep(pkg, n);
      console.log(chalk.gray(`🧹 Removed ${n} (managed by @vue/cli-service@5).`));
    }
  });

  // --- Sass loader compatible with Webpack 5 ---
  if (hasDep(pkg, "sass-loader")) setDepRange(pkg, "sass-loader", "^13.3.2");

  // Write & install
  if (!ctx.dryRun) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
    console.log(chalk.gray("✍️  package.json updated."));

    console.log(chalk.cyan(`📥 Installing via ${ctx.pm}…`));
    await installWithPeerRetry(ctx.pm);
    console.log(chalk.green("✅ Dependencies installed (with peer-deps handling if needed)."));
  } else {
    console.log(chalk.yellow("🧪 Dry run: would update deps and install (with npm peer-deps retry if needed)."));
  }

  const vuetifyPluginPath = path.join(ctx.root, "src/plugins/vuetify.ts");
  if (!fs.existsSync(vuetifyPluginPath)) {
    const vuetifyContent = `
import { createVuetify } from 'vuetify'
import 'vuetify/styles'

const vuetify = createVuetify({
  // theme, icons, etc.
})

export default vuetify
`.trim() + "\\n";
    fs.mkdirSync(path.dirname(vuetifyPluginPath), { recursive: true });
    fs.writeFileSync(vuetifyPluginPath, vuetifyContent, "utf8");
    console.log(chalk.gray("✚ Created src/plugins/vuetify.ts (Vuetify 3)."));
  }

  console.log(chalk.gray("\nℹ️  Notes:"));
  console.log(chalk.gray("   • npm v7+ enforces peerDependencies; we auto-retry with --legacy-peer-deps."));
  console.log(chalk.gray("   • Removed Vue 2 compiler and bumped class-decorator stack when detected."));
  console.log(chalk.gray("   • Test tooling bumps only if already present (no new frameworks added)."));
}
