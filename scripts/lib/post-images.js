// Reads the images and body text of a Naver blog post. Source posts are
// mostly the blogger's own phone captures of the event page, which is what
// the published post shows instead of a single og:image thumbnail -- and the
// period/benefit details often only exist inside those captures.

// Same Tistory limits as thumbnail.js: images go in as data: URIs, and the
// editor drops a post whose content gets much past ~265KB.
const IMAGE_WIDTH = "w466";
const MAX_IMAGE_BYTES = 110 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 190 * 1024;

async function fetchPostBody(link) {
  const m = link.match(/blog\.naver\.com\/([^/?]+)\/(\d+)/);
  if (!m) return null;
  const [, blogId, logNo] = m;
  const pageUrl = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true&noTrackingCode=true&directAccess=false`;
  const res = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const html = await res.text();
  const start = html.indexOf("se-main-container");
  if (start < 0) return null;
  return html.slice(start, html.indexOf("post_footer_contents", start) >>> 0);
}

// Image URLs in post order, without the ?type= size suffix. Only the
// blogger's uploads (postfiles) -- stickers and map tiles live elsewhere.
function imageUrlsFromBody(body) {
  const seen = new Set();
  for (const m of body.matchAll(/https:\/\/postfiles\.pstatic\.net\/[^"'\s?]+/g)) seen.add(m[0]);
  return [...seen];
}

function textFromBody(body) {
  return body
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|​/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^se-main-container">\s*/, "")
    .trim();
}

async function fetchImage(url) {
  try {
    const res = await fetch(`${url}?type=${IMAGE_WIDTH}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    return { buf, contentType };
  } catch {
    return null;
  }
}

// Picks images by 1-based position in the post and returns them as data:
// URIs, dropping any that would push the post past the size budget.
async function fetchPostImagesAsDataUris(link, positions) {
  try {
    const body = await fetchPostBody(link);
    if (!body) return [];
    const urls = imageUrlsFromBody(body);
    const out = [];
    let total = 0;
    for (const pos of positions) {
      const url = urls[pos - 1];
      if (!url) continue;
      const img = await fetchImage(url);
      if (!img || img.buf.length > MAX_IMAGE_BYTES || total + img.buf.length > MAX_TOTAL_IMAGE_BYTES) continue;
      total += img.buf.length;
      out.push(`data:${img.contentType};base64,${img.buf.toString("base64")}`);
    }
    return out;
  } catch {
    return [];
  }
}

module.exports = { fetchPostBody, imageUrlsFromBody, textFromBody, fetchImage, fetchPostImagesAsDataUris };
