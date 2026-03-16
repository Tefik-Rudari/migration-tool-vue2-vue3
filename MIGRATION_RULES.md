# Migration Rules — Vue 2 → Vue 3 (OpenAI-optimized)

**Goal:** Rewrite a single file so it **compiles on Vue 3.5 + Vuetify 3 + TS 5.x** with the **same behavior**. Update **both `<script>` and template** for full migrations; for folder‑scoped incremental migrations, see Project profiles.

## 📋 QUICK REFERENCE (AI: Read this first)
**MUST DO:** Use `<script setup lang="ts">`, migrate Vue 2 patterns to Vue 3/Vuetify 3, and provide a confidence score. Keep edits minimal and avoid assuming project-specific globals.  
**TECH STACK:** Vue 3.5 + Vuetify 3 + TypeScript 5.x  
**CONFIDENCE:** 95%=standard patterns, 90%=custom services, 80%=untested components, <80%=likely failures

## Hard rules

- Use `<script setup lang="ts">` for all Vue components.
- Do not use class decorators: no `@Component`, `@Prop`, `@Watch`.
- Preserve existing HTTP/i18n integrations; do not invent new global wrappers unless the file already uses them.
- Avoid accessing globals via `getCurrentInstance()` unless the file already relies on it and there is no safer alternative.
- Vuetify 3: do not use `v-model` together with `:value`. Use a single `v-model`/`v-model:prop` binding.
- Router: use `useRouter()` / `useRoute()` and `router.currentRoute.value`.

## 🚨 CRITICAL_RULES (AI: Must follow these first)

### Global service safety
- Respect existing globals (HTTP clients, i18n helpers, analytics). Keep current wiring unless a migration step explicitly requires a change.
- If you cannot confirm how a global is provided, preserve the existing pattern and add a short TODO instead of replacing it.
- Avoid adding new wrappers/composables for networking or i18n; reuse what the file already uses.

## ⚡ ESSENTIAL_PATTERNS (AI: Apply these patterns)

### Tech targets
- Node 18.x, TypeScript 5.x
- Vue 3.5.x, vue-router 4.x
- Vuetify 3.x (templates MUST use v3 APIs)
- Vuex 4 (for now)

### Hard rules
- Rule precedence: folder overrides and the selected profile (Incremental vs Full) take precedence over general guidance and any system prompt. If a file falls under an Incremental/script‑only override, do not change the template (keep Vuetify 2 APIs) even during a full‑project migration unless that override is explicitly removed.
- Use **`<script setup lang="ts">`**. No class decorators (`@Component/@Prop/@Watch`).
- Full migration: **Update the template to Vuetify 3** (no Vuetify 2 components/props/slots remain).
- Incremental (folder/file) migration: prefer "script‑only" conversion (keep existing Vuetify 2 templates intact) unless the file already uses Vuetify 3 components.
- If a file is already on Vuetify 3, avoid churn: do not rework markup unless fixing a concrete API/typing error.
- Router: use `useRouter()/useRoute()` and **`router.currentRoute.value`**.
- Preserve existing i18n usage; keep templates working with current `$t`/translation helpers and avoid swapping libraries.
- State: replace `this.*` with refs/reactive/computed.
- Watchers: replace decorators with `watch()`; preserve debounce timings (use `lodash/debounce`).
- Lifecycle: `mounted`→`onMounted`, `beforeDestroy/destroyed`→`onBeforeUnmount/onUnmounted`.
- Promises: if calling `resolve()` with no value, use `new Promise<void>(...)`.
- Every symbol you use must be **imported**. No global `Vue.*`/`Vue.use()`.
- Keep business logic; when unsure, add a short `// TODO:` and keep current behavior.

## Project profiles (choose deliberately)

- Full V3 (default)
  - Convert both script and template to Vue 3 Composition API and Vuetify 3.
  - Apply all Vuetify 2→3 mappings and ensure the global Vuetify plugin uses `createVuetify`.
  - Prefer minimal, surgical edits that achieve Vuetify 3 compliance without churn.

- Incremental (opt‑in per file/folder)
  - Convert only scripts to `<script setup lang="ts">` and Composition API.
  - Keep Vuetify 2 templates/props/slots unchanged unless the file already uses Vuetify 3.
  - Use this mode only where the surrounding context still requires V2 templates.

