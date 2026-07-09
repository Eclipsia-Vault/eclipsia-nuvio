const cheerio = require('cheerio-without-node-native');

const PROVIDER_NAME = "Vornix.";
const BASE_URL = "https://vegamovies.mq";
const TMDB_API_KEY = "6e6ab700b6477171ee6c23d504b1e9cb";
const DOMAINS_JSON_URL = "https://codeberg.org/eclipsia-404/eclipsia/raw/branch/main/urls.json";
const REQUEST_TIMEOUT = 12000;
const MAX_1080P_STREAMS = 4;

const ALLOWED_QUALITIES = ['2160p', '4k', '1440p', '1080p'];
const QUALITY_MAP = {
  '4k': '2160p',
  '4kp': '2160p'
};

const QUALITY_WEIGHTS = {
  '2160p': 4,
  '4k': 4,
  '1440p': 3,
  '1080p': 2,
  '720p': 1,
  'HD': 0
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5"
};

const MOBILE_UAS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
];

function getMobileHeaders() {
  const ua = MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)];
  return {
    "User-Agent": ua,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": BASE_URL + "/"
  };
}

const EXCLUDED_BUTTONS = ['filepress', 'gdtot', 'dropgalaxy', 'gdflix', 'gdlink'];

async function fetchSafe(url, options = {}, timeout = REQUEST_TIMEOUT) {
  try {
    const merged = { ...options, headers: { ...HEADERS, ...(options.headers || {}), 'Accept-Encoding': 'identity' } };
    const fetchPromise = fetch(url, merged);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout));
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (e) {
    return null;
  }
}

