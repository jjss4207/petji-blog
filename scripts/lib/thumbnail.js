// Shared thumbnail lookup for Naver blog posts, used by both the mechanical
// digest (generate-drafts.js) and the AI-curated draft builder
// (build-curated-draft.js).
//
// Naver blog links are a frameset page; the real post (and its og:image)
// lives at /PostView.naver?blogId=...&logNo=.... Mechanical lookup only --
// no AI involved, just reading a meta tag -- so it's free and safe to run
// for every item in a batch.
//
// Returns a data: URI (not the hotlink URL) because Naver's thumbnail CDN
// 403s any request carrying a Referer from another site, and Tistory's
// editor strips the referrerpolicy="no-referrer" attribute that would
// otherwise fix that -- so a plain <img src="https://...naver..."> always
// renders broken once published. Embedding the bytes sidesteps both.
//
// Tistory's editor also silently drops the ENTIRE post content if it's too
// big (observed: ~265KB OK, ~389KB dropped) -- with up to 8 images per post
// that means each one has to stay small, so we ask Naver's own thumbnail CDN
// for a smaller size (type=w300, ~14KB) instead of embedding full-size images.
const MAX_THUMBNAIL_BYTES = 40 * 1024;

async function fetchThumbnail(link) {
  try {
    const m = link.match(/blog\.naver\.com\/([^/?]+)\/(\d+)/);
    if (!m) return null;
    const [, blogId, logNo] = m;
    const pageUrl = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true&noTrackingCode=true&directAccess=false`;
    const pageRes = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (!og) return null;
    let imageUrl = og[1];
    try {
      const u = new URL(imageUrl);
      u.searchParams.set("type", "w300");
      imageUrl = u.toString();
    } catch {
      // keep original imageUrl if it doesn't parse as a URL
    }

    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
    if (!imgRes.ok) return null;
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_THUMBNAIL_BYTES) return null;
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

module.exports = { fetchThumbnail, MAX_THUMBNAIL_BYTES };
