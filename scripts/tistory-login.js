// Opens a real (visible) browser window so you can log in to Tistory yourself.
// No password is ever read or stored by this script — only the resulting
// logged-in session (cookies) is saved locally to .auth/tistory-state.json
// so future runs can reuse it without logging in again.

const path = require("path");
const { chromium } = require("playwright");

const AUTH_FILE = path.join(__dirname, "..", ".auth", "tistory-state.json");
const LOGIN_URL = "https://www.tistory.com/auth/login";
const MAX_WAIT_MS = 5 * 60 * 1000;
const POLL_MS = 2000;

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(LOGIN_URL);

  console.log("브라우저 창에서 직접 로그인해주세요. 로그인이 완료되면 자동으로 감지합니다 (최대 5분 대기)...");

  const start = Date.now();
  let loggedIn = false;
  while (Date.now() - start < MAX_WAIT_MS) {
    await page.waitForTimeout(POLL_MS);
    const url = page.url();
    if (!url.includes("/auth/login")) {
      loggedIn = true;
      break;
    }
  }

  if (!loggedIn) {
    console.error("시간 내에 로그인이 감지되지 않았습니다. 다시 시도해주세요.");
    await browser.close();
    process.exit(1);
  }

  const fs = require("fs");
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await context.storageState({ path: AUTH_FILE });
  console.log(`로그인 세션을 저장했습니다: ${AUTH_FILE}`);

  await browser.close();
}

main();