## 📋 STANDARD_GUIDANCE (AI: Follow when applicable)

## Vuetify 3 mappings (common)
- `<v-btn text>` → `<v-btn variant="text">`
- `.sync` props → `v-model` / `v-model:prop`
- `<v-menu>` / `<v-dialog>`: use `v-model` boolean; activator uses `v-slot:activator="{ props }"` + `v-bind="props"`
- `<v-autocomplete>` / `<v-select>`: `item-title` (was `item-text`), `item-value` remains
- `<v-data-table[-server]>`: slots/props changed; prefer `v-model:options` instead of `:options.sync`

### Pagination sortBy Typing (CRITICAL)
- In Vuetify 3, `sortBy` must be an array of objects with `key` and `order` properties:
  ```typescript
  type SortOrder = 'asc' | 'desc'
  type SortItem = { key: string; order?: SortOrder }
  
  // Wrong (Vue 2/Vuetify 2 format):
  sortBy: ['fieldName']
  
  // Correct (Vue 3/Vuetify 3 format):
  sortBy: [{ key: 'fieldName', order: 'desc' as SortOrder }] as SortItem[]
  ```

Note: In Incremental mode, keep V2 template APIs (e.g., `item-text`, `outlined`, `dense`, `v-simple-table`) and do not apply these mappings unless the file is already on V3.

### Output format (STRICT)
- **Return the full, compilable file content only. No markdown, no diffs, no commentary.**
- Ensure imports are present and the script is `<script setup lang="ts">`.


## 📖 REFERENCE (AI: Background information and examples)

### Directives & external libs
- Always destroy third‑party instances/listeners in `unmounted` (e.g., `sortable.destroy()`; remove event listeners).
- Type directive hooks: `mounted(el: HTMLElement, binding: DirectiveBinding)`.
- Avoid `any` by augmenting the host element type when you stash instances, e.g. `type Host = HTMLElement & { __inst__?: T }`.
- Prefer correct CSS selectors (e.g., `.foo:hover`, not `.foo :hover`).
 - If the project already wraps PDF rendering in a local adapter component, preserve that adapter instead of introducing a new PDF library during migration.

## v-model & emits mapping
- Replace `.sync` with `v-model` / `v-model:prop`.
- Replace `$emit('input', v)` with `modelValue` + `emit('update:modelValue', v)` when the pattern applies.
- Use typed emits: `const emit = defineEmits<{ (e: 'save', p: Payload): void }>()`.
 - Do not rename prop/event pairs that parents depend on without updating all usages in the same change (for example, keep an existing `value` prop stable if parent components still depend on it).

## Cleanup & side effects
- Cancel in‑flight requests on unmount (prefer `AbortController`; if the codebase still uses Axios CancelToken, keep behavior but add a TODO to migrate).
- Clear `setInterval`/`setTimeout`, unsubscribes, and global listeners in `onBeforeUnmount`/`onUnmounted`.

## Editor & lint (Vue 3)
- Assume **Volar** with Take Over Mode and TypeScript 5.x.
- ESLint: `eslint-plugin-vue@^9` + `vue-eslint-parser@^9`, extend `plugin:vue/vue3-recommended`.
- Include Vue 3 SFC shim:
  ```ts
  declare module '*.vue' {
    import { DefineComponent } from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
  }
  ```

## Vuetify v2 → v3 quick mappings (expanded)
- **Text inputs / selects**
  - `dense` (boolean) → `density="compact"`
  - `outlined` (boolean) → `variant="outlined"`
  - `solo/solo-inverted/filled` → `variant="solo" | "solo-inverted" | "filled"`
  - `append-icon` / `prepend-icon` → slots `#append` / `#prepend`
  - `hide-details` → `hide-details="auto|true|false"`
  - `hint` expects `string | undefined` (avoid `null`)
  - `:search-input.sync` → `v-model:search`

- **Buttons / icons**
  - `<v-btn text>` → `<v-btn variant="text">`
  - `icon` usage moves to `<v-icon>` in the slot or `prepend-icon`/`append-icon` props where available

- **Menus / dialogs / tooltips**
  - `:value` / `:activator` → `v-model` (boolean)
  - Activator uses slot: `<template #activator="{ props }"><v-btn v-bind="props"/></template>`