async function fetchJson(url, options = {}) {
  try {
    const res = await fetchSafe(url, options);
    if (!res || !res.ok) return null;
    const text = await res.text();
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

async function fetchHtml(url, options = {}) {
  try {
    const res = await fetchSafe(url, options);
    if (!res || !res.ok) return null;
    return cheerio.load(await res.text());
  } catch (e) {
    return null;
  }
}

function getOrigin(url) {
  try {
    const parts = url.split('//');
    if (parts.length < 2) return url;
    return parts[0] + '//' + parts[1].split('/')[0];
  } catch (e) { return url; }
}

function fixUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://')) return 'https://' + url.slice(7);
  if (url.startsWith('https://')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return baseUrl + url;
  return baseUrl + '/' + url;
}

function parseQuality(text) {
  const t = String(text || '');
  const q = t.match(/(2160|1080|720|480|1440)\s*P/i);
  if (q) return q[1].toLowerCase() + 'p';
  if (/4K|UHD/i.test(t)) return '2160p';
  if (/1440|2K/i.test(t)) return '1440p';
  return 'HD';
}

function normalizeQuality(quality) {
  if (!quality) return null;
  const q = quality.toLowerCase();
  if (QUALITY_MAP[q]) return QUALITY_MAP[q];
  if (ALLOWED_QUALITIES.includes(q)) return q;
  return null;
}

function decodeEntities(str) {
  if (!str) return '';
  return str.replace(/&#8211;/g, '-')
            .replace(/&#8212;/g, '-')
            .replace(/&#038;/g, '&')
            .replace(/&#8217;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&ndash;/g, '-')
            .replace(/&mdash;/g, '-')
            .replace(/&quot;/g, '"');
}

let tenEightyPCount = 0;

function makeStream(name, title, url, quality, headers, mediaInfo, fallbackQuality = 'HD') {
    if (!url || !url.startsWith('https://')) {
      return null;
    }
    
    const normalizedQuality = normalizeQuality(quality) || normalizeQuality(fallbackQuality);
    if (!normalizedQuality) {
      return null;
    }
    
    if (normalizedQuality === '1080p' && tenEightyPCount >= MAX_1080P_STREAMS) {
      return null;
    }
    
    const cleanTitle = decodeEntities(title || "").replace(/[\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    
    let filename = "";
    const fileMatch = cleanTitle.match(/\[\s*([^\]]+\.(?:mkv|mp4|avi|zip|rar|ts))\s*\]/i);
    if (fileMatch) {
        filename = fileMatch[1].trim();
    }

    let fileSizeOnly = "N/A";
    const sizeMatch = cleanTitle.match(/\[\s*(\d+(?:\.\d+)?\s*[MG]B)\s*\]/i);
    if (sizeMatch) fileSizeOnly = sizeMatch[1].trim();

    let sourceTag = "WEB-DL";
    if (/bluray|blu\-ray|bdrip/i.test(cleanTitle)) sourceTag = "Blu-ray";
    else if (/hdrip|webrip/i.test(cleanTitle)) sourceTag = "WEBRip";

    let imaxTag = "";
    if (/imax/i.test(cleanTitle)) imaxTag = " • IMAX";

    let rangeTag = "";
    if (/dolby\s*vision|dovi/i.test(cleanTitle.toLowerCase())) rangeTag = "Dolby Vision";
    else if (/hdr10/i.test(cleanTitle)) rangeTag = "HDR10";
    else if (/hdr/i.test(cleanTitle)) rangeTag = "HDR";
    else if (/10bit|10\-bit/i.test(cleanTitle)) rangeTag = "10-Bit";
    else if (/sdr/i.test(cleanTitle.toLowerCase())) rangeTag = "SDR";

    let codecTag = "H.264";
    if (/hevc|x265|h265/i.test(cleanTitle)) {
        codecTag = "H.265";
    } else if (/x264|h264/i.test(cleanTitle)) {
        codecTag = "H.264";
    }

    const displayQuality = normalizedQuality;
    const videoRangeBlock = rangeTag ? `${rangeTag} • ${codecTag}` : codecTag;

    let audioChannelTag = "AAC";
    const audioMatch = cleanTitle.match(/(TrueHD\s*7\.1|DDP\s*7\.1|DDP\s*5\.1|DD\s*5\.1|5\.1|AAC)/i);
    if (audioMatch) {
        let matchedTag = audioMatch[1].toUpperCase().replace(/\s+/g, '');
        if (matchedTag === "5.1") matchedTag = "DDP5.1";
        if (matchedTag.includes("TRUEHD")) matchedTag = "TrueHD 7.1";
        audioChannelTag = matchedTag;
    } else if (/dolby\s*digital|dd/i.test(cleanTitle)) {
        audioChannelTag = 'Dolby Digital';
    } else if (/dolby/i.test(cleanTitle)) {
        audioChannelTag = 'Dolby';
    }

    if (/atmos/i.test(cleanTitle)) {
        audioChannelTag = audioChannelTag !== "Auto" ? `${audioChannelTag} • Atmos` : 'Atmos';
    }

    let langFlags = [];
    const lowerTitle = cleanTitle.toLowerCase();
    const isDual = /dual|hindi\-eng|eng\-hin/i.test(cleanTitle || "");
    
    if (isDual) {
        langFlags.push("English • Hindi");
    } else {
        if (/english|eng/i.test(lowerTitle)) langFlags.push("English");
        if (/hindi|hin/i.test(lowerTitle)) langFlags.push("Hindi");
        if (langFlags.length === 0) langFlags.push("English");
    }
    const displayLanguages = langFlags.join(' • ');

    let cleanedMainTitle = "";
    const yearMatch = cleanTitle.match(/\b(19\d{2}|20\d{2})\b/);
    const displayYear = yearMatch ? `(${yearMatch[1]})` : "";
    const searchString = filename || cleanTitle;
    const preciseSAndEMatch = searchString.match(/[sS](\d+)\s*[eE](\d+)/);

    if (preciseSAndEMatch) {
        let rawShowName = searchString.split(/[sS]\d+/i)[0]
                            .replace(/[\.\-_]/g, ' ')
                            .replace(/[\{\[\(].*$/g, '')
                            .trim();
        let sNum = parseInt(preciseSAndEMatch[1], 10);
        let eNum = parseInt(preciseSAndEMatch[2], 10);
        cleanedMainTitle = `${rawShowName} - S${sNum} E${eNum}`;
    } else {
        let movieName = cleanTitle.split(/[\.\-_]\d{3,4}p/i)[0]
                                  .replace(/[\.\-_]/g, ' ')
                                  .replace(/\d{3,4}p.*/i, '')
                                  .replace(/[\{\[\(].*$/g, '')
                                  .trim();
        cleanedMainTitle = movieName + (displayYear ? ` - ${displayYear}` : "");
    }
    
    cleanedMainTitle = cleanedMainTitle.replace(/\s+/g, ' ').replace(/\s+-\s+-\s+/g, ' - ').replace(/-\s*$/, '').trim();

   let hostLabel = "";
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes("/hub2/") || lowerUrl.includes("hubcloud") || lowerUrl.includes("homelander.buzz") || lowerUrl.includes("whistle.lat") || lowerUrl.includes("mandalorian.buzz")) {
        hostLabel = "HubCloud";
    } else if (lowerUrl.includes(".r2.dev") || lowerUrl.includes("vcloud")) {
        hostLabel = "vCloud";
    }
  
    const providerLabel = `${PROVIDER_NAME}`;
    const qualityLabel = displayQuality.toUpperCase();
    const label = `${providerLabel} • ${displayQuality}${imaxTag}${hostLabel ? ' • ' + hostLabel : ''}`;

    const line1 = `${displayLanguages}${fileSizeOnly !== "N/A" ? ` • ${fileSizeOnly}` : ''}`.trim();
    const line2 = `${sourceTag}${audioChannelTag !== "Auto" ? ` • ${audioChannelTag}` : ''} • ${videoRangeBlock}`.trim();

    if (normalizedQuality === '1080p') {
      tenEightyPCount++;
    }

    return {
        name: label,
        title: line1 ? `${line1}\n${line2}` : line2,
        size: line1 ? `${line1}\n${line2}` : line2,
        url: url,
        _resWeight: QUALITY_WEIGHTS[displayQuality] || 0,
        _quality: displayQuality,
        _sizeWeight: sizeMatch ? parseFloat(sizeMatch[1]) * (sizeMatch[1].toUpperCase().includes("GB") ? 1024 : 1) : 0,
        behaviorHints: {
            notWebReady: true,
            proxyHeaders: {
                request: headers || { "Referer": baseUrl + "/" }
            }
        }
    };
}

function resetCounters() {
  tenEightyPCount = 0;
}

function dedupe(streams) {
  const seen = new Set();
  return (streams || []).filter(s => {
    if (!s || !s.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

function isStrictMatch(requestedTitle, requestedYear, scrapedTitle, scrapedYear, altTitles = []) {
  if (!scrapedTitle) return false;
  
  const scrClean = scrapedTitle.toLowerCase().replace(/download\s*/gi, '').replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, ' ');
  
  let validTitles = [requestedTitle, ...altTitles].filter(t => !!t);
  let matched = false;
  
  for (let t of validTitles) {
    const reqClean = t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, ' ');
    if (reqClean.length > 0 && (scrClean.includes(reqClean) || scrClean.startsWith(reqClean))) {
       matched = true;
       break;
    }
  }
  
  if (!matched) return false;
  
  if (requestedYear && scrapedYear) {
    const rY = parseInt(requestedYear);
    const sY = parseInt(scrapedYear);
    if (!isNaN(rY) && !isNaN(sY)) {
      if (Math.abs(rY - sY) > 1) return false;
    }
  }
  return true;
}

let cachedDomains = null;
let domainCacheTime = 0;
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000;
let baseUrl = BASE_URL;
let cachedHubDomain = 'https://hubcloud.foo';
let cachedVcDomain = 'https://vcloud.zip';

async function refreshDomains() {
  const now = Date.now();
  if (cachedDomains && (now - domainCacheTime) < DOMAIN_CACHE_TTL) return cachedDomains;
  try {
    const data = await fetchJson(DOMAINS_JSON_URL, {}, 8000);
    if (data) {
      cachedDomains = data;
      domainCacheTime = now;
      if (data.vegamovies) baseUrl = data.vegamovies;
      if (data.hubcloud) cachedHubDomain = data.hubcloud;
      if (data.vcloud) cachedVcDomain = data.vcloud;
    }
  } catch (e) {
  }
  return cachedDomains || {};
}

function getLatestHubDomain() { return cachedHubDomain; }
function getLatestVcDomain() { return cachedVcDomain; }

async function getTMDBInfo(id, type) {
  const idStr = String(id || '').trim();
  const isImdb = idStr.startsWith('tt');
  const tmdbType = (type === 'tv' || type === 'series') ? 'tv' : 'movie';
  try {
    if (isImdb) {
      const data = await fetchJson('https://api.themoviedb.org/3/find/' + idStr + '?api_key=' + TMDB_API_KEY + '&external_source=imdb_id', { headers: { 'Accept-Encoding': 'identity' } });
      const list = data ? (tmdbType === 'tv' ? data.tv_results : data.movie_results) : null;
      if (list && list.length > 0) {
        const item = list[0];
        return {
          title: tmdbType === 'tv' ? item.name : item.title,
          year: (item.first_air_date || item.release_date || '').split('-')[0],
          imdbId: idStr,
          tmdbId: item.id
        };
      }
      return { title: idStr, year: null, imdbId: idStr, tmdbId: null };
    } else {
      const data = await fetchJson('https://api.themoviedb.org/3/' + tmdbType + '/' + idStr + '?api_key=' + TMDB_API_KEY + '&append_to_response=external_ids,alternative_titles', { headers: { 'Accept-Encoding': 'identity' } });
      if (data) {
        let altTitles = [];
        if (data.alternative_titles && data.alternative_titles.titles) {
          altTitles = data.alternative_titles.titles.map(t => String(t.title || ''));
        } else if (data.alternative_titles && data.alternative_titles.results) {
          altTitles = data.alternative_titles.results.map(t => String(t.title || ''));
        }
        return {
          title: tmdbType === 'tv' ? data.name : data.title,
          year: (data.first_air_date || data.release_date || '').split('-')[0],
          imdbId: data.imdb_id || (data.external_ids && data.external_ids.imdb_id) || null,
          tmdbId: data.id,
          altTitles: altTitles
        };
      }
    }
  } catch (e) {
  }
  return { title: idStr, year: null, imdbId: null, tmdbId: null };
}

async function searchByTitle(query, year) {
  if (!query) return [];
  const searchQuery = encodeURIComponent(query + (year ? ' ' + year : ''));
  const url = baseUrl + '/search.php?q=' + searchQuery + '&page=1&per_page=15';
  
  const data = await fetchJson(url, { headers: { ...getMobileHeaders(), 'Accept-Encoding': 'identity' } });
  if (!data || !data.hits || data.hits.length === 0) {
    return [];
  }
  
  return data.hits.map(h => {
    const doc = h.document || {};
    return {
      postId: String(doc.id || ''),
      title: (doc.post_title || '').replace(/Download\s*/gi, '').trim(),
      permalink: doc.permalink || '',
      imdbId: doc.imdb_id || '',
      year: (doc.category && Array.isArray(doc.category)) ? (doc.category.find(c => /^(19|20)\d{2}$/.test(String(c).trim())) || (((doc.post_title || '').match(/\b(19|20)\d{2}\b/) || [null])[0])) : (((doc.post_title || '').match(/\b(19|20)\d{2}\b/) || [null])[0])
    };
  });
}

async function fetchPostContent(postId, link) {
  if (!postId) return null;
  
  const apiUrl = baseUrl + '/wp-json/wp/v2/posts/' + postId;
  
  try {
    const res = await fetchSafe(apiUrl, { headers: getMobileHeaders() }, 15000);
    
    if (res && res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (json && json.content && json.content.rendered) {
          const rendered = json.content.rendered;
          if (!/nexdrive|vcloud|hubcloud|fastdl|genxfm/i.test(rendered)) {
             throw new Error("WP-JSON payload is a stale cache missing download links");
          }
          return {
            title: (json.title && json.title.rendered || '').replace(/Download\s*/gi, '').trim(),
            html: rendered
          };
        }
      } catch (parseError) {
      }
    }
  } catch (e) {
  }
  
  try {
    const fallbackUrl = link ? fixUrl(link) : (baseUrl + '/?p=' + postId);
    const htmlRes = await fetchHtml(fallbackUrl, { headers: getMobileHeaders() });
    if (htmlRes) {
      const contentHtml = htmlRes('.entry-content').html() || htmlRes('.post-content').html();
      if (contentHtml) {
        return {
          title: htmlRes('title').text().replace(/Download\s*/gi, '').trim(),
          html: contentHtml
        };
      }
    }
  } catch (e) {
  }
  return null;
}

function extractNexdriveLinks(contentHtml) {
  if (!contentHtml) return [];
  
  const links = [];
  const $ = cheerio.load(contentHtml);
  const seenUrls = new Set();
  
  $('a[href*="nexdrive"], a[href*="genxfm"], a[href*="fastdl"], a[href*="vcloud"], a[href*="hubcloud"]').each((i, el) => {
    try {
      const href = $(el).attr('href');
      if (!href) return;
      
      if (!href.startsWith('https://')) return;
      
      const linkText = ($(el).text() || '').trim();
      if (EXCLUDED_BUTTONS.some(ex => linkText.toLowerCase().includes(ex))) return;
      
      if (seenUrls.has(href)) return;
      seenUrls.add(href);
      
      let quality = 'HD';
      let fullLabel = linkText || 'Download';
      const hrefPos = contentHtml.indexOf(href);
      if (hrefPos > 0) {
        const beforeHref = contentHtml.substring(Math.max(0, hrefPos - 3000), hrefPos);
        const hMatch = beforeHref.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi);
        if (hMatch && hMatch.length > 0) {
            const headerContext = hMatch[hMatch.length - 1].replace(/<[^>]*>/g, '').trim().replace(/Download/ig, '');
            if (headerContext.length > 5) fullLabel = headerContext;
        }

        const qualityPattern = /(?:^|>|\s)(\d{3,4}p|4K|UHD|HDR)(?:<|\s|$)/gi;
        let qMatch;
        let lastMatch = null;
        let lastIndex = -1;
        while ((qMatch = qualityPattern.exec(beforeHref)) !== null) {
          if (qMatch.index > lastIndex) {
            lastIndex = qMatch.index;
            lastMatch = qMatch[1];
          }
        }
        if (lastMatch) {
          quality = parseQuality(lastMatch);
        }
        if (!quality || quality === 'HD') {
          const headingQ = beforeHref.match(/<(?:h[1-6]|strong|b)[^>]*>[^<]*?(\d{3,4}p|4K|UHD)[^<]*?<\//i);
          if (headingQ) quality = parseQuality(headingQ[1]);
        }
      }
    
    const normalizedQ = normalizeQuality(quality);
    if (!normalizedQ) return;
    
    links.push({ href: href, quality: normalizedQ, label: fullLabel });
    } catch (e) { }
  });
  
  return links;
}

function capLinksForEfficiency(links, maxTotal = 15) {
  if (!links || links.length <= maxTotal) return links;
  return links.slice(0, maxTotal);
}

function extractSeasonFromContent(contentHtml, targetSeason) {
  if (!contentHtml || targetSeason == null) return contentHtml;
  
  let cleanHtml = contentHtml.split('id="comments"')[0];
  if (cleanHtml.length === contentHtml.length) {
     cleanHtml = contentHtml.split('class="comments-area"')[0];
  }
  
  const seasonRegex = /(?:Season|Saison|Staffel)\s+0*(\d+)\b(?!\s*(?:-|–|to|and|&|&#))/gi;
  let match;
  let seasonBlocks = [];
  
  while ((match = seasonRegex.exec(cleanHtml)) !== null) {
      let tagStartH = cleanHtml.lastIndexOf('<h', match.index);
      let tagStartS = cleanHtml.lastIndexOf('<strong', match.index);
      let tagStart = Math.max(tagStartH, tagStartS);
      
      if (tagStart < 0 || match.index - tagStart > 500) tagStart = match.index;
      
      let localContext = cleanHtml.substring(tagStart, match.index + 50);
      if (localContext.toLowerCase().includes('download') || localContext.toLowerCase().includes('episode')) continue;
      
      seasonBlocks.push({ season: parseInt(match[1]), index: tagStart });
  }
  
  if (seasonBlocks.length === 0) return cleanHtml;
  
  let targetBlocks = seasonBlocks.filter(b => b.season === targetSeason);
  let targetBlock = targetBlocks[0];
  if (!targetBlock) return cleanHtml;
  
  let startPos = targetBlock.index;
  let nextBlock = seasonBlocks.find(b => b.index > startPos && b.season !== targetSeason);
  let cutPos = nextBlock ? nextBlock.index : cleanHtml.length;
  
  return cleanHtml.substring(startPos, cutPos);
}

async function extractSingleVc(vcUrl, referer, targetSeason, targetEpisode, displayLabel, fallbackQuality, mediaInfo) {
  const streams = [];
  const lower = vcUrl.toLowerCase();
  
  if (lower.includes('vcloud') || lower.includes('hubcloud') || lower.includes('nexdrive') || lower.includes('fastdl')) {
    if (!vcUrl.startsWith('https://')) {
      return streams;
    }
    
    const isHub = lower.includes('hubcloud');
    const latestBase = isHub ? getLatestHubDomain() : getLatestVcDomain();
    const curBase = getOrigin(vcUrl);
    
    let newUrl = vcUrl;
    if (curBase !== latestBase && (vcUrl.includes('vcloud') || vcUrl.includes('hubcloud'))) {
      newUrl = vcUrl.replace(curBase, latestBase);
    }
    
    const html = await fetchHtml(newUrl, {
      headers: { ...getMobileHeaders(), 'Referer': referer || baseUrl + '/', 'Cookie': 'xla=s4t' },
      redirect: 'manual'
    });
    if (!html) return streams;
    
    const rawHtml = html.html();
    const pageTitle = html('title').text() || '';
    
    if (targetSeason != null || targetEpisode != null) {
      const seMatch = pageTitle.match(/[.\s_\-](?:S|Season)\s*0*(\d{1,2})[.\s_\-]*(?:E|Ep|Episode)\s*0*(\d{1,2})[.\s_\-]/i);
      if (seMatch) {
        const vcSeason = parseInt(seMatch[1]);
        const vcEpisode = parseInt(seMatch[2]);
        if (targetSeason != null && vcSeason !== targetSeason) {
          return streams;
        }
        if (targetEpisode != null && vcEpisode !== targetEpisode) {
          return streams;
        }
      } else {
        const sMatch = pageTitle.match(/[.\s_\-](?:S|Season)\s*0*(\d{1,2})[.\s_\-]/i);
        if (sMatch && targetSeason != null) {
          const vcSeason = parseInt(sMatch[1]);
          if (vcSeason !== targetSeason) {
            return streams;
          }
        }
      }
    }
    
    let bridgeUrl = '';
    const varMatch = rawHtml.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/);
    const varAtobMatch = rawHtml.match(/var\s+url\s*=\s*atob\(atob\('([^']+)'\)\)/);
    
    if (varAtobMatch) {
      try {
        bridgeUrl = atob(atob(varAtobMatch[1]));
      } catch(e) {
        bridgeUrl = varAtobMatch[1];
      }
    } else if (varMatch) {
      bridgeUrl = varMatch[1];
    }
    
    const serverTasks = [];
    const headerText = html('div.card-header').text() || '';
    let extractedQuality = parseQuality(headerText) || fallbackQuality || 'HD';
    
    if (bridgeUrl && bridgeUrl.includes('.workers.dev')) {
      if (!bridgeUrl.startsWith('https://')) return streams;
      const synced = bridgeUrl + '?s=' + (1 + new Date().getMinutes());
      serverTasks.push(() => {
        streams.push(makeStream('Worker', (displayLabel || 'Worker Server') + ' [' + headerText + ']', synced, extractedQuality, { 'Referer': newUrl }, mediaInfo, fallbackQuality));
      });
      bridgeUrl = '';
    }
    
    html('a.btn, a').each((i, el) => {
      try {
        let href = html(el).attr('href') || '';
        let text = (html(el).text() || '').trim();
        let lowerText = text.toLowerCase();
        
        if (!href || href === '#') return;
        if (!href.startsWith('https://')) return;
        if (href.toLowerCase().includes('.zip')) return;
        
        if (lowerText.includes('10gbps') || lowerText.includes('gdflix') || lowerText.includes('dropgalaxy') || lowerText.includes('telegram')) return;
        
        if (lowerText.includes('fslv2')) {
          serverTasks.push(() => {
            streams.push(makeStream('FSLv2', (displayLabel || text) + ' [' + headerText + ']', href, extractedQuality, { 'Referer': newUrl }, mediaInfo, fallbackQuality));
          });
        }
        else if (lowerText.includes('fsl')) {
          const synced = href.includes('?') ? href + '&s=' + (1 + new Date().getMinutes()) : href + '?s=' + (1 + new Date().getMinutes());
          serverTasks.push(() => {
            streams.push(makeStream('FSL', (displayLabel || text) + ' [' + headerText + ']', synced, extractedQuality, { 'Referer': newUrl }, mediaInfo, fallbackQuality));
          });
        }
        else if (lowerText.includes('worker')) {
          const synced = href.includes('?') ? href + '&s=' + (1 + new Date().getMinutes()) : href + '?s=' + (1 + new Date().getMinutes());
          serverTasks.push(() => {
            streams.push(makeStream('Worker', (displayLabel || text) + ' [' + headerText + ']', synced, extractedQuality, { 'Referer': newUrl }, mediaInfo, fallbackQuality));
          });
        }
      } catch (e) {}
    });

    if (serverTasks.length > 0) {
      serverTasks.forEach(fn => fn());
      return streams;
    }
    
    if (!bridgeUrl) {
      const downloadHref = html('#download').attr('href') || 
        html('a').filter((i, el) => {
          const href = html(el).attr('href') || '';
          return href.includes('hubcloud.php') || href.includes('token') || href.includes('dl');
        }).first().attr('href');
      if (downloadHref) {
        if (!downloadHref.startsWith('http')) return streams;
        bridgeUrl = downloadHref.startsWith('http') ? downloadHref : getOrigin(newUrl) + '/' + downloadHref.replace(/^\//, '');
      }
    }
    
    if (!bridgeUrl) {
      const redirectLink = html('a[href*="vcloud.zip"]').filter((i, el) => {
        const href = html(el).attr('href') || '';
        return !href.includes('/api/') && href !== newUrl && href.startsWith('https://');
      }).first().attr('href');
      if (redirectLink) {
        return await extractSingleVc(redirectLink, referer, targetSeason, targetEpisode, displayLabel, fallbackQuality, mediaInfo);
      }
    }
    
    if (!bridgeUrl) return streams;
    if (!bridgeUrl.startsWith('http')) bridgeUrl = getOrigin(newUrl) + bridgeUrl;
    if (!bridgeUrl.startsWith('https://')) return streams;
    
    const bridgeHtml = await fetchHtml(bridgeUrl, {
      headers: { ...getMobileHeaders(), 'Referer': newUrl, 'Cookie': 'xla=s4t' }
    });
    if (!bridgeHtml) return streams;
    
    const bridgeRaw = bridgeHtml.html();
    const bridgeHeaderText = bridgeHtml('div.card-header').text() || '';
    const bridgeQuality = parseQuality(bridgeHeaderText) || extractedQuality;
    
    const bridgeVarMatch = bridgeRaw.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/);
    if (bridgeVarMatch) {
      const workerUrl = bridgeVarMatch[1];
      if (workerUrl.includes('.workers.dev') && workerUrl.startsWith('https://')) {
        const synced = workerUrl + '?s=' + (1 + new Date().getMinutes());
        serverTasks.push(() => {
          streams.push(makeStream('Worker', (displayLabel || 'Worker Server') + ' [' + bridgeHeaderText + ']', synced, bridgeQuality, { 'Referer': bridgeUrl }, mediaInfo, fallbackQuality));
        });
      }
    }

    bridgeHtml('a.btn, a').each((i, el) => {
      try {
        let href = bridgeHtml(el).attr('href') || '';
        let text = (bridgeHtml(el).text() || '').trim();
        let lowerText = text.toLowerCase();
        
        if (!href || href === '#') return;
        if (!href.startsWith('https://')) return;
        if (href.toLowerCase().includes('.zip')) return;
        
        if (lowerText.includes('10gbps') || lowerText.includes('gdflix') || lowerText.includes('dropgalaxy') || lowerText.includes('telegram')) {
          return; 
        }
        
        if (lowerText.includes('fslv2')) {
          serverTasks.push(() => {
            streams.push(makeStream('FSLv2', (displayLabel || text) + ' [' + headerText + ']', href, extractedQuality, { 'Referer': bridgeUrl }, mediaInfo, fallbackQuality));
          });
        }
        else if (lowerText.includes('fsl')) {
          const synced = href.includes('?') ? href + '&s=' + (1 + new Date().getMinutes()) : href + '?s=' + (1 + new Date().getMinutes());
          serverTasks.push(() => {
            streams.push(makeStream('FSL', (displayLabel || text) + ' [' + headerText + ']', synced, extractedQuality, { 'Referer': bridgeUrl }, mediaInfo, fallbackQuality));
          });
        }
      } catch (e) { }
    });
    
    if (serverTasks.length === 0) {
      const fslHref = bridgeHtml('#fsl').attr('href');
      if (fslHref && fslHref.startsWith('https://')) {
        const synced = fslHref + '?s=' + (1 + new Date().getMinutes());
        serverTasks.push(() => {
          streams.push(makeStream('FSL', (displayLabel || 'FSL Server') + ' [' + headerText + ']', synced, extractedQuality, { 'Referer': bridgeUrl }, mediaInfo, fallbackQuality));
        });
      }
    }
    
    serverTasks.forEach(fn => fn());
  }
  
  return streams;
}

async function loadStreamsFromUrl(url, label, quality, referer, targetSeason, targetEpisode, mediaInfo) {
  if (!url || !url.startsWith('https://')) return [];
  
  const lower = url.toLowerCase();
  
  if (lower.includes('vcloud') || lower.includes('hubcloud')) {
    return await extractSingleVc(url, referer || url, targetSeason, targetEpisode, label, quality, mediaInfo);
  }
  
  if (lower.includes('nexdrive') || lower.includes('genxfm') || lower.includes('fastdl')) {
    const $ = await fetchHtml(url, { headers: { ...getMobileHeaders(), 'Referer': referer || baseUrl + '/' }, redirect: 'manual' });
    if (!$) return [];
    
    const streams = [];
    const tasks = [];
    $('a[href*="vcloud"], a[href*="hubcloud"]').each((i, el) => {
      let vhref = $(el).attr('href');
      if (vhref && vhref.startsWith('https://')) {
        if (vhref.startsWith('/')) {
            vhref = getOrigin(url) + vhref;
        }
        
        if (vhref.includes('/api/index.php?link=')) {
          tasks.push(async () => {
              const $api = await fetchHtml(vhref, { headers: { ...getMobileHeaders(), 'Referer': url }, redirect: 'manual' });
             if (!$api) return [];
             
             let resolvedVhref = $api('a.btn-success, a.btn').attr('href');
             if (resolvedVhref && resolvedVhref.startsWith('https://')) {
                if (resolvedVhref.startsWith('/')) resolvedVhref = getOrigin(vhref) + resolvedVhref;
                return await extractSingleVc(resolvedVhref, vhref, targetSeason, targetEpisode, label, quality, mediaInfo);
             }
             return [];
          });
          return;
        }
        
        tasks.push(async () => {
          return await extractSingleVc(vhref, url, targetSeason, targetEpisode, label, quality, mediaInfo);
        });
      }
    });
    
    if (targetEpisode != null) {
      let found = false;
      const pIdx = targetEpisode - 1;
      
      if (pIdx >= 0 && pIdx < tasks.length) {
         try {
           const r = await tasks[pIdx]();
           if (Array.isArray(r) && r.length > 0) {
              r.forEach(s => { if (s && s.url) streams.push(s); });
              found = true;
           }
         } catch(e) {}
      }
      
      if (!found) {
        const remainingTasks = tasks.filter((_, i) => i !== pIdx);
        for (let i = 0; i < remainingTasks.length; i += 5) {
          const chunk = remainingTasks.slice(i, i + 5);
          const results = await Promise.all(chunk.map(fn => (async () => { try { return await fn(); } catch (e) { return []; } })()));
          let chunkFound = false;
          results.forEach(r => { 
            if (Array.isArray(r) && r.length > 0) {
              r.forEach(s => { if (s && s.url) streams.push(s); });
              chunkFound = true;
            }
          });
          if (chunkFound) break;
        }
      }
    } else {
      for (let i = 0; i < tasks.length; i += 5) {
         const chunk = tasks.slice(i, i + 5);
         const results = await Promise.all(chunk.map(fn => (async () => { try { return await fn(); } catch (e) { return []; } })()));
         results.forEach(r => { if (Array.isArray(r)) r.forEach(s => { if (s && s.url) streams.push(s); }); });
      }
    }
    
    return streams;
  }
  return [];
}

async function extractFromPost(post, label, isTv, targetSeason, targetEpisode, mediaYear) {
  try {
    let contentHtml = post.html;
    let seasonLabel = '';
    
    if (isTv && targetSeason != null) {
      const filtered = extractSeasonFromContent(contentHtml, targetSeason);
      if (filtered) {
        contentHtml = filtered;
      }
      seasonLabel = ' S' + targetSeason;
      if (targetEpisode) seasonLabel += 'E' + targetEpisode;
    }
    
    const mediaInfo = (seasonLabel.trim() || mediaYear || '').trim();
    
    const links = extractNexdriveLinks(contentHtml);
    const efficientLinks = capLinksForEfficiency(links);
    
    if (efficientLinks.length === 0) return [];
    
    const streams = [];
    const tasks = [];
    
    for (const link of efficientLinks) {
      const quality = link.quality || 'HD';
      const displayLabel = link.label || (seasonLabel + ' [' + quality + ']');
      tasks.push(() => loadStreamsFromUrl(link.href, displayLabel, quality, baseUrl + '/', targetSeason, targetEpisode, mediaInfo));
    }
    
    const results = await Promise.all(tasks.map(fn => (async () => { try { return await fn(); } catch (e) { return []; } })()));
    results.forEach(r => { if (Array.isArray(r)) r.forEach(s => { if (s && s.url) streams.push(s); }); });
    
    return streams;
    
  } catch (e) {
    return [];
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    resetCounters();
    await refreshDomains();
    
    const isTv = (mediaType === 'tv' || mediaType === 'series');
    const media = await getTMDBInfo(tmdbId, mediaType);
    let imdbId = media.imdbId;
    let mediaTitle = media.title;
    let mediaYear = media.year;
    
    if ((!imdbId || !imdbId.startsWith('tt')) && String(tmdbId).startsWith('tt')) {
      imdbId = String(tmdbId);
    }
    
    let searchResults = [];
    
    if (imdbId && imdbId.startsWith('tt')) {
      searchResults = await searchByTitle(imdbId, null);
    }
    
    const hasExactImdbMatch = searchResults.some(r => r.imdbId === imdbId);
    if (searchResults.length === 0 || !hasExactImdbMatch) {
      let query = mediaTitle;
      if (isTv && season != null) query += ' season ' + Number(season);
      else if (mediaYear) query += ' ' + mediaYear;
      
      searchResults = await searchByTitle(query, mediaYear);
      
      if (searchResults.length === 0 && isTv && season != null) {
        searchResults = await searchByTitle(mediaTitle, mediaYear);
      }
    }
    
    if (searchResults.length === 0) return [];
    
    let bestMatch = null;
    const targetImdb = (imdbId && imdbId.startsWith('tt')) ? imdbId : null;
    
    for (const r of searchResults) {
      if (targetImdb && r.imdbId === targetImdb) {
        if (!isTv || !season) {
          bestMatch = r;
          break;
        }
        
        const sMatchRange = /(?:s|season|staffel|saison)\s*0*(\d+)\s*(?:-|–|to|and|&|&#)\s*0*(\d+)\b/i.exec(r.title);
        let sMatch = false;
        
        if (sMatchRange) {
           const startSeason = parseInt(sMatchRange[1]);
           const endSeason = parseInt(sMatchRange[2]);
           const targetS = parseInt(season);
           if (targetS >= startSeason && targetS <= endSeason) {
               sMatch = true;
           }
        }
        
        if (!sMatch) {
            sMatch = new RegExp('(?:s|season|staffel|saison)\\s*0*' + Number(season) + '\\b', 'i').test(r.title);
        }
        
        if (sMatch) {
          bestMatch = r;
          break;
        }
      }
      if (!bestMatch) {
        if (isStrictMatch(mediaTitle, mediaYear, r.title, r.year, media.altTitles)) {
          bestMatch = r;
        }
      }
    }
    
    if (!bestMatch || !bestMatch.postId) {
      return [];
    }
    
    const postData = await fetchPostContent(bestMatch.postId, bestMatch.permalink);
    if (!postData) return [];
    
    const exactScrapedTitle = postData.title || bestMatch.title;
    
    const streams = await extractFromPost(postData, exactScrapedTitle, isTv, season != null ? Number(season) : null, episode != null ? Number(episode) : null, mediaYear);
    
    const sortedStreams = dedupe(streams).sort((a, b) => {
      if (b._resWeight !== a._resWeight) {
        return b._resWeight - a._resWeight;
      }
      return b._sizeWeight - a._sizeWeight;
    });

    return sortedStreams;

    
  } catch (e) {
    resetCounters();
    return [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}