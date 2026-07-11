"use strict";

const __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    const fulfilled = (value) => { try { step(generator.next(value)); } catch (e) { reject(e); } };
    const rejected  = (value) => { try { step(generator.throw(value)); } catch (e) { reject(e); } };
    const step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

const HEXION_ENDPOINTS = [
  "https://tight-frog-63c3.xn1nazihva.workers.dev/config/aHR0cHM6Ly9hLjExMTQ3Ny54eXovOjpzb3J0PWZpbGUtZGVzYzo6dG1kYj02ZTZhYjcwMGI2NDc3MTcxZWU2YzIzZDUwNGIxZTljYjo6bmFtZT1FY2xpcHNpYQ",
  "https://cool-darkness-71f0.heved.workers.dev/config/aHR0cHM6Ly9hLjExMTQ3Ny54eXovOjpzb3J0PWZpbGUtZGVzYzo6dG1kYj02ZTZhYjcwMGI2NDc3MTcxZWU2YzIzZDUwNGIxZTljYjo6bmFtZT1FY2xpcHNpYQ",
  "https://tight-frog-63c3.xn1nazihva.workers.dev/config/aHR0cHM6Ly9hLjExMTQ3Ny54eXovOjpzb3J0PWZpbGUtZGVzYzo6dG1kYj02ZTZhYjcwMGI2NDc3MTcxZWU2YzIzZDUwNGIxZTljYjo6bmFtZT1FY2xpcHNpYQ",
];

const TMDB_API_KEY = "6e6ab700b6477171ee6c23d504b1e9cb";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
};

const pad2 = (n) => String(Number.parseInt(n ?? 0, 10) || 0).padStart(2, "0");
const cleanText = (str) => String(str ?? "").replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, "").trim();
const extractQuality  = (t) => String(t ?? "").match(/(\d{3,4}p|4K)/i)?.[0] ?? null;
const extractSize     = (t) => { const m = String(t ?? "").match(/(\d+\.?\d*)\s*(GB|MB|TB)/i); return m ? `${parseFloat(m[1])} ${m[2].toUpperCase()}` : null; };
const extractBitDepth = (t) => String(t ?? "").match(/(\d{2,3})bit/i)?.[0]?.toLowerCase() ?? null;

const extractLanguage = (t) => {
  const m = String(t ?? "").match(/\(([^)]+)\)/);
  if (!m) return "Default";
  const raw = m[1].trim();
  return raw.toLowerCase() === "" ? "Default" : raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
};

const extractSource = (t) => {
  const sources = ["BluRay", "WEB-DL", "WEBRip", "HDTV", "DVDScr", "DVDRip", "CAM", "TS", "TC"];
  for (const src of sources)
    if (String(t ?? "").toUpperCase().includes(src.toUpperCase()))
      return src === "BluRay" ? "Blu-ray" : src;
  return null;
};

const extractCodec = (t) => {
  const map = { "X265": "HEVC", "X.265": "HEVC", "HEVC": "HEVC", "H.265": "HEVC", "X264": "H.264", "X.264": "H.264", "AVC": "H.264", "H.264": "H.264" };
  const upper = String(t ?? "").toUpperCase();
  for (const [k, v] of Object.entries(map)) if (upper.includes(k)) return v;
  return null;
};

const isProxyUrl = (url) => String(url ?? "").includes("workers.dev") || /[?&]url=/.test(String(url ?? ""));

function getImdbId(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const type = mediaType === "tv" ? "tv" : "movie";
    try {
      const res = yield fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`);
      if (!res.ok) return null;
      const data = yield res.json();
      return data?.external_ids?.imdb_id ?? null;
    } catch { return null; }
  });
}

function resolveProxyUrl(url) {
  return __async(this, null, function* () {
    try {
      const res = yield fetch(url, { redirect: "follow", headers: { ...HEADERS, "Referer": url } });
      const finalUrl = res.url;
      if ([".m3u8", ".mp4", ".mkv"].some((ext) => finalUrl.includes(ext))) return finalUrl;
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("text/plain")) return (yield res.text()).trim() || null;
      if (ct.includes("application/json")) { const d = yield res.json(); return d?.url ?? d?.stream ?? d?.src ?? null; }
      return finalUrl || null;
    } catch { return null; }
  });
}

function buildStream(item) {
  return __async(this, null, function* () {
    if (!item?.url || item.externalUrl) return null;
    if (String(item.url).includes("github.com")) return null;

    const ct = cleanText(item.title);
    const quality  = extractQuality(ct);
    const language = extractLanguage(ct);
    const fileSize = extractSize(ct);
    const source   = extractSource(ct);
    const codec    = extractCodec(ct);
    const bitDepth = extractBitDepth(ct);

    const parts = ["Hexion."];
    if (fileSize)                            parts.push(fileSize);
    if (source)                              parts.push(source);
    if (codec)                               parts.push(codec);
    if (bitDepth)                            parts.push(bitDepth);
    if (quality && !ct.includes(quality))    parts.push(quality);

    const displayName = parts.join(" • ");
    const fullName    = language !== "Default" ? `${displayName} (${language})` : displayName;

    const headers = { ...(item.behaviorHints?.proxyHeaders?.request ?? {}), ...(item.behaviorHints?.headers ?? {}) };
    const streamUrl = isProxyUrl(item.url) ? yield resolveProxyUrl(item.url) : item.url;
    if (!streamUrl) return null;

    return {
      name: fullName,
      title: quality ?? "Unknown",
      url: streamUrl,
      quality: quality ?? "Unknown",
      fileSize, source, codec, bitDepth,
      language: language !== "Default" ? language : null,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      provider: "hexion",
    };
  });
}

function parseStreams(data) {
  return __async(this, null, function* () {
    if (!Array.isArray(data?.streams) || data.streams.length === 0) return [];
    const valid = data.streams.filter((item) => {
      if (typeof item?.url !== "string" || !item.url.startsWith("https")) return false;
      const inner = item.url.match(/[?&]url=(https?:\/\/[^&]+)/);
      return !inner || inner[1].startsWith("https");
    });
    const streams = yield Promise.all(valid.map(buildStream));
    return streams.filter(Boolean);
  });
}

function fetchFromEndpoint(base, path) {
  return __async(this, null, function* () {
    try {
      const res = yield fetch(`${base}/${path}`);
      if (!res.ok) return [];
      return yield parseStreams(yield res.json());
    } catch { return []; }
  });
}

// Try every endpoint in order; return first non-empty result
function fetchWithFallback(paths) {
  return __async(this, null, function* () {
    for (const base of HEXION_ENDPOINTS) {
      for (const path of paths) {
        const streams = yield fetchFromEndpoint(base, path);
        if (streams.length > 0) return streams;
      }
    }
    return [];
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    const isSeries = mediaType === "tv" || season != null || episode != null;
    const s = season ?? 1;
    const e = episode ?? 1;

    try {
      const imdbId = yield getImdbId(tmdbId, isSeries ? "tv" : "movie");
      if (!imdbId) return [];

      const paths = isSeries
        ? [
            `stream/series/${imdbId}:${pad2(s)}:${pad2(e)}.json`,
            `stream/series/${imdbId}:${parseInt(s, 10) || 1}:${parseInt(e, 10) || 1}.json`,
          ]
        : [`stream/movie/${imdbId}.json`];

      return yield fetchWithFallback(paths);
    } catch { return []; }
  });
}

module.exports = { getStreams };