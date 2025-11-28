import fs from "fs";
import path from "path";
import chalk from "chalk";
import { execa } from "execa";
import type { RunContext } from "../core/types.js";
import { depRules, type DepRule } from "./deps-rules.js";

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

type ChangeBuckets = {
  set: string[];
  remove: string[];
  replace: string[];
  warn: string[];
};

function describe(target: string, version?: string, reason?: string) {
  const base = version ? `${target}@${version}` : target;
  return reason ? `${base} — ${reason}` : base;
}

function applyRuleToPackage(rule: DepRule, pkg: any, ctx: RunContext, changes: ChangeBuckets) {
  if (rule.condition && !rule.condition(ctx, pkg)) return;

  const present = hasDep(pkg, rule.name);
  if (rule.action === "warn") {
    if (present) {
      changes.warn.push(describe(rule.name, undefined, rule.reason));
    }
    return;
  }

  if (rule.requirePresence && !present) return;

  switch (rule.action) {
    case "set": {
      const version = rule.version || "*";
      setDepRange(pkg, rule.name, version);
      changes.set.push(describe(rule.name, version, rule.reason));
      break;
    }
    case "remove": {
      if (!present) return;
      removeDep(pkg, rule.name);
      changes.remove.push(describe(rule.name, undefined, rule.reason));
      break;
    }
    case "replace": {
      if (!present) return;
      const target = rule.target;
      if (!target) return;
      const version = rule.version || "*";
      removeDep(pkg, rule.name);
      setDepRange(pkg, target, version);
      changes.replace.push(describe(`${rule.name} → ${target}`, version, rule.reason));
      break;
    }
  }
}

function applyDependencyRules(ctx: RunContext, pkg: any) {
  const changes: ChangeBuckets = { set: [], remove: [], replace: [], warn: [] };
  for (const rule of depRules) applyRuleToPackage(rule, pkg, ctx, changes);
  return changes;
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

  // Backup before modifying
  const backup = backupPackageJson(pkgPath);
  console.log(chalk.gray(`🛟 Backup created: ${path.basename(backup)}`));

  const changes = applyDependencyRules(ctx, pkg);

  const pretty = (items: string[]) => items.map((x) => `   • ${x}`).join("\n");
  if (changes.set.length) console.log(chalk.gray("🧭 Set/updated:\n" + pretty(changes.set)));
  if (changes.replace.length) console.log(chalk.gray("🔁 Replaced:\n" + pretty(changes.replace)));
  if (changes.remove.length) console.log(chalk.gray("🧹 Removed:\n" + pretty(changes.remove)));
  if (changes.warn.length) console.log(chalk.yellow("⚠️  Review manually:\n" + pretty(changes.warn)));

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
  console.log(chalk.gray("   • Rules cover Vue 2 compiler removal, class-decorator pins, Vuetify 3, and CLI 5 when present."));
  console.log(chalk.gray("   • Test tooling bumps only if already present (no new frameworks added)."));
}
