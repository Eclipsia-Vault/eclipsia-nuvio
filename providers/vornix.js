const cheerio = require('cheerio-without-node-native');

const PROVIDER_NAME    = 'Vornix.';
const BASE_URL         = 'https://vegamovies.mq';
const TMDB_API_KEY     = '6e6ab700b6477171ee6c23d504b1e9cb';
const DOMAINS_JSON_URL = 'https://git.nixnet.services/eclipsia-404/utils/raw/branch/main/urls.json';
const REQUEST_TIMEOUT  = 12000;

const HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5'
};

const MOBILE_UAS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
];

const EXCLUDED_BUTTONS   = ['filepress', 'gdtot', 'dropgalaxy', 'gdflix', 'gdlink'];
const ALLOWED_QUALITIES  = new Set(['2160p', '1080p']);

let cachedDomains   = null;
let domainCacheTime = 0;
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000;

let baseUrl         = BASE_URL;
let cachedHubDomain = 'https://hubcloud.foo';
let cachedVcDomain  = 'https://vcloud.zip';

function getMobileHeaders() {
  const ua = MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)];
  return {
    'User-Agent':      ua,
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer':         baseUrl + '/',
  };
}

async function fetchSafe(url, options = {}, timeout = REQUEST_TIMEOUT) {
  try {
    const merged = {
      ...options,
      headers: {
        ...HEADERS,
        ...(options.headers || {}),
        'Accept-Encoding': 'identity',
      },
    };
    const fetchPromise   = fetch(url, merged);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeout)
    );
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch {
    return null;
  }
}

