// Shared logic for publishing a single draft ({ title, html }) to Tistory
// through the Tistory web editor, reusing the session saved by
// scripts/tistory-login.js. Used by both the one-off CLI (publish-tistory.js)
// and the dashboard scheduler (dashboard-server.js).

async function publishDraftToTistory(page, draft, blogUrl, { isPrivateTest = false } = {}) {
  await page.goto(`${blogUrl.replace(/\/$/, "")}/manage/newpost/`);
  await page.waitForSelector("#post-title-inp", { timeout: 20000 });
  await page.waitForFunction(() => window.tinymce && window.tinymce.get("editor-tistory"), { timeout: 20000 });

  await page.fill("#post-title-inp", draft.title);
  const contentLength = await page.evaluate((html) => {
    const editor = window.tinymce.get("editor-tistory");
    editor.setContent(html);
    editor.fire("change");
    editor.fire("input");
    editor.save(); // sync tinymce content back to the underlying textarea Tistory reads on submit
    return editor.getContent().length;
  }, draft.html);
  if (contentLength === 0) {
    throw new Error("본문 삽입 실패: 에디터에 내용이 반영되지 않았습니다.");
  }
  await page.waitForTimeout(500);

  await page.evaluate(() => document.getElementById("publish-layer-btn").click());
  await page.waitForSelector("#open20", { timeout: 10000 });
  if (!isPrivateTest) {
    await page.evaluate(() => {
      const radio = document.getElementById("open20");
      radio.click();
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(300);
  } // else leave default 비공개 selected

  await page.evaluate(() => document.getElementById("publish-btn").click());
  await page.waitForTimeout(3000);

  const url = page.url();
  const stillOnEditor = url.includes("/manage/newpost") || url.includes("/manage/post");
  return { publishedUrl: stillOnEditor ? null : url };
}

module.exports = { publishDraftToTistory };
