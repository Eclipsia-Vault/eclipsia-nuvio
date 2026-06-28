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

const TMDB_API_KEY = "6e6ab700b6477171ee6c23d504b1e9cb";
const API = "https://tv.imgcdn.kim/newtv";
const DEFAULT_REFERER = "https://net11.cc/";
const DEFAULT_QUALITY = "1080p";
const MAX_EPISODE_PAGES = 20;

const SERVICES = [
  { code: "nf", name: "Netflix" },
  { code: "pv", name: "Prime Video" },
  { code: "hs", name: "Disney+ Hotstar" }
];

const USER_AGENTS = [
  "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 15; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 15; Pixel 8a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; Pixel 6 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 15; Pixel 9a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36"
];

const pad2 = (n) => String(Number.parseInt(n ?? 0, 10) || 0).padStart(2, "0");

const cleanText = (str) =>
  String(str ?? "")
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, "")
    .trim();

const extractQuality = (titleText) => {
  const match = String(titleText ?? "").match(/(\d{3,4}p)/i);
  return match?.[0] ?? DEFAULT_QUALITY;
};

const getRandomUserAgent = () =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const isHttpsUrl = (url) =>
  typeof url === "string" && url.startsWith("https://");

function makeHeaders(code) {
  return {
    ott: code,
    "user-agent": getRandomUserAgent(),
    "x-requested-with": "XMLHttpRequest",
    accept: "application/json, text/plain, */*",
    referer: DEFAULT_REFERER
  };
}

function getMediaTitle(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const type = mediaType === "tv" ? "tv" : "movie";
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    try {
      const response = yield fetch(url);
      if (!response.ok) return null;
      const data = yield response.json();
      return (mediaType === "tv" ? data?.name : data?.title) ?? null;
    } catch {
      return null;
    }
  });
}

function getJson(url, options) {
  return __async(this, null, function* () {
    const response = yield fetch(url, options);
    if (!response.ok) return null;
    return yield response.json();
  });
}

function getPlayer(id, svc, h) {
  return __async(this, null, function* () {
    const data = yield getJson(`${API}/player.php?id=${id}`, { headers: h });
    if (!isHttpsUrl(data?.video_link)) return [];

    const ref = isHttpsUrl(data?.referer) ? data.referer : DEFAULT_REFERER;
    const quality = extractQuality(cleanText(data?.title)) ?? DEFAULT_QUALITY;

    return [
      {
      name: svc.name,
      title: DEFAULT_QUALITY,
      url: data.video_link,
      quality: DEFAULT_QUALITY,
      type: data.video_link.includes(".m3u8") ? "m3u8" : "video",
      headers: {
        Referer: ref,
        Origin: ref,
        "User-Agent": h["user-agent"]
        },
        provider: "soryn"
      }
    ];
  });
}

function findEpisode(seasonId, epNum, svc, h, page) {
  return __async(this, null, function* () {
    if ((page ?? 1) > MAX_EPISODE_PAGES) return [];

    const data = yield getJson(`${API}/episodes.php?id=${seasonId}&page=${page ?? 1}`, { headers: h });
    const eps = (data?.episodes ?? []).filter(Boolean);

    for (const ep of eps) {
      if (Number.parseInt(ep?.ep, 10) === epNum && ep?.id) {
        return yield getPlayer(ep.id, svc, h);
      }
    }

    if (Number.parseInt(data?.nextPageShow, 10) === 1) {
      return yield findEpisode(seasonId, epNum, svc, h, (page ?? 1) + 1);
    }

    return [];
  });
}

function getServiceStreams(svc, title, mediaType, season, episode) {
  return __async(this, null, function* () {
    const h = makeHeaders(svc.code);
    const json = yield getJson(`${API}/search.php?s=${encodeURIComponent(title)}`, { headers: h });
    const results = json?.searchResult ?? [];
    const tl = title.trim().toLowerCase();

    let match = results.find((r) => r?.t?.trim().toLowerCase() === tl) ?? null;
    if (!match && results.length === 1) match = results[0];
    if (!match) return [];

    if (mediaType !== "tv") {
      return yield getPlayer(match.id, svc, h);
    }

    const post = yield getJson(`${API}/post.php?id=${match.id}`, { headers: h });
    const seasons = post?.season ?? [];
    const s = Number.parseInt(season, 10);

    let seasonId = null;
    for (const item of seasons) {
      const m = item?.s?.match(/Season\s*(\d+)/i);
      if (m && Number.parseInt(m[1], 10) === s) {
        seasonId = item.id;
        break;
      }
    }

    if (!seasonId) return [];
    return yield findEpisode(seasonId, Number.parseInt(episode, 10), svc, h, 1);
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    const isSeries = mediaType === "tv" || season != null || episode != null;
    const s = season ?? 1;
    const e = episode ?? 1;

    try {
      const title = yield getMediaTitle(tmdbId, isSeries ? "tv" : "movie");
      if (!title) return [];

      const results = yield Promise.all(
        SERVICES.map((svc) =>
          getServiceStreams(svc, title, isSeries ? "tv" : "movie", s, e).catch(() => [])
        )
      );

      return results.flat();
    } catch {
      return [];
    }
  });
}

module.exports = { getStreams };
