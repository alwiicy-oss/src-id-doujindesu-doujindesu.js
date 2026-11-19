// ID: ext_doujindesu
// NAME: DoujinDesu
// TYPE: comic
// VERSION: 1.0.5
// COLOR: #E91E63
// ICON: https://doujin.desu.xxx/favicon.ico
// REFERER: https://doujin.desu.xxx/

const BASE = "https://doujin.desu.xxx";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "Referer": BASE + "/"
};

function cleanText(str) {
  if (!str) return "";
  return str.replace(/<[^>]+>/g, " ").replace(/&#8211;/g, "-").replace(/&#8217;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
function extractImg(block) {
  if (!block) return "";
  const m1 = block.match(/data-lazy-src=["']([^"']+)["']/i);
  if (m1 && !m1[1].startsWith("data:")) return m1[1].trim();
  const m2 = block.match(/data-src=["']([^"']+)["']/i);
  if (m2 && !m2[1].startsWith("data:")) return m2[1].trim();
  const m3 = block.match(/src=["']([^"']+)["']/i);
  if (m3 && !m3[1].startsWith("data:")) return m3[1].trim();
  return "";
}
function absUrl(u) {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("/")) return BASE + u;
  return BASE + "/" + u;
}
async function fetchHtml(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.text();
}

var KonmikExtension = {
  async getList(page, query, filters) {
    page = page || 1;
    let url = "";
    if (query && query.trim()) {
      url = `${BASE}/page/${page}/?s=${encodeURIComponent(query.trim())}`;
    } else {
      url = page > 1 ? `${BASE}/page/${page}/` : `${BASE}/`;
    }
    const html = await fetchHtml(url);
    const mangaList = [];
    const seen = new Set();

    // CARA BARU: scan semua href /manga/ , jangan patokan </a>
    const hrefRegex = /href=["']([^"']*\/manga\/[^"'\s]+)["']/gi;
    let h;
    while ((h = hrefRegex.exec(html)) !== null) {
      let href = h[1].split("?")[0].split("#")[0];
      if (!href || href.endsWith("/manga/")) continue;
      if (href.includes("/chapter") || href.includes("/page/")) continue;
      if (seen.has(href)) continue;
      seen.add(href);

      // Ambil 1200 karakter sekitar link buat cari title + cover
      const idx = h.index;
      const around = html.substring(Math.max(0, idx - 800), idx + 1500);

      // Title: coba dari title="..." di tag <a> yang sama, lalu dari alt="...", lalu dari div tt
      let title = "";
      const aTag = html.substring(Math.max(0, idx - 300), idx + 200);
      const tAttr = aTag.match(/title=["']([^"']+)["']/i);
      if (tAttr) title = cleanText(tAttr[1]);
      if (!title) {
        const altAttr = around.match(/alt=["']([^"']+)["']/i);
        if (altAttr) title = cleanText(altAttr[1]);
      }
      if (!title) {
        const tt = around.match(/<div class=["']tt["'][^>]*>([\s\S]{1,200}?)<\/div>/i);
        if (tt) title = cleanText(tt[1]);
      }
      if (!title) {
        // fallback: slug jadi title
        const slug = href.split("/manga/")[1].replace(/\/$/, "");
        title = cleanText(slug.replace(/-/g, " "));
      }
      // Filter sampah
      if (!title || title.length < 3 || title.length > 180) continue;
      if (title.toLowerCase().includes("doujindesu") && title.length < 20) continue;

      let cover = extractImg(around);
      mangaList.push({ id: absUrl(href), title, cover_url: absUrl(cover), latest_chapter: "-", rating: "-", views: "-" });
      if (mangaList.length >= 40) break;
    }

    return { manga_list: mangaList };
  },

  async getDetail(slug) {
    const url = slug.startsWith("http") ? slug : absUrl(slug);
    const html = await fetchHtml(url);
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? cleanText(titleMatch[1]) : "Unknown";
    let cover = "";
    const og = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (og) cover = og[1];
    if (!cover) cover = extractImg(html.substring(0, 8000));
    const descMatch = html.match(/<div class=["']entry-content["'][\s\S]*?>([\s\S]*?)<\/div>/i);
    const description = descMatch ? cleanText(descMatch[1]) : "Tidak ada sinopsis.";
    const genres = [];
    const gr = /<a[^>]+href=["'][^"']*\/(?:genres|tag|genre)\/[^"']*["'][^>]*>([^<]+)<\/a>/gi;
    let gm;
    while ((gm = gr.exec(html)) !== null) {
      const g = cleanText(gm[1]);
      if (g && g.length < 30 && !genres.includes(g)) genres.push(g);
    }
    const chapters = [{ id: url, title: "Read - Chapter 1", endpoint: url, date: "-" }];
    return { title, cover_url: absUrl(cover), description, author: "-", artist: "-", rating: "-", views: "-", genres: genres.length ? genres : ["Doujin"], chapters };
  },

  async getChapterImages(endpoint) {
    const url = endpoint.startsWith("http") ? endpoint : absUrl(endpoint);
    const html = await fetchHtml(url);
    const images = [];
    const imgRe = /<img[^>]+(?:data-lazy-src|data-src|src)=["']([^"']+)["']/gi;
    let im;
    while ((im = imgRe.exec(html)) !== null) {
      const u = absUrl(im[1].trim());
      if (u && !u.startsWith("data:") && !images.includes(u) && !u.includes("logo") && !u.includes("favicon")) images.push(u);
    }
    return images;
  }
};
