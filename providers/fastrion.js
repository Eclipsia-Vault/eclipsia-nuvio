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

const FASTRION_API = "https://addon.notorrent2.workers.dev";
const FASTRION_BACKUP_API = "https://addon-osvh.onrender.com";
const TMDB_API_KEY = "6e6ab700b6477171ee6c23d504b1e9cb";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
};

const pad2 = (n) => String(Number.parseInt(n ?? 0, 10) || 0).padStart(2, "0");

const cleanText = (str) =>
  String(str ?? "")
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .trim();

const extractQuality = (titleText) => {
  const match = String(titleText ?? "").match(/(\d{3,4}p)/i);
  return match?.[0] ?? "Unknown";
};

// Check if title has allowed resolution/quality markers: 1080p, 2160p (4K), or Multi
const hasAllowedQuality = (titleText) => {
  const str = String(titleText ?? "").toLowerCase();
  // Allow: 1080p, 2160p, 4k, multi
  return /\b(1080p|2160p|4[kK]|multi)\b/.test(str);
};

// Allowed languages besides Original and Multi
const ALLOWED_LANGUAGES = ["Latino", "Português", "Castellano", "Türkçe"];

const normalizeLanguageName = (raw) => {
  const lowerRaw = raw.toLowerCase().trim();
  
  const languageMap = {
    'latino': 'Latino',
    'português': 'Português',
    'portugues': 'Português',
    'español': 'Castellano',
    'spanish': 'Castellano',
    'castellano': 'Castellano',
    'türkçe': 'Türkçe',
    'turkish': 'Türkçe'
  };
  
  return languageMap[lowerRaw];
};

const extractLanguage = (cleanedTitle) => {
  const langMatch = String(cleanedTitle ?? "").match(/\(([^)]+)\)/);
  
  // Check for explicit audio language patterns like "Áudio Português", "Audio Español", etc.
  const audioLangMatch = String(cleanedTitle ?? "").match(/\b[Aa]udio\s+([^\s\(\)]+)/i);
  if (audioLangMatch && audioLangMatch[1]) {
    const normalized = normalizeLanguageName(audioLangMatch[1]);
    if (normalized && ALLOWED_LANGUAGES.includes(normalized)) {
      return normalized;
    }
  }
  
  if (!langMatch) return "Default";
  const raw = langMatch[1].trim();
  const lowerRaw = raw.toLowerCase();

  if (lowerRaw.includes("multi")) return "Multi";
  if (lowerRaw === "original audio" || lowerRaw === "original") return "Original";

  const emojiLang = cleanedTitle.match(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/);
  if (emojiLang) {
    const codeMap = {
      'MX': 'Latino',
      'ES': 'Castellano',
      'PT': 'Português',
      'TR': 'Türkçe'
    };
    const mapped = codeMap[emojiLang[0]];
    if (mapped && ALLOWED_LANGUAGES.includes(mapped)) {
      return mapped;
    }
  }

  const normalized = normalizeLanguageName(raw);
  if (normalized && ALLOWED_LANGUAGES.includes(normalized)) {
    return normalized;
  }

  return "Default";
};

const isProxyUrl = (url) =>
  String(url ?? "").includes("workers.dev") ||
  /[?&](?:url|u)=/.test(String(url ?? "")) ||
  /\/redirect\?p=/.test(String(url ?? ""));

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
    const innerParamMatch = String(url).match(/[?&](?:u|url)=(https?:\/\/[^&]+)/i);
    if (innerParamMatch) {
      return decodeURIComponent(innerParamMatch[1]);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = yield fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: { ...HEADERS, "Referer": url.split("?")[0] },
      });

      clearTimeout(timeoutId);

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
      return url;
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
    const language = extractLanguage(cleanedTitle);
    const isMulti = language === "Multi";
    const quality = isMulti ? "1080p/4K" : extractQuality(cleanedTitle);

    const headers = {
      ...(item.behaviorHints?.proxyHeaders?.request ?? {}),
      ...(item.behaviorHints?.headers ?? {}),
    };

    const streamUrl = isProxyUrl(item.url)
      ? yield resolveProxyUrl(item.url)
      : item.url;

    if (!streamUrl) return null;

    const nameParts = ["Fastrion."];
    if (language !== "Default") nameParts.push(language);

    return {
      name: nameParts.join(" • "),
      title: quality,
      url: streamUrl,
      quality,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      provider: "Fastrion.",
      _isOriginal: language === "Original",
      _isMulti: language === "Multi",
      _language: language
    };
  });
}

