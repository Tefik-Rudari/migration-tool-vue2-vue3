import { banner, confirmContinue, kv } from "./core/ui.js";
import type { RunContext, Step } from "./core/types.js";
import { preflight } from "./steps/preflight.js";
import { scan } from "./steps/scan.js";
import { updateDeps } from "./steps/update-deps.js";
import { aiCodemods } from "./steps/ai-codemods.js";
import chalk from "chalk";

export async function runAll(ctx: RunContext) {
  const steps: Step[] = [
    { name: "Preflight", description: "Verify git state, current branch.", run: preflight },
    { name: "Scan", description: "Detect Vue/Router/Vuex/Vuetify versions, list files, find blockers.", run: scan },
    { name: "Update Dependencies", description: "Bump to Vue 3 core deps and install. Optionally add @vue/compat.", run: updateDeps },
  ];

  const lname = (s: Step) => s.name.toLowerCase();

  const onlyIdx = ctx.only ? steps.findIndex(s => lname(s) === ctx.only!.toLowerCase()) : -1;
  const fromIdx = ctx.from ? steps.findIndex(s => lname(s) === ctx.from!.toLowerCase()) : 0;
  const toIdx = ctx.to ? steps.findIndex(s => lname(s) === ctx.to!.toLowerCase()) : steps.length - 1;

  const start = onlyIdx >= 0 ? onlyIdx : Math.max(0, fromIdx >= 0 ? fromIdx : 0);
  const end = onlyIdx >= 0 ? onlyIdx : Math.min(steps.length - 1, toIdx >= 0 ? toIdx : steps.length - 1);

  for (let i = start; i <= end; i++) {
    const s = steps[i];
    banner(`Step ${i + 1} of ${steps.length}: ${s.name}`);
    console.log(chalk.gray(s.description));

    const ok = await confirmContinue(`Proceed with "${s.name}"?`, ctx.nonInteractive);
    if (!ok) {
      console.log(chalk.yellow("⏹  Aborted by user."));
      process.exit(0);
    }

    await s.run(ctx);

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
