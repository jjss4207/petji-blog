// Local dashboard for reviewing and publishing Tistory drafts.
//
// Two ways drafts get here:
//  1. A scheduled cloud agent curates the day's collected items and commits
//     the result to data/drafts/pending.json on GitHub (see
//     scripts/build-curated-draft.js) -- this process pulls that down
//     every few minutes so it shows up here.
//  2. Hand-written posts via the "새 글 예약" form below, saved to
//     data/scheduled-posts.json with a scheduledAt time.
//
// Either way, publishing to Tistory itself only happens here, using the
// session saved by scripts/tistory-login.js -- manually via "지금 발행",
// or automatically once a scheduled post's time arrives. Keep this process
// running (npm run dashboard) for scheduled posts and git sync to work.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const express = require("express");
const { chromium } = require("playwright");
const { publishDraftToTistory } = require("./lib/tistory-publish");

const ROOT = path.join(__dirname, "..");
const AUTH_FILE = path.join(ROOT, ".auth", "tistory-state.json");
const POSTS_PATH = path.join(ROOT, "data", "scheduled-posts.json");
const PUBLISHED_LOG_PATH = path.join(ROOT, "data", "published-log.json");
const CONFIG_PATH = path.join(ROOT, "data", "config.json");
const DRAFTS_PATH = path.join(ROOT, "data", "drafts", "pending.json");

const PORT = process.env.PORT || 4321;
const CHECK_INTERVAL_MS = 60 * 1000;

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function getBlogUrl() {
  return process.env.TISTORY_BLOG_URL || loadJson(CONFIG_PATH, {}).tistoryBlogUrl || null;
}

function getAutoConfig() {
  return loadJson(CONFIG_PATH, {}).dailyAutoCollect || null;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, "public")));

app.get("/api/posts", (req, res) => {
  res.json({
    drafts: loadJson(DRAFTS_PATH, []),
    scheduled: loadJson(POSTS_PATH, []),
    published: loadJson(PUBLISHED_LOG_PATH, []).slice(-30).reverse(),
    loggedIn: fs.existsSync(AUTH_FILE),
    blogUrl: getBlogUrl(),
    autoCollect: getAutoConfig(),
  });
});

app.post("/api/posts", (req, res) => {
  const { title, html, scheduledAt } = req.body || {};
  if (!title || !html || !scheduledAt) {
    return res.status(400).json({ error: "title, html, scheduledAt는 필수입니다." });
  }
  if (Number.isNaN(new Date(scheduledAt).getTime())) {
    return res.status(400).json({ error: "scheduledAt 형식이 올바르지 않습니다." });
  }

  const posts = loadJson(POSTS_PATH, []);
  const post = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    html,
    scheduledAt,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  posts.push(post);
  posts.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  saveJson(POSTS_PATH, posts);
  res.status(201).json(post);
});

app.delete("/api/posts/:id", (req, res) => {
  const posts = loadJson(POSTS_PATH, []);
  const target = posts.find((p) => p.id === req.params.id);
  if (!target) return res.status(404).json({ error: "찾을 수 없습니다." });
  if (target.status !== "pending") {
    return res.status(409).json({ error: "대기 중인 글만 취소할 수 있습니다." });
  }
  saveJson(POSTS_PATH, posts.filter((p) => p.id !== req.params.id));
  res.status(204).end();
});

