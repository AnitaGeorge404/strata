// Reads public GitHub activity through the GraphQL API.

const API = 'https://api.github.com/graphql';

async function gql(token, query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'strata',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

/** Calendar months, oldest first, ending with the current (partial) month. */
function monthRanges(count, now) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    const end = new Date(Math.min(next.getTime() - 1000, now.getTime()));
    out.push({ start, end });
  }
  return out;
}

const MONTH_FIELDS = `
  contributionCalendar { totalContributions }
  commitContributionsByRepository(maxRepositories: 25) {
    contributions { totalCount }
    repository { primaryLanguage { name color } }
  }`;

export async function fetchActivity({ login, token, months = 24, now = new Date() }) {
  if (!token) throw new Error('A GitHub token is required (set GITHUB_TOKEN).');
  const ranges = monthRanges(months, now);

  // One aliased contributionsCollection per month, six months per request.
  const collections = [];
  for (let i = 0; i < ranges.length; i += 6) {
    const chunk = ranges.slice(i, i + 6);
    const fields = chunk
      .map((r, j) => `m${j}: contributionsCollection(from: "${r.start.toISOString()}", to: "${r.end.toISOString()}") {${MONTH_FIELDS}}`)
      .join('\n');
    const data = await gql(token, `query($login: String!) { user(login: $login) { ${fields} } }`, { login });
    if (!data.user) throw new Error(`GitHub user "${login}" not found.`);
    chunk.forEach((_, j) => collections.push(data.user[`m${j}`]));
  }

  const extra = await gql(
    token,
    `query($login: String!) { user(login: $login) {
      contributionsCollection { contributionCalendar { weeks { contributionDays { date contributionCount } } } }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: { field: CREATED_AT, direction: DESC }) {
        nodes { createdAt }
      }
    } }`,
    { login },
  );

  const days = extra.user.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  const created = extra.user.repositories.nodes.map((r) => new Date(r.createdAt));

  const monthsOut = ranges.map((r, i) => {
    const c = collections[i];
    const langs = new Map();
    for (const entry of c.commitContributionsByRepository) {
      const lang = entry.repository.primaryLanguage;
      if (!lang) continue;
      const prev = langs.get(lang.name) ?? { name: lang.name, color: lang.color ?? '#8b949e', count: 0 };
      prev.count += entry.contributions.totalCount;
      langs.set(lang.name, prev);
    }
    return {
      date: r.start,
      total: c.contributionCalendar.totalContributions,
      languages: [...langs.values()].sort((a, b) => b.count - a.count),
      newRepos: created.filter((d) => d >= r.start && d <= r.end).length,
    };
  });

  return { login, generatedAt: now, months: monthsOut, streak: currentStreak(days) };
}

function currentStreak(days) {
  let i = days.length - 1;
  if (i >= 0 && days[i].contributionCount === 0) i--; // today may simply not have started yet
  let streak = 0;
  while (i >= 0 && days[i].contributionCount > 0) {
    streak++;
    i--;
  }
  return streak;
}