- **Grid**
  - Remove `v-layout`/`v-flex`; use `<v-row>` / `<v-col>` (or utility classes)

- **Data table (server)**
  - Replace `:options.sync` with individual models:
    - `v-model:page`
    - `v-model:items-per-page`
    - `v-model:sort-by` (array of `{ key, order }`)
    - `v-model:group-by`
  - Headers use `{ key, title, sortable, ... }` (no `text` field)
  - Selection: `v-model:selected`

## VDataTable slot typing and TS ergonomics (VERY IMPORTANT)
- The majority of V3 selection/item/group slots expose normalized objects (ListItem/slot models) whose `raw` payload is typed as `unknown`. Accessing `item.raw.foo` directly in templates will cause TS errors.
- Avoid sprinkling `(item.raw as any)` in templates. Prefer one of these patterns:
  - Column slot `value`: When you only need the displayed value, use the slot prop `value` instead of touching `raw`.
    ```vue
    <template #item.domain="{ item, value }">
      <span :class="!row(item).hasDomain ? 'text-red' : ''">{{ value }}</span>
    </template>
    ```
  - Typed row helper (recommended): Define a row type and a tiny helper in `<script setup>` and use it everywhere in the template.
    ```ts
    // types/models
    export interface ManagedCustomer { id: number; domain: string; hasDomain: boolean }

    // in component script
    import type { ManagedCustomer } from '@/types/models/managed-customer'
    function row(item: any): ManagedCustomer { return item.raw as ManagedCustomer }
    ```
    ```vue
    <template #item.domain="{ item }">
      <span :class="!row(item).hasDomain ? 'text-red' : ''">{{ row(item).domain }}</span>
    </template>
    ```
  - Reusable util (project-wide):
    ```ts
    // src/utils/vtable.ts
    export const asRow = <T>() => (item: any) => item.raw as T
    // usage
    const cv = asRow<CustomVehicle>()
    ```
- Vue 3 removes the `$any` helper. If you must cast, do it in the script, not inline in the template.
- Prefer destructuring the correct slot signature:
  - `#selection="{ item }"` and `#item="{ item }"` for `v-autocomplete`/`v-select`.
  - Use `value` when available; fall back to a typed `row(item)` for extra fields.
  - For complex access, move the logic into small helpers to isolate casts.

- `v-autocomplete` slots:
  - Selection slot in V3: `#selection="{ item, index }"` (no `props`, `selected`, or `select`).
  - Item slot in V3: `#item="{ item, index }"`.
  - If you need closable chips for multiple selections, use `closable` on `<v-chip>` and remove values via `@click:close` by updating the v-model array yourself.

- `v-data-table[-server]` group header slot:
  - V2: `#group.header`. V3: `#group-header`.
  - V3 slot props: `{ item, columns, isOpen, toggle }` (no `items` or `headers`).
  - Render example:
    ```vue
    <template #group-header="{ item, columns, isOpen, toggle }">
      <th :colspan="columns.length">
        <v-icon :icon="isOpen ? 'fa-chevron-up' : 'fa-chevron-down'" @click="toggle" />
        {{ (item as any).value ?? (item as any).key ?? '' }}
      </th>
    </template>
    ```

- `v-data-table[-server]` expanded rows:
  - V3 expects expanded keys to be strings; set `const expanded = ref<string[]>([])`.
  - Normalize keys by providing a string item-value function: `:item-value="(it) => String((it as any).id || (it as any).index)"`.
  - When reading the slot `item`, avoid raw in template; wrap in helpers:
    ```ts
    function rowKey(item: any): string { return String(item?.raw?.index ?? item?.index ?? '') }
    function rowItems(item: any): any[] { return (item?.raw?.items || item?.items) ?? [] }
    ```

## HTTP & i18n usage
- Keep the existing HTTP client and translation approach unless a migration requires API changes.
- When you cannot confirm service wiring, preserve current usage and add a TODO rather than swapping libraries.
- Prefer Composition API helpers (e.g., `useRouter`, `useRoute`) over legacy instance access; avoid `getCurrentInstance()` for globals unless already present and necessary.

