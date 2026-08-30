// Fetches configured Naver Blog RSS feeds, merges new posts into data/items.json,
// and regenerates the static site at docs/index.html.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SOURCES_PATH = path.join(__dirname, "sources.json");
const DATA_PATH = path.join(ROOT, "data", "items.json");
const SITE_PATH = path.join(ROOT, "docs", "index.html");

const MAX_ITEMS = 300;
const EXCERPT_LENGTH = 140;

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`);
  const m = block.match(re);
  if (!m) return "";
  return (m[1] !== undefined ? m[1] : m[2]).trim();
}

function stripHtml(text) {
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function parseRss(xml, sourceName) {
  const items = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const block of itemBlocks) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link").split("?")[0];
    const guid = extractTag(block, "guid") || link;
    const description = stripHtml(extractTag(block, "description"));
    const pubDate = extractTag(block, "pubDate");
    const category = extractTag(block, "category");
    if (!title || !link) continue;
    items.push({
      guid,
      title,
      link,
      source: sourceName,
      category,
      pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      excerpt: description.length > EXCERPT_LENGTH
        ? description.slice(0, EXCERPT_LENGTH) + "…"
        : description,
    });
  }
  return items;
}

async function fetchFeed(source) {
  const res = await fetch(source.rssUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  });
  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);
  const xml = await res.text();
  return parseRss(xml, source.name);
}

function loadExistingItems() {
  if (!fs.existsSync(DATA_PATH)) return [];
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function mergeItems(existing, fresh) {
  const byGuid = new Map(existing.map((it) => [it.guid, it]));
  for (const item of fresh) byGuid.set(item.guid, item);
  return [...byGuid.values()]
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, MAX_ITEMS);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSite(items) {
  const updated = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const cards = items
    .map((it) => {
      const date = new Date(it.pubDate).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
      return `
      <article class="card">
        <div class="meta">
          <span class="source">${escapeHtml(it.source)}</span>
          ${it.category ? `<span class="tag">${escapeHtml(it.category)}</span>` : ""}
          <span class="date">${date}</span>
        </div>
        <h2><a href="${escapeHtml(it.link)}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a></h2>
        <p class="excerpt">${escapeHtml(it.excerpt)}</p>
        <a class="read-more" href="${escapeHtml(it.link)}" target="_blank" rel="noopener">원문 보기 →</a>
      </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>인터넷 폐지줍기 모음</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; padding: 0 1rem 3rem;
    font-family: -apple-system, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    background: #f6f5f2; color: #1c1c1c;
  }
  header { max-width: 720px; margin: 0 auto; padding: 2.5rem 0 1rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .updated { color: #777; font-size: 0.85rem; }
  main { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem; }
  .card {
    background: #fff; border-radius: 12px; padding: 1.1rem 1.3rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  .meta { display: flex; gap: 0.5rem; flex-wrap: wrap; font-size: 0.78rem; color: #888; margin-bottom: 0.4rem; }
  .source { font-weight: 600; color: #4a63e7; }
  .tag { background: #eef0fb; color: #4a63e7; padding: 0.1rem 0.5rem; border-radius: 999px; }
  h2 { font-size: 1.05rem; margin: 0 0 0.4rem; line-height: 1.4; }
  h2 a { color: inherit; text-decoration: none; }
  h2 a:hover { text-decoration: underline; }
  .excerpt { font-size: 0.9rem; color: #444; line-height: 1.5; margin: 0 0 0.5rem; }
  .read-more { font-size: 0.85rem; color: #4a63e7; text-decoration: none; font-weight: 600; }
  .read-more:hover { text-decoration: underline; }
  @media (prefers-color-scheme: dark) {
    body { background: #15161a; color: #e8e8e8; }
    .card { background: #1f2128; box-shadow: none; }
    .excerpt { color: #bbb; }
    .tag { background: #262a3a; }
  }
</style>
</head>
<body>
<header>
  <h1>💰 인터넷 폐지줍기 모음</h1>
  <div class="updated">마지막 업데이트: ${updated} · 총 ${items.length}개 글</div>
</header>
<main>
${cards}
</main>
</body>
</html>
`;
}

async function main() {
  const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
  const results = await Promise.allSettled(sources.map(fetchFeed));

  let fresh = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      fresh = fresh.concat(r.value);
    } else {
      console.error(`Failed to fetch ${sources[i].name}: ${r.reason}`);
    }
  });

  const existing = loadExistingItems();
  const merged = mergeItems(existing, fresh);

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(merged, null, 2), "utf8");

  fs.mkdirSync(path.dirname(SITE_PATH), { recursive: true });
  fs.writeFileSync(SITE_PATH, renderSite(merged), "utf8");

  console.log(`Merged ${fresh.length} fetched items into ${merged.length} total items.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
