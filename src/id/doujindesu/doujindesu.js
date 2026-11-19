// ID: ext_doujindesu
// NAME: DoujinDesu
// TYPE: comic
// VERSION: 1.0.4
// COLOR: #E91E63
// ICON: https://doujin.desu.xxx/favicon.ico
// REFERER: https://doujin.desu.xxx/

const BASE = "https://doujin.desu.xxx";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": BASE + "/"
};

function cleanText(str) {
  if (!str) return "";
  return str.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
function extractImg(block) {
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

    // doujin.desu.xxx pake /manga/xxx dan /gallery/xxx
    const re = /<a[^>]+href=["']([^"']*\/(?:manga|gallery)\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      let href = m[1].split("?")[0];
      if (seen.has(href)) continue;
      seen.add(href);
      let title = "";
      const tAttr = m[0].match(/title=["']([^"']+)["']/i);
      if (tAttr) title = cleanText(tAttr[1]);
      if (!title) title = cleanText(m[2]);
      if (!title || title.length < 2 || title.length > 180) continue;
      let cover = extractImg(m[2]);
      if (!cover) {
        const idx = html.indexOf(m[0]);
        cover = extractImg(html.substring(Math.max(0, idx - 700), idx + 700));
      }
      mangaList.push({ id: absUrl(href), title, cover_url: absUrl(cover), latest_chapter: "-", rating: "-", views: "-" });
      if (mangaList.length >= 30) break;
    }

    if (mangaList.length === 0) {
      const parts = html.split(/<div class=["']bsx["']/i);
      for (let i = 1; i < parts.length; i++) {
        const block = parts[i];
        const lm = block.match(/<a[^>]+href=["']([^"']+)["']/i);
        if (!lm || seen.has(lm[1])) continue;
        seen.add(lm[1]);
        const tm = block.match(/<div class=["']tt["'][^>]*>([\s\S]*?)<\/div>/i);
        const title = cleanText(tm ? tm[1] : "");
        if (!title) continue;
        mangaList.push({ id: absUrl(lm[1]), title, cover_url: absUrl(extractImg(block)), latest_chapter: "-", rating: "-", views: "-" });
      }
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
    const descMatch = html.match(/<div class=["']entry-content["'][\s\S]*?>([\s\S]*?)<\/div>/i);
    const description = descMatch ? cleanText(descMatch[1]) : "Tidak ada sinopsis.";
    const genres = [];
    const gr = /<a[^>]+href=["'][^"']*\/(?:genres|tag)\/[^"']*["'][^>]*>([^<]+)<\/a>/gi;
    let gm;
    while ((gm = gr.exec(html)) !== null) {
      const g = cleanText(gm[1]);
      if (g && !genres.includes(g)) genres.push(g);
    }
    const chapters = [{ id: url, title: "Read - Chapter 1", endpoint: url, date: "-" }];
    return { title, cover_url: absUrl(cover), description, author: "-", artist: "-", rating: "-", views: "-", genres: genres.length ? genres : ["Doujin"], chapters };
  },

  async getChapterImages(endpoint) {
    const url = endpoint.startsWith("http") ? endpoint : absUrl(endpoint);
    const html = await fetchHtml(url);
    const images = [];
    const area = html.match(/<div id=["']readerarea["'][\s\S]*?<\/div>/i);
    const srcHtml = area ? area[0] : html;
    const imgRe = /<img[^>]+(?:data-lazy-src|data-src|src)=["']([^"']+)["']/gi;
    let im;
    while ((im = imgRe.exec(srcHtml)) !== null) {
      const u = absUrl(im[1].trim());
      if (u && !u.startsWith("data:") && !images.includes(u)) images.push(u);
    }
    if (images.length === 0) {
      const allRe = /https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi;
      let sm;
      while ((sm = allRe.exec(html)) !== null) {
        if (!images.includes(sm[0])) images.push(sm[0]);
      }
    }
    return images;
  }
};
