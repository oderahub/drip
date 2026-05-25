/**
 * GET /api/github-activity?username=...&repo=...&windowDays=...
 *
 * Returns:
 *   { username, repo, windowDays, commitCount, prCount, lastCommitTimestamp }
 *
 * Semantics (must match skills/skill-streaming.md "Activity payload semantics"):
 *   - commitCount: distinct commits authored by `username` to `repo` with
 *     committer.date in [now - windowDays, now].
 *   - prCount: distinct PRs by `username` to `repo` that were OPENED or MERGED
 *     in the window. A PR opened+merged in the same window counts once.
 *   - lastCommitTimestamp: unix seconds of the most-recent commit in the
 *     window, or 0 if none.
 *
 * Authentication: optional GITHUB_TOKEN env var raises the GitHub anonymous
 * rate limit (60/hour) to authenticated rate limit (5000/hour). Required for
 * Vercel deployment.
 *
 * This route is consumed by the Somnia JSON API Request agent via
 * IJsonApiAgent.fetchString(url, ""). The response is appended to the LLM
 * Inference classifier prompt by DripPolicies.
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Top-level shape served to clients.
 *
 * The `json` field is a string containing a JSON serialization of the
 * activity payload (sans `json` itself, to avoid infinite recursion). It
 * exists for the Somnia JSON API Request agent: validators call
 * `fetchString(url, "json")` to extract this single string, which is
 * appended verbatim to the classifier prompt. We learned in Milestone 4
 * Step B that the agent's empty-selector behaviour returns Go's default
 * map representation (with scientific notation on large numbers), which
 * the M3 determinism suite never verified the classifier against. Using
 * the `json` wrapper sidesteps that by giving the agent a clean string to
 * fetch.
 *
 * The other top-level fields are kept for off-chain consumers (the
 * frontend dashboard, debugging, third-party integrations) — they're
 * properly typed JSON values and easier to consume from JS.
 */
interface ActivityResponse {
  username: string;
  repo: string;
  windowDays: number;
  commitCount: number;
  prCount: number;
  lastCommitTimestamp: number;
  json: string;
}

interface ErrorResponse {
  error: string;
  details?: unknown;
}

const GH_API = "https://api.github.com";

function ghHeaders(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "drip-agentic-streaming/0.1",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghFetch<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: ghHeaders(), next: { revalidate: 30 } });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`GitHub ${r.status}: ${body.slice(0, 200)}`);
  }
  return (await r.json()) as T;
}

interface GhCommit {
  sha: string;
  commit: { committer?: { date?: string }; author?: { date?: string } };
  author?: { login?: string } | null;
}