async function fetchJson(url, options = {}) {
  try {
    const res = await fetchSafe(url, options);
    if (!res || !res.ok) return null;
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

async function fetchHtml(url, options = {}) {
  try {
    const res = await fetchSafe(url, options);
    if (!res || !res.ok) return null;
    return cheerio.load(await res.text());
  } catch {
    return null;
  }
}

function getOrigin(url) {
  try {
    const parts = url.split('//');
    if (parts.length < 2) return url;
    return parts[0] + '//' + parts[1].split('/')[0];
  } catch {
    return url;
  }
}

function fixUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return baseUrl + url;
  return baseUrl + '/' + url;
}

function parseQuality(str) {
  const s = String(str || '');
  const m = s.match(/(2160|1080|720|480)\s*P/i);
  if (m) return m[1].toLowerCase() + 'p';
  if (/4K|UHD/i.test(s)) return '2160p';
  if (/1440|2K/i.test(s)) return '1440p';
  return 'HD';
}

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&#038;/g, '&')
    .replace(/&#8217;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/&quot;/g, '"');
}

function parseFilenameToLabel(filename) {
  if (!filename) return '';

  let name = filename
    .replace(/â€"/g, '-').replace(/â€"/g, '-')
    .replace(/&#8211;/g, '-').replace(/&#8212;/g, '-')
    .replace(/&amp;/g, '&').replace(/&ndash;/g, '-').replace(/&mdash;/g, '-')
    .replace(/\.(mkv|mp4|avi|webm|m4v|ts|zip|rar)$/i, '');

  name = name
    .replace(/\bH[.\s_]?(264|265)\b/gi, 'H$1')
    .replace(/\bx[.\s_]?(264|265)\b/gi, 'x$1');

  name = name.replace(/\b(DDP|DD\+?|EAC3|AAC|AC3|TrueHD|FLAC|Opus|MP3)[.\s_]?(\d)/gi, '$1.$2');

  name = name.replace(/[_\s]+/g, '.');

  const tokens = name.split('.').filter(t => t.length > 0);

  const NOISE = /^(vegamovies|vega|nl|nf|hdmovies\w*|bolly4u|filmyzilla|filmywap|moviesflix|moviesda|mp4moviez|khatrimaza|9xmovie|jalshamoviez|rdxhd|mkvcage|coolmoviez|7starhd|world4ufree|downloadhub|moviescounter|skymovies|movies4u|extramovies|tamilrockers|isaimini|movierulz|cinemavilla|3movierulz|afilmywap|toxicwap|fullmaza|hindimovies|esub|esubs|subs|sub|yify|yts|rarbg|evo|psa|ettv|etrg)$/i;
  const YEAR      = /^(19|20)\d{2}$/;
  const SEASON_EP = /^(s\d{1,2}(e\d{1,3})?|e\d{1,3}|\d{1,2}x\d{1,2})$/i;
  const QUALITY   = /^(2160p|1080p|720p|480p|360p|4k|2k|uhd)$/i;
  const SOURCE    = /^(bluray|blu-ray|bdrip|brrip|webrip|web-dl|webdl|web|hdtv|dvdrip|dvd|camrip|hdrip|amzn|amazon|netflix|dsnp|disney\+?|hbo|hmax|max|appletv\+?|peacock|hulu|hdcam|pdvd|tcrip|hdts|predvd)$/i;
  const VIDEO_CODEC = /^(hevc|x265|x264|h264|h265|xvid|divx|av1|10bit|8bit|10-bit|8-bit|vp9|vc-1|vc\.1)$/i;
  const EXTRA     = /^(imax|remastered|extended|theatrical|unrated|criterion|proper|repack|retail|remux|open\.?matte|openmatte|directorscut|directors\.cut|hdr10\+|hdr10|hdr|sdr|dv|dolby\.vision)$/i;
  const AUDIO_PREFIX = /^(ddp|dd\+?|aac|ac3|eac3|truehd|flac|opus|mp3)$/i;
  const AUDIO_DTS = /^dts$/i;
  const ATMOS     = /^atmos$/i;
  const LANG      = /^(hindi|english|tamil|telugu|malayalam|kannada|punjabi|bengali|marathi|urdu|gujarati|french|spanish|german|italian|portuguese|japanese|korean|chinese|arabic|russian|dutch|polish|turkish|thai|indonesian|malay|vietnamese|dubbed|dub)$/i;
  const DUALMULTI = /^(dual|multi)$/i;

  const TC = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  const QUALITY_MAP = {
    '4k': '4K', '2160p': '4K', '2k': '2K', 'uhd': 'UHD',
  };

  const SOURCE_MAP = {
    bluray: 'BluRay', 'blu-ray': 'BluRay', bdrip: 'BDRip', brrip: 'BRRip',
    webrip: 'WEBRip', 'web-dl': 'WEB-DL', webdl: 'WEB-DL', web: 'WEB',
    hdtv: 'HDTV', dvdrip: 'DVDRip', dvd: 'DVD', camrip: 'CAMRip',
    hdrip: 'HDRip', amzn: 'Prime Video', amazon: 'Amazon', netflix: 'Netflix',
    dsnp: 'Disney+', hbo: 'HBO', hmax: 'HBO Max', max: 'HBO Max',
    appletv: 'Apple TV+', 'appletv+': 'Apple TV+', peacock: 'Peacock', hulu: 'Hulu',
    hdcam: 'HDCAM', hdts: 'HDTS', pdvd: 'PDVD', tcrip: 'TCRip', predvd: 'PreDVD',
  };

  const CODEC_MAP = {
    hevc: 'HEVC', x265: 'x265', x264: 'x264', h264: 'H.264', h265: 'H.265',
    xvid: 'XviD', divx: 'DivX', av1: 'AV1',
    '10bit': '10-bit', '8bit': '8-bit', '10-bit': '10-bit', '8-bit': '8-bit',
    vp9: 'VP9', 'vc-1': 'VC-1', 'vc.1': 'VC-1',
  };

  const EXTRA_MAP = {
    imax: 'IMAX', remastered: 'Remastered', extended: 'Extended', theatrical: 'Theatrical',
    unrated: 'Unrated', criterion: 'Criterion', proper: 'Proper', repack: 'Repack',
    retail: 'Retail', remux: 'Remux', 'open.matte': 'Open Matte', openmatte: 'Open Matte',
    directorscut: "Director's Cut", 'directors.cut': "Director's Cut",
    'hdr10+': 'HDR10+', hdr10: 'HDR10', hdr: 'HDR', sdr: 'SDR', dv: 'DV',
    'dolby.vision': 'Dolby Vision',
  };

  const AUDIO_PREFIX_MAP = {
    ddp: 'DDP', dd: 'DD', 'dd+': 'DD+', aac: 'AAC', ac3: 'AC3', eac3: 'EAC3',
    truehd: 'TrueHD', flac: 'FLAC', opus: 'Opus', mp3: 'MP3',
  };

  const quality = [], source = [], extra = [], audio = [], codec = [], lang = [];
  const buckets = { quality, source, extra, audio, codec, lang };
  const push = (cat, val) => { if (val && buckets[cat]) buckets[cat].push(val); };

  function classifySingle(tok) {
    const low = tok.toLowerCase();
    if (NOISE.test(tok) || YEAR.test(tok) || SEASON_EP.test(tok)) return null;
    if (QUALITY.test(tok))      return { cat: 'quality', val: QUALITY_MAP[low] || tok };
    if (SOURCE.test(tok))       return { cat: 'source',  val: SOURCE_MAP[low] || TC(tok) };
    if (VIDEO_CODEC.test(tok))  return { cat: 'codec',   val: CODEC_MAP[low] || tok.toUpperCase() };
    if (EXTRA.test(tok))        return { cat: 'extra',   val: EXTRA_MAP[low] || TC(tok) };
    if (ATMOS.test(tok))        return { cat: 'audio',   val: 'Atmos' };
    if (AUDIO_PREFIX.test(tok)) return { cat: 'audio',   val: AUDIO_PREFIX_MAP[low] || TC(tok) };
    if (AUDIO_DTS.test(tok))    return { cat: 'audio',   val: 'DTS' };
    if (LANG.test(tok))         return { cat: 'lang',    val: TC(tok) };
    return null;
  }

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (!tok) { i++; continue; }

    if (NOISE.test(tok) || YEAR.test(tok) || SEASON_EP.test(tok)) { i++; continue; }

    if (/^web$/i.test(tok) && /^dl$/i.test(tokens[i + 1] || '')) {
      source.push('WEB-DL'); i += 2; continue;
    }
    if (/^blu$/i.test(tok) && /^ray$/i.test(tokens[i + 1] || '')) {
      source.push('BluRay'); i += 2; continue;
    }

    if (/^dolby$/i.test(tok)) {
      const next = (tokens[i + 1] || '').toLowerCase();
      if (next === 'vision') { quality.push('Dolby Vision'); i += 2; continue; }
      if (next === 'atmos')  { audio.push('Atmos'); i += 2; continue; }
      if (/^\d$/.test(next)) {
        const sub = (tokens[i + 2] && /^\d$/.test(tokens[i + 2])) ? tokens[i + 2] : null;
        audio.push(sub ? `Dolby ${next}.${sub}` : `Dolby ${next}`);
        i += sub ? 3 : 2; continue;
      }
      i++; continue;
    }

    if (AUDIO_PREFIX.test(tok) && /^\d$/.test(tokens[i + 1] || '')) {
      const ch  = tokens[i + 1];
      const sub = (tokens[i + 2] && /^\d$/.test(tokens[i + 2])) ? tokens[i + 2] : null;
      const prefix = AUDIO_PREFIX_MAP[tok.toLowerCase()] || TC(tok);
      audio.push(sub ? `${prefix} ${ch}.${sub}` : `${prefix} ${ch}`);
      i += sub ? 3 : 2; continue;
    }

    if (AUDIO_DTS.test(tok)) {
      const n1 = (tokens[i + 1] || '').toUpperCase();
      const n2 = (tokens[i + 2] || '').toUpperCase();
      if (n1 === 'HD' && n2 === 'MA') { audio.push('DTS-HD MA'); i += 3; continue; }
      if (n1 === 'HD') { audio.push('DTS-HD'); i += 2; continue; }
      if (n1 === 'MA') { audio.push('DTS-MA'); i += 2; continue; }
      if (n1 === 'X')  { audio.push('DTS:X');  i += 2; continue; }
      audio.push('DTS'); i++; continue;
    }

    if (DUALMULTI.test(tok) && /^(audio|lang|language)$/i.test(tokens[i + 1] || '')) {
      lang.push(TC(tok) + ' Audio'); i += 2; continue;
    }

    const single = classifySingle(tok);
    if (single) { push(single.cat, single.val); i++; continue; }

    if (tok.includes('-')) {
      for (const part of tok.split('-')) {
        if (!part) continue;
        const c = classifySingle(part);
        if (c) push(c.cat, c.val);
      }
      i++; continue;
    }

    i++;
  }

  const ordered = [...source, ...extra, ...audio, ...codec, ...lang];

  const seen = new Set();
  return ordered.filter(p => {
    const k = p.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).join(' | ');
}

function makeStream(name, title, url, quality, proxyHeaders) {
  let label = decodeEntities(name).replace(/[\n\t]+/g, '').trim();
  let desc  = decodeEntities(title || '').replace(/[\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

  let filename = '';
  const bracketMatch = desc.match(/\[\s*([^\]]+\.(?:mkv|mp4|avi|webm|m4v|zip|rar|ts))\s*\]/i);
  if (bracketMatch) {
    filename = bracketMatch[1].trim();
    desc = desc.replace(bracketMatch[0], '').trim();
  }

  if (!filename) {
    const bareMatch = desc.match(/(\S+\.(?:mkv|mp4|avi|webm|m4v|ts))$/i);
    if (bareMatch) {
      filename = bareMatch[1].trim();
      desc = desc.replace(bareMatch[0], '').trim();
    }
  }

  let subtitle = '';

  if (filename) {
    subtitle = parseFilenameToLabel(filename);
  }

  return {
    name:  PROVIDER_NAME,
    title: subtitle,
    quality: quality || 'HD',
    size:  subtitle,
    url:   url || '',
    behaviorHints: {
      notWebReady: true,
      proxyHeaders: {
        request: proxyHeaders || { Referer: baseUrl + '/' },
      },
    },
  };
}

function isAllowedQuality(quality) {
  return ALLOWED_QUALITIES.has(quality);
}

function dedupe(streams) {
  const seen = new Set();
  return (streams || []).filter(s => {
    if (!s || !s.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

async function refreshDomains() {
  const now = Date.now();
  if (cachedDomains && now - domainCacheTime < DOMAIN_CACHE_TTL) return cachedDomains;

  try {
    const data = await fetchJson(DOMAINS_JSON_URL, {}, 8000);
    if (data) {
      cachedDomains   = data;
      domainCacheTime = now;
      if (data.vegamovies) baseUrl         = data.vegamovies;
      if (data.hubcloud)   cachedHubDomain = data.hubcloud;
      if (data.vcloud)     cachedVcDomain  = data.vcloud;
    }
  } catch { }

  return cachedDomains || {};
}

function getLatestHubDomain() { return cachedHubDomain; }
function getLatestVcDomain()  { return cachedVcDomain; }

async function getTMDBInfo(id, type) {
  const idStr  = String(id || '').trim();
  const isImdb = idStr.startsWith('tt');
  const kind   = (type === 'tv' || type === 'series') ? 'tv' : 'movie';

  try {
    if (isImdb) {
      const data = await fetchJson(
        `https://api.themoviedb.org/3/find/${idStr}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
        { headers: { 'Accept-Encoding': 'identity' } }
      );
      const results = data ? (kind === 'tv' ? data.tv_results : data.movie_results) : null;
      if (results && results.length > 0) {
        const r = results[0];
        return {
          title:  kind === 'tv' ? r.name : r.title,
          year:   (r.first_air_date || r.release_date || '').split('-')[0],
          imdbId: idStr,
          tmdbId: r.id,
        };
      }
      return { title: idStr, year: null, imdbId: idStr, tmdbId: null };
    } else {
      const data = await fetchJson(
        `https://api.themoviedb.org/3/${kind}/${idStr}?api_key=${TMDB_API_KEY}&append_to_response=external_ids,alternative_titles`,
        { headers: { 'Accept-Encoding': 'identity' } }
      );
      if (data) {
        let altTitles = [];
        if (data.alternative_titles && data.alternative_titles.titles) {
          altTitles = data.alternative_titles.titles.map(t => String(t.title || ''));
        } else if (data.alternative_titles && data.alternative_titles.results) {
          altTitles = data.alternative_titles.results.map(t => String(t.title || ''));
        }
        return {
          title:     kind === 'tv' ? data.name : data.title,
          year:      (data.first_air_date || data.release_date || '').split('-')[0],
          imdbId:    data.imdb_id || (data.external_ids && data.external_ids.imdb_id) || null,
          tmdbId:    data.id,
          altTitles,
        };
      }
    }
  } catch { }

  return { title: idStr, year: null, imdbId: null, tmdbId: null };
}

async function searchByTitle(title, year) {
  if (!title) return [];

  const q    = encodeURIComponent(title + (year ? ' ' + year : ''));
  const url  = baseUrl + '/search.php?q=' + q + '&page=1&per_page=15';
  const data = await fetchJson(url, {
    headers: { ...getMobileHeaders(), 'Accept-Encoding': 'identity' },
  });

  if (!data || !data.hits || data.hits.length === 0) return [];

  return data.hits.map(hit => {
    const doc = hit.document || {};
    return {
      postId:    String(doc.id || ''),
      title:     (doc.post_title || '').replace(/Download\s*/gi, '').trim(),
      permalink: doc.permalink || '',
      imdbId:    doc.imdb_id || '',
      year:      Array.isArray(doc.category)
        ? doc.category.find(v => /^(19|20)\d{2}$/.test(String(v).trim())) ||
          ((doc.post_title || '').match(/\b(19|20)\d{2}\b/) || [null])[0]
        : ((doc.post_title || '').match(/\b(19|20)\d{2}\b/) || [null])[0],
    };
  });
}

async function fetchPostContent(postId, permalink) {
  if (!postId) return null;

  const apiUrl = baseUrl + '/wp-json/wp/v2/posts/' + postId;

  try {
    const res = await fetchSafe(apiUrl, { headers: getMobileHeaders() }, 15000);
    if (res && res.ok) {
      try {
        const json = JSON.parse(await res.text());
        if (json && json.content && json.content.rendered) {
          const html = json.content.rendered;
          if (!/nexdrive|vcloud|hubcloud|fastdl|genxfm/i.test(html)) {
            throw new Error('stale cache');
          }
          return {
            title: ((json.title && json.title.rendered) || '').replace(/Download\s*/gi, '').trim(),
            html,
          };
        }
      } catch { }
    }
  } catch { }

  try {
    const pageUrl = permalink ? fixUrl(permalink) : baseUrl + '/?p=' + postId;
    const $ = await fetchHtml(pageUrl, { headers: getMobileHeaders() });
    if ($) {
      const html = $('.entry-content').html() || $('.post-content').html();
      if (html) {
        return {
          title: $('title').text().replace(/Download\s*/gi, '').trim(),
          html,
        };
      }
    }
  } catch { }

  return null;
}

function extractNexdriveLinks(html) {
  if (!html) return [];

  const results = [];
  const $       = cheerio.load(html);
  const seen    = new Set();

  $('a[href*="nexdrive"], a[href*="genxfm"], a[href*="fastdl"], a[href*="vcloud"], a[href*="hubcloud"]')
    .each((_, el) => {
      try {
        const href = $(el).attr('href');
        if (!href) return;

        const labelText = ($(el).text() || '').trim();
        if (EXCLUDED_BUTTONS.some(x => labelText.toLowerCase().includes(x))) return;
        if (seen.has(href)) return;
        seen.add(href);

        let quality = 'HD';
        let label   = labelText || 'Download';

        const pos = html.indexOf(href);
        if (pos > 0) {
          const context = html.substring(Math.max(0, pos - 3000), pos);

          const headings = context.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi);
          if (headings && headings.length > 0) {
            const lastHeading = headings[headings.length - 1]
              .replace(/<[^>]*>/g, '')
              .trim()
              .replace(/Download/ig, '');
            if (lastHeading.length > 5) label = lastHeading;
          }

          const qualityRe = /(?:^|>|\s)(\d{3,4}p|4K|UHD|HDR)(?:<|\s|$)/gi;
          let m, lastMatch = null, lastIdx = -1;
          while ((m = qualityRe.exec(context)) !== null) {
            if (m.index > lastIdx) { lastIdx = m.index; lastMatch = m[1]; }
          }
          if (lastMatch) quality = parseQuality(lastMatch);

          if (!quality || quality === 'HD') {
            const tagMatch = context.match(/<(?:h[1-6]|strong|b)[^>]*>[^<]*?(\d{3,4}p|4K|UHD)[^<]*?<\//i);
            if (tagMatch) quality = parseQuality(tagMatch[1]);
          }
        }

        if (!isAllowedQuality(quality)) return;

        results.push({ href: fixUrl(href), quality, label });
      } catch { }
    });

  return results;
}

function capLinksForEfficiency(links, max = 15) {
  if (!links || links.length <= max) return links;
  return links.slice(0, max);
}

function extractSeasonFromContent(html, targetSeason) {
  if (!html || targetSeason == null) return html;

  let content = html.split('id="comments"')[0];
  if (content.length === html.length) {
    content = html.split('class="comments-area"')[0];
  }

  const seasonRe = /(?:Season|Saison|Staffel)\s+0*(\d+)\b(?!\s*(?:-|-|to|and|&|&#))/gi;
  let m;
  const occurrences = [];

  while ((m = seasonRe.exec(content)) !== null) {
    let nearestH   = content.lastIndexOf('<h', m.index);
    let nearestStr = content.lastIndexOf('<strong', m.index);
    let start      = Math.max(nearestH, nearestStr);
    if (start < 0 || m.index - start > 500) start = m.index;

    const ctx = content.substring(start, m.index + 50);
    if (ctx.toLowerCase().includes('download') || ctx.toLowerCase().includes('episode')) continue;

    occurrences.push({ season: parseInt(m[1]), index: start });
  }

  if (occurrences.length === 0) return content;

  const match = occurrences.find(o => o.season === targetSeason);
  if (!match) return content;

  const startIdx = match.index;
  const next     = occurrences.find(o => o.index > startIdx && o.season !== targetSeason);
  const endIdx   = next ? next.index : content.length;

  return content.substring(startIdx, endIdx);
}

async function extractSingleVc(vcUrl, referer, season, episode, streamTitle, quality, extraHint) {
  const streams = [];
  const urlLow  = vcUrl.toLowerCase();

  if (
    urlLow.includes('vcloud') || urlLow.includes('hubcloud') ||
    urlLow.includes('nexdrive') || urlLow.includes('fastdl')
  ) {
    const isHub    = urlLow.includes('hubcloud');
    const domain   = isHub ? getLatestHubDomain() : getLatestVcDomain();
    const origin   = getOrigin(vcUrl);
    let   resolved = vcUrl;

    if (origin !== domain && (vcUrl.includes('vcloud') || vcUrl.includes('hubcloud'))) {
      resolved = vcUrl.replace(origin, domain);
    }

    const $ = await fetchHtml(resolved, {
      headers: { ...getMobileHeaders(), Referer: referer || baseUrl + '/', Cookie: 'xla=s4t' },
      redirect: 'manual',
    });
    if (!$) return streams;

    const pageHtml  = $.html();
    const pageTitle = $('title').text() || '';

    if (season != null || episode != null) {
      const seMatch = pageTitle.match(/[.\s_\-](?:S|Season)\s*0*(\d{1,2})[.\s_\-]*(?:E|Ep|Episode)\s*0*(\d{1,2})[.\s_\-]/i);
      if (seMatch) {
        const pageSeason  = parseInt(seMatch[1]);
        const pageEpisode = parseInt(seMatch[2]);
        if (season  != null && pageSeason  !== season)  return streams;
        if (episode != null && pageEpisode !== episode)  return streams;
      } else {
        const sMatch = pageTitle.match(/[.\s_\-](?:S|Season)\s*0*(\d{1,2})[.\s_\-]/i);
        if (sMatch && season != null && parseInt(sMatch[1]) !== season) return streams;
      }
    }

    let directUrl = '';
    const urlVarMatch = pageHtml.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/);
    if (urlVarMatch) directUrl = urlVarMatch[1];

    const deferred   = [];
    const cardHeader = $('div.card-header').text() || '';
    let resolvedQuality = parseQuality(cardHeader) || quality || 'HD';

    if (directUrl && directUrl.includes('.workers.dev')) {
      const workerUrl = directUrl + '?s=' + (1 + new Date().getMinutes());
      if (isAllowedQuality(resolvedQuality)) {
        deferred.push(() => {
          streams.push(makeStream(
            'Worker | ' + resolvedQuality,
            (streamTitle || 'Worker Server') + ' [' + cardHeader + ']',
            workerUrl,
            resolvedQuality,
            { Referer: resolved }
          ));
        });
      }
      directUrl = '';
    }

    $('a.btn, a').each((_, el) => {
      try {
        let   href    = $(el).attr('href') || '';
        const btnText = ($(el).text() || '').trim();
        const btnLow  = btnText.toLowerCase();

        if (!href || href === '#') return;
        if (href.toLowerCase().includes('.zip')) return;
        if (btnLow.includes('10gbps') || btnLow.includes('gdflix') ||
            btnLow.includes('dropgalaxy') || btnLow.includes('telegram')) return;
        if (!isAllowedQuality(resolvedQuality)) return;

        if (btnLow.includes('fslv2')) {
          deferred.push(() => {
            streams.push(makeStream(
              'FSLv2 (Fast) | ' + resolvedQuality,
              (streamTitle || btnText) + ' [' + cardHeader + ']',
              href,
              resolvedQuality,
              { Referer: resolved }
            ));
          });
        } else if (btnLow.includes('fsl')) {
          const fslUrl = href.includes('?') ? href + '&s=' + (1 + new Date().getMinutes())
                                            : href + '?s=' + (1 + new Date().getMinutes());
          deferred.push(() => {
            streams.push(makeStream(
              'FSL | ' + resolvedQuality,
              (streamTitle || btnText) + ' [' + cardHeader + ']',
              fslUrl,
              resolvedQuality,
              { Referer: resolved }
            ));
          });
        } else if (btnLow.includes('worker')) {
          const workerUrl = href.includes('?') ? href + '&s=' + (1 + new Date().getMinutes())
                                               : href + '?s=' + (1 + new Date().getMinutes());
          deferred.push(() => {
            streams.push(makeStream(
              'Worker | ' + resolvedQuality,
              (streamTitle || btnText) + ' [' + cardHeader + ']',
              workerUrl,
              resolvedQuality,
              { Referer: resolved }
            ));
          });
        }
      } catch { }
    });

    if (deferred.length > 0) {
      deferred.forEach(fn => fn());
      return streams;
    }

    if (!directUrl) {
      const dlHref = $('#download').attr('href') ||
        $('a').filter((_, el) => {
          const h = $(el).attr('href') || '';
          return h.includes('hubcloud.php') || h.includes('token') || h.includes('dl');
        }).first().attr('href');
      if (dlHref) {
        directUrl = dlHref.startsWith('http') ? dlHref
                                               : getOrigin(resolved) + '/' + dlHref.replace(/^\//, '');
      }
    }

    if (!directUrl) {
      const nextHref = $('a[href*="vcloud.zip"]').filter((_, el) => {
        const h = $(el).attr('href') || '';
        return !h.includes('/api/') && h !== resolved;
      }).first().attr('href');
      if (nextHref) return extractSingleVc(nextHref, referer, season, episode, streamTitle, quality, extraHint);
    }

    if (!directUrl) return streams;
    if (!directUrl.includes('://')) directUrl = getOrigin(resolved) + directUrl;

    const $dl = await fetchHtml(directUrl, {
      headers: { ...getMobileHeaders(), Referer: resolved, Cookie: 'xla=s4t' },
    });
    if (!$dl) return streams;

    const dlHtml     = $dl.html();
    const dlHeader   = $dl('div.card-header').text() || '';
    const dlQuality  = parseQuality(dlHeader) || resolvedQuality;
    const dlUrlMatch = dlHtml.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/);

    if (dlUrlMatch) {
      const cdnUrl = dlUrlMatch[1];
      if (cdnUrl.includes('.workers.dev') && isAllowedQuality(dlQuality)) {
        const workerUrl = cdnUrl + '?s=' + (1 + new Date().getMinutes());
        deferred.push(() => {
          streams.push(makeStream(
            'Worker | ' + dlQuality,
            (streamTitle || 'Worker Server') + ' [' + dlHeader + ']',
            workerUrl,
            dlQuality,
            { Referer: directUrl }
          ));
        });
      }
    }

    $dl('a.btn, a').each((_, el) => {
      try {
        let   href    = $dl(el).attr('href') || '';
        const btnText = ($dl(el).text() || '').trim();
        const btnLow  = btnText.toLowerCase();

        if (!href || href === '#') return;
        if (href.toLowerCase().includes('.zip')) return;
        if (btnLow.includes('10gbps') || btnLow.includes('gdflix') ||
            btnLow.includes('dropgalaxy') || btnLow.includes('telegram')) return;

        const effectiveQuality = quality || dlQuality;
        if (!isAllowedQuality(effectiveQuality)) return;

        if (btnLow.includes('fslv2')) {
          deferred.push(() => {
            streams.push(makeStream(
              'FSLv2 (Fast) | ' + effectiveQuality,
              (streamTitle || btnText) + ' [' + cardHeader + ']',
              href,
              effectiveQuality,
              { Referer: directUrl }
            ));
          });
        } else if (btnLow.includes('fsl')) {
          const fslUrl = href + '?s=' + (1 + new Date().getMinutes());
          deferred.push(() => {
            streams.push(makeStream(
              'FSL | ' + effectiveQuality,
              (streamTitle || btnText) + ' [' + cardHeader + ']',
              fslUrl,
              effectiveQuality,
              { Referer: directUrl }
            ));
          });
        }
      } catch { }
    });

    if (deferred.length === 0) {
      const fslHref = $dl('#fsl').attr('href');
      if (fslHref) {
        const effectiveQuality = quality || dlQuality;
        if (isAllowedQuality(effectiveQuality)) {
          const fslUrl = fslHref + '?s=' + (1 + new Date().getMinutes());
          deferred.push(() => {
            streams.push(makeStream(
              'FSL | ' + effectiveQuality,
              (streamTitle || 'FSL Server') + ' [' + cardHeader + ']',
              fslUrl,
              effectiveQuality,
              { Referer: directUrl }
            ));
          });
        }
      }
    }

    deferred.forEach(fn => fn());
  }

  return streams;
}

async function loadStreamsFromUrl(url, streamTitle, quality, referer, season, episode, extraHint) {
  const urlLow = url.toLowerCase();

  if (urlLow.includes('vcloud') || urlLow.includes('hubcloud')) {
    return extractSingleVc(url, referer || url, season, episode, streamTitle, quality, extraHint);
  }

  if (urlLow.includes('nexdrive') || urlLow.includes('genxfm') || urlLow.includes('fastdl')) {
    const $ = await fetchHtml(url, {
      headers: { ...getMobileHeaders(), Referer: referer || baseUrl + '/' },
      redirect: 'manual',
    });
    if (!$) return [];

    const streams = [];
    const tasks   = [];

    $('a[href*="vcloud"], a[href*="hubcloud"]').each((_, el) => {
      let href = $(el).attr('href');
      if (!href) return;
      if (href.startsWith('/')) href = getOrigin(url) + href;

      if (href.includes('/api/index.php?link=')) {
        tasks.push(async () => {
          const $mid = await fetchHtml(href, {
            headers: { ...getMobileHeaders(), Referer: url },
            redirect: 'manual',
          });
          if (!$mid) return [];
          let nextHref = $mid('a.btn-success, a.btn').attr('href');
          if (nextHref) {
            if (nextHref.startsWith('/')) nextHref = getOrigin(href) + nextHref;
            return extractSingleVc(nextHref, href, season, episode, streamTitle, quality, extraHint);
          }
          return [];
        });
        return;
      }

      tasks.push(() => extractSingleVc(href, url, season, episode, streamTitle, quality, extraHint));
    });

    if (episode != null) {
      let found = false;
      const epIdx = episode - 1;
      if (epIdx >= 0 && epIdx < tasks.length) {
        try {
          const result = await tasks[epIdx]();
          if (Array.isArray(result) && result.length > 0) {
            result.forEach(s => { if (s && s.url) streams.push(s); });
            found = true;
          }
        } catch { }
      }

      if (!found) {
        const others = tasks.filter((_, i) => i !== epIdx);
        for (let i = 0; i < others.length; i += 5) {
          const results = await Promise.all(others.slice(i, i + 5).map(fn => fn().catch(() => [])));
          let gotOne = false;
          results.forEach(r => {
            if (Array.isArray(r) && r.length > 0) {
              r.forEach(s => { if (s && s.url) streams.push(s); });
              gotOne = true;
            }
          });
          if (gotOne) break;
        }
      }
    } else {
      for (let i = 0; i < tasks.length; i += 5) {
        const results = await Promise.all(tasks.slice(i, i + 5).map(fn => fn().catch(() => [])));
        results.forEach(r => {
          if (Array.isArray(r)) r.forEach(s => { if (s && s.url) streams.push(s); });
        });
      }
    }

    return streams;
  }

  return [];
}

async function extractFromPost(postData, postTitle, isTv, season, episode, year) {
  try {
    let html   = postData.html;
    let suffix = '';

    if (isTv && season != null) {
      const sliced = extractSeasonFromContent(html, season);
      if (sliced) html = sliced;
      suffix = ' S' + season;
      if (episode) suffix += 'E' + episode;
    }

    const hint   = (suffix.trim() || year || '').trim();
    const links  = extractNexdriveLinks(html);
    const capped = capLinksForEfficiency(links);

    if (capped.length === 0) return [];

    const streams = [];
    const tasks   = capped.map(link => {
      const q     = link.quality || 'HD';
      const label = link.label   || suffix + ' [' + q + ']';
      return () => loadStreamsFromUrl(link.href, label, q, baseUrl + '/', season, episode, hint);
    });

    const results = await Promise.all(tasks.map(fn => fn().catch(() => [])));
    results.forEach(r => {
      if (Array.isArray(r)) r.forEach(s => { if (s && s.url) streams.push(s); });
    });

    return streams;
  } catch {
    return [];
  }
}

function isStrictMatch(title, year, candidateTitle, candidateYear, altTitles = []) {
  if (!candidateTitle) return false;

  const normalize = s =>
    s.toLowerCase()
     .replace(/download\s*/gi, '')
     .replace(/[^a-z0-9\s]/g, ' ')
     .trim()
     .replace(/\s+/g, ' ');

  const norm    = normalize(candidateTitle);
  const targets = [title, ...altTitles].filter(Boolean);

  let titleMatch = false;
  for (const t of targets) {
    const n = normalize(t);
    if (n.length > 0 && (norm.includes(n) || norm.startsWith(n))) {
      titleMatch = true;
      break;
    }
  }

  if (!titleMatch) return false;

  if (year && candidateYear) {
    if (Math.abs(parseInt(year) - parseInt(candidateYear)) > 1) return false;
  }

  return true;
}

async function getStreams(id, type, season, episode) {
  try {
    await refreshDomains();

    const isTv   = type === 'tv' || type === 'series';
    const tmdb   = await getTMDBInfo(id, type);
    let imdbId   = tmdb.imdbId;
    let title    = tmdb.title;
    let year     = tmdb.year;

    if ((!imdbId || !imdbId.startsWith('tt')) && String(id).startsWith('tt')) {
      imdbId = String(id);
    }

    let hits = [];
    if (imdbId && imdbId.startsWith('tt')) {
      hits = await searchByTitle(imdbId, null);
    }

    const hasExactImdb = hits.some(h => h.imdbId === imdbId);
    if (hits.length === 0 || !hasExactImdb) {
      let query = title;
      if (isTv && season != null) query += ' season ' + Number(season);
      else if (year)              query += ' ' + year;

      hits = await searchByTitle(query, year);

      if (hits.length === 0 && isTv && season != null) {
        hits = await searchByTitle(title, year);
      }
    }

    if (hits.length === 0) return [];

    let match      = null;
    const exactImdb = imdbId && imdbId.startsWith('tt') ? imdbId : null;

    for (const hit of hits) {
      if (exactImdb && hit.imdbId === exactImdb) {
        if (!isTv || !season) {
          match = hit;
          break;
        }
        const rangeMatch = /(?:s|season|staffel|saison)\s*0*(\d+)\s*(?:-|-|to|and|&|&#)\s*0*(\d+)\b/i.exec(hit.title);
        let seasonOk = false;
        if (rangeMatch) {
          const lo = parseInt(rangeMatch[1]);
          const hi = parseInt(rangeMatch[2]);
          if (parseInt(season) >= lo && parseInt(season) <= hi) seasonOk = true;
        }
        if (!seasonOk) {
          seasonOk = new RegExp('(?:s|season|staffel|saison)\\s*0*' + Number(season) + '\\b', 'i').test(hit.title);
        }
        if (seasonOk) { match = hit; break; }
      }

      if (!match && isStrictMatch(title, year, hit.title, hit.year, tmdb.altTitles)) {
        match = hit;
      }
    }

    if (!match || !match.postId) return [];

    const postData = await fetchPostContent(match.postId, match.permalink);
    if (!postData) return [];

    const postTitle = postData.title || match.title;
    const streams   = await extractFromPost(
      postData,
      postTitle,
      isTv,
      season  != null ? Number(season)  : null,
      episode != null ? Number(episode) : null,
      year
    );

    const qualityOrder = { '2160p': 1, '1080p': 2 };
    const sourceScore  = name => {
      if (/HubCloud|FSLv2/i.test(name)) return 2;
      if (/Worker/i.test(name))         return 1;
      return 0;
    };

    const sorted = dedupe(streams)
      .filter(s => isAllowedQuality(s.quality))
      .sort((a, b) => {
        const sa = sourceScore(a.name);
        const sb = sourceScore(b.name);
        if (sa !== sb) return sb - sa;
        return (qualityOrder[a.quality] || 99) - (qualityOrder[b.quality] || 99);
      });

    const withSubtitle    = sorted.filter(s => s.title && s.title.trim().length > 0);
    const withoutSubtitle = sorted.filter(s => !s.title || s.title.trim().length === 0);

    return withSubtitle.length > 0 ? withSubtitle : withoutSubtitle;

  } catch {
    return [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
