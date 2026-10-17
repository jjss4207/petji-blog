// Takes a curated-items JSON file (produced by a human or an AI editorial
// pass -- see the shape below) and turns it into a ready-to-publish Tistory
// draft, then commits it to the repo so the local dashboard can pick it up.
//
// Usage: node scripts/build-curated-draft.js <path-to-curated.json>
//
// Input JSON shape:
// {
//   "postTitle": "optional override; defaults to a dated title",
//   "items": [
//     {
//       "guid": "<matches an items.json guid, used to mark it as used>",
//       "eyebrow": "short category tag, e.g. '간편결제 · 추첨'",
//       "title": "rewritten, clean title",
//       "period": "기간 -- when this runs, or '정보 없음'",
//       "benefit": "혜택 -- what you actually get",
//       "howto": "참여 -- how to participate",
//       "link": "original post URL (also used to look up a thumbnail)",
//       "source": "blog name"
//     }
//   ],
//   "excluded": [
//     { "title": "...", "reason": "e.g. 추천인 코드 입력 필요" }
//   ]
// }
//
// This script owns the parts that are easy to get wrong mechanically:
// thumbnail fetching/sizing, HTML escaping, inline-style safety, and the
// git commit. The curation judgment itself (what to write in each field,
// what to exclude) is expected to already be done by whoever produced the
// input JSON.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { fetchThumbnail } = require("./lib/thumbnail");

const ROOT = path.join(__dirname, "..");
const USED_PATH = path.join(ROOT, "data", "used-items.json");
const DRAFTS_PATH = path.join(ROOT, "data", "drafts", "pending.json");

const COLOR = {
  accent: "#0e7c66",
  ink: "#14231f",
  inkSoft: "#4b5c56",
  border: "#d9e2dd",
  surface: "#ffffff",
};
const FONT = "'Pretendard','Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label, value) {
  if (!value) return "";
  return `      <div style="display:flex;gap:10px;font-size:14px;margin:0 0 4px;">
        <span style="color:${COLOR.accent};font-weight:700;font-size:13px;min-width:34px;flex-shrink:0;">${escapeHtml(label)}</span>
        <span style="color:${COLOR.ink};">${escapeHtml(value)}</span>
      </div>`;
}

function buildCard(it) {
  const image = it.thumbnail
    ? `<img src="${it.thumbnail}" alt="" style="display:block;width:100%;height:180px;object-fit:cover;" />`
    : "";
  const rows = [row("기간", it.period), row("혜택", it.benefit), row("참여", it.howto)].filter(Boolean).join("\n");
  return `  <div style="background:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:14px;overflow:hidden;margin-bottom:16px;font-family:${FONT};">
    ${image}
    <div style="padding:20px 22px;">
      <p style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${COLOR.accent};font-weight:700;margin:0 0 8px;">${escapeHtml(it.eyebrow || "앱테크")}</p>
      <h3 style="font-size:19px;line-height:1.35;margin:0 0 10px;color:${COLOR.ink};">${escapeHtml(it.title)}</h3>
      <div style="margin:0 0 14px;">
${rows}
      </div>
      <a href="${escapeHtml(it.link)}" target="_blank" rel="noopener" style="display:inline-block;font-size:12.5px;color:${COLOR.accent};text-decoration:none;border-bottom:1px solid currentColor;">${escapeHtml(it.source || "")} · 원문 보기</a>
    </div>
  </div>`;
}

function buildExcludedFooter(excluded) {
  if (!excluded || excluded.length === 0) return "";
  const lines = excluded
    .map((e) => `    <li style="margin-bottom:4px;">${escapeHtml(e.title)} — ${escapeHtml(e.reason)}</li>`)
    .join("\n");
  return `\n  <div style="margin-top:8px;padding-top:16px;border-top:1px solid ${COLOR.border};font-family:${FONT};">
    <p style="font-size:13px;font-weight:700;color:${COLOR.ink};margin:0 0 8px;">제외한 글</p>
    <ul style="margin:0;padding-left:18px;font-size:13px;color:${COLOR.inkSoft};">
${lines}
    </ul>
  </div>`;
}

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8" });
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/build-curated-draft.js <path-to-curated.json>");
    process.exit(1);
  }
  const curated = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const items = curated.items || [];
  if (items.length === 0) {
    console.log("편집된 글이 없습니다. 커밋하지 않습니다.");
    return;
  }

  const withThumbnails = await Promise.all(
    items.map(async (it) => ({ ...it, thumbnail: it.link ? await fetchThumbnail(it.link) : null }))
  );

  const today = new Date().toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const title = curated.postTitle || `${today} 앱테크 브리핑 (${items.length}건)`;

  const header = `<div style="margin-bottom:24px;font-family:${FONT};">
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${COLOR.accent};font-weight:700;margin:0 0 8px;">Petji Zupgi · ${escapeHtml(today)}</p>
    <p style="font-size:14px;color:${COLOR.inkSoft};margin:0;">오늘의 앱테크·이벤트 정보 ${items.length}건을 정리했습니다.</p>
  </div>`;

  const cards = withThumbnails.map(buildCard).join("\n");
  const footer = buildExcludedFooter(curated.excluded);
  const html = `${header}\n${cards}${footer}`;

  console.log(`생성된 본문 길이: ${html.length}자`);

  const drafts = loadJson(DRAFTS_PATH, []);
  drafts.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    html,
    itemGuids: items.map((it) => it.guid).filter(Boolean),
    createdAt: new Date().toISOString(),
    source: "ai-curated",
  });
  saveJson(DRAFTS_PATH, drafts);

  const used = new Set(loadJson(USED_PATH, []));
  items.forEach((it) => it.guid && used.add(it.guid));
  saveJson(USED_PATH, [...used]);

  console.log(`초안 생성 완료: "${title}" (${items.length}건, 제외 ${(curated.excluded || []).length}건)`);

  try {
    run("git", ["add", "data/drafts/pending.json", "data/used-items.json"]);
    run("git", ["commit", "-m", `AI-curated draft: ${title}`]);
    run("git", ["push"]);
    console.log("깃헙에 커밋 및 푸시 완료.");
  } catch (err) {
    console.error("git 커밋/푸시 중 문제가 발생했습니다:", err.message);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
