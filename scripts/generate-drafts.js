// Turns newly-collected items from data/items.json into a ready-to-publish
// Tistory draft (title + HTML body) and appends it to data/drafts/pending.json.
// Run this after scripts/fetch-feeds.js so it has fresh items to work with.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ITEMS_PATH = path.join(ROOT, "data", "items.json");
const USED_PATH = path.join(ROOT, "data", "used-items.json");
const DRAFTS_PATH = path.join(ROOT, "data", "drafts", "pending.json");

const BATCH_SIZE = 8;

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPost(items) {
  const today = new Date().toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const title = `${today} 인터넷 폐지줍기 모음 (${items.length}건)`;

  const sections = items
    .map(
      (it) => `
<h3>${escapeHtml(it.title)}</h3>
<p>${escapeHtml(it.excerpt)}</p>
<p>출처: ${escapeHtml(it.source)} | <a href="${escapeHtml(it.link)}" target="_blank" rel="noopener">원문 보기</a></p>
<hr>`
    )
    .join("\n");

  const html = `<p>오늘 새로 올라온 앱테크·이벤트·포인트 정보 ${items.length}건을 모았습니다.</p>
${sections}`;

  return { title, html };
}

function main() {
  const items = loadJson(ITEMS_PATH, []);
  const used = new Set(loadJson(USED_PATH, []));

  const unused = items.filter((it) => !used.has(it.guid));
  if (unused.length === 0) {
    console.log("새로 발행할 항목이 없습니다.");
    return;
  }

  const batch = unused.slice(0, BATCH_SIZE);
  const post = buildPost(batch);

  const drafts = loadJson(DRAFTS_PATH, []);
  drafts.push({
    title: post.title,
    html: post.html,
    itemGuids: batch.map((it) => it.guid),
    createdAt: new Date().toISOString(),
  });

  fs.mkdirSync(path.dirname(DRAFTS_PATH), { recursive: true });
  fs.writeFileSync(DRAFTS_PATH, JSON.stringify(drafts, null, 2), "utf8");

  batch.forEach((it) => used.add(it.guid));
  fs.writeFileSync(USED_PATH, JSON.stringify([...used], null, 2), "utf8");

  console.log(`초안 생성 완료: "${post.title}" (${batch.length}건 사용, 대기중 ${drafts.length}개)`);
}

main();
