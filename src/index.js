#!/usr/bin/env node
// strata: turn GitHub activity into a geological cross-section.
//
//   node src/index.js --user <login> [--months 24] [--out strata]
//   node src/index.js --demo
//
// Needs GITHUB_TOKEN (or GH_TOKEN) in the environment, except with --demo.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchActivity } from './github.js';
import { demoActivity } from './demo.js';
import { buildModel } from './eras.js';
import { render } from './render.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = process.env;
  const months = Math.min(36, Math.max(6, Number(args.months ?? env.STRATA_MONTHS ?? 24) || 24));
  const outDir = args.out ?? env.STRATA_OUT ?? 'strata';

  let activity;
  if (args.demo) {
    activity = demoActivity(months);
  } else {
    const login = args.user ?? env.STRATA_USER;
    if (!login) throw new Error('Tell me whose rock to draw: --user <github-login> (or STRATA_USER).');
    activity = await fetchActivity({ login, token: env.GITHUB_TOKEN ?? env.GH_TOKEN, months });
  }

  const model = buildModel(activity);
  await mkdir(outDir, { recursive: true });
  for (const theme of ['dark', 'light']) {
    const file = path.join(outDir, `strata-${theme}.svg`);
    await writeFile(file, render(model, theme));
    console.log(`wrote ${file}`);
  }
  console.log(`@${model.login}: ${model.total} contributions, ${model.eras.length} eras (${model.eras.map((e) => e.name).join(' → ')}), ${model.streak}-day streak`);
}

main().catch((err) => {
  console.error(`strata: ${err.message}`);
  process.exit(1);
});
