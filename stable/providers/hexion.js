"use strict";

const __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    const fulfilled = (value) => {
      try { step(generator.next(value)); } catch (e) { reject(e); }
    };
    const rejected = (value) => {
      try { step(generator.throw(value)); } catch (e) { reject(e); }
    };
    const step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

const BASE_URL = "https://sooti.info";
const BASE_CONFIG = "%7B%22DebridServices%22%3A%5B%7B%22provider%22%3A%22httpstreaming%22%2C%22http4khdhub%22%3Afalse%2C%22httpHDHub4u%22%3Afalse%2C%22httpUHDMovies%22%3Afalse%2C%22httpMoviesDrive%22%3Afalse%2C%22httpMKVCinemas%22%3Afalse%2C%22httpMalluMv%22%3Afalse%2C%22httpCineDoze%22%3Afalse%2C%22httpVixSrc%22%3Afalse%2C%22httpMoviesMod%22%3Afalse%2C%22httpMoviesLeech%22%3Afalse%2C%22httpAnimeFlix%22%3Afalse%2C%22http111477%22%3Atrue%2C%22httpXDMovies%22%3Afalse%2C%22httpPixeldrain%22%3Afalse%2C%22enableProxy%22%3Afalse%2C%22proxyUrl%22%3A%22%22%2C%22proxyPassword%22%3A%22%22%7D%5D%2C%22Languages%22%3A%5B%5D%2C%22Resolutions%22%3A%5B%222160p%22%2C%221080p%22%5D%2C%22Scrapers%22%3A%5B%221337x%22%2C%22knaben%22%2C%22torrents-csv%22%2C%22rarbg%22%2C%22extto%22%2C%22limetorrents%22%5D%2C%22IndexerScrapers%22%3A%5B%22stremthru%22%5D%2C%22ScrapersConfigured%22%3Atrue%2C%22minSize%22%3A0%2C%22maxSize%22%3A200%2C%22ShowCatalog%22%3Atrue%2C%22ProxyApplyAll%22%3Afalse%2C%22DebridProvider%22%3A%22httpstreaming%22%7D";
const HEXION_API = `${BASE_URL}/${BASE_CONFIG}`;
const TMDB_API_KEY = "6e6ab700b6477171ee6c23d504b1e9cb";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
};

const pad2 = (n) => String(Number.parseInt(n ?? 0, 10) || 0).padStart(2, "0");

const cleanText = (str) =>
  String(str ?? "")
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, "")
    .trim();

const extractQuality = (titleText) => {
  const match = String(titleText ?? "").match(/(\d{3,4}p|4K)/i);
  return match?.[0] ?? null;
};

const extractLanguage = (cleanedTitle) => {
  const langMatch = String(cleanedTitle ?? "").match(/\(([^)]+)\)/);
  if (!langMatch) return "Default";
  const raw = langMatch[1].trim();
  return raw.toLowerCase() === ""
    ? "Default"
    : raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
};

const extractSize = (titleText) => {
  const match = String(titleText ?? "").match(/(\d+\.?\d*)\s*(GB|MB|TB)/i);
  return match ? `${parseFloat(match[1])} ${match[2].toUpperCase()}` : null;
};

const extractSource = (titleText) => {
  const sources = ["BluRay", "WEB-DL", "WEBRip", "HDTV", "DVDScr", "DVDRip", "CAM", "TS", "TC"];
  const text = String(titleText ?? "");
  for (const src of sources) {
    if (text.toUpperCase().includes(src.toUpperCase())) return src === "BluRay" ? "Blu-ray" : src;
  }
  return null;
};

const extractCodec = (titleText) => {
  const codecMap = {
    "X265": "HEVC", "X.265": "HEVC", "HEVC": "HEVC", "H.265": "HEVC",
    "X264": "H.264", "X.264": "H.264", "AVC": "H.264", "H.264": "H.264"
  };
  const text = String(titleText ?? "").toUpperCase();
  for (const [key, value] of Object.entries(codecMap)) {
    if (text.includes(key)) return value;
  }
  return null;
};

const extractBitDepth = (titleText) => {
  const match = String(titleText ?? "").match(/(\d{2,3})bit/i);
  return match?.[0]?.toLowerCase() ?? null;
};

const isProxyUrl = (url) =>
  String(url ?? "").includes("workers.dev") || /[?&]url=/.test(String(url ?? ""));

