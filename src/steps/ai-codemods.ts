import path from "path";
import fs from "fs/promises";
import { globby } from "globby";
import chalk from "chalk";
import { execa } from "execa";
import { aiRewriteFile } from "../core/ai.js";
import type { RunContext } from "../core/types.js";
import ora from "ora";

// Time estimation for file migration
function estimateFileTime(lineCount: number, retryAttempts: number = 1): number {
  // Base time for AI processing (seconds)
  const baseAiTime = 15;
  // Additional time per 100 lines for complexity
  const complexityTime = Math.ceil(lineCount / 100) * 2;
  // Verification time per attempt
  const verificationTime = 2;
  
  // Total estimate: AI calls + verification + buffer
  const totalTime = (baseAiTime + complexityTime) * retryAttempts + verificationTime * retryAttempts + 1;
  return totalTime;
}

// Format time as MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Enhanced spinner with time tracking
function createTimedSpinner(prefix: string, estimatedSeconds: number) {
  const enabled = !!process.stdout.isTTY;
  const spinner = ora({ isEnabled: enabled, prefixText: prefix, spinner: 'dots' });
  let startTime: number;
  let updateInterval: NodeJS.Timeout | null = null;

  return {
    start(msg: string) {
      startTime = Date.now();
      const estimate = formatTime(estimatedSeconds);
      spinner.text = `${msg} [est: ${estimate}]`;
      spinner.start();
      
      // Update elapsed time every second
      updateInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const estimate = formatTime(estimatedSeconds);
        const elapsedStr = formatTime(elapsed);
        spinner.text = `${msg} [${elapsedStr}/${estimate}]`;
      }, 1000);
    },
    update(msg: string) {
      if (updateInterval) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const estimate = formatTime(estimatedSeconds);
        const elapsedStr = formatTime(elapsed);
        spinner.text = `${msg} [${elapsedStr}/${estimate}]`;
      } else {
        spinner.text = msg;
      }
    },
    succeed(msg?: string) {
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
      if (msg && startTime) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const elapsedStr = formatTime(elapsed);
        spinner.succeed(`${msg} [${elapsedStr}]`);
      } else if (msg) {
        spinner.succeed(msg);
      } else {
        spinner.succeed();
      }
    },
    fail(msg?: string) {
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
      if (msg && startTime) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const elapsedStr = formatTime(elapsed);
        spinner.fail(`${msg} [${elapsedStr}]`);
      } else if (msg) {
        spinner.fail(msg);
      } else {
        spinner.fail();
      }
    },
    stop(_clearLine = true) {
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
      spinner.stop();
    }
  };
}

// Spinner that delegates to `ora` (handles TTY, cursor, interleaved logs)
function createSpinner(prefix: string) {
  const enabled = !!process.stdout.isTTY;
  const spinner = ora({ isEnabled: enabled, prefixText: prefix, spinner: 'dots' });
  return {
    start(msg: string) {
      spinner.text = msg;
      spinner.start();
    },
    update(msg: string) {
      spinner.text = msg;
    },
    succeed(msg?: string) {
      if (msg) spinner.succeed(msg); else spinner.succeed();
    },
    fail(msg?: string) {
      if (msg) spinner.fail(msg); else spinner.fail();
    },
    stop(_clearLine = true) {
      spinner.stop();
    }
  };
}

async function runVerifier(root: string, relPath: string): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout } = await execa('node', ['tools/verify-migration.mjs', relPath], { cwd: root });
    return { ok: true, output: stdout ?? '' };
  } catch (e: any) {
    const out = ((e && e.stdout) || '') + '\n' + ((e && e.stderr) || '');
    return { ok: false, output: out };
  }
}

