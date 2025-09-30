import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import { globby } from "globby";
import { parse as recastParse, print as recastPrint, types as t } from "recast";
import * as babelParser from "@babel/parser";
import { parse as parseSFC } from "@vue/compiler-sfc";
import type { RunContext } from "../core/types.js";

/* -------------------- Parser & helpers -------------------- */

// IMPORTANT: plugin order matters (decorators BEFORE classProperties)
const parser = {
  parse(code: string) {
    return babelParser.parse(code, {
      sourceType: "module",
      plugins: [
        "typescript",
        "jsx",
        "decorators-legacy",      // must come before classProperties
        "classProperties",
        "classPrivateProperties",
        "classPrivateMethods",
        "dynamicImport",
        "importMeta",
        "topLevelAwait",
        "optionalChaining",
        "nullishCoalescingOperator",
        "exportDefaultFrom",
      ],
    });
  },
};

const isIdent = (n: any, name: string) => n?.type === "Identifier" && n.name === name;

function printIfChanged(ast: any, original: string) {
  const out = recastPrint(ast).code;
  return out !== original ? out : null;
}

function editSafe(code: string, filename: string, visitor: (ast: any) => boolean): string | null {
  try {
    const ast = recastParse(code, { parser });
    const touched = visitor(ast);
    return touched ? printIfChanged(ast, code) : null;
  } catch (e: any) {
    const loc = e?.loc ? `(${e.loc.line}:${e.loc.column})` : "";
    console.log(chalk.yellow(`⚠️  Parse skipped: ${filename} ${loc}`));
    try {
      const lines = code.split("\n");
      const i = Math.max(0, (e?.loc?.line ?? 1) - 3);
      const j = Math.min(lines.length, (e?.loc?.line ?? 1) + 2);
      const snippet = lines.slice(i, j).map((l, idx) => `${i + idx + 1}  ${l}`).join("\n");
      console.log(chalk.gray(snippet));
    } catch { }
    return null;
  }
}

/** Extract first <script> block (or scriptSetup) region; we operate on raw code to tolerate decorators/class style. */
function extractScriptRegion(sfcCode: string) {
  const sfc = parseSFC(sfcCode);
  const { descriptor } = sfc;
  // Prefer <script>, else <script setup> (we'll still treat as plain TS/JS)
  const blk = descriptor.script ?? descriptor.scriptSetup;
  if (!blk?.content || !blk.loc) return null;
  const start = blk.loc.start.offset;
  const end = blk.loc.end.offset;
  const content = sfcCode.slice(start, end);
  return { start, end, content };
}

function transformVueSFCRaw(sfcCode: string, filename: string, runAll: (js: string) => string | null): string | null {
  const region = extractScriptRegion(sfcCode);
  if (!region) return null;
  const next = runAll(region.content);
  if (!next || next === region.content) return null;
  return sfcCode.slice(0, region.start) + next + sfcCode.slice(region.end);
}

async function writeMaybe(ctx: RunContext, file: string, next: string) {
  if (ctx.dryRun) {
    console.log(chalk.gray(`DRY-RUN: would update ${path.relative(ctx.root, file)}`));
  } else {
    await fs.writeFile(file, next, "utf8");
    console.log(chalk.green(`✔ Updated ${path.relative(ctx.root, file)}`));
  }
}

/* -------------------- Transforms -------------------- */

