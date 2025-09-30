import { execa } from "execa";
import chalk from "chalk";
import type { RunContext } from "../core/types.js";

// Checks we're in a git repo and shows current branch.
// Non-destructive; we keep branch creation for later.
export async function preflight(_ctx: RunContext) {
  console.log(chalk.cyan("🔒 Preflight checks…"));

  try {
    await execa("git", ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    console.log(chalk.red("❌ Not a git repo. Run this from your project root."));
    process.exit(1);
  }

  try {
    const { stdout: branch } = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    console.log("🌿 Current branch:", chalk.bold(branch));
  } catch {}

  const { stdout } = await execa("git", ["status", "--porcelain"]);
  if (stdout.trim().length) {
    console.log(chalk.yellow("⚠️  Working tree has uncommitted changes. Proceeding, but commit often."));
  }
}