// Manually publish one auto-collected (or hand-written) draft right now.
// This is the only path that actually posts to Tistory for drafts sitting
// in data/drafts/pending.json -- nothing publishes those automatically.
app.post("/api/drafts/:id/publish", async (req, res) => {
  if (isBrowserBusy) {
    return res.status(409).json({ error: "다른 글을 발행하는 중입니다. 잠시 후 다시 시도해주세요." });
  }
  const drafts = loadJson(DRAFTS_PATH, []);
  const draft = drafts.find((d) => d.id === req.params.id);
  if (!draft) return res.status(404).json({ error: "찾을 수 없습니다." });

  try {
    const result = await publishNow(draft);
    saveJson(DRAFTS_PATH, loadJson(DRAFTS_PATH, []).filter((d) => d.id !== draft.id));
    pushLocalChange(`Published: ${draft.title}`);
    res.json({ publishedUrl: result.publishedUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/drafts/:id/preview.png", async (req, res) => {
  if (isBrowserBusy) {
    return res.status(409).json({ error: "다른 작업이 진행 중입니다. 잠시 후 다시 시도해주세요." });
  }
  const draft = loadJson(DRAFTS_PATH, []).find((d) => d.id === req.params.id);
  if (!draft) return res.status(404).json({ error: "찾을 수 없습니다." });
  try {
    const png = await capturePreview(draft);
    res.set("Content-Type", "image/png");
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/posts/:id/preview.png", async (req, res) => {
  if (isBrowserBusy) {
    return res.status(409).json({ error: "다른 작업이 진행 중입니다. 잠시 후 다시 시도해주세요." });
  }
  const post = loadJson(POSTS_PATH, []).find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: "찾을 수 없습니다." });
  try {
    const png = await capturePreview(post);
    res.set("Content-Type", "image/png");
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/drafts/:id", (req, res) => {
  const drafts = loadJson(DRAFTS_PATH, []);
  const target = drafts.find((d) => d.id === req.params.id);
  if (!target) {
    return res.status(404).json({ error: "찾을 수 없습니다." });
  }
  saveJson(DRAFTS_PATH, drafts.filter((d) => d.id !== req.params.id));
  pushLocalChange(`Discard draft: ${target.title}`);
  res.status(204).end();
});

let isBrowserBusy = false;

// Opens a Tistory session and publishes one { title, html } draft. Shared by
// the scheduled-posts auto-publish loop and the manual "지금 발행" button.
async function publishNow(draft) {
  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error("로그인 세션이 없습니다. node scripts/tistory-login.js <블로그주소> 를 먼저 실행하세요.");
  }
  const blogUrl = getBlogUrl();
  if (!blogUrl) {
    throw new Error("블로그 주소가 설정되지 않았습니다. data/config.json을 확인하세요.");
  }

  isBrowserBusy = true;
  console.log(`[publish] 발행 시작: "${draft.title}"`);
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();
    const result = await publishDraftToTistory(page, draft, blogUrl, {});

    const log = loadJson(PUBLISHED_LOG_PATH, []);
    log.push({ title: draft.title, publishedAt: new Date().toISOString(), url: result.publishedUrl, itemGuids: draft.itemGuids || [] });
    saveJson(PUBLISHED_LOG_PATH, log);

    console.log(`[publish] 발행 완료: "${draft.title}"${result.publishedUrl ? " -> " + result.publishedUrl : ""}`);
    return result;
  } catch (err) {
    console.error(`[publish] 발행 실패: "${draft.title}" - ${err.message}`);
    throw err;
  } finally {
    await browser.close();
    isBrowserBusy = false;
  }
}

// Opens Tistory's own "미리보기" (preview) overlay with the draft's title and
// body filled in -- never touches the publish button -- and screenshots it,
// so what's returned is exactly how the real post will look once published.
async function capturePreview(draft) {
  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error("로그인 세션이 없습니다. node scripts/tistory-login.js <블로그주소> 를 먼저 실행하세요.");
  }
  const blogUrl = getBlogUrl();
  if (!blogUrl) {
    throw new Error("블로그 주소가 설정되지 않았습니다. data/config.json을 확인하세요.");
  }

  isBrowserBusy = true;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: AUTH_FILE, viewport: { width: 1280, height: 2400 } });
    const page = await context.newPage();
    await page.goto(`${blogUrl.replace(/\/$/, "")}/manage/newpost/`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForSelector("#post-title-inp", { timeout: 20000 });
    await page.waitForFunction(() => window.tinymce && window.tinymce.get("editor-tistory"), { timeout: 20000 });

    await page.fill("#post-title-inp", draft.title);
    await page.evaluate((html) => {
      const editor = window.tinymce.get("editor-tistory");
      editor.setContent(html);
      editor.save();
    }, draft.html);

    await page.click("#preview-btn");
    const frame = page.locator(".preview_layer iframe");
    await frame.waitFor({ timeout: 10000 });
    await page.waitForTimeout(3000); // let the preview finish rendering -- longer drafts take a bit to lay out
    return await frame.screenshot();
  } finally {
    await browser.close();
    isBrowserBusy = false;
  }
}

async function checkAndPublishDue() {
  if (isBrowserBusy) return;
  const posts = loadJson(POSTS_PATH, []);
  const now = Date.now();
  const due = posts.find((p) => p.status === "pending" && new Date(p.scheduledAt).getTime() <= now);
  if (!due) return;

  try {
    const result = await publishNow(due);
    due.status = "published";
    due.publishedAt = new Date().toISOString();
    due.publishedUrl = result.publishedUrl;
    pushLocalChange(`Published: ${due.title}`);
  } catch (err) {
    due.status = "failed";
    due.error = err.message;
  }

  const updated = loadJson(POSTS_PATH, []).map((p) => (p.id === due.id ? due : p));
  saveJson(POSTS_PATH, updated);
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

// The actual curation (reading today's items, rewriting titles, filling in
// 기간/혜택/참여, deciding what to exclude) happens in a scheduled cloud
// agent -- not here -- because this process only has the Tistory login
// session locally, while the cloud agent only has repo access. The agent
// commits its draft to GitHub; this just pulls it down so the dashboard
// shows it. Local actions (publish, discard) push back out the same way.
const SYNC_INTERVAL_MS = 2 * 60 * 1000;

function syncFromGit() {
  try {
    git(["pull", "--rebase", "--autostash"]);
  } catch (err) {
    console.error("[sync] git pull 실패:", err.message.split("\n")[0]);
  }
}

function pushLocalChange(message) {
  try {
    git(["add", "data/drafts/pending.json", "data/used-items.json", "data/published-log.json"]);
    const status = git(["status", "--porcelain", "--", "data/drafts/pending.json", "data/used-items.json", "data/published-log.json"]);
    if (!status.trim()) return; // nothing to commit
    git(["commit", "-m", message]);
    git(["push"]);
  } catch (err) {
    console.error("[sync] git push 실패 (다음 동기화 때 다시 시도됩니다):", err.message.split("\n")[0]);
  }
}

setInterval(checkAndPublishDue, CHECK_INTERVAL_MS);
setInterval(syncFromGit, SYNC_INTERVAL_MS);
checkAndPublishDue();
syncFromGit();

app.listen(PORT, () => {
  console.log(`대시보드 실행 중: http://localhost:${PORT}`);
  console.log(`${CHECK_INTERVAL_MS / 1000}초마다 예약된 글을 확인합니다. 이 터미널을 닫으면 자동 발행도 멈춥니다.`);
});