interface GhPull {
  number: number;
  state: "open" | "closed";
  user?: { login?: string } | null;
  created_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

/**
 * Fetch commits authored by `username` since `sinceIso`, paginating up to
 * `maxPages` × 100 results. Returns the commit objects.
 *
 * Note on the `author` parameter: GitHub's API takes `author` as the GitHub
 * login OR an email. Matching by login is reliable; we use it here.
 */
async function fetchCommits(
  owner: string,
  repo: string,
  username: string,
  sinceIso: string,
  maxPages = 5,
): Promise<GhCommit[]> {
  const out: GhCommit[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `${GH_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?author=${encodeURIComponent(username)}&since=${encodeURIComponent(sinceIso)}&per_page=100&page=${page}`;
    const batch = await ghFetch<GhCommit[]>(url);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

/**
 * Fetch PRs from this contributor and count those that were OPENED or MERGED
 * inside the window. GitHub's pulls endpoint doesn't filter by author, so we
 * page through state=all and filter client-side. We stop paging once we see
 * a page whose newest item was created before the window — older PRs can't
 * have been opened-in-window. (They CAN still have been merged-in-window if
 * the PR is very old; for the hackathon we accept this trade-off, which
 * undercounts very-old PRs that were merged during the window. Most DAO
 * contributor windows are short — 7 days — making this rare.)
 */
async function countPRs(
  owner: string,
  repo: string,
  username: string,
  sinceMs: number,
  nowMs: number,
  maxPages = 10,
): Promise<number> {
  let count = 0;
  const lowerUser = username.toLowerCase();
  for (let page = 1; page <= maxPages; page++) {
    const url = `${GH_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=all&sort=created&direction=desc&per_page=100&page=${page}`;
    const batch = await ghFetch<GhPull[]>(url);
    if (batch.length === 0) break;

    let anyInWindow = false;
    for (const pr of batch) {
      if ((pr.user?.login ?? "").toLowerCase() !== lowerUser) continue;
      const createdMs = Date.parse(pr.created_at);
      const mergedMs = pr.merged_at ? Date.parse(pr.merged_at) : 0;
      const openedInWindow = createdMs >= sinceMs && createdMs <= nowMs;
      const mergedInWindow = mergedMs > 0 && mergedMs >= sinceMs && mergedMs <= nowMs;
      if (openedInWindow || mergedInWindow) count++;
      if (createdMs >= sinceMs) anyInWindow = true;
    }
    // Stop when the WHOLE page is older than the window — anything further
    // back can no longer have been opened-in-window. (Merged-in-window of
    // old PRs is the documented undercount above.)
    if (!anyInWindow) break;
    if (batch.length < 100) break;
  }
  return count;
}

function lastCommitTimestamp(commits: GhCommit[]): number {
  let maxMs = 0;
  for (const c of commits) {
    const iso = c.commit?.committer?.date ?? c.commit?.author?.date;
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (Number.isFinite(ms) && ms > maxMs) maxMs = ms;
  }
  return Math.floor(maxMs / 1000);
}

export async function GET(req: NextRequest): Promise<NextResponse<ActivityResponse | ErrorResponse>> {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username")?.trim();
  const repoParam = searchParams.get("repo")?.trim(); // "owner/name"
  const windowDaysStr = searchParams.get("windowDays")?.trim();

  if (!username || !repoParam || !windowDaysStr) {
    return NextResponse.json(
      { error: "Missing required query params: username, repo, windowDays" },
      { status: 400 },
    );
  }
  const windowDays = Number.parseInt(windowDaysStr, 10);
  if (!Number.isFinite(windowDays) || windowDays < 1 || windowDays > 90) {
    return NextResponse.json(
      { error: "windowDays must be an integer in [1, 90]" },
      { status: 400 },
    );
  }
  const [owner, repo] = repoParam.split("/");
  if (!owner || !repo) {
    return NextResponse.json(
      { error: 'repo must be in "owner/name" form' },
      { status: 400 },
    );
  }

  const nowMs = Date.now();
  const sinceMs = nowMs - windowDays * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();

  try {
    const [commits, prCount] = await Promise.all([
      fetchCommits(owner, repo, username, sinceIso),
      countPRs(owner, repo, username, sinceMs, nowMs),
    ]);

    const core = {
      username,
      repo: repoParam,
      windowDays,
      commitCount: commits.length,
      prCount,
      lastCommitTimestamp: lastCommitTimestamp(commits),
    };
    const payload: ActivityResponse = {
      ...core,
      // Stringified inner payload. Note this is the SAME object minus the
      // `json` field — DripPolicies feeds this string verbatim to the
      // classifier, and the M3 determinism suite verified the classifier
      // against exactly this shape (six top-level fields, plain JSON).
      json: JSON.stringify(core),
    };
    return NextResponse.json(payload, {
      status: 200,
      // Cache modestly — JSON API agent's subcommittee fetches the same URL
      // from 3 validators in quick succession; identical responses are
      // critical for determinism. 30-second cache aligns all three.
      headers: { "Cache-Control": "public, max-age=30, s-maxage=30" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "GitHub fetch failed", details: msg }, { status: 502 });
  }
}
