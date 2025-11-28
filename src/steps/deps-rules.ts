import type { RunContext } from "../core/types.js";

export type DepRuleAction = "set" | "remove" | "replace" | "warn";

export type DepRule = {
  name: string;                             // package to match
  action: DepRuleAction;                    // what to do when present
  version?: string;                         // target version/range for set/replace
  target?: string;                          // replacement package name (for replace)
  reason?: string;                          // short explanation for logs
  requirePresence?: boolean;                // skip if not currently installed (default false = allowed to add)
  condition?: (ctx: RunContext, pkg: any) => boolean; // optional guard (e.g., compat flag)
};

// Data-driven dependency actions. Only applied when the package is present,
// unless requirePresence is false (e.g., vue, @vue/compat).
export const depRules: DepRule[] = [
  { name: "vue", action: "set", version: "3.5.18", reason: "Vue 3 core pin" },
  { name: "vue-router", action: "set", version: "^4.4.0", reason: "Vue Router for Vue 3", requirePresence: true },
  { name: "vuex", action: "set", version: "^4.1.0", reason: "Vuex 4 works with Vue 3", requirePresence: true },
  { name: "@vue/compat", action: "set", version: "^3.5.18", reason: "Compat build for incremental migration", condition: (ctx) => ctx.compat === true },

  // Class API (compat safe)
  { name: "vue-class-component", action: "set", version: "^7.2.6", reason: "Class API compatible with Vue 3", requirePresence: true },
  { name: "vue-property-decorator", action: "set", version: "^8.5.1", reason: "Class API compatible with Vue 3", requirePresence: true },

  // Vue 2-only compiler
  { name: "vue-template-compiler", action: "remove", reason: "Vue 2 only; replaced by @vue/compiler-sfc" },

  // Jest transformers
  { name: "vue-jest", action: "replace", target: "@vue/vue3-jest", version: "^29.2.5", reason: "Vue 3 SFC transformer" },
  { name: "@vue/vue3-jest", action: "set", version: "^29.2.5", reason: "Ensure current Vue 3 Jest transformer", requirePresence: true },

  // Compiler
  { name: "@vue/compiler-sfc", action: "set", version: "^3.5.0", reason: "Vue 3 SFC compiler", requirePresence: true },

  // Vuetify
  { name: "vuetify", action: "set", version: "^3.7.0", reason: "Vuetify 3 for Vue 3 projects", requirePresence: true },
  { name: "vuetify-loader", action: "remove", reason: "Vuetify 2 loader; not used in v3" },
  { name: "vue-cli-plugin-vuetify", action: "remove", reason: "Vuetify 2 CLI plugin; not used in v3" },

  // i18n / Axios
  { name: "vue-i18n", action: "set", version: "^9.14.0", reason: "Vue I18n for Vue 3", requirePresence: true },
  { name: "vue-axios", action: "set", version: "^3.5.2", reason: "Vue 3 compatible vue-axios", requirePresence: true },
  { name: "axios", action: "set", version: "^1.7.0", reason: "Latest Axios", requirePresence: true },

  // Charts
  { name: "chart.js", action: "set", version: "^4.4.0", reason: "Chart.js 4 works with Vue 3", requirePresence: true },
  { name: "vue-chartjs", action: "set", version: "^5.3.0", reason: "Vue Chart.js v5 for Vue 3", requirePresence: true },

  // Forms
  { name: "vee-validate", action: "set", version: "^4.12.0", reason: "Vee Validate v4 supports Vue 3", requirePresence: true },
  { name: "vuex-persistedstate", action: "set", version: "^4.1.0", reason: "Vuex persisted state plugin for Vuex 4", requirePresence: true },

  // ESLint
  { name: "eslint", action: "set", version: "^8.0.0", reason: "ESLint 8 for Vue CLI 5", requirePresence: true },
  { name: "eslint-plugin-vue", action: "set", version: "^9.26.0", reason: "Vue 3 template linting", requirePresence: true },
  { name: "eslint-plugin-vuetify", action: "remove", reason: "Vuetify 2 ESLint plugin" },

  // TypeScript toolchain
  { name: "typescript", action: "set", version: "^5.5.4", reason: "Modern TypeScript baseline", requirePresence: true },
  { name: "@typescript-eslint/parser", action: "set", version: "^6.21.0", reason: "TS ESLint parser aligned with ESLint 8", requirePresence: true },
  { name: "@typescript-eslint/eslint-plugin", action: "set", version: "^6.21.0", reason: "TS ESLint plugin aligned with ESLint 8", requirePresence: true },
  { name: "@types/node", action: "set", version: "^18.19.0", reason: "Node types that match TS baseline", requirePresence: true },

  // Jest stack
  { name: "jest", action: "set", version: "^29.7.0", reason: "Jest version compatible with Vue 3 tooling", requirePresence: true },
  { name: "ts-jest", action: "set", version: "^29.2.5", reason: "TS Jest transformer for Jest 29", requirePresence: true },
  { name: "@types/jest", action: "set", version: "^29.5.12", reason: "Jest type defs aligned with Jest 29", requirePresence: true },

  // Webpack pins (CLI manages Webpack 5)
  { name: "webpack", action: "remove", reason: "Vue CLI 5 manages Webpack 5; avoid pinning" },
  { name: "webpack-bundle-analyzer", action: "remove", reason: "Remove CLI-managed Webpack pins" },
  { name: "webpack-chain", action: "remove", reason: "Remove CLI-managed Webpack pins" },

  // Loaders
  { name: "sass-loader", action: "set", version: "^13.3.2", reason: "Sass loader compatible with Webpack 5", requirePresence: true },

  // CLI 5
  { name: "@vue/cli-service", action: "set", version: "^5.0.0", reason: "Vue CLI 5 for Vue 3", requirePresence: true },
  { name: "@vue/cli-plugin-babel", action: "set", version: "^5.0.0", reason: "Vue CLI 5 plugin", requirePresence: true },
  { name: "@vue/cli-plugin-eslint", action: "set", version: "^5.0.0", reason: "Vue CLI 5 plugin", requirePresence: true },
  { name: "@vue/cli-plugin-typescript", action: "set", version: "^5.0.0", reason: "Vue CLI 5 plugin", requirePresence: true },
  { name: "@vue/cli-plugin-unit-jest", action: "set", version: "^5.0.0", reason: "Vue CLI 5 plugin", requirePresence: true },
  { name: "@vue/cli-plugin-e2e-cypress", action: "set", version: "^5.0.0", reason: "Vue CLI 5 plugin", requirePresence: true },
  { name: "@vue/babel-preset-app", action: "set", version: "^5.0.0", reason: "Vue CLI 5 preset", requirePresence: true },

  // Icons
  { name: "@fortawesome/vue-fontawesome", action: "set", version: "^3.0.0", reason: "FontAwesome Vue 3 wrapper", requirePresence: true },

  // Legacy/obsolete warnings only
  { name: "vue-resource", action: "warn", reason: "Legacy Vue 2 plugin; consider replacing" },
  { name: "vue-analytics", action: "warn", reason: "Vue 2 analytics plugin; replace with vue-gtag-next or similar" },
  { name: "vue-clipboard2", action: "warn", reason: "Vue 2 clipboard plugin; use vue-clipboard3 or modern alternatives" },
  { name: "vue-fragment", action: "warn", reason: "Vue 2-only; fragments are native in Vue 3" },
  { name: "vue-meta", action: "warn", reason: "Vue 2-era meta mgmt; prefer @vueuse/head or unhead" },
  { name: "vue-head", action: "warn", reason: "Vue 2-only; use @unhead/vue" },
  { name: "vue-router-layout", action: "warn", reason: "Vue 2 pattern; use route meta/layout wrappers" },
  { name: "vue-the-mask", action: "warn", reason: "Vue 2 mask library; consider maska or vue-the-mask-next" },
  { name: "vue2-autocomplete-js", action: "warn", reason: "No Vue 3 release; replace" },
];
