/**
 * Finds every module reference in a blueprint, including the ones the old check
 * missed.
 *
 * WHY THE OLD ONE MISSED THEM
 *   It matched /\{\{(\d+)\./ — a module number sitting immediately after the opening
 *   braces. But a Make expression puts references inside function calls:
 *
 *     {{get(parseJSON(2.copy); 2.loc)}}
 *
 *   Neither 2 is preceded by "{{", so the check reported "references=ok" on a
 *   blueprint Make then refused with "references non-existing module [module ID 2]".
 *   A check that passes what the target rejects is worse than no check.
 *
 * Usage: node tools/check-refs.mjs
 */
import { readFileSync } from 'node:fs';

/** Module ids in execution order, with what each one can see. */
function* withVisibility(flow, inherited = []) {
  const seen = [...inherited];
  for (const module of flow) {
    yield { module, visible: new Set(seen) };
    for (const route of module.routes || []) yield* withVisibility(route.flow, [...seen, module.id]);
    seen.push(module.id);
  }
}

/**
 * Every `<digits>.` that is a module reference.
 *
 * Guarded on both sides: not preceded by a word character or a dot, so `1.5` in a
 * style rule and `rgba(0,0,0,.16)` are not mistaken for module 5 or module 0; and
 * followed by an identifier or a backtick, which is how Make writes a field name.
 */
function refsIn(value) {
  const found = new Set();
  const pattern = /(?:^|[^\w.])(\d+)\.(?=[A-Za-z_`])/g;
  for (const match of String(value).matchAll(pattern)) found.add(Number(match[1]));
  return found;
}

/**
 * Finds `{{ ... {{ ... }} ... }}`.
 *
 * Make has no nested expressions: the inner closing braces end the outer one and
 * everything after it is sent as literal text — so a notification would arrive with
 * `+ 1.guardianName + "` printed in it. Cheap to write by accident when building a
 * long expression from concatenated strings, and invisible in the JSON.
 */
function nestedBraces(json) {
  const bad = [];
  for (const [, inner] of json.matchAll(/\{\{((?:[^{}]|\{(?!\{))*\{\{)/g)) bad.push(inner.slice(0, 60));
  return bad;
}

let failures = 0;
for (const file of ['make/blueprint-1-instant.json', 'make/blueprint-2-reminders.json']) {
  const data = JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
  const problems = [];
  let count = 0;

  for (const snippet of nestedBraces(JSON.stringify(data))) {
    problems.push(`nested {{ }} — Make cannot parse this: ${snippet}`);
  }

  for (const { module, visible } of withVisibility(data.flow)) {
    count += 1;
    const { routes, ...own } = module;
    // Only look inside {{ }}, so CSS in an e-mail body cannot be read as a reference.
    const expressions = [...JSON.stringify(own).matchAll(/\{\{([^}]*)\}\}/g)].map((m) => m[1]);
    for (const expression of expressions) {
      for (const ref of refsIn(expression)) {
        if (ref === module.id) problems.push(`module ${module.id} references itself in: ${expression.slice(0, 60)}`);
        else if (!visible.has(ref)) problems.push(`module ${module.id} references ${ref}, which does not run before it — in: ${expression.slice(0, 60)}`);
      }
    }
  }

  if (problems.length) {
    failures += problems.length;
    console.error(`${file}  modules=${count}  FAIL`);
    for (const problem of [...new Set(problems)]) console.error(`    ${problem}`);
  } else {
    console.log(`${file}  modules=${count}  references=ok`);
  }
}
process.exit(failures ? 1 : 0);
