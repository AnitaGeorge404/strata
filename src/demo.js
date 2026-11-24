// Fake but plausible activity, for previews without a token.
import { rng } from './util.js';

const L = {
  Python: '#3572A5',
  TypeScript: '#3178c6',
  Rust: '#dea584',
};

export function demoActivity(months = 24, now = new Date()) {
  const R = rng(42);
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const age = months - 1 - i; // 0 = oldest
    let lang = age < 8 ? 'Python' : age < 15 ? 'TypeScript' : 'Rust';
    let total = Math.round(20 + R() * 90 + age * 4);
    if (age === 11 || age === 12) total = 0; // a quiet break
    if (age === 19) total = 260; // hackathon month
    const second = lang === 'Rust' ? 'TypeScript' : 'Python';
    out.push({
      date,
      total,
      languages: total
        ? [
            { name: lang, color: L[lang], count: Math.round(total * 0.6) },
            { name: second, color: L[second], count: Math.round(total * 0.2) },
          ]
        : [],
      newRepos: [2, 9, 15, 19, 22].includes(age) ? 1 : 0,
    });
  }
  return { login: 'octo-geologist', generatedAt: now, months: out, streak: 17 };
}