function getImdbId(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const type = mediaType === "tv" ? "tv" : "movie";
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
    try {
      const response = yield fetch(url);
      if (!response.ok) return null;
      const data = yield response.json();
      return data?.external_ids?.imdb_id ?? null;
    } catch {
      return null;
    }
  });
}

function resolveProxyUrl(url) {
  return __async(this, null, function* () {
    try {
      const response = yield fetch(url, {
        redirect: "follow",
        headers: { ...HEADERS, "Referer": url },
      });
      const finalUrl = response.url;
      if ([".m3u8", ".mp4", ".mkv"].some((ext) => finalUrl.includes(ext))) {
        return finalUrl;
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/plain")) {
        const text = yield response.text();
        return text.trim() || null;
      }
      if (contentType.includes("application/json")) {
        const data = yield response.json();
        return data?.url ?? data?.stream ?? data?.src ?? null;
      }
      return finalUrl || null;
    } catch {
      return null;
    }
  });
}

const detectStreamType = (url) => {
  if (!url)
    return "video";
  const lower = String(url).toLowerCase().split("?")[0];
  return lower.includes(".m3u8") ? "m3u8" : "video";
};

function buildStream(item) {
  return __async(this, null, function* () {
    if (!item?.url || item.externalUrl) return null;
    if (String(item.url).includes("github.com")) return null;

    const cleanedTitle = cleanText(item.title);
    
    const quality = extractQuality(cleanedTitle);
    const language = extractLanguage(cleanedTitle);
    const fileSize = extractSize(cleanedTitle);
    const source = extractSource(cleanedTitle);
    const codec = extractCodec(cleanedTitle);
    const bitDepth = extractBitDepth(cleanedTitle);
    
    const nameParts = ["Hexion."];
    if (fileSize) nameParts.push(fileSize);
    if (source) nameParts.push(source);
    if (codec) nameParts.push(codec);
    if (bitDepth) nameParts.push(bitDepth);
    if (quality && !cleanedTitle.includes(quality)) nameParts.push(quality);
    
    const displayName = nameParts.join(" • ");
    
    const fullDisplayName = language !== "Default" 
      ? `${displayName} (${language})`
      : displayName;

    const headers = {
      ...(item.behaviorHints?.proxyHeaders?.request ?? {}),
      ...(item.behaviorHints?.headers ?? {}),
    };

    const streamUrl = isProxyUrl(item.url)
      ? yield resolveProxyUrl(item.url)
      : item.url;

    if (!streamUrl) return null;

    return {
      name: fullDisplayName,
      title: quality ?? "Unknown",
      url: streamUrl,
      quality: quality ?? "Unknown",
      fileSize,
      source,
      codec,
      bitDepth,
      language: language !== "Default" ? language : null,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      provider: "hexion",
    };
  });
}

function parseStreams(data) {
  return __async(this, null, function* () {
    if (!Array.isArray(data?.streams) || data.streams.length === 0) return [];

    const validItems = data.streams.filter((item) => {
      const cleanedTitle = cleanText(item?.title);
      if (!cleanedTitle.toLowerCase().includes("")) return false;
      if (typeof item?.url !== "string" || !item.url.startsWith("https")) return false;

      const innerMatch = item.url.match(/[?&]url=(https?:\/\/[^&]+)/);
      return !innerMatch || innerMatch[1].startsWith("https");
    });

    const streams = yield Promise.all(validItems.map(buildStream));
    return streams.filter(Boolean);
  });
}

function fetchStreams(url) {
  return __async(this, null, function* () {
    try {
      const response = yield fetch(url);
      if (!response.ok) return [];
      const data = yield response.json();
      return yield parseStreams(data);
    } catch {
      return [];
    }
  });
}

function fetchFirstValid(urls) {
  return __async(this, null, function* () {
    for (const url of urls) {
      const streams = yield fetchStreams(url);
      if (streams.length > 0) return streams;
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

      if (!isSeries) {
        return yield fetchStreams(`${HEXION_API}/stream/movie/${imdbId}.json`);
      }

      return yield fetchFirstValid([
        `${HEXION_API}/stream/series/${imdbId}:${pad2(s)}:${pad2(e)}.json`,
        `${HEXION_API}/stream/series/${imdbId}:${parseInt(s, 10) || 1}:${parseInt(e, 10) || 1}.json`,
      ]);
    } catch {
      return [];
    }
  });
}

module.exports = { getStreams };