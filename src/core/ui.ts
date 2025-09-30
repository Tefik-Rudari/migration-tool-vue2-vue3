import chalk from "chalk";
import prompts from "prompts";

// Pretty banners & confirmations used by the orchestrator/steps

export function banner(title: string) {
  const line = "─".repeat(Math.max(10, title.length + 2));
  console.log(chalk.cyan(`\n┌${line}┐`));
  console.log(chalk.cyan(`│ ${title} │`));
  console.log(chalk.cyan(`└${line}┘`));
}

export async function confirmContinue(message: string, nonInteractive: boolean): Promise<boolean> {
  if (nonInteractive) {
    // In --yes mode we auto-accept to support CI or non-interactive runs
    console.log(chalk.gray(`${message} (auto-accepted via --yes)`));
    return true;
  }
  const res = await prompts({
    type: "confirm",
    name: "ok",
    message,
    initial: true,
  });
  return Boolean(res.ok);
}

export function kv(label: string, value: string) {
  console.log(`${chalk.gray("•")} ${chalk.white(label)} ${chalk.gray("→")} ${chalk.bold(value)}`);
}