/** T1: main.* → createApp + app.use(...) + app.mount(...) + Vue.use(X)→app.use(X) */
function visitCreateApp(ast: any): boolean {
  let touched = false;
  let sawVueDefaultImport = false;

  t.visit(ast, {
    visitImportDeclaration(p) {
      if (p.value.source.value === "vue") {
        if (p.value.specifiers.some((s: any) => s.type === "ImportDefaultSpecifier")) {
          sawVueDefaultImport = true;
        }
      }
      this.traverse(p);
    },
  });

  if (sawVueDefaultImport) {
    t.visit(ast, {
      visitImportDeclaration(p) {
        if (p.value.source.value !== "vue") return this.traverse(p);
        p.value.specifiers = p.value.specifiers.filter((s: any) => s.type !== "ImportDefaultSpecifier");
        if (!p.value.specifiers.some((s: any) => s.imported?.name === "createApp")) {
          p.value.specifiers.push(t.builders.importSpecifier(t.builders.identifier("createApp")));
        }
        touched = true;
        this.traverse(p);
      },
    });
  }

  t.visit(ast, {
    visitNewExpression(p) {
      const n = p.value;
      if (!isIdent(n.callee, "Vue")) return this.traverse(p);

      const arg0 = n.arguments?.[0];
      const props = arg0?.type === "ObjectExpression" ? (arg0.properties as any[]) : [];
      const hasRouter = props?.some((pr: any) => pr.key?.name === "router");
      const render = props?.find((pr: any) => pr.key?.name === "render");

      let appArg: any = t.builders.identifier("App");
      if (
        render?.value?.type === "ArrowFunctionExpression" &&
        render.value.body?.type === "CallExpression" &&
        render.value.body?.arguments?.[0]
      ) {
        appArg = render.value.body.arguments[0];
      }

      const appDecl = t.builders.variableDeclaration("const", [
        t.builders.variableDeclarator(
          t.builders.identifier("app"),
          t.builders.callExpression(t.builders.identifier("createApp"), [appArg])
        ),
      ]);
      const stmts: any[] = [appDecl];

      if (hasRouter) {
        stmts.push(
          t.builders.expressionStatement(
            t.builders.callExpression(
              t.builders.memberExpression(t.builders.identifier("app"), t.builders.identifier("use")),
              [t.builders.identifier("router")]
            )
          )
        );
      }

      // default selector
      let mountSel: any = t.builders.literal("#app");
      const callExpr = p.parentPath?.parentPath?.value;
      if (
        callExpr?.type === "CallExpression" &&
        callExpr.callee?.type === "MemberExpression" &&
        callExpr.callee.property?.name === "mount" &&
        callExpr.arguments?.[0]?.type === "Literal"
      ) {
        mountSel = callExpr.arguments[0];
      }

      stmts.push(
        t.builders.expressionStatement(
          t.builders.callExpression(
            t.builders.memberExpression(t.builders.identifier("app"), t.builders.identifier("mount")),
            [mountSel]
          )
        )
      );

      const exprStmt = p.parentPath?.parentPath;
      if (exprStmt?.parentPath?.value?.type === "ExpressionStatement") {
        exprStmt.parentPath.replace(t.builders.blockStatement(stmts as any));
      } else {
        p.replace(t.builders.blockStatement(stmts as any));
      }
      touched = true;

      this.traverse(p);
    },
  });

  // Vue.use(X) → app.use(X)
  t.visit(ast, {
    visitCallExpression(p) {
      const c = p.value;
      if (
        c.callee?.type === "MemberExpression" &&
        isIdent(c.callee.object, "Vue") &&
        isIdent(c.callee.property, "use")
      ) {
        p.replace(
          t.builders.callExpression(
            t.builders.memberExpression(t.builders.identifier("app"), t.builders.identifier("use")),
            c.arguments || []
          )
        );
        touched = true;
      }
      this.traverse(p);
    },
  });

  return touched;
}

