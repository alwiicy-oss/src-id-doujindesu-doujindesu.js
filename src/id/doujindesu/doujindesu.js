// ID: ext_doujindesu
// NAME: DoujinDesu
// TYPE: comic
// VERSION: 1.0.6
// COLOR: #E91E63
// ICON: https://doujin.desu.xxx/favicon.ico
// REFERER: https://doujin.desu.xxx/

const BASES = [
  "https://doujin.desu.xxx",
  "https://doujindesu.tv",
  "https://doujindesu.ooo"
];
let ACTIVE_BASE = BASES[0];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
  "Referer": "https://doujin.desu.xxx/"
};

function cleanText(s) {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
function extractImg(block) {
  if (!block) return "";
  const m = block.match(/(?:data-lazy-src|data-src|src)=["']([^"']+)["']/i);
  if (m && !m[1].startsWith("data:")) return m[1].trim();
  return "";
}
function absUrl(u, base) {
  base = base || ACTIVE_BASE;
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("/")) return base + u;
  return base + "/" + u;
}
async function fetchHtml(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return "";
    const t = await res.text();
    // Kalau kena Cloudflare, HTML-nya cuma "Just a moment" / challenge
    if (t.includes("Just a moment") || t.includes("cf-browser-verification") || t.length < 2000) return "";
    return t;
  } catch (e) { return ""; }
}

function parseList(html, base) {
  const list = [];
  const seen = new Set();
  // 1. Coba pola WordPress standar: <div class="bsx"> atau <article>
  const blocks = html.split(/<article|<div class=["']bsx|<div class=["']listupd/gi);
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i].substring(0, 2000);
    const lm = b.match(/href=["']([^"']*\/manga\/[^"']+)["']/i);
    if (!lm) continue;
    let href = lm[1].split("?")[0];
    if (seen.has(href)) continue;
    seen.add(href);
    let title = "";
    const alt = b.match(/alt=["']([^"']+)["']/i);
    if (alt) title = cleanText(alt[1]);
    if (!title) {
      const tt = b.match(/<div class=["']tt["'][^>]*>([\s\S]{1,200}?)<\/div>/i);
      if (tt) title = cleanText(tt[1]);
    }
    if (!title) title = cleanText(href.split("/manga/")[1].replace(/\//g, "").replace(/-/g, " "));
    if (!title || title.length < 3) continue;
    list.push({ id: absUrl(href, base), title, cover_url: absUrl(extractImg(b), base), latest_chapter: "-", rating: "-", views: "-" });
    if (list.length >= 30) break;
  }
  // 2. Kalau masih 0, scan semua href /manga/ mentah
  if (list.length === 0) {
    const re = /href=["']([^"']*\/manga\/[^"'\s]+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      let href = m[1].split("?")[0];
      if (seen.has(href) || href.endsWith("/manga/")) continue;
      seen.add(href);
      const slug = href.split("/manga/")[1].replace(/\//g, "");
      const title = cleanText(slug.replace(/-/g, " "));
      if (title.length < 3) continue;
      list.push({ id: absUrl(href, base), title, cover_url: "", latest_chapter: "-", rating: "-", views: "-" });
      if (list.length >= 30) break;
    }
  }
  return list;
}

var KonmikExtension = {
  async getList(page, query, filters) {
    page = page || 1;
    // Coba 3 domain satu-satu, yang pertama dapet data langsung dipake
    for (let bi = 0; bi < BASES.length; bi++) {
      const base = BASES[bi];
      let url = "";
      if (query && query.trim()) url = `${base}/page/${page}/?s=${encodeURIComponent(query.trim())}`;
      else url = page > 1 ? `${base}/page/${page}/` : `${base}/`;
      const html = await fetchHtml(url);
      if (!html) continue;
      const list = parseList(html, base);
      if (list.length > 0) {
        ACTIVE_BASE = base;
        return { manga_list: list };
      }
      // Coba juga endpoint /manga/ list
      const html2 = await fetchHtml(`${base}/manga/page/${page}/`);
      if (html2) {
        const list2 = parseList(html2, base);
        if (list2.length > 0) {
          ACTIVE_BASE = base;
          return { manga_list: list2 };
        }
      }
    }
    return { manga_list: [] };
  },

  async getDetail(slug) {
    const url = slug.startsWith("http") ? slug : absUrl(slug);
    const html = await fetchHtml(url) || "";
    const tm = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = tm ? cleanText(tm[1]) : cleanText(url.split("/manga/")[1] || "Unknown");
    let cover = "";
    const og = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (og) cover = og[1];
    const desc = html.match(/<div class=["']entry-content["'][\s\S]*?>([\s\S]*?)<\/div>/i);
    return { title, cover_url: absUrl(cover), description: desc ? cleanText(desc[1]) : "Tidak ada sinopsis.", author: "-", artist: "-", rating: "-", views: "-", genres: ["Doujin"], chapters: [{ id: url, title: "Read - Chapter 1", endpoint: url, date: "-" }] };
  },

  async getChapterImages(endpoint) {
    const url = endpoint.startsWith("http") ? endpoint : absUrl(endpoint);
    const html = await fetchHtml(url) || "";
    const images = [];
    const re = /<img[^>]+(?:data-lazy-src|data-src|src)=["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const u = absUrl(m[1].trim());
      if (u && !u.startsWith("data:") && !images.includes(u) && !u.includes("logo")) images.push(u);
    }
    return images;
  }
};
