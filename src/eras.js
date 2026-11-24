// Turns months into geological eras named after the language you wrote most.

const NAMES = {
  Python: 'Pythonian',
  Rust: 'Rustocene',
  JavaScript: 'Jurassic',
  TypeScript: 'Typassic',
  Go: 'Gopherocene',
  Java: 'Javanian',
  'C++': 'Cretaceous',
  C: 'Cambrian',
  'C#': 'Carboniferous',
  Ruby: 'Rubian',
  Kotlin: 'Kotlinian',
  Swift: 'Swiftocene',
  HTML: 'Markupian',
  CSS: 'Stylocene',
  SCSS: 'Stylocene',
  'Jupyter Notebook': 'Notebookian',
  Shell: 'Shellurian',
  PHP: 'Permian',
  Dart: 'Dartonian',
  Scala: 'Scalarian',
  Haskell: 'Lambdian',
  Lua: 'Lunarian',
  R: 'Regressian',
  Vue: 'Vuelocene',
  Svelte: 'Sveltian',
  Zig: 'Zigocene',
  Elixir: 'Elixirian',
  Solidity: 'Chainian',
  Dockerfile: 'Containerian',
  MATLAB: 'Matrician',
};

export function eraName(era) {
  if (era.key === 'quiet') return 'The Quiet Age';
  if (!era.lang) return 'The Interlude';
  const base = NAMES[era.lang] ?? `${era.lang.replace(/[^A-Za-z]/g, '') || 'Code'}ian`;
  return `The ${base}`;
}

/** Adds dominant language per month and groups months into eras (oldest first). */
export function buildModel(activity) {
  const months = activity.months.map((m) => {
    const top = m.languages[0];
    const quiet = m.total === 0;
    return { ...m, quiet, lang: quiet ? null : top?.name ?? null, color: quiet ? null : top?.color ?? null };
  });

  let eras = [];
  months.forEach((m, i) => {
    const key = m.quiet ? 'quiet' : m.lang ?? 'mixed';
    const last = eras.at(-1);
    if (last && last.key === key) last.end = i;
    else eras.push({ key, start: i, end: i, lang: m.lang, color: m.color });
  });

  // A single odd month is a blip, not an era: fold it into its neighbour.
  let changed = true;
  while (changed && eras.length > 1) {
    changed = false;
    const idx = eras.findIndex((e) => e.end === e.start);
    if (idx === -1) break;
    const blip = eras[idx];
    const host = idx > 0 ? eras[idx - 1] : eras[idx + 1];
    host.start = Math.min(host.start, blip.start);
    host.end = Math.max(host.end, blip.end);
    eras.splice(idx, 1);
    // merge neighbours that now share a key
    eras = eras.reduce((acc, e) => {
      const last = acc.at(-1);
      if (last && last.key === e.key) last.end = e.end;
      else acc.push(e);
      return acc;
    }, []);
    changed = true;
  }

  eras.forEach((e) => (e.name = eraName(e)));

  const totals = new Map();
  for (const m of months)
    for (const l of m.languages) {
      const prev = totals.get(l.name) ?? { ...l, count: 0 };
      prev.count += l.count;
      totals.set(l.name, prev);
    }

  return {
    login: activity.login,
    generatedAt: activity.generatedAt,
    streak: activity.streak,
    total: months.reduce((s, m) => s + m.total, 0),
    months,
    eras,
    topLanguages: [...totals.values()].sort((a, b) => b.count - a.count).slice(0, 4),
  };
}