/** T2: vue-router v3 → v4 */
function visitRouter4(ast: any): boolean {
  let touched = false;
  let isRouterFile = false;

  t.visit(ast, {
    visitImportDeclaration(p) {
      if (p.value.source.value === "vue-router") isRouterFile = true;
      this.traverse(p);
    },
    visitNewExpression(p) {
      if (isIdent(p.value.callee, "VueRouter")) isRouterFile = true;
      this.traverse(p);
    },
  });
  if (!isRouterFile) return false;

  // imports
  t.visit(ast, {
    visitImportDeclaration(p) {
      if (p.value.source.value !== "vue-router") return this.traverse(p);
      p.value.specifiers = p.value.specifiers.filter((s: any) => s.type !== "ImportDefaultSpecifier");
      const names = new Set(p.value.specifiers.map((s: any) => s.imported?.name));
      if (!names.has("createRouter")) {
        p.value.specifiers.push(t.builders.importSpecifier(t.builders.identifier("createRouter")));
      }
      if (![...names].some((n) => n === "createWebHistory" || n === "createWebHashHistory")) {
        p.value.specifiers.push(t.builders.importSpecifier(t.builders.identifier("createWebHistory")));
      }
      touched = true;
      this.traverse(p);
    },
  });

  // remove Vue.use(VueRouter)
  t.visit(ast, {
    visitExpressionStatement(p) {
      const e = p.value.expression;
      if (
        e?.type === "CallExpression" &&
        e.callee?.type === "MemberExpression" &&
        isIdent(e.callee.object, "Vue") &&
        isIdent(e.callee.property, "use")
      ) {
        p.prune();
        touched = true;
        return false;
      }
      this.traverse(p);
    },
  });

  // new VueRouter({ mode, base, routes }) -> createRouter({ history, routes })
  t.visit(ast, {
    visitNewExpression(p) {
      const n = p.value;
      if (!isIdent(n.callee, "VueRouter")) return this.traverse(p);

      const arg = n.arguments?.[0];
      let routesExpr: any = t.builders.arrayExpression([]);
      let baseExpr: any | null = null;
      let mode: "history" | "hash" | null = null;

      if (arg?.type === "ObjectExpression") {
        for (const pr of arg.properties as any[]) {
          if (pr.key?.name === "routes") routesExpr = pr.value;
          if (pr.key?.name === "base") baseExpr = pr.value;
          if (pr.key?.name === "mode" && pr.value?.type === "Literal") mode = pr.value.value;
        }
      }

      const histFn = mode === "hash" ? "createWebHashHistory" : "createWebHistory";
      const histCall = t.builders.callExpression(t.builders.identifier(histFn), baseExpr ? [baseExpr] : []);

      const init = t.builders.callExpression(t.builders.identifier("createRouter"), [
        t.builders.objectExpression([
          t.builders.property("init", t.builders.identifier("history"), histCall),
          t.builders.property("init", t.builders.identifier("routes"), routesExpr),
        ]),
      ]);

      p.replace(init);
      touched = true;
      this.traverse(p);
    },
  });

  return touched;
}

/** T3: Lifecycle rename + basic v-model emit update
 *  - Handles Options API objects
 *  - Handles class-style components (method names or class fields)
 */