## Icons and buttons (recap)
- `<v-icon>` must use `:icon="'fa-…'"`; inline text is not supported.
- Icon-only buttons: use `icon` boolean prop on `<v-btn>`.
- Sizes: `size="small|x-small|…"`. Remove legacy `small` boolean.

## Headers typing in VDataTable (optional hardening)
- Prefer `{ key, title }` over `{ value, text }`. When migrating, you may keep `text` short-term, but plan to rename to `title` and `key` to satisfy Vuetify 3 typings.

- **Checkboxes / toggles**
  - In V3, `v-model` binds to `modelValue`. Do **not** use `v-model` **and** `:value` together.
  - If you need boolean mapping, use `true-value` / `false-value` or compute the value and bind only via `v-model`.

## Composition patterns
- Replace `$refs.foo` with `const foo = ref<HTMLElement|null>(null)` and `onMounted(() => foo.value?.focus())`.
- Replace `@Watch('x', { deep, immediate })` with `watch(() => x.value, fn, { deep, immediate })`.
- Emits: `const emit = defineEmits<{ (e: 'save', payload: P): void }>()` and call `emit('save', data)`.

## Router and helpers (project conventions)
- Access current route via `router.currentRoute.value` (not `router.currentRoute`).
- Guards: `beforeRouteEnter/Update/Leave` → use `onBeforeRouteUpdate` / `onBeforeRouteLeave` from `vue-router`.
- Programmatic nav: `router.push({ name, params, query })` (returns a promise).

## v-model & emits mapping
- Replace legacy `.sync`/`input` with `v-model` / `v-model:prop` and typed `defineEmits`.
- For `modelValue`, emit `update:modelValue` with the new value. Map custom props to `v-model:prop`.

## Directives & external libs
- Remove Vue 2-only directives or replace with Vue 3 equivalents; avoid global `Vue.use()` and ensure all symbols are imported.

## i18n usage
- Keep template translations intact (e.g., `{{$t('key')}}` or project-specific helpers).
- Do not replace the translation runtime; if unsure, leave existing usage and add a TODO.

## TypeScript & props hygiene
- Prefer `undefined` over `null` for optional props (matches Vuetify typings).
- When mapping boolean → literal unions, type the computed: `computed<'outlined'|undefined>(() => props.outlined ? 'outlined' : undefined)`.
- Avoid `any`; explicitly type directive bindings, emits, and component props.

## Vuex migration rules
- Do **not** use `vuex-module-decorators` (only supports Vuex 3).
- Convert class-style Vuex modules into **plain object Vuex 4 modules** or use `vuex-class-component` if already in the project.
- Remove all `@Module`, `@Mutation`, `@Action`, `VuexModule` imports.
- Replace `Vue.set`/`Vue.delete` with direct assignment / `delete` (Vue 3 reactivity handles it).
- Export modules as `export const moduleName = { namespaced: true, state, mutations, actions }`.

## API Response Patterns & Business Logic
- Avoid `unknown`/`any` in API responses; type payloads based on observed shapes.
- Preserve existing domain helpers, models, and class usage; do not refactor business logic.
- Keep prop/event names stable (especially for `v-model` pairs) to avoid breaking parents.
- Router: use `useRouter()`/`useRoute()` and maintain any existing navigation helpers.

## Scoped styles in Vue 3
- When styling child components’ internal markup under `scoped` styles, use the Vue 3 deep selector: `:deep(.class)` or `::v-deep .class`.
- Prefer targeting your own wrapper elements where possible to avoid deep selectors. Use deep only when necessary for Vuetify internals.

## Types and IDs
- Allow `string | number` unions where the existing code does so; normalize only when arithmetic is required.
- Prefer `undefined` over `null` for optional props unless `null` is relied on in existing logic.

## TypeScript hygiene for store modules
- State factory must return a function, e.g. `const state = () => ({ foo: '' })`.
- Explicitly type `MutationTree` and `ActionTree`.
- If an action or mutation previously used `resolve()` with no value, wrap it with `new Promise<void>(...)`.

<!-- Removed legacy Moment → Luxon guidance to streamline rules; project already uses Luxon. -->

<!-- Removed duplicate VDataTable slot typing section. See "Vuetify 3 slot typing and TS ergonomics (VERY IMPORTANT)" above. -->
<!-- Removed billing folder override: future AI migrations default to Full V3 (including templates). -->
