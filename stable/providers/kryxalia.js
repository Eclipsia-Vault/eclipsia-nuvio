"use strict";

const PROVIDER_NAME = "Kryxalia.";
const BASE_URL = "https://anineko.to";
const TMDB_KEY = "6e6ab700b6477171ee6c23d504b1e9cb";

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": `${BASE_URL}/`
};

function fetchText(url, options) {
  return fetch(url, Object.assign({ headers: DEFAULT_HEADERS }, options ?? {}))
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    });
}

function getTMDBTitle(tmdbId, mediaType) {
  const type = mediaType === "movie" ? "movie" : "tv";
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_KEY}`;

  return fetch(url)
    .then(r => r.json())
    .then(data => ({
      title: data.name ?? data.title ?? "",
      originalTitle: data.original_name ?? data.original_title ?? "",
      year: (data.first_air_date ?? data.release_date ?? "").split("-")[0]
    }))
    .catch(() => ({ title: "", originalTitle: "", year: "" }));
}

function searchAniNeko(keyword) {
  const url = `${BASE_URL}/browser?keyword=${encodeURIComponent(keyword)}`;
  
  return fetchText(url).then(html => {
    const results = [];
    const regex = /<article class="nv-anime-card nv-browse-card">[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]+alt="([^"]+)"/g;
    
    let match;
    while ((match = regex.exec(html)) !== null) {
      results.push({
        title: match[3].trim(),
        image: match[2].trim(),
        href: `${BASE_URL}${match[1].trim()}`
      });
    }
    return results;
  });
}

function normalizeTitle(str) {
  return String(str ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleScore(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 80;
  
  const wa = na.split(" ");
  const wb = nb.split(" ");
  const matched = wa.filter(w => w.length > 2 && wb.includes(w)).length;
  return Math.round((matched / Math.max(wa.length, wb.length)) * 60);
}

function findBestMatch(results, title, originalTitle) {
  let best = null;
  let bestScore = 0;
  
  results.forEach(r => {
    const s = Math.max(titleScore(r.title, title), titleScore(r.title, originalTitle));
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  });
  
  return bestScore >= 40 ? best : null;
}

function extractEpisodes(showUrl) {
  return fetchText(showUrl).then(html => {
    const episodes = [];
    const regex = /<article class="nv-info-episode-item">[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<strong>Episode (\d+)<\/strong>/g;
    
    let match;
    while ((match = regex.exec(html)) !== null) {
      episodes.push({
        href: `${BASE_URL}${match[1].trim()}`,
        number: parseInt(match[2], 10)
      });
    }
    return episodes;
  });
}

function extractVibeplayer(videoUrl) {
  const idMatch = videoUrl.match(/vibeplayer\.site\/([a-z0-9]+)/);
  if (!idMatch) return Promise.resolve(null);
  return Promise.resolve(`https://vibeplayer.site/public/stream/${idMatch[1]}/master.m3u8`);
}

async function extractStreamsFromEpisode(episodeUrl) {
  const html = await fetchText(episodeUrl);
  
  const serverTasks = [];
  let subtitleUrl = "";

  const regex = /<button[^>]+data-video="([^"]+)"[^>]*>\s*([^<\s]+)\s*<span>([^<]+)<\/span>/g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const [videoUrl, serverNameRaw, labelRaw] = match.slice(1).map(s => s.trim());
    const serverName = serverNameRaw.replace(/[\[\]]/g, "");
    const label = labelRaw === "Sort Sub" ? "Soft Sub" : labelRaw;

    if (!serverName.startsWith("HD-")) continue;

    if (!subtitleUrl) {
      const subMatch = videoUrl.match(/(?:sub|caption_1|c1_file)=([^&"]+)/);
      if (subMatch) subtitleUrl = decodeURIComponent(subMatch[1]);
    }

    const priority = serverName === "HD-1" ? 1 : serverName === "HD-2" ? 2 : 99;

    const extractor = (serverName === "HD-1" || serverName === "HD-2") 
      ? extractVibeplayer(videoUrl) 
      : null;
    
    if (!extractor) continue;

    serverTasks.push(
      extractor.then(streamUrl => streamUrl 
        ? { serverName, label, priority, streamUrl }
        : null
      ).catch(() => null)
    );
  }

  const results = await Promise.all(serverTasks);
  const valid = results.filter(Boolean);
  valid.sort((a, b) => a.priority - b.priority);

  const streams = valid.map(s => ({
    serverName: s.serverName,
    label: s.label,
    streamUrl: s.streamUrl
  }));

  return { streams, subtitleUrl };
}

async function getStreams(tmdbId, mediaType, season, episode) {
  const ep = episode ?? 1;
  
  const info = await getTMDBTitle(tmdbId, mediaType);
  if (!info.title) throw new Error("Could not resolve title from TMDB");

  let results = await searchAniNeko(info.title);
  
  if (results.length === 0 && info.originalTitle && info.originalTitle !== info.title) {
    results = await searchAniNeko(info.originalTitle);
  }

  if (results.length === 0) {
    throw new Error(`No search results found for: ${info.title}`);
  }

  const match = findBestMatch(results, info.title, info.originalTitle) ?? results[0];

  const showPath = match.href.replace(BASE_URL, '').replace(/^\//, '');
  const episodes = await extractEpisodes(`${BASE_URL}/${showPath}`);
  const targetEp = episodes.find(e => e.number === ep);

  if (!targetEp) {
    throw new Error(`Episode ${ep} not found (show has ${episodes.length} episodes)`);
  }

  const result = await extractStreamsFromEpisode(targetEp.href);

  const showName = PROVIDER_NAME;

  return result.streams.map(s => {
    const formattedLabel = s.label === "Soft Sub" ? "SUB" : s.label;
    
    return {
      name: `${showName} • ${formattedLabel} • HD`,
      title: `${showName} • ${formattedLabel} • HD`,
      url: s.streamUrl,
      headers: {
        "User-Agent": DEFAULT_HEADERS["User-Agent"],
        "Referer": `${BASE_URL}/`
      },
      subtitles: result.subtitleUrl ? [{ url: result.subtitleUrl, lang: "English" }] : []
    };
  });
}

module.exports = { getStreams };