function visitLifecycleAndVModel(ast: any): boolean {
  let touched = false;

  // Options API: export default { beforeDestroy, destroyed, props: { value } ... }
  t.visit(ast, {
    visitExportDefaultDeclaration(p) {
      const obj = p.value.declaration;
      if (obj?.type === "ObjectExpression") {
        for (const pr of obj.properties as any[]) {
          if (!pr.key?.name) continue;
          if (pr.key.name === "beforeDestroy") {
            pr.key.name = "beforeUnmount";
            touched = true;
          }
          if (pr.key.name === "destroyed") {
            pr.key.name = "unmounted";
            touched = true;
          }
        }

        // props.value -> props.modelValue + ensure emits ['update:modelValue']
        const propsNode = (obj.properties as any[]).find((x) => x.key?.name === "props");
        if (propsNode?.value?.type === "ObjectExpression") {
          for (const pr of propsNode.value.properties as any[]) {
            if (pr.key?.name === "value") {
              pr.key.name = "modelValue";
              let emitsNode = (obj.properties as any[]).find((x) => x.key?.name === "emits");
              if (!emitsNode) {
                emitsNode = t.builders.property(
                  "init",
                  t.builders.identifier("emits"),
                  t.builders.arrayExpression([t.builders.literal("update:modelValue")])
                );
                obj.properties.push(emitsNode);
              } else if (emitsNode.value?.type === "ArrayExpression") {
                const has = emitsNode.value.elements.some((el: any) => el?.value === "update:modelValue");
                if (!has) emitsNode.value.elements.push(t.builders.literal("update:modelValue"));
              }
              touched = true;
            }
          }
        }
      }
      this.traverse(p);
    },
  });

  // Class-style components: rename lifecycle methods
  t.visit(ast, {
    visitClassBody(p) {
      for (const el of p.value.body as any[]) {
        // method syntax: beforeDestroy() {} / destroyed() {}
        if (el.type === "MethodDefinition" && el.key?.name === "beforeDestroy") {
          el.key.name = "beforeUnmount";
          touched = true;
        }
        if (el.type === "MethodDefinition" && el.key?.name === "destroyed") {
          el.key.name = "unmounted";
          touched = true;
        }
        // class field arrow funcs: beforeDestroy = () => {} / destroyed = () => {}
        if (el.type === "ClassProperty" && el.key?.name === "beforeDestroy") {
          el.key.name = "beforeUnmount";
          touched = true;
        }
        if (el.type === "ClassProperty" && el.key?.name === "destroyed") {
          el.key.name = "unmounted";
          touched = true;
        }
      }
      this.traverse(p);
    },
  });

  // $emit('input', x) -> $emit('update:modelValue', x)
  t.visit(ast, {
    visitCallExpression(p) {
      const n = p.value;
      if (
        n.callee?.type === "MemberExpression" &&
        n.callee.property?.name === "$emit" &&
        n.arguments?.[0]?.type === "Literal" &&
        n.arguments[0].value === "input"
      ) {
        n.arguments[0] = t.builders.literal("update:modelValue");
        touched = true;
      }
      this.traverse(p);
    },
  });

  return touched;
}

/** T3b: Class-style components lifecycle rename
 *  Handles:
 *    - beforeDestroy() {}  -> beforeUnmount()
 *    - destroyed() {}      -> unmounted()
 *    - beforeDestroy = () => {} / destroyed = () => {}
 */
function visitClassLifecycle(ast: any): boolean {
  let touched = false;

  t.visit(ast, {
    visitClassBody(p) {
      for (const el of p.value.body as any[]) {
        // method syntax
        if (el.type === "MethodDefinition" && (el.key?.name === "beforeDestroy" || el.key?.name === "destroyed")) {
          el.key.name = el.key.name === "beforeDestroy" ? "beforeUnmount" : "unmounted";
          touched = true;
        }
        // class field syntax (TS: ClassProperty / newer: PropertyDefinition)
        if ((el.type === "ClassProperty" || el.type === "PropertyDefinition")
          && (el.key?.name === "beforeDestroy" || el.key?.name === "destroyed")) {
          el.key.name = el.key.name === "beforeDestroy" ? "beforeUnmount" : "unmounted";
          touched = true;
        }
      }
      this.traverse(p);
    },
  });

  return touched;
}

// ensure emits in @Options/@Component({ ... })
function ensureEmitsUpdateModel(obj: any): boolean {
  let changed = false;
  let emitsNode = (obj.properties as any[]).find((x: any) => x.key?.name === "emits");
  if (!emitsNode) {
    emitsNode = t.builders.property(
      "init",
      t.builders.identifier("emits"),
      t.builders.arrayExpression([t.builders.literal("update:modelValue")])
    );
    obj.properties.push(emitsNode);
    return true;
  }
  if (emitsNode.value?.type === "ArrayExpression") {
    const has = emitsNode.value.elements.some((el: any) => el?.value === "update:modelValue");
    if (!has) { emitsNode.value.elements.push(t.builders.literal("update:modelValue")); changed = true; }
  }
  return changed;
}

