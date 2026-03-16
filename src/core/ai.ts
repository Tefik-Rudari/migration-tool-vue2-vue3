// Minimal AI bridge: sends one file + context, returns full rewritten code.
// Uses OPENAI_API_KEY from env. You can swap the provider later without changing callers.

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
}

import "dotenv/config";
import type { RunContext } from "./types.js";

import fetch from "node-fetch";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES module __dirname polyfill
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function extractSmartRules(rulesText: string, filePath: string): string {
  if (!rulesText) return '';

  // Split by H2 sections (## ). Keep the preface too
  const lines = rulesText.split(/\r?\n/);
  type Sec = { title: string; content: string[] };
  const sections: Sec[] = [];
  let cur: Sec = { title: '(preface)', content: [] };
  for (const ln of lines) {
    const m = ln.match(/^##\s+(.+?)\s*$/);
    if (m) {
      sections.push(cur);
      cur = { title: m[1], content: [] };
    } else {
      cur.content.push(ln);
    }
  }
  sections.push(cur);

  const wantTitles = new Set([
    'Hard rules',
    'Project profiles (choose deliberately)',
    'Vuetify 3 mappings (common)',
    'Vuetify v2 → v3 quick mappings (expanded)',
    'Directives & external libs',
    'v-model & emits mapping',
    'Axios & i18n (globals + typing)',
    'Types and IDs (project conventions)',
    'Router and helpers (project conventions)',
    'VDataTable slot typing (Vuetify 3)',
    'VDataTable slot typing and TS ergonomics (VERY IMPORTANT)',
    'Editor & lint (Vue 3)',
  ]);

  const out: string[] = [];
  // Always include preface (first block before first H2)
  if (sections.length && sections[0].title === '(preface)') {
    out.push(sections[0].content.join('\n'));
  }

  for (const s of sections) {
    if (wantTitles.has(s.title)) {
      out.push(`## ${s.title}`);
      out.push(s.content.join('\n'));
    }
  }

  // Folder overrides: include any section whose title matches the file path pattern
  // Sections are titled like: Folder overrides — `src/components/sysop/billing/*`
  for (const s of sections) {
    const m = s.title.match(/^Folder overrides —\s*`([^`]+)`/);
    if (!m) continue;
    const pat = m[1]; // simple prefix match on path portion before any wildcard
    const prefix = pat.split('*')[0];
    if (!prefix) continue;
    if (filePath.replace(/\\/g, '/').startsWith(prefix)) {
      out.push(`## ${s.title}`);
      out.push(s.content.join('\n'));
    }
  }

  const result = out.join('\n\n').trim();
  // Hard cap to avoid huge prompts; keep last 60k chars if needed
  const MAX = 60000;
  return result.length > MAX ? result.slice(0, MAX) : result;
}

function readRulesFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

// Rough cost estimator per 1k tokens (adjust as needed for your account/pricing)
function estimateCost(model: string, promptTokens: number, completionTokens: number) {
  // Optional env overrides (USD per 1k tokens)
  const envIn = Number(process.env.OPENAI_RATE_INPUT_PER1K || "");
  const envOut = Number(process.env.OPENAI_RATE_OUTPUT_PER1K || "");

  // Baseline rates (adjust as needed). We match by prefix so "gpt-5-xxx" works.
  const per1k: Record<string, { input: number; output: number }> = {
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    "gpt-4o": { input: 0.005, output: 0.015 },
    // Assume GPT‑5 pricing similar to GPT‑4o unless overridden by env
    "gpt-5": { input: 0.005, output: 0.015 },
  };

  const key = Object.keys(per1k).find((k) => model.startsWith(k)) || "gpt-4o-mini";
  const base = per1k[key];

  const inputRate = Number.isFinite(envIn) && envIn > 0 ? envIn : base.input;
  const outputRate = Number.isFinite(envOut) && envOut > 0 ? envOut : base.output;

  const cost = (promptTokens / 1000) * inputRate + (completionTokens / 1000) * outputRate;
  return { cost, rates: { input: inputRate, output: outputRate } };
}

