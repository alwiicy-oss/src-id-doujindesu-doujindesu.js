// ID: ext_doujindesu
// NAME: DoujinDesu
// TYPE: comic
// VERSION: 1.0.7
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
    if (t.includes("Just a moment") || t.includes("cf-browser-verification") || t.length < 2000) return "";
    return t;
  } catch (e) { return ""; }
}

function isBadSlug(slug) {
  if (!slug) return true;
  slug = slug.toLowerCase().replace(/\//g, "");
  // Ini yang bikin "page1" muncul tadi - sekarang dibuang semua
  if (slug === "" || slug === "page" || slug.startsWith("page") || slug.startsWith("page-")) return true;
  if (/^page\d+$/.test(slug) || /^p\d+$/.test(slug)) return true;
  if (slug === "manga" || slug === "category" || slug === "tag" || slug === "genre" || slug === "genres" || slug === "author" || slug === "search") return true;
  if (slug.includes("category") || slug.includes("/page/")) return true;
  if (/^\d+$/.test(slug)) return true;
  if (slug.length < 4) return true;
  return false;
}

function parseList(html, base) {
  const list = [];
  const seen = new Set();

  // Cari semua <a> yang href-nya /manga/xxx
  const re = /<a[^>]+href=["']([^"']*\/manga\/[^"'\s]+)["'][^>]*>([\s\S]{0,1500}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1].split("?")[0].split("#")[0];
    const slugPart = href.split("/manga/")[1] || "";
    const slug = slugPart.split("/")[0];
    if (isBadSlug(slug)) continue;
    if (href.includes("/page/")) continue;
    if (seen.has(href)) continue;
    seen.add(href);

    const inner = m[2] || "";
    const fullTag = m[0] || "";

    // Title dari alt, title, atau div tt - JANGAN dari slug kalau ada alt
    let title = "";
    const alt = (fullTag + inner).match(/alt=["']([^"']+)["']/i);
    if (alt) title = cleanText(alt[1]);
    if (!title) {
      const tAttr = fullTag.match(/title=["']([^"']+)["']/i);
      if (tAttr) title = cleanText(tAttr[1]);
    }
    if (!title) {
      const tt = inner.match(/<div class=["']tt["'][^>]*>([\s\S]{1,200}?)<\/div>/i);
      if (tt) title = cleanText(tt[1]);
    }
    if (!title) {
      const h = inner.match(/<h[23][^>]*>([\s\S]{1,200}?)<\/h[23]>/i);
      if (h) title = cleanText(h[1]);
    }
    // Terakhir baru dari slug, tapi slug-nya harus beneran judul, bukan page1
    if (!title) title = cleanText(slug.replace(/-/g, " "));
    if (!title || title.length < 3 || title.length > 180) continue;
    if (title.toLowerCase() === "page1" || title.toLowerCase().startsWith("page ")) continue;

    let cover = extractImg(fullTag + inner);
    // Kalau cover masih kosong, cari di 800 char setelah link
    if (!cover) {
      const idx = m.index;
      cover = extractImg(html.substring(idx, idx + 1000));
    }

    list.push({ id: absUrl(href, base), title, cover_url: absUrl(cover, base), latest_chapter: "-", rating: "-", views: "-" });
    if (list.length >= 30) break;
  }
  return list;
}

var KonmikExtension = {
  async getList(page, query, filters) {
    page = page || 1;
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
    const title = tm ? cleanText(tm[1]) : "Unknown";
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
