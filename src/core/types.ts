// A "step" is a named task with a run() function and a short description.
// This lets the orchestrator render progress and ask for confirmation.
export type Step = {
  name: string;                // e.g., "Preflight"
  description: string;         // e.g., "Verify git state, current branch"
  run: (ctx: RunContext) => Promise<void>;
};
// pm types
export type PM = "yarn" | "npm" | "pnpm";

// Shared context that steps can read/write.
// We’ll accumulate scan results here, package manager, flags, etc.
export type RunContext = {
  root: string;               // project root (process.cwd())
  pm: PM;                     // package manager (detected)
  dryRun: boolean;            // --dry-run
  compat: boolean;            // whether to add @vue/compat
  nonInteractive: boolean;    // --yes (skip prompts)
  from?: string;
  to?: string;
  only?: string;

  // new AI-related fields
  aiTargets?: string[];               // paths to run codemods on
  aiMode?: "auto" | "ask" | "report"; // how to apply codemods
  aiCommit?: boolean;                 // auto-commit changes?
  aiMaxLines?: number;                // safeguard for huge patches
  
  // add more as we move forward (scan results, file lists, etc.)
  scan?: {
    files: string[];
    deps: Record<string, string>;
    blockers: string[];
    vue: string | undefined;
    router: string | undefined;
    vuex: string | undefined;
    vuetify: string | undefined;
  };
};
