// Finds the actual event page a Naver blog post points to, so a published
// post can link straight there instead of back to the source blog.
//
// Mechanical lookup only: reads the post body (se-main-container) of the
// same PostView page thumbnail.js uses and returns the first outbound link
// that isn't another blog post / Naver chrome. Falls back to any URL in the
// RSS excerpt (which is often cut off mid-URL, so it's only a fallback).

const SKIP_HOSTS = /(^|\.)(blog\.naver\.com|pstatic\.net|nid\.naver\.com|help\.naver\.com|naver\.me|tistory\.com|youtube\.com|youtu\.be|instagram\.com)$/i;

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

function pickEventUrl(candidates) {
  for (const raw of candidates) {
    const url = decodeEntities(raw).replace(/[)\].,…]+$/, "");
    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) continue;
      if (SKIP_HOSTS.test(u.hostname)) continue;
      return u.toString();
    } catch {
      // not a parseable URL -- try the next one
    }
  }
  return null;
}

async function fetchEventUrl(link, excerpt = "") {
  try {
    const m = link.match(/blog\.naver\.com\/([^/?]+)\/(\d+)/);
    if (m) {
      const [, blogId, logNo] = m;
      const pageUrl = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true&noTrackingCode=true&directAccess=false`;
      const res = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const html = await res.text();
        const start = html.indexOf("se-main-container");
        const body = start >= 0 ? html.slice(start, html.indexOf("post_footer_contents", start) >>> 0) : "";
        const hrefs = [...body.matchAll(/href=["']([^"']+)["']/g)].map((x) => x[1]);
        const bare = body.replace(/<[^>]+>/g, " ").match(/https?:\/\/[^\s"'<>]+/g) || [];
        const found = pickEventUrl([...hrefs, ...bare]);
        if (found) return found;
      }
    }
  } catch {
    // network trouble -- fall through to the excerpt
  }
  const url = pickEventUrl(excerpt.match(/https?:\/\/[^\s…]+/g) || []);
  // An excerpt URL that ran into the "…" truncation is likely incomplete.
  return url && !excerpt.includes(url.replace(/\/$/, "") + "…") ? url : null;
}

module.exports = { fetchEventUrl };
