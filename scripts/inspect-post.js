// For the nightly curation agent: dumps what's in a source post so it can be
// read properly before writing a draft -- the full body text, the detected
// event page URL, and every image saved to disk (numbered in post order) so
// the agent can open and look at them. Event periods are often only visible
// inside those images.
//
// Usage: node scripts/inspect-post.js <post link> [out dir, default /tmp/post-images]

const fs = require("fs");
const path = require("path");
const os = require("os");
const { fetchPostBody, imageUrlsFromBody, textFromBody, fetchImage } = require("./lib/post-images");
const { fetchEventUrl } = require("./lib/event-url");

async function main() {
  const link = process.argv[2];
  if (!link) {
    console.error("Usage: node scripts/inspect-post.js <post link> [out dir]");
    process.exit(1);
  }
  const logNo = (link.match(/(\d+)\/?$/) || [, "post"])[1];
  const outDir = path.join(process.argv[3] || path.join(os.tmpdir(), "post-images"), logNo);
  fs.mkdirSync(outDir, { recursive: true });

  const body = await fetchPostBody(link);
  if (!body) {
    console.log("본문을 가져오지 못했습니다.");
    return;
  }
  console.log("=== 본문 ===");
  console.log(textFromBody(body).slice(0, 4000));
  console.log("\n=== 이벤트 페이지 ===");
  console.log((await fetchEventUrl(link)) || "(찾지 못함)");

  console.log("\n=== 이미지 (번호 = images에 넣을 값) ===");
  const urls = imageUrlsFromBody(body);
  for (let i = 0; i < urls.length; i++) {
    const img = await fetchImage(urls[i]);
    if (!img) {
      console.log(`${i + 1}: (다운로드 실패)`);
      continue;
    }
    const file = path.join(outDir, `${i + 1}.jpg`);
    fs.writeFileSync(file, img.buf);
    console.log(`${i + 1}: ${file} (${Math.round(img.buf.length / 1024)}KB)`);
  }
  if (urls.length === 0) console.log("(이미지 없음)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
