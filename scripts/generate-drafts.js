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

const { fetchThumbnail } = require("./lib/thumbnail");

// Inline styles only -- no <style> block or external font link. Most blog
// platforms (Tistory included) strip <style>/<link> tags from post content
// when saving, so anything not inline on the element itself gets dropped.
const COLOR = {
  accent: "#0e7c66",
  ink: "#14231f",
  inkSoft: "#4b5c56",
  border: "#d9e2dd",
  surface: "#ffffff",
};
const FONT = "'Pretendard','Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";

function buildCard(it) {
  const eyebrow = it.category ? escapeHtml(it.category) : "앱테크";
  const image = it.thumbnail
    ? `<img src="${it.thumbnail}" alt="" style="display:block;width:100%;height:180px;object-fit:cover;" />`
    : "";
  return `  <div style="background:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:14px;overflow:hidden;margin-bottom:16px;font-family:${FONT};">
    ${image}
    <div style="padding:20px 22px;">
      <p style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${COLOR.accent};font-weight:700;margin:0 0 8px;">${eyebrow}</p>
      <h3 style="font-size:19px;line-height:1.35;margin:0 0 10px;color:${COLOR.ink};">${escapeHtml(it.title)}</h3>
      <p style="font-size:14px;line-height:1.6;color:${COLOR.ink};margin:0 0 14px;">${escapeHtml(it.excerpt)}</p>
      <a href="${escapeHtml(it.link)}" target="_blank" rel="noopener" style="display:inline-block;font-size:12.5px;color:${COLOR.accent};text-decoration:none;border-bottom:1px solid currentColor;">${escapeHtml(it.source)} · 원문 보기</a>
    </div>
  </div>`;
}

async function buildPost(items) {
  const withThumbnails = await Promise.all(
    items.map(async (it) => ({ ...it, thumbnail: await fetchThumbnail(it.link) }))
  );

  const today = new Date().toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const title = `${today} 인터넷 폐지줍기 모음 (${items.length}건)`;

  const header = `<div style="margin-bottom:24px;font-family:${FONT};">
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${COLOR.accent};font-weight:700;margin:0 0 8px;">Petji Zupgi · ${escapeHtml(today)}</p>
    <p style="font-size:14px;color:${COLOR.inkSoft};margin:0;">오늘 새로 올라온 앱테크·이벤트·포인트 정보 ${items.length}건을 모았습니다.</p>
  </div>`;

  const cards = withThumbnails.map(buildCard).join("\n");

  const html = `${header}\n${cards}`;

  return { title, html };
}

async function main() {
  const items = loadJson(ITEMS_PATH, []);
  const used = new Set(loadJson(USED_PATH, []));

  const unused = items.filter((it) => !used.has(it.guid));
  if (unused.length === 0) {
    console.log("새로 발행할 항목이 없습니다.");
    return;
  }

  const batch = unused.slice(0, BATCH_SIZE);
  const post = await buildPost(batch);

  const drafts = loadJson(DRAFTS_PATH, []);
  drafts.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
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
