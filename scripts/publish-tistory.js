// Publishes the oldest pending draft (data/drafts/pending.json) to Tistory
// using the session saved by tistory-login.js. Run generate-drafts.js first
// so there is something to publish.

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { publishDraftToTistory } = require("./lib/tistory-publish");

const ROOT = path.join(__dirname, "..");
const AUTH_FILE = path.join(ROOT, ".auth", "tistory-state.json");
const DRAFTS_PATH = path.join(ROOT, "data", "drafts", "pending.json");
const PUBLISHED_LOG_PATH = path.join(ROOT, "data", "published-log.json");

const args = process.argv.slice(2).filter((a) => a !== "--private");
const IS_PRIVATE_TEST = process.argv.includes("--private");
const BLOG_URL = args[0] || process.env.TISTORY_BLOG_URL;

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
  if (!BLOG_URL) {
    console.error("Usage: node publish-tistory.js https://yourid.tistory.com");
    process.exit(1);
  }
  if (!fs.existsSync(AUTH_FILE)) {
    console.error("로그인 세션이 없습니다. 먼저 node scripts/tistory-login.js <블로그주소> 를 실행하세요.");
    process.exit(1);
  }

  const drafts = loadJson(DRAFTS_PATH, []);
  if (drafts.length === 0) {
    console.log("발행할 초안이 없습니다.");
    return;
  }

  const draft = drafts[0];
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page = await context.newPage();

  let result;
  try {
    result = await publishDraftToTistory(page, draft, BLOG_URL, { isPrivateTest: IS_PRIVATE_TEST });
  } finally {
    await browser.close();
  }

  const remaining = drafts.slice(1);
  fs.writeFileSync(DRAFTS_PATH, JSON.stringify(remaining, null, 2), "utf8");

  const log = loadJson(PUBLISHED_LOG_PATH, []);
  log.push({
    title: draft.title,
    publishedAt: new Date().toISOString(),
    url: result.publishedUrl,
    itemGuids: draft.itemGuids,
  });
  fs.writeFileSync(PUBLISHED_LOG_PATH, JSON.stringify(log, null, 2), "utf8");

  console.log(
    `발행 완료 (${IS_PRIVATE_TEST ? "비공개 테스트" : "공개"}): "${draft.title}"${
      result.publishedUrl ? " -> " + result.publishedUrl : " (URL 확인 필요)"
    }`
  );
}

main();
