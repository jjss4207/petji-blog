// Takes a curated-items JSON file (produced by a human or an AI editorial
// pass -- see the shape below) and turns EACH item into its own separate
// ready-to-publish Tistory draft (one post per item, not a bundled digest),
// then commits them to the repo so the local dashboard can pick them up.
//
// Usage: node scripts/build-curated-draft.js <path-to-curated.json>
//
// Input JSON shape:
// {
//   "items": [
//     {
//       "guid": "<matches an items.json guid, used to mark it as used>",
//       "eyebrow": "short category tag, e.g. '간편결제 · 추첨'",
//       "title": "rewritten, clean title -- becomes the post title",
//       "period": "기간 -- when this runs, or '정보 없음'",
//       "benefit": "혜택 -- what you actually get",
//       "howto": "참여 -- how to participate",
//       "link": "original post URL (also used to look up a thumbnail)",
//       "source": "blog name"
//     }
//   ]
// }
// (Items that should be skipped -- e.g. require a referral/invite code --
// should simply be left out of "items" entirely; no draft is made for them.)
//
// This script owns the parts that are easy to get wrong mechanically:
// thumbnail fetching/sizing, HTML escaping, inline-style safety, and the
// git commit. The curation judgment itself (what to write in each field,
// what to skip) is expected to already be done by whoever produced the
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
  return `    <div style="display:flex;gap:10px;font-size:15px;margin:0 0 6px;">
      <span style="color:${COLOR.accent};font-weight:700;font-size:13px;min-width:34px;flex-shrink:0;padding-top:2px;">${escapeHtml(label)}</span>
      <span style="color:${COLOR.ink};">${escapeHtml(value)}</span>
    </div>`;
}

// One item -> one full, standalone post body (not a card in a list -- this
// IS the whole post, so no outer bordered box, just spaced sections).
function buildPostHtml(it) {
  const image = it.thumbnail
    ? `<img src="${it.thumbnail}" alt="" style="display:block;width:100%;max-height:320px;object-fit:cover;border-radius:12px;margin:0 0 20px;" />`
    : "";
  const rows = [row("기간", it.period), row("혜택", it.benefit), row("참여", it.howto)].filter(Boolean).join("\n");
  return `<div style="font-family:${FONT};">
  ${image}
  <p style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${COLOR.accent};font-weight:700;margin:0 0 10px;">${escapeHtml(it.eyebrow || "앱테크")}</p>
  <div style="margin:0 0 18px;">
${rows}
  </div>
  <a href="${escapeHtml(it.link)}" target="_blank" rel="noopener" style="display:inline-block;font-size:13px;color:${COLOR.accent};text-decoration:none;border-bottom:1px solid currentColor;">${escapeHtml(it.source || "")} · 원문 보기</a>
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

  const drafts = loadJson(DRAFTS_PATH, []);
  const used = new Set(loadJson(USED_PATH, []));
  const createdTitles = [];

  for (const it of withThumbnails) {
    const html = buildPostHtml(it);
    drafts.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: it.title,
      html,
      itemGuids: it.guid ? [it.guid] : [],
      createdAt: new Date().toISOString(),
      source: "ai-curated",
    });
    if (it.guid) used.add(it.guid);
    createdTitles.push(it.title);
  }

  saveJson(DRAFTS_PATH, drafts);
  saveJson(USED_PATH, [...used]);

  console.log(`초안 ${createdTitles.length}건 생성 완료 (각각 별도 글):`);
  createdTitles.forEach((t) => console.log(` - ${t}`));

  try {
    run("git", ["add", "data/drafts/pending.json", "data/used-items.json"]);
    run("git", ["commit", "-m", `AI-curated drafts: ${createdTitles.length}건 (${createdTitles[0]}${createdTitles.length > 1 ? " 외" : ""})`]);
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