// T5: in class components, rename @Prop() value -> modelValue and add emits
function visitClassVModel(ast: any): boolean {
  let touched = false;

  // 1) rename @Prop() value -> modelValue
  t.visit(ast, {
    visitClassProperty(p) {
      const el: any = p.value;
      const hasPropDecorator = (el.decorators || []).some((d: any) => {
        const e = d.expression;
        return (e.type === "CallExpression" ? e.callee?.name : e.name) === "Prop";
      });
      if (hasPropDecorator && el.key?.name === "value") {
        el.key.name = "modelValue";
        touched = true;
      }
      this.traverse(p);
    },
  });

  // 2) ensure @Options({ emits: ['update:modelValue'] }) exists
  t.visit(ast, {
    visitDecorator(p) {
      const expr: any = p.value.expression;
      if (expr?.type === "CallExpression" && (expr.callee?.name === "Options" || expr.callee?.name === "Component")) {
        const arg = expr.arguments?.[0];
        if (arg?.type === "ObjectExpression") {
          if (ensureEmitsUpdateModel(arg)) touched = true;
        }
      }
      this.traverse(p);
    },
  });

  return touched;
}


// T6: main entry rewrite (Vue 2 → Vue 3 app instance)
function visitMainEntry(ast: any): boolean {
  let touched = false;
  let hasCreateApp = false;
  let hasAppVar = false;

  // 1) ensure import { createApp, configureCompat } from 'vue'
  t.visit(ast, {
    visitImportDeclaration(p) {
      if (p.value.source.value === "vue") {
        const names = new Set(p.value.specifiers.map((s: any) => s.imported?.name));
        if (!names.has("createApp")) {
          p.value.specifiers.push(t.builders.importSpecifier(t.builders.identifier("createApp")));
          touched = true;
        }
        if (!names.has("configureCompat")) {
          p.value.specifiers.push(t.builders.importSpecifier(t.builders.identifier("configureCompat")));
          touched = true;
        }
      }
      this.traverse(p);
    }
  });

  // 2) new Vue({...}).$mount('#app')  →  const app = createApp(App); app.mount('#app')
  t.visit(ast, {
    visitNewExpression(p) {
      const callee = p.value.callee;
      if (callee?.name === "Vue") {
        // try to find .$mount('#app') parent
        const exprStmt = p.parentPath?.parentPath?.value?.type === "ExpressionStatement"
          ? p.parentPath?.parentPath
          : null;
        // build: const app = createApp(App)
        const appId = t.builders.identifier("app");
        const appDecl = t.builders.variableDeclaration("const", [
          t.builders.variableDeclarator(
            appId,
            t.builders.callExpression(
              t.builders.identifier("createApp"),
              [t.builders.identifier("App")]
            )
          ),
        ]);
        // and mount
        let mountArg = t.builders.literal("#app");
        // if original had .$mount('...') get that arg if available
        const parent = p.parentPath?.value;
        if (parent?.type === "CallExpression" && parent.callee?.property?.name === "$mount" && parent.arguments?.[0]) {
          mountArg = parent.arguments[0];
        }
        const mountStmt = t.builders.expressionStatement(
          t.builders.callExpression(
            t.builders.memberExpression(appId, t.builders.identifier("mount")),
            [mountArg]
          )
        );

        // inject configureCompat({ MODE: 2 }) before creating app
        const compatStmt = t.builders.expressionStatement(
          t.builders.callExpression(
            t.builders.identifier("configureCompat"),
            [t.builders.objectExpression([
              t.builders.property("init", t.builders.identifier("MODE"), t.builders.literal(2))
            ])]
          )
        );

        // replace the whole expression statement with 3 statements
        const body = exprStmt?.parentPath?.value?.body;
        if (Array.isArray(body)) {
          const idx = body.indexOf(exprStmt.value);
          body.splice(idx, 1, compatStmt, appDecl, mountStmt);
          exprStmt.prune(); // safety
        } else {
          // fallback replace
          p.replace(appDecl);
        }
        hasAppVar = true;
        touched = true;
      }
      this.traverse(p);
    }
  });

  // 3) Vue.use/dir/component/config → app.use/dir/component (and drop productionTip)
  const replaceVueMember = (name: string, to: string) => {
    t.visit(ast, {
      visitCallExpression(p) {
        const cal = p.value.callee;
        if (cal?.type === "MemberExpression" && cal.object?.name === "Vue" && cal.property?.name === name) {
          // ensure app var exists
          const appId = t.builders.identifier("app");
          hasAppVar = true;
          p.value.callee = t.builders.memberExpression(appId, t.builders.identifier(to));
          touched = true;
        }
        this.traverse(p);
      }
    });
  };
  replaceVueMember("use", "use");
  replaceVueMember("directive", "directive");
  replaceVueMember("component", "component");

  // remove Vue.config.productionTip
  t.visit(ast, {
    visitAssignmentExpression(p) {
      const left = p.value.left;
      if (left?.type === "MemberExpression"
        && left.object?.type === "MemberExpression"
        && left.object.object?.name === "Vue"
        && left.object.property?.name === "config"
        && left.property?.name === "productionTip") {
        // drop the statement
        const es = p.parentPath?.value;
        if (es?.type === "ExpressionStatement") es.type = "EmptyStatement";
        touched = true;
      }
      this.traverse(p);
    }
  });

  return touched;
}


