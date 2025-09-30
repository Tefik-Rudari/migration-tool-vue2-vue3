// Purpose:
//   Robust package manager resolution for the migration tool.
//   - Detect by lockfiles AND by availability of the binary.
//   - Handle mismatches interactively (prompts) or non-interactively (--yes).
//
// Behavior summary:
//   Priority by lockfiles (if tool can run them):
//     1) package-lock.json → npm
//     2) yarn.lock         → yarn (fallback if npm isn't selected)
//     3) pnpm-lock.yaml    → pnpm (optional; we recognize it but won’t use unless present)
//   If no lockfiles: ask user (yarn/npm); default to npm in --yes mode.
//
// Notable APIs used:
//   - fs.existsSync(path): does this file exist?
//   - execa('cmd', ['-v']): is this binary available?

import fs from "fs";
import path from "path";
import prompts from "prompts";
import { execa } from "execa";

export type PM = "yarn" | "npm" | "pnpm";

async function hasBinary(cmd: string): Promise<boolean> {
  try {
    // On success this prints a version and exits 0. On failure ENOENT or non-zero.
    await execa(cmd, ["-v"]);
    return true;
  } catch {
    return false;
  }
}

export async function resolvePackageManager(opts: {
  root: string;
  nonInteractive: boolean;
}): Promise<PM> {
  const { root, nonInteractive } = opts;

  const hasYarnLock = fs.existsSync(path.join(root, "yarn.lock"));
  const hasNpmLock = fs.existsSync(path.join(root, "package-lock.json"));
  const hasPnpmLock = fs.existsSync(path.join(root, "pnpm-lock.yaml"));

  const yarnOk = await hasBinary("yarn");
  const npmOk = await hasBinary("npm");
  const pnpmOk = await hasBinary("pnpm");

  // 1) Ideal matches: lockfile + binary
  if (hasNpmLock && npmOk) return "npm";
  if (hasYarnLock && yarnOk) return "yarn";
  if (hasPnpmLock && pnpmOk) return "pnpm";

  // 2) Mismatch cases: lockfile present but binary missing
  if (hasYarnLock && !yarnOk) {
    if (nonInteractive) {
      // Non-interactive: default to npm if available; else error with guidance.
      if (npmOk) return "npm";
      throw new Error(
        "yarn.lock detected but 'yarn' is not installed, and 'npm' is unavailable in non-interactive mode."
      );
    }
    const { pm } = await prompts({
      type: "select",
      name: "pm",
      message:
        "Detected yarn.lock but Yarn is not installed. Which package manager should we use?",
      choices: [
        { title: "npm (generate/maintain package-lock.json)", value: "npm" },
        { title: "Install Yarn manually then re-run", value: "abort" }
      ],
      initial: 0
    });
    if (pm === "npm") return "npm";
    throw new Error("Aborted: please install Yarn (npm i -g yarn) or choose npm.");
  }

  if (hasNpmLock && !npmOk) {
    if (nonInteractive) {
      if (yarnOk) return "yarn";
      throw new Error(
        "package-lock.json detected but 'npm' is not installed, and 'yarn' is unavailable in non-interactive mode."
      );
    }
    const { pm } = await prompts({
      type: "select",
      name: "pm",
      message:
        "Detected package-lock.json but npm is not installed. Which package manager should we use?",
      choices: [
        { title: "yarn (will ignore package-lock.json)", value: "yarn" },
        { title: "Abort and install npm", value: "abort" }
      ],
      initial: 0
    });
    if (pm === "yarn") return "yarn";
    throw new Error("Aborted: please install npm or choose Yarn.");
  }

  // 3) No lockfiles; ask user (default npm in --yes)
  if (nonInteractive) {
    if (npmOk) return "npm";
    if (yarnOk) return "yarn";
    throw new Error("No lockfiles and no package manager binaries found.");
  }

  const { pm } = await prompts({
    type: "select",
    name: "pm",
    message: "No lockfiles detected. Which package manager should we use?",
    choices: [
      { title: "npm (default)", value: "npm" },
      { title: "yarn", value: "yarn" }
      // You could add pnpm here if your team uses it.
    ],
    initial: 0
  });

  if (pm === "npm" && npmOk) return "npm";
  if (pm === "yarn" && yarnOk) return "yarn";

  throw new Error(`Selected package manager '${pm}' is not installed.`);
}