// Heuristic: is this SFC already on Vue 3?
// Return a short reason if we consider it migrated so we can skip the AI call.
function detectVue3Sfc(src: string): { migrated: boolean; reason: string } {
  // Fast path: <script setup> is a strong indicator
  if (/<script[^>]*\bsetup\b/i.test(src)) {
    return { migrated: true, reason: '<script setup> present' };
  }

  // SFC macro usage only exists in Vue 3
  const macro = /(\bdefineProps\b|\bdefineEmits\b|\bdefineExpose\b|\bwithDefaults\b|\bdefineOptions\b)/;
  if (macro.test(src)) {
    return { migrated: true, reason: 'Vue 3 SFC macros used' };
  }

  // Obvious Vue 2-only patterns – if present, do NOT mark as migrated
  const vue2 = /(vue-property-decorator|@Component\b|Vue\.extend\(|mixins:\s*\[|beforeDestroy\b|destroyed\b)/;
  if (vue2.test(src)) {
    return { migrated: false, reason: 'Vue 2 patterns present' };
  }

  // Composition API via defineComponent + setup can exist on both (via plugin),
  // so treat it as neutral. Default to not migrated to be safe.
  return { migrated: false, reason: 'no strong Vue 3 signal' };
}

/**
 * Run AI codemods on a set of user-selected targets (files or folders/globs).
 * - Accepts folders; we expand to src/*//*.vue under those paths.
* - Applies one AI rewrite per file.
* - In --dry-run prints a summary only.
* - If ctx.nonInteractive === false and ctx.aiAsk === true, prompts per file (future).
* - Auto-commits each changed file if ctx.aiCommit === true.
*/
export async function aiCodemods(ctx: RunContext) {
  // Normalize AI options with safe defaults
  const targets = (ctx.aiTargets && ctx.aiTargets.length) ? ctx.aiTargets : ["src"];
  const mode: "auto" | "ask" | "report" = ctx.aiMode ?? "auto";
  const commit = Boolean(ctx.aiCommit ?? false);
  const maxLines = Number.isFinite((ctx.aiMaxLines as number)) ? (ctx.aiMaxLines as number) : 600;
  const excludeOverLines = Number.isFinite(((ctx as any).aiExcludeOverLines as number))
    ? (((ctx as any).aiExcludeOverLines as number) | 0)
    : 800;

  // Per-file verification & retry settings (read from ctx, fall back to defaults)
  let verifyEnabled = ((ctx as any).aiVerify ?? true) as boolean;
  const verifyRetries = Number.isFinite(((ctx as any).aiVerifyRetries as number))
    ? (((ctx as any).aiVerifyRetries as number) | 0)
    : 2; // total attempts = verifyRetries + 1
  const verifierPath = path.join(ctx.root, "tools/verify-migration.mjs");
  let verifierAvailable = true;
  try {
    await fs.stat(verifierPath);
  } catch {
    verifierAvailable = false;
    if (verifyEnabled) {
      console.log(chalk.gray("Verifier script not found (tools/verify-migration.mjs). Skipping verification for AI codemods."));
      verifyEnabled = false;
    }
  }

  // Minimum confidence: results below this will be retried even if verifier passes
  // Raised to favor higher-confidence outputs for standard, well-documented migrations
  const minConfidence = Number.isFinite(((ctx as any).aiMinConfidence as number))
    ? ((ctx as any).aiMinConfidence as number)
    : 0.90;

  const strictFirst = Boolean(((ctx as any).aiStrictFirst ?? true));

  // Header
  console.log(chalk.cyan("\n🧠 AI Codemods"));

  if (!process.env.OPENAI_API_KEY) {
    console.log(chalk.red("❌ OPENAI_API_KEY is not set. Skipping AI Codemods."));
    return;
  }

  if (!targets.length) {
    console.log(chalk.yellow("No AI targets passed. Provide files/folders with --ai-targets."));
    return;
  }

  // Expand folders/globs
  const patterns: string[] = [];
  for (const t of targets) {
    const abs = path.isAbsolute(t) ? t : path.join(ctx.root, t);
    // if it's a dir, scan standard extensions inside
    // else treat as direct glob/file
    try {
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) {
        patterns.push(path.join(abs, "**/*.vue"));
      } else {
        patterns.push(abs);
      }
    } catch {
      // fallback: treat as glob from cwd
      patterns.push(abs);
    }
  }

  const files = await globby(patterns, { gitignore: true });
  const vueFiles = files.filter((f) => f.endsWith('.vue'))
    .sort((a, b) => {
      // Sort by depth (shallower first), then by path order
      const depthA = a.split('/').length;
      const depthB = b.split('/').length;
      
      if (depthA !== depthB) {
        return depthA - depthB; // Shallower directories first
      }
      
      // Same depth - keep natural order (no additional sorting)
      return 0;
    });
  if (!vueFiles.length) {
    console.log(chalk.yellow("No matching .vue files found for AI targets."));
    return;
  }
  console.log(chalk.gray(`Targets: ${vueFiles.length} file(s)`));

  // project hints sent to the model (kept short)
  const hints: string[] = [];
  if (ctx.compat) hints.push("Vue 3 compat build is enabled (@vue/compat).");
  if (ctx.scan?.deps?.vuetify) hints.push(`Vuetify present: ${ctx.scan.deps.vuetify}`);
  if (ctx.scan?.deps?.["vue-router"]) hints.push(`Router present: ${ctx.scan.deps["vue-router"]}`);
  if (ctx.scan?.deps?.["vue-i18n"]) hints.push(`i18n present: ${ctx.scan.deps["vue-i18n"]}`);

  const goals = [
    "Migrate Vue 2 syntax to Vue 3 (createApp/app.use, lifecycle names, v-model changes).",
    "If class-based component detected, convert to <script setup> Composition API (preserve props/emits).",
    "If Vuetify 2 usage detected, migrate to Vuetify 3 APIs (component/prop names, slots).",
    "Keep business logic and types intact; add TODO comments if unsure.",
    `Aim for model confidence >= ${minConfidence.toFixed(2)} on the first attempt. If only standard patterns are applied (no business logic change), set confidence to 0.95+.`,
    "CRITICAL: Use useAxios() and useT() from @/composables/useGlobals. Do NOT implement local fallbacks/wrappers or access getCurrentInstance().",
    "CRITICAL: Always provide a confidence score at the end and mention if assumptions are untested.",
    ...(strictFirst
      ? [
          "Prefer minimal, surgical edits. Do NOT reformat or reorder code unless required by migration.",
          "Do NOT introduce new libraries or remove existing logic. Touch only what is necessary to satisfy migration rules and compilation.",
          "Avoid broad refactors. Preserve templates and styles; only update APIs and patterns that must change for Vue 3.",
        ]
      : []),
  ];

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let failed = 0;
  const updatedFiles: string[] = [];
  let fatalError = false;
  
  // Overall migration timing
  const overallStartTime = Date.now();
  let totalEstimatedTime = 0;

  // Pre-calculate total estimated time for all files
  for (const file of vueFiles) {
    const original = await fs.readFile(file, 'utf8');
    const lineCount = original.split('\n').length;
    totalEstimatedTime += estimateFileTime(lineCount);
  }
  
  console.log(chalk.gray(`Total estimated time: ${formatTime(totalEstimatedTime)}`));

  for (let i = 0; i < vueFiles.length; i++) {
    const file = vueFiles[i];
    const rel = path.relative(ctx.root, file);
    const lang = 'vue' as const;

    const original = await fs.readFile(file, 'utf8');

    // Skip files that already look migrated to Vue 3
    const v3 = detectVue3Sfc(original);
    if (v3.migrated) {
      const indexStr = chalk.gray(`[${i + 1}/${vueFiles.length}]`);
      console.log(`${indexStr} ${chalk.white(rel)} → ${chalk.gray(`skipped (${v3.reason})`)}`);
      skipped++;
      continue;
    }

    // Exclude very large files to avoid excessive AI diffs
    const lineCount = original.split('\n').length;
    if (lineCount >= excludeOverLines) {
      const indexStr = chalk.gray(`[${i + 1}/${vueFiles.length}]`);
      console.log(`${indexStr} ${chalk.white(rel)} → ${chalk.gray(`skipped (too large: ${lineCount} lines ≥ ${excludeOverLines})`)}`);
      skipped++;
      continue;
    }

    let attempts = 0;
    let success = false;
    let lastVerifierOut = '';

    // Per-file start line with time estimation
    const indexStr = chalk.gray(`[${i + 1}/${vueFiles.length}]`);
    const prefix = `${indexStr} ${chalk.white(rel)} → `;
    const estimatedTime = estimateFileTime(lineCount, verifyRetries + 1);
    const spin = createTimedSpinner(prefix, estimatedTime);

    while (attempts <= verifyRetries) {
      attempts++;

      // Strengthen goals on retries with verifier output
      const augmentedGoals = attempts === 1
        ? goals
        : [
            ...goals,
            `Raise confidence to >= ${minConfidence}. If only routine mappings are needed, set 0.95+.`,
            `Fix verifier violations for ${rel}. Only change what is needed to comply with rules. Do NOT remove business logic. Violations summary (may be truncated):\n${lastVerifierOut.slice(0, 1200)}`,
          ];

      const before = success ? await fs.readFile(file, 'utf8') : original;

      spin.start(`AI rewrite (attempt ${attempts}/${verifyRetries + 1})`);
      let result: Awaited<ReturnType<typeof aiRewriteFile>> | null = null;
      try {
        result = await aiRewriteFile(ctx, {
          filePath: rel,
          language: lang,
          code: before,
          projectHints: hints,
          goals: augmentedGoals,
        });
        spin.stop();
      } catch (err: any) {
        const msg = err?.message || String(err);
        spin.fail(`error: ${msg}`);
        console.log(chalk.red(`AI rewrite failed for ${rel}: ${msg}`));
        failed++;
        fatalError = true;
        break;
      }

      if (!result) {
        console.log(chalk.gray('skipped'));
        skipped++;
        break;
      }

      const after = String(result.code);
      if (after === before) {
        console.log(chalk.gray('unchanged'));
        unchanged++;
        break;
      }

      // Optional guard: skip huge rewrites
      if (maxLines && Math.abs(after.split('\n').length - before.split('\n').length) > maxLines) {
        console.log(chalk.yellow('skipped (patch too large)'));
        skipped++;
        break;
      }

      // Write candidate to disk so the verifier can read it
      await fs.writeFile(file, after, 'utf8');

      // If verify disabled, accept immediately
      if (!verifyEnabled) {
        success = true;
        const confOut = typeof result.confidence === 'number' ? result.confidence.toFixed(2) : 'n/a';
        console.log(chalk.green(`updated (conf ${confOut})`));
        break;
      }

      // Run verifier for this single file
      spin.start('verifying');
      const { ok, output } = await runVerifier(ctx.root, rel);
      spin.stop();
      if (ok) {
        // Confidence gate: retry if below threshold even when verifier passes
        if (typeof result.confidence === 'number' && result.confidence < minConfidence) {
          lastVerifierOut = `Passed verifier but confidence ${result.confidence.toFixed(2)} < min ${minConfidence}.`;
          await fs.writeFile(file, original, 'utf8');
          console.log(chalk.yellow(`low confidence; retry ${attempts}/${verifyRetries + 1}`));
          if (attempts > verifyRetries) {
            console.log(chalk.red('failed'));
            failed++;
            break;
          }
          continue;
        }

        success = true;
        const confOut = typeof result.confidence === 'number' ? result.confidence.toFixed(2) : 'n/a';
        console.log(chalk.green(`updated (conf ${confOut})`));
        break;
      }

      // Failed verification → restore original (or last good), prepare retry
      lastVerifierOut = output || 'verifier returned non-zero status';
      await fs.writeFile(file, original, 'utf8');
      console.log(chalk.yellow(`verify failed; retry ${attempts}/${verifyRetries + 1}`));

      if (attempts > verifyRetries) {
        console.log(chalk.red('failed'));
        failed++;
        break;
      }
    }

    if (fatalError) {
      break;
    }

    if (success) {
      changed++;
      updatedFiles.push(rel);
      if (commit) {
        try {
          await execa('git', ['add', rel]);
          await execa('git', ['commit', '-m', `ai: migrate ${rel} to Vue 3`]);
        } catch (e) {
          console.log(chalk.yellow(` (commit failed)`));
        }
      }
    }
  }

  if (fatalError) {
    console.log(chalk.red("\nAI Codemods aborted due to an error. Fix the issue above and rerun."));
    return;
  }

  if (!verifyEnabled && !verifierAvailable) {
    console.log(chalk.yellow("⚠️ Verification skipped (tools/verify-migration.mjs not found). Review changes manually."));
  } else if (!verifyEnabled) {
    console.log(chalk.yellow("⚠️ Verification disabled. Review changes manually."));
  }

  // Summary with timing information
  const overallElapsedTime = Math.floor((Date.now() - overallStartTime) / 1000);
  const overallElapsedStr = formatTime(overallElapsedTime);
  const totalEstimatedStr = formatTime(totalEstimatedTime);
  
  console.log(
    chalk.green(`\n✅ Done. Updated ${changed}/${vueFiles.length}`) +
      chalk.gray(` (unchanged ${unchanged}, skipped ${skipped}, failed ${failed})`),
  );
  console.log(
    chalk.cyan(`⏱️  Total time: ${overallElapsedStr}`) +
      chalk.gray(` (estimated: ${totalEstimatedStr})`),
  );
  
  if (updatedFiles.length) {
    // Brief list of updated files
    for (const u of updatedFiles) console.log(chalk.gray(` • ${u}`));
  }
}