/* -------------------- Step runner -------------------- */

export async function codemods(ctx: RunContext) {
  console.log(chalk.cyan("\n🛠  Running codemods (createApp, router4, lifecycle, v-model)…"));

  const allFiles =
    ctx.scan?.files?.length
      ? ctx.scan.files
      : await globby(["src/**/*.{vue,ts,js}"], { cwd: ctx.root, gitignore: true });

  const entries = allFiles.filter((p) => /(^|\/)src\/main\.(t|j)sx?$/.test(p) || /(^|\/)main\.(t|j)sx?$/.test(p));
  const routerFiles = allFiles.filter((p) => /(^|\/)src\/router\/.*\.(t|j)sx?$/.test(p) || /(^|\/)router\.(t|j)s$/.test(p));
  const rest = allFiles.filter((p) => !entries.includes(p) && !routerFiles.includes(p));

  const applyTransforms = (code: string, filename: string) => {
    let next = code;
    const run = (fn: (ast: any) => boolean) => (editSafe(next, filename, fn) || next);
    next = run(visitMainEntry);
    // next = run(visitCreateApp);
    // next = run(visitRouter4);
    next = run(visitLifecycleAndVModel);
    next = run(visitClassLifecycle);
    next = run(visitClassVModel);
    return next !== code ? next : null;
  };

  // 1) Entry files (skip for now; you converted main/router manually)
  for (const rel of entries) {
    const file = path.isAbsolute(rel) ? rel : path.join(ctx.root, rel);
    const src = await fs.readFile(file, "utf8");
    // no transforms here
  }

  // 2) Router files (skip for now)
  for (const rel of routerFiles) {
    const file = path.isAbsolute(rel) ? rel : path.join(ctx.root, rel);
    const src = await fs.readFile(file, "utf8");
    // no transforms here
  }

  // 3) Broad pass: lifecycle (options + class) + basic v-model
  for (const rel of rest) {
    const file = path.isAbsolute(rel) ? rel : path.join(ctx.root, rel);
    const src = await fs.readFile(file, "utf8");
    const isVue = file.endsWith(".vue");

    let next = isVue
      ? transformVueSFCRaw(src, file, (js) => applyTransforms(js, file))
      : applyTransforms(src, file);

    // Fallback text pass if AST failed (very safe replacements)
    if (!next) {
      const safe = src
        .replace(/\bbeforeDestroy\b/g, "beforeUnmount")
        .replace(/\bdestroyed\b/g, "unmounted")
        .replace(/\$emit\(\s*['"]input['"]\s*,/g, "$emit('update:modelValue',");
      if (safe !== src) next = safe;
    }

    if (next) await writeMaybe(ctx, file, next);
  }

  console.log(chalk.green("✅ Codemods step completed."));
  console.log(chalk.gray("   • Class lifecycle methods handled. Review class-decorator imports later for Vue 3."));
}