export type AIRewriteInput = {
  filePath: string;
  language: "vue" | "ts" | "js";
  code: string;              // full file text
  projectHints?: string[];   // short bullets (deps, vuetify3, compat on, etc.)
  goals?: string[];          // what to fix (e.g. "Vue2->Vue3", "Vuetify2->Vuetify3")
};

export async function aiRewriteFile(
  ctx: RunContext,
  input: AIRewriteInput
): Promise<{ code: string; rationale: string; confidence: number; duration: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in env.");
  }

  // keep payload bounded
  const MAX_CHARS = 90000;
  const trimmedCode = input.code.length > MAX_CHARS
    ? input.code.slice(0, MAX_CHARS) + "\n/* ...file truncated for AI... */"
    : input.code;

  // Prompt composition:
  // 1. Always load the built-in generic rules shipped with the package.
  // 2. If --rules or MIGRATION_RULES_PATH is provided, append that file as a
  //    project-specific overlay instead of replacing the built-in rules.
  const builtInRulesPath = path.resolve(__dirname, '../../MIGRATION_RULES.md');
  const customRulesPath = ctx.rulesPath || process.env.MIGRATION_RULES_PATH;
  let builtInRulesText = "";
  let customRulesText = "";

  try {
    builtInRulesText = readRulesFile(builtInRulesPath);
    console.log("📖 Loaded built-in migration rules");
  } catch {
    console.warn("⚠️  Built-in migration rules not found. Using system prompt only.");
  }

  if (customRulesPath) {
    try {
      customRulesText = readRulesFile(customRulesPath);
      console.log(`📖 Loaded custom migration rules overlay: ${path.resolve(customRulesPath)}`);
    } catch {
      console.warn(`⚠️  Custom rules file not found: ${customRulesPath}`);
    }
  }

  // Allow a lighter, faster prompt by sending a subset of the rules most relevant to the current file.
  // Set AI_RULES_MODE=full to send the entire file.
  const rulesMode = (process.env.AI_RULES_MODE || 'smart').toLowerCase();
  const builtInRulesForPrompt =
    rulesMode === "full"
      ? builtInRulesText
      : extractSmartRules(builtInRulesText, input.filePath);

  // Keep custom overlays intact so project-specific instructions are never dropped
  // by the smart section extractor.
  const rulesSections = [
    builtInRulesForPrompt.trim(),
    customRulesText.trim()
      ? [
          "## Custom project overrides",
          "These rules are user-supplied and take precedence when they conflict with the built-in defaults.",
          "",
          customRulesText.trim(),
        ].join("\n")
      : "",
  ].filter(Boolean);
  const rulesForPrompt = rulesSections.join("\n\n");

  const system = [
    rulesForPrompt ? `PROJECT RULES:\n${rulesForPrompt}` : '',
    'You are a senior Vue engineer. Rewrite ONE file so it compiles on Vue 3 and, when applicable, Vuetify 3 with identical behavior.',
    'Update BOTH the <script> logic and template when the migration requires it.',
    'Make the smallest correct change. Keep business logic and types. If uncertain, add a short // TODO and proceed.',
    '',
    'Required migrations:',
    '- Use <script setup lang=\'ts\'> Composition API (no vue-class-component / vue-property-decorator).',
    '- Vue 3 core: new Vue()->createApp; Vue.use()->app.use; lifecycle beforeDestroy/destroyed->beforeUnmount/unmounted; v-model/.sync -> v-model[:arg] + defineEmits; modern slot syntax.',
    '- Emits: previous $emit(\'input\', x) -> modelValue + emit(\'update:modelValue\', x); type emits.',
    "- Preserve the file's existing i18n approach unless the project rules explicitly require a different migration target.",
    '- Router: use useRouter()/useRoute() and router.currentRoute.value.',
    "- Preserve the file's existing HTTP client/integration unless the project rules explicitly require a different adapter.",
    '- Import hygiene: every referenced symbol must be imported; never use global Vue.*.',
    '',
    'Vuetify 3 specifics (do not use V2 APIs):',
    '- <v-menu> uses v-model (boolean) for open/close; activator slot uses { props } and v-bind="props".',
    '- <v-btn text> -> variant="text".',
    '- v-date-picker: remove deprecated props; keep supported ones.',
    '- Prefer item-title over item-text; keep item-value.',
    '- Use v-model:search instead of :search-input.sync.',
    '',
    '',
    'CONFIDENCE SCORING GUIDELINES:',
    '- 0.95-1.0: Simple, straightforward migrations (basic prop renames, lifecycle methods)',
    '- 0.85-0.94: Standard Vue 2→3 patterns with clear mappings (v-model, emits, composition API)',
    '- 0.70-0.84: Complex but documented migrations (Vuetify 2→3, multiple interdependent changes)',
    '- 0.50-0.69: Uncertain business logic preservation, missing context, or experimental patterns',
    '- 0.30-0.49: High risk changes, deprecated patterns, or insufficient information',
    '- 0.0-0.29: Unable to safely migrate without breaking functionality',
    '',
    'CONFIDENCE FACTORS:',
    '- (-) Complex business logic that might be affected',
    '- (-) Missing imports or unclear dependencies',
    '- (-) Deprecated Vuetify components with no clear V3 equivalent',
    '- (-) Class decorators requiring major restructuring',
    '- (+) Simple prop/method renames with 1:1 mappings',
    '- (+) Standard Vue 3 composition API patterns',
    '- (+) Well-documented Vuetify 3 migrations',
    '',
    'Output strictly JSON: { "confidence": 0.0-1.0, "rationale": "Detailed explanation of migration approach and confidence reasoning", "code": "FULL FILE CONTENT" }.',
    'No diffs, no markdown, full file only.',
  ].filter(Boolean).join('\n');

  const user = [
    `FILE: ${input.filePath}`,
    `LANG: ${input.language}`,
    input.projectHints?.length ? `HINTS:\n- ${input.projectHints.join("\n- ")}` : "",
    input.goals?.length ? `GOALS:\n- ${input.goals.join("\n- ")}` : "",
    "CURRENT FILE CONTENT:",
    "```",
    trimmedCode,
    "```",
  ].filter(Boolean).join("\n");

  const temp = model.startsWith("gpt-5") ? 1 : 0;

  const t0 = Date.now();

  // Use the Chat Completions REST endpoint to stay dependency-light
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: temp,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    let body: any = undefined;
    try { body = JSON.parse(text); } catch { }

    const code = body?.error?.code || body?.error?.type || String(resp.status);
    if (resp.status === 401) {
      throw new Error(`OpenAI auth error (401). Check OPENAI_API_KEY. Raw: ${text}`);
    }
    if (resp.status === 429 || code === "insufficient_quota") {
      throw new Error(
        `OpenAI quota/rate error (429). You may be out of credits or rate-limited.\n` +
        `- Add billing or switch key\n` +
        `- Or set alternate provider via OPENAI_BASE_URL/OPENAI_MODEL. Raw: ${text}`
      );
    }
    throw new Error(`OpenAI error: ${resp.status} ${text}`);
  }

  const data = await resp.json() as any;
  const elapsed = Date.now() - t0;

  function formatTime(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;
    return `${minutes}m ${seconds}s ${milliseconds}ms`;
  }

  const usage = data.usage;
  if (usage && typeof usage.total_tokens === "number") {
    try {
      const promptTokens = Number(usage.prompt_tokens || 0);
      const completionTokens = Number(usage.completion_tokens || 0);
      const { cost } = estimateCost(model, promptTokens, completionTokens);
      console.log(
        `[AI] tokens total=${usage.total_tokens} prompt=${promptTokens} completion=${completionTokens} model=${model} est=$${cost.toFixed(6)} time=${formatTime(elapsed)}`
      );
    } catch { }
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  let parsed: any;
  try { parsed = JSON.parse(content); } catch { return null; }
  if (!parsed?.code) return null;

  return {
    code: parsed.code,
    rationale: String(parsed.rationale ?? ""),
    confidence: Number(parsed.confidence ?? 0),
    duration: formatTime(elapsed),
  };
}
