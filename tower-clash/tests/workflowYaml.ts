import { readFileSync } from 'node:fs';

/*
 * Tiny read-only view of the GitHub workflow files for the QA guards (QA-19). No YAML library is
 * a declared dependency, and the workflows only use the subset needed here: `- name:` steps under
 * `steps:` and `run:` as a single line or a `|` block scalar. The block scalar is returned the way
 * the runner sees it (indentation of its first line removed, one trailing newline).
 */

export const workflowPath = (file: string): URL => new URL(`../../.github/workflows/${file}`, import.meta.url);
export const readWorkflow = (file: string): string => readFileSync(workflowPath(file), 'utf8');

/** The `on:` block (from `on:` up to the next top-level key). */
export function onBlock(yaml: string): string {
  const m = /\non:\n([\s\S]*?)(?=\n[A-Za-z_][\w-]*:)/.exec(`\n${yaml}`);
  if (!m) throw new Error('no top-level on: block');
  return m[1]!;
}

export type RunBlock = { step: string; run: string };

/** Every `run:` of the file with the name of the step it belongs to (`''` before the first named step). */
export function runBlocks(yaml: string): RunBlock[] {
  const lines = yaml.split('\n');
  const out: RunBlock[] = [];
  let step = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const named = /^\s*- name: (.*)$/.exec(line);
    if (named) step = named[1]!.trim();
    const run = /^(\s*)(?:- )?run: ?(.*)$/.exec(line);
    if (!run) continue;
    const keyIndent = run[1]!.length;
    const inline = run[2]!.trim();
    if (inline !== '|' && inline !== '|-') {
      out.push({ step, run: `${inline}\n` });
      continue;
    }
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j]!;
      if (l.trim() !== '' && l.length - l.trimStart().length <= keyIndent) break;
      body.push(l);
    }
    while (body.length && body[body.length - 1]!.trim() === '') body.pop();
    const first = body.find((l) => l.trim() !== '') ?? '';
    const indent = first.length - first.trimStart().length;
    out.push({ step, run: `${body.map((l) => l.slice(Math.min(indent, l.length - l.trimStart().length))).join('\n')}\n` });
    i = j - 1;
  }
  return out;
}

/** The `run:` of the step with exactly this name. */
export function stepRun(yaml: string, name: string): string {
  const found = runBlocks(yaml).filter((b) => b.step === name);
  if (found.length !== 1) throw new Error(`expected one run: for step "${name}", found ${found.length}`);
  return found[0]!.run;
}

/** The whole text of the step with this name (from its `- name:` line to the next step). */
export function stepText(yaml: string, name: string): string {
  const start = yaml.indexOf(`- name: ${name}\n`);
  if (start < 0) throw new Error(`step not found: ${name}`);
  const next = yaml.indexOf('\n      - ', start + 1);
  return yaml.slice(start, next < 0 ? undefined : next);
}
