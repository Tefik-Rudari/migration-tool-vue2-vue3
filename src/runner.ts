import { banner, confirmContinue, kv } from "./core/ui.js";
import type { RunContext, Step } from "./core/types.js";
import { preflight } from "./steps/preflight.js";
import { scan } from "./steps/scan.js";
import { updateDeps } from "./steps/update-deps.js";
import { aiCodemods } from "./steps/ai-codemods.js";
import chalk from "chalk";

export async function runAll(ctx: RunContext) {
  const allSteps: Step[] = [
    { name: "Preflight", description: "Verify git state, current branch.", run: preflight },
    { name: "Scan", description: "Detect Vue/Router/Vuex/Vuetify versions, list files, find blockers.", run: scan },
    { name: "Update Dependencies", description: "Bump to Vue 3 core deps and install. Optionally add @vue/compat.", run: updateDeps, optional: true },
  ];

  const failedSteps: { name: string; error: string }[] = [];

  const formatError = (err: unknown) => {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    const anyErr = err as any;
    return anyErr.shortMessage || anyErr.stderr || anyErr.message || String(err);
  };

  const lname = (s: Step) => s.name.toLowerCase();
  const normalizeStepName = (name: string) => name.toLowerCase().replace(/\s+/g, "-");

  // Filter steps based on --skip and --only flags
  let steps = allSteps;

  if (ctx.onlySteps && ctx.onlySteps.length > 0) {
    const onlyNames = ctx.onlySteps.map(s => normalizeStepName(s));
    steps = steps.filter(s => onlyNames.includes(normalizeStepName(s.name)));
    console.log(chalk.cyan(`\n📋 Only running: ${steps.map(s => s.name).join(", ")}`));
  } else if (ctx.skipSteps && ctx.skipSteps.length > 0) {
    const skipNames = ctx.skipSteps.map(s => normalizeStepName(s));
    steps = steps.filter(s => !skipNames.includes(normalizeStepName(s.name)));
    console.log(chalk.cyan(`\n⏭️  Skipping: ${ctx.skipSteps.join(", ")}`));
  }

  // Filter by shouldRun condition
  const stepsToRun: Step[] = [];
  for (const step of steps) {
    if (step.shouldRun) {
      const should = await step.shouldRun(ctx);
      if (should) stepsToRun.push(step);
      else console.log(chalk.gray(`⏭️  Skipping ${step.name} (condition not met)`));
    } else {
      stepsToRun.push(step);
    }
  }

  const start = 0;
  const end = stepsToRun.length - 1;
  let abortedEarly = false;

  for (let i = start; i <= end; i++) {
    const s = stepsToRun[i];
    banner(`Step ${i + 1} of ${stepsToRun.length}: ${s.name}`);
    console.log(chalk.gray(s.description));

    const ok = await confirmContinue(`Proceed with "${s.name}"?`, ctx.nonInteractive);
    if (!ok) {
      console.log(chalk.yellow("⏹  Aborted by user."));
      process.exit(0);
    }

    try {
      await s.run(ctx);
    } catch (err) {
      const msg = formatError(err);
      failedSteps.push({ name: s.name, error: msg });
      console.log(chalk.red(`❌ ${s.name} failed: ${msg}`));

      if (!s.optional) {
        const continueAfterError = await confirmContinue(
          `Continue after "${s.name}" failed? (review logs above)`,
          ctx.nonInteractive
        );
        if (!continueAfterError) {
          console.log(chalk.yellow("⏹  Aborting due to failed required step."));
          abortedEarly = true;
          break;
        }
      } else {
        console.log(chalk.yellow(`⚠️  ${s.name} is optional; continuing to next step.`));
      }
      continue;
    }

    if (s.name === "Scan" && ctx.scan) {
      console.log();
      kv("Files", String(ctx.scan.files.length));
      kv("Vue", String(ctx.scan.vue ?? "—"));
      kv("Router", String(ctx.scan.router ?? "—"));
      kv("Vuex", String(ctx.scan.vuex ?? "—"));
      kv("Vuetify", String(ctx.scan.vuetify ?? "—"));

      if (ctx.scan.blockers.length) {
        console.log(chalk.yellow("\n🚧 Blockers:"));
        for (const b of ctx.scan.blockers) console.log("  • " + b);
        console.log(chalk.gray("Vuetify 2 → 3 will be a separate command after core Vue 3 migration is complete."));
      }
    }
  }

  if (abortedEarly) {
    console.log(chalk.yellow("Fix the issue above and re-run the tool when ready."));
    return;
  }

  if (failedSteps.length) {
    console.log(chalk.yellow("\n⚠️  Some steps failed:"));
    for (const f of failedSteps) console.log(`   • ${f.name}: ${f.error}`);
    console.log(chalk.yellow("You can fix these manually and re-run specific steps with --only or --skip."));
    if (ctx.nonInteractive) {
      console.log(chalk.yellow("Skipping AI Codemods because previous steps failed (auto mode)."));
      return;
    }
    console.log(chalk.yellow("Proceed with AI Codemods at your own risk, or rerun after fixing the failures."));
  }

  // Optional: offer AI codemods after core deps update
  const proceedAI = await confirmContinue(
    "Run AI Codemods now (rewrite .vue files with model-driven rules)?",
    ctx.nonInteractive ? true : false
  );

  if (proceedAI) {
    try {
      const aiCtx = {
        ...ctx,
        aiTargets: ctx.aiTargets && ctx.aiTargets.length ? ctx.aiTargets : ["src"],
        aiMode: ctx.aiMode ?? "auto",
        aiCommit: Boolean(ctx.aiCommit ?? false),
        aiMaxLines: Number.isFinite(ctx.aiMaxLines as number) ? (ctx.aiMaxLines as number) : 600,
        aiMaxSourceLines: Number.isFinite(ctx.aiMaxSourceLines as number) ? (ctx.aiMaxSourceLines as number) : undefined,
      };
      await aiCodemods(aiCtx as typeof ctx);
    } catch (e) {
      console.log(chalk.red(`AI Codemods failed: ${(e as Error)?.message || e}`));
    }
  } else {
    console.log(chalk.gray("Skipping AI Codemods."));
  }
  banner("Core phase complete (deps)");
  console.log(chalk.green("✅ Finished selected steps. (AI Codemods offered after deps.)"));
}