function parseStreams(data) {
  return __async(this, null, function* () {
    if (!Array.isArray(data?.streams) || data.streams.length === 0) return [];

    const validItems = data.streams.filter((item) => {
      const cleanedTitle = cleanText(item?.title);
      const extractedLang = extractLanguage(cleanedTitle);
      
      // Only allow Original, Multi, or one of the 4 specified languages
      if (extractedLang === "Default") return false;
      
      // Must have allowed quality marker: 1080p, 2160p, 4K, or Multi
      if (!hasAllowedQuality(cleanedTitle)) return false;
      
      if (typeof item?.url !== "string" || !item.url.startsWith("https")) return false;

      const innerParamMatch = item.url.match(/[?&](?:u|url)=(https?:\/\/[^&]+)/i);
      return !innerParamMatch || innerParamMatch[1].startsWith("https");
    });

    // Sort: Original first (highest priority), then Multi, then other languages
    validItems.sort((a, b) => {
      const aLang = extractLanguage(cleanText(a.title));
      const bLang = extractLanguage(cleanText(b.title));
      
      const aIsTop = aLang === "Original" || aLang === "Multi";
      const bIsTop = bLang === "Original" || bLang === "Multi";
      
      // Both are top tier
      if (aIsTop && bIsTop) {
        // Within top tier: Original gets highest priority
        if (aLang === "Original" && bLang !== "Original") return -1;
        if (bLang === "Original" && aLang !== "Original") return 1;
        return 0;
      }
      
      // A is top, B is not
      if (aIsTop && !bIsTop) return -1;
      
      // B is top, A is not
      if (!aIsTop && bIsTop) return 1;
      
      // Both are non-top-tier languages, maintain order
      return 0;
    });

    const streams = yield Promise.all(validItems.map(buildStream));
    const filteredStreams = streams.filter(Boolean);
    
    // Group by language for per-language limiting
    const groups = {};
    for (const stream of filteredStreams) {
      const key = stream._language;
      if (!groups[key]) groups[key] = [];
      groups[key].push(stream);
    }
    
    // Build result with max 2 streams per language group
    // Order: Original (max 2) → Multi (max 2) → Other languages (max 2 each)
    const result = [];
    
    const orderedLanguages = ["Original", "Multi", ...ALLOWED_LANGUAGES];
    
    for (const lang of orderedLanguages) {
      if (groups[lang]) {
        // Limit each language to max 2 streams
        const limited = groups[lang].slice(0, 2);
        result.push(...limited);
      }
    }
    
    return result;
  });
}

function fetchStreams(url) {
  return __async(this, null, function* () {
    try {
      const response = yield fetch(url);
      if (!response.ok) return [];
      const data = yield response.json();

      const streams = yield parseStreams(data);

      if (
        streams.length === 0 &&
        Array.isArray(data?.streams) &&
        data.streams.some((s) => s?.externalUrl)
      ) {
        const freeTrialUrl = url.replace(FASTRION_API, FASTRION_BACKUP_API);
        if (freeTrialUrl !== url) {
          const trialResponse = yield fetch(freeTrialUrl);
          if (trialResponse.ok) {
            const trialData = yield trialResponse.json();
            return yield parseStreams(trialData);
          }
        }
      }

      return streams;
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
        return yield fetchStreams(`${FASTRION_API}/stream/movie/${imdbId}.json`);
      }

      return yield fetchFirstValid([
        `${FASTRION_API}/stream/series/${imdbId}:${pad2(s)}:${pad2(e)}.json`,
        `${FASTRION_API}/stream/series/${imdbId}:${parseInt(s, 10) || 1}:${parseInt(e, 10) || 1}.json`,
      ]);
    } catch {
      return [];
    }
  });
}

module.exports = { getStreams };
