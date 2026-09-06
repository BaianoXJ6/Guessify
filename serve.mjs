import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const ROOT = process.cwd();

const SERVER_CONFIG_PATH =
  join(ROOT, 'server.config.json');

const LASTFM_ROOT =
  'https://ws.audioscrobbler.com/2.0/';


const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};


/* =========================================================
   CONFIG
========================================================= */

let serverConfig = {};

try {
  serverConfig =
    JSON.parse(
      await readFile(
        SERVER_CONFIG_PATH,
        'utf8'
      )
    );
} catch {}


const PORT =
  Number(
    process.env.PORT ||
    serverConfig.port ||
    5173
  );


const HOST =
  String(
    process.env.HOST ||
    '0.0.0.0'
  );


const LASTFM_API_KEY =
  String(
    process.env.LASTFM_API_KEY ||
    serverConfig.lastfmApiKey ||
    ''
  ).trim();


const SUPABASE_URL =
  String(
    process.env.SUPABASE_URL ||
    serverConfig.supabaseUrl ||
    ''
  )
    .trim()
    .replace(
      /\/+$/,
      ''
    );


const SUPABASE_SECRET_KEY =
  String(
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    serverConfig.supabaseSecretKey ||
    ''
  ).trim();


const CAPSULE_CACHE_SECONDS =
  Number(
    serverConfig.capsuleCacheSeconds ||
    60
  );


const RANKING_REFRESH_SECONDS =
  Number(
    serverConfig.rankingRefreshSeconds ||
    180
  );


const capsuleCache =
  new Map();


const durationCache =
  new Map();


function isLastfmConfigured() {
  return Boolean(
    LASTFM_API_KEY &&
    !LASTFM_API_KEY.includes(
      'COLE_'
    ) &&
    !LASTFM_API_KEY.includes(
      'SUA_'
    )
  );
}


function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_URL &&
    /^https:\/\//i.test(
      SUPABASE_URL
    ) &&
    SUPABASE_SECRET_KEY &&
    !SUPABASE_SECRET_KEY.includes(
      'COLE_'
    ) &&
    !SUPABASE_SECRET_KEY.includes(
      'SUA_'
    )
  );
}


/* =========================================================
   HTTP
========================================================= */

function sendJson(
  res,
  status,
  body
) {
  res.writeHead(
    status,
    {
      'Content-Type':
        'application/json; charset=utf-8',

      'Cache-Control':
        'no-store'
    }
  );


  res.end(
    JSON.stringify(
      body
    )
  );
}


async function readBody(req) {
  let data = '';


  for await (
    const chunk of req
  ) {
    data += chunk;


    if (
      data.length >
      2_000_000
    ) {
      throw new Error(
        'Payload grande demais.'
      );
    }
  }


  if (!data) {
    return {};
  }


  return JSON.parse(
    data
  );
}


/* =========================================================
   SUPABASE
========================================================= */

async function supabaseRest(
  resource,
  {
    method = 'GET',
    query = {},
    body,
    prefer,
    timeoutMs = 15000
  } = {}
) {

  if (
    !isSupabaseConfigured()
  ) {
    const error =
      new Error(
        'SUPABASE_NOT_CONFIGURED'
      );


    error.code =
      'SUPABASE_NOT_CONFIGURED';


    throw error;
  }


  const url =
    new URL(
      `${SUPABASE_URL}/rest/v1/${resource}`
    );


  for (
    const [
      key,
      value
    ]
    of Object.entries(
      query || {}
    )
  ) {

    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      url.searchParams.set(
        key,
        String(value)
      );
    }
  }


  const headers = {
    apikey:
      SUPABASE_SECRET_KEY,

    Accept:
      'application/json'
  };


  if (
    body !== undefined
  ) {
    headers['Content-Type'] =
      'application/json';
  }


  if (prefer) {
    headers.Prefer =
      prefer;
  }


  const response =
    await fetch(
      url,
      {
        method,

        headers,

        body:
          body === undefined
            ? undefined
            : JSON.stringify(
                body
              ),

        signal:
          AbortSignal.timeout(
            timeoutMs
          )
      }
    );


  const text =
    await response.text();


  if (
    !response.ok
  ) {

    let detail =
      text;


    try {
      const parsed =
        JSON.parse(
          text
        );


      detail =
        parsed.message ||
        parsed.details ||
        parsed.hint ||
        text;

    } catch {}


    const error =
      new Error(
        `Supabase ${
          response.status
        }: ${
          String(
            detail ||
            'erro desconhecido'
          ).slice(
            0,
            500
          )
        }`
      );


    error.supabaseStatus =
      response.status;


    throw error;
  }


  if (!text) {
    return null;
  }


  try {
    return JSON.parse(
      text
    );

  } catch {
    return text;
  }
}


async function supabaseUpsert(
  table,
  rows,
  onConflict
) {

  if (
    !Array.isArray(
      rows
    )
  ) {
    rows = [
      rows
    ];
  }


  if (
    !rows.length
  ) {
    return [];
  }


  return await supabaseRest(
    table,
    {
      method:
        'POST',

      query: {
        on_conflict:
          onConflict,

        select:
          '*'
      },

      body:
        rows,

      prefer:
        'resolution=merge-duplicates,return=representation'
    }
  );
}


async function supabasePatch(
  table,
  query,
  body
) {
  return await supabaseRest(
    table,
    {
      method:
        'PATCH',

      query: {
        ...query,

        select:
          '*'
      },

      body,

      prefer:
        'return=representation'
    }
  );
}


async function supabaseDelete(
  table,
  query
) {
  return await supabaseRest(
    table,
    {
      method:
        'DELETE',

      query,

      prefer:
        'return=minimal'
    }
  );
}


async function supabasePing() {

  const rows =
    await supabaseRest(
      'profiles',
      {
        query: {
          select:
            'id',

          limit:
            1
        },

        timeoutMs:
          8000
      }
    );


  return Array.isArray(
    rows
  );
}


/* =========================================================
   LAST.FM
========================================================= */

async function lastfm(
  method,
  params = {}
) {

  if (
    !isLastfmConfigured()
  ) {
    const error =
      new Error(
        'LASTFM_NOT_CONFIGURED'
      );


    error.code =
      'LASTFM_NOT_CONFIGURED';


    throw error;
  }


  const url =
    new URL(
      LASTFM_ROOT
    );


  url.search =
    new URLSearchParams({
      method,

      api_key:
        LASTFM_API_KEY,

      format:
        'json',

      ...Object.fromEntries(
        Object.entries(
          params
        )
          .filter(
            (
              [, value]
            ) =>
              value !== undefined &&
              value !== null
          )

          .map(
            (
              [
                key,
                value
              ]
            ) => [
              key,
              String(
                value
              )
            ]
          )
      )
    });


  const response =
    await fetch(
      url,
      {
        signal:
          AbortSignal.timeout(
            12000
          ),

        headers: {
          'User-Agent':
            'Guessify-Capsula/2.0'
        }
      }
    );


  const text =
    await response.text();


  let body;


  try {
    body =
      JSON.parse(
        text
      );

  } catch {
    throw new Error(
      `Last.fm respondeu ${
        response.status
      }`
    );
  }


  if (
    !response.ok ||
    body.error
  ) {

    const error =
      new Error(
        body.message ||
        `Last.fm erro ${
          body.error ||
          response.status
        }`
      );


    error.lastfmCode =
      body.error;


    throw error;
  }


  return body;
}


/* =========================================================
   NOMES / CHAVES
========================================================= */

function cleanName(
  value
) {
  return String(
    value ||
    ''
  )
    .trim()
    .replace(
      /\s+/g,
      ' '
    );
}


function stableKey(
  ...parts
) {

  const normalized =
    parts
      .map(
        part =>
          cleanName(
            part
          )
            .toLowerCase()
      )
      .join(
        '\u0000'
      );


  return Buffer
    .from(
      normalized,
      'utf8'
    )
    .toString(
      'base64url'
    );
}


function trackKey(
  artist,
  track
) {
  return stableKey(
    artist,
    track
  );
}


function artistKey(
  artist
) {
  return stableKey(
    artist
  );
}


function albumKey(
  artist,
  album
) {
  return stableKey(
    artist,
    album
  );
}


function monthStartFromKey(
  monthKey
) {

  const match =
    String(
      monthKey ||
      ''
    ).match(
      /^(\d{4})-(\d{2})$/
    );


  if (!match) {
    throw new Error(
      'Mês inválido. Use YYYY-MM.'
    );
  }


  return (
    `${match[1]}-${match[2]}-01`
  );
}


function monthWindow(
  tzOffsetMinutes = 0,
  nowMs = Date.now()
) {

  const offset =
    Number.isFinite(
      Number(
        tzOffsetMinutes
      )
    )
      ? Number(
          tzOffsetMinutes
        )
      : 0;


  const shifted =
    new Date(
      nowMs -
      offset *
      60000
    );


  const year =
    shifted
      .getUTCFullYear();


  const month =
    shifted
      .getUTCMonth();


  const startPseudo =
    Date.UTC(
      year,
      month,
      1,
      0,
      0,
      0
    );


  const nextPseudo =
    Date.UTC(
      year,
      month + 1,
      1,
      0,
      0,
      0
    );


  return {
    key:
      `${year}-${
        String(
          month + 1
        ).padStart(
          2,
          '0'
        )
      }`,

    monthStart:
      `${year}-${
        String(
          month + 1
        ).padStart(
          2,
          '0'
        )
      }-01`,

    start:
      Math.floor(
        (
          startPseudo +
          offset *
          60000
        ) /
        1000
      ),

    end:
      Math.floor(
        Math.min(
          nowMs,

          nextPseudo +
          offset *
          60000 -
          1
        ) /
        1000
      )
  };
}


function extractImage(
  images
) {

  if (
    !Array.isArray(
      images
    )
  ) {
    return '';
  }


  return (
    images.find(
      item =>
        item?.size ===
        'extralarge'
    )?.['#text'] ||

    images.find(
      item =>
        item?.size ===
        'large'
    )?.['#text'] ||

    images.find(
      item =>
        item?.size ===
        'medium'
    )?.['#text'] ||

    images.at(-1)
      ?.['#text'] ||

    ''
  );
}


function toIsoFromUnix(
  uts
) {

  const value =
    Number(
      uts ||
      0
    );


  return value > 0
    ? new Date(
        value *
        1000
      ).toISOString()
    : null;
}


function chunkArray(
  items,
  size = 200
) {

  const chunks =
    [];


  for (
    let i = 0;
    i < items.length;
    i += size
  ) {
    chunks.push(
      items.slice(
        i,
        i + size
      )
    );
  }


  return chunks;
}


/* =========================================================
   PERFIS
========================================================= */

function profileFromRow(
  row
) {

  if (!row) {
    return null;
  }


  return {
    id:
      row.id,

    spotifyId:
      row.spotify_id,

    displayName:
      row.spotify_display_name ||
      row.lastfm_username ||
      'Usuário Guessify',

    lastfmUser:
      row.lastfm_username ||
      null,

    avatar:
      row.avatar_url ||
      '',

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    lastSeenAt:
      row.last_seen_at
  };
}


async function getProfileRowBySpotifyId(
  spotifyId
) {

  if (!spotifyId) {
    return null;
  }


  const rows =
    await supabaseRest(
      'profiles',
      {
        query: {
          select:
            '*',

          spotify_id:
            `eq.${spotifyId}`,

          limit:
            1
        }
      }
    );


  return Array.isArray(
    rows
  )
    ? rows[0] ||
      null
    : null;
}


async function getProfileRowByLastfm(
  username
) {

  if (!username) {
    return null;
  }


  const rows =
    await supabaseRest(
      'profiles',
      {
        query: {
          select:
            '*',

          lastfm_username:
            `eq.${
              cleanName(
                username
              )
            }`,

          limit:
            1
        }
      }
    );


  return Array.isArray(
    rows
  )
    ? rows[0] ||
      null
    : null;
}


async function getProfile(
  spotifyId
) {

  return profileFromRow(
    await getProfileRowBySpotifyId(
      spotifyId
    )
  );
}


async function getProfilesWithLastfm(
  limit = 30
) {

  const rows =
    await supabaseRest(
      'profiles',
      {
        query: {
          select:
            '*',

          lastfm_username:
            'not.is.null',

          order:
            'last_seen_at.desc.nullslast',

          limit
        }
      }
    );


  return Array.isArray(
    rows
  )
    ? rows
    : [];
}


async function validateLastfmUser(
  username
) {

  const data =
    await lastfm(
      'user.getInfo',
      {
        user:
          cleanName(
            username
          )
      }
    );


  if (
    !data.user?.name
  ) {
    throw new Error(
      'Usuário do Last.fm não encontrado.'
    );
  }


  return {
    username:
      data.user.name,

    displayName:
      data.user.realname ||
      data.user.name,

    avatar:
      extractImage(
        data.user.image
      )
  };
}


async function upsertProfile(
  payload
) {

  const spotifyId =
    cleanName(
      payload.spotifyId
    );


  const displayName =
    cleanName(
      payload.displayName ||
      'Usuário Guessify'
    );


  const requestedLastfm =
    cleanName(
      payload.lastfmUser
    );


  if (!spotifyId) {
    throw new Error(
      'Spotify ID ausente.'
    );
  }


  if (
    !requestedLastfm
  ) {
    throw new Error(
      'Digite seu usuário do Last.fm.'
    );
  }


  const lastfmUser =
    await validateLastfmUser(
      requestedLastfm
    );


  const now =
    new Date()
      .toISOString();


  const rows =
    await supabaseUpsert(
      'profiles',
      {
        spotify_id:
          spotifyId,

        spotify_display_name:
          displayName,

        lastfm_username:
          lastfmUser.username,

        avatar_url:
          lastfmUser.avatar ||
          null,

        last_seen_at:
          now
      },
      'spotify_id'
    );


  const row =
    Array.isArray(
      rows
    )
      ? rows[0]
      : null;


  return {
    ...profileFromRow(
      row
    ),

    lastfmProfile:
      lastfmUser
  };
}


async function unlinkProfile(
  spotifyId
) {

  const row =
    await getProfileRowBySpotifyId(
      spotifyId
    );


  if (!row) {
    return false;
  }


  await supabasePatch(
    'profiles',
    {
      spotify_id:
        `eq.${spotifyId}`
    },
    {
      lastfm_username:
        null,

      last_seen_at:
        new Date()
          .toISOString()
    }
  );


  return true;
}


/* =========================================================
   SCROBBLES DO MÊS
========================================================= */

async function fetchMonthScrobbles(
  username,
  tzOffsetMinutes
) {

  const range =
    monthWindow(
      tzOffsetMinutes
    );


  const baseParams = {
    user:
      username,

    from:
      range.start,

    to:
      range.end,

    limit:
      200,

    extended:
      1
  };


  const first =
    await lastfm(
      'user.getRecentTracks',
      {
        ...baseParams,

        page:
          1
      }
    );


  const attr =
    first
      .recenttracks
      ?.['@attr'] ||
    {};


  const totalPages =
    Math.max(
      1,

      Number(
        attr.totalPages ||
        1
      )
    );


  const apiReportedTotal =
    Number(
      attr.total ||
      0
    );


  let rawTracks =
    Array.isArray(
      first
        .recenttracks
        ?.track
    )
      ? [
          ...first
            .recenttracks
            .track
        ]
      : [];


  const pages =
    [];


  for (
    let page = 2;
    page <= totalPages;
    page++
  ) {
    pages.push(
      page
    );
  }


  for (
    let i = 0;
    i < pages.length;
    i += 4
  ) {

    const batch =
      pages.slice(
        i,
        i + 4
      );


    const results =
      await Promise.all(
        batch.map(
          page =>
            lastfm(
              'user.getRecentTracks',
              {
                ...baseParams,

                page
              }
            )
        )
      );


    for (
      const result
      of results
    ) {

      const pageTracks =
        Array.isArray(
          result
            .recenttracks
            ?.track
        )
          ? result
              .recenttracks
              .track
          : [];


      rawTracks.push(
        ...pageTracks
      );
    }
  }


  const parsed =
    rawTracks

      .filter(
        track =>
          track
            ?.date
            ?.uts
      )

      .map(
        track => ({
          name:
            cleanName(
              track.name
            ),

          artist:
            cleanName(
              typeof track.artist ===
              'string'
                ? track.artist
                : (
                    track.artist?.name ||
                    track.artist?.['#text']
                  )
            ),

          album:
            cleanName(
              track.album?.['#text'] ||
              track.album?.name
            ),

          image:
            extractImage(
              track.image
            ),

          uts:
            Number(
              track.date.uts
            )
        })
      )

      .filter(
        track =>
          track.name &&
          track.artist &&
          Number.isFinite(
            track.uts
          ) &&
          track.uts >
          0
      );


  const seen =
    new Set();


  const scrobbles =
    [];


  for (
    const track
    of parsed
  ) {

    const uniqueKey =
      [
        track.uts,

        track.artist
          .toLowerCase(),

        track.name
          .toLowerCase()
      ].join(
        '\u0001'
      );


    if (
      seen.has(
        uniqueKey
      )
    ) {
      continue;
    }


    seen.add(
      uniqueKey
    );


    scrobbles.push(
      track
    );
  }


  return {
    ...range,

    scrobbles,

    total:
      scrobbles.length,

    apiReportedTotal,

    totalPages,

    fetchedPages:
      totalPages,

    truncated:
      false
  };
}


/* =========================================================
   AGREGA MÚSICAS / ARTISTAS / ÁLBUNS
========================================================= */

function aggregateScrobbles(
  scrobbles
) {

  const tracks =
    new Map();


  const artists =
    new Map();


  const albums =
    new Map();


  const days =
    new Set();


  for (
    const scrobble
    of scrobbles
  ) {

    /* MÚSICA */

    const tk =
      trackKey(
        scrobble.artist,
        scrobble.name
      );


    const track =
      tracks.get(
        tk
      ) || {
        key:
          tk,

        name:
          scrobble.name,

        artist:
          scrobble.artist,

        album:
          scrobble.album ||
          '',

        image:
          scrobble.image ||
          '',

        plays:
          0,

        lastPlayedAt:
          0
      };


    track.plays +=
      1;


    track.lastPlayedAt =
      Math.max(
        track.lastPlayedAt,
        scrobble.uts
      );


    if (
      !track.image &&
      scrobble.image
    ) {
      track.image =
        scrobble.image;
    }


    if (
      !track.album &&
      scrobble.album
    ) {
      track.album =
        scrobble.album;
    }


    tracks.set(
      tk,
      track
    );


    /* ARTISTA */

    const ak =
      artistKey(
        scrobble.artist
      );


    const artist =
      artists.get(
        ak
      ) || {
        key:
          ak,

        name:
          scrobble.artist,

        image:
          scrobble.image ||
          '',

        plays:
          0,

        lastPlayedAt:
          0
      };


    artist.plays +=
      1;


    artist.lastPlayedAt =
      Math.max(
        artist.lastPlayedAt,
        scrobble.uts
      );


    if (
      !artist.image &&
      scrobble.image
    ) {
      artist.image =
        scrobble.image;
    }


    artists.set(
      ak,
      artist
    );


    /* ÁLBUM */

    if (
      scrobble.album
    ) {

      const alk =
        albumKey(
          scrobble.artist,
          scrobble.album
        );


      const album =
        albums.get(
          alk
        ) || {
          key:
            alk,

          name:
            scrobble.album,

          artist:
            scrobble.artist,

          image:
            scrobble.image ||
            '',

          plays:
            0,

          lastPlayedAt:
            0
        };


      album.plays +=
        1;


      album.lastPlayedAt =
        Math.max(
          album.lastPlayedAt,
          scrobble.uts
        );


      if (
        !album.image &&
        scrobble.image
      ) {
        album.image =
          scrobble.image;
      }


      albums.set(
        alk,
        album
      );
    }


    days.add(
      new Date(
        scrobble.uts *
        1000
      )
        .toISOString()
        .slice(
          0,
          10
        )
    );
  }


  const sortByPlays =
    (
      a,
      b
    ) =>
      b.plays -
      a.plays ||

      b.lastPlayedAt -
      a.lastPlayedAt ||

      a.name.localeCompare(
        b.name
      );


  return {
    tracks:
      [
        ...tracks.values()
      ].sort(
        sortByPlays
      ),

    artists:
      [
        ...artists.values()
      ].sort(
        sortByPlays
      ),

    albums:
      [
        ...albums.values()
      ].sort(
        sortByPlays
      ),

    daysActive:
      days.size
  };
}


/* =========================================================
   DURAÇÕES
========================================================= */

async function preloadDurationsFromSupabase(
  trackKeys
) {

  const missing =
    [
      ...new Set(
        trackKeys
      )
    ].filter(
      key =>
        !durationCache.has(
          key
        )
    );


  if (
    !missing.length
  ) {
    return;
  }


  for (
    const chunk
    of chunkArray(
      missing,
      80
    )
  ) {

    const rows =
      await supabaseRest(
        'monthly_track_stats',
        {
          query: {
            select:
              'track_key,duration_ms,updated_at',

            track_key:
              `in.(${
                chunk.join(
                  ','
                )
              })`,

            duration_ms:
              'gt.0',

            order:
              'updated_at.desc',

            limit:
              1000
          }
        }
      ).catch(
        error => {
          console.warn(
            '[Supabase] Não consegui carregar cache de duração:',
            error.message
          );

          return [];
        }
      );


    for (
      const row
      of rows ||
      []
    ) {

      const durationMs =
        Number(
          row.duration_ms ||
          0
        );


      if (
        row.track_key &&
        durationMs >
        0 &&
        !durationCache.has(
          row.track_key
        )
      ) {

        durationCache.set(
          row.track_key,
          durationMs
        );
      }
    }
  }
}


async function getDurationMs(
  artist,
  track
) {

  const key =
    trackKey(
      artist,
      track
    );


  const cached =
    Number(
      durationCache.get(
        key
      ) ||
      0
    );


  if (
    cached >
    0
  ) {
    return cached;
  }


  try {

    const data =
      await lastfm(
        'track.getInfo',
        {
          artist,

          track,

          autocorrect:
            1
        }
      );


    const durationMs =
      Number(
        data.track
          ?.duration ||
        0
      );


    if (
      durationMs >
      0
    ) {

      durationCache.set(
        key,
        durationMs
      );


      return durationMs;
    }

  } catch (
    error
  ) {

    console.warn(
      '[Capsula] duração indisponível:',
      artist,
      '-',
      track,
      error.message
    );
  }


  return 0;
}


async function mapWithConcurrency(
  items,
  limit,
  fn
) {

  if (
    !items.length
  ) {
    return [];
  }


  const output =
    new Array(
      items.length
    );


  let next =
    0;


  const workers =
    Array.from(
      {
        length:
          Math.min(
            limit,
            items.length
          )
      },

      async () => {

        while (
          next <
          items.length
        ) {

          const index =
            next++;


          output[index] =
            await fn(
              items[index],
              index
            );
        }
      }
    );


  await Promise.all(
    workers
  );


  return output;
}


async function calculateCountedStats(
  aggregated
) {

  await preloadDurationsFromSupabase(
    aggregated.tracks.map(
      track =>
        track.key
    )
  );


  const missingDurations =
    aggregated.tracks.filter(
      track =>
        !(
          Number(
            durationCache.get(
              track.key
            ) ||
            0
          ) >
          0
        )
    );


  await mapWithConcurrency(
    missingDurations,
    4,

    track =>
      getDurationMs(
        track.artist,
        track.name
      )
  );


  let countedMs =
    0;


  let countedScrobbles =
    0;


  let missingDurationScrobbles =
    0;


  const missingDurationTracks =
    [];


  const artistTime =
    new Map();


  const albumTime =
    new Map();


  const tracks =
    aggregated.tracks.map(
      track => {

        const durationMs =
          Number(
            durationCache.get(
              track.key
            ) ||
            0
          );


        const totalListenedMs =
          durationMs > 0
            ? durationMs *
              track.plays
            : 0;


        if (
          durationMs >
          0
        ) {

          countedMs +=
            totalListenedMs;


          countedScrobbles +=
            track.plays;


          const ak =
            artistKey(
              track.artist
            );


          artistTime.set(
            ak,

            Number(
              artistTime.get(
                ak
              ) ||
              0
            ) +
            totalListenedMs
          );


          if (
            track.album
          ) {

            const alk =
              albumKey(
                track.artist,
                track.album
              );


            albumTime.set(
              alk,

              Number(
                albumTime.get(
                  alk
                ) ||
                0
              ) +
              totalListenedMs
            );
          }

        } else {

          missingDurationScrobbles +=
            track.plays;


          missingDurationTracks.push({
            name:
              track.name,

            artist:
              track.artist,

            plays:
              track.plays
          });
        }


        return {
          ...track,

          durationMs,

          totalListenedMs,

          totalListenedSeconds:
            Math.floor(
              totalListenedMs /
              1000
            ),

          totalListenedMinutes:
            Math.floor(
              totalListenedMs /
              60000
            )
        };
      }
    );


  const artists =
    aggregated.artists.map(
      artist => {

        const totalListenedMs =
          Number(
            artistTime.get(
              artist.key
            ) ||
            0
          );


        return {
          ...artist,

          totalListenedMs,

          totalListenedSeconds:
            Math.floor(
              totalListenedMs /
              1000
            ),

          totalListenedMinutes:
            Math.floor(
              totalListenedMs /
              60000
            )
        };
      }
    );


  const albums =
    aggregated.albums.map(
      album => {

        const totalListenedMs =
          Number(
            albumTime.get(
              album.key
            ) ||
            0
          );


        return {
          ...album,

          totalListenedMs,

          totalListenedSeconds:
            Math.floor(
              totalListenedMs /
              1000
            ),

          totalListenedMinutes:
            Math.floor(
              totalListenedMs /
              60000
            )
        };
      }
    );


  const totalScrobbles =
    tracks.reduce(
      (
        sum,
        track
      ) =>
        sum +
        track.plays,
      0
    );


  const durationCoveragePercent =
    totalScrobbles
      ? Math.round(
          (
            countedScrobbles /
            totalScrobbles
          ) *
          100
        )
      : 100;


  return {
    countedMs,

    countedSeconds:
      Math.floor(
        countedMs /
        1000
      ),

    countedMinutes:
      Math.floor(
        countedMs /
        60000
      ),

    countedScrobbles,

    missingDurationScrobbles,

    missingDurationTracks,

    durationCoveragePercent,

    tracks,

    artists,

    albums
  };
}


/* =========================================================
   BASE MANUAL DO SPOTIFY
========================================================= */

function baselineFromRow(
  row
) {

  if (!row) {
    return null;
  }


  return {
    id:
      row.id,

    profileId:
      row.profile_id,

    monthStart:
      row.month_start,

    baseMinutes:
      Number(
        row.base_minutes ||
        0
      ),

    baseSeconds:
      Number(
        row.base_seconds ||
        0
      ),

    capturedAt:
      row.captured_at,

    source:
      row.source
  };
}


async function getBaselineByProfile(
  profileId,
  monthKey
) {

  if (
    !profileId ||
    !monthKey
  ) {
    return null;
  }


  const rows =
    await supabaseRest(
      'capsule_baselines',
      {
        query: {
          select:
            '*',

          profile_id:
            `eq.${profileId}`,

          month_start:
            `eq.${
              monthStartFromKey(
                monthKey
              )
            }`,

          limit:
            1
        }
      }
    );


  return baselineFromRow(
    Array.isArray(
      rows
    )
      ? rows[0]
      : null
  );
}


async function getBaselineBySpotifyId(
  spotifyId,
  monthKey
) {

  const profile =
    await getProfileRowBySpotifyId(
      spotifyId
    );


  if (!profile) {
    return null;
  }


  return await getBaselineByProfile(
    profile.id,
    monthKey
  );
}


async function saveBaseline(
  payload
) {

  const spotifyId =
    cleanName(
      payload.spotifyId
    );


  const baseMinutes =
    Math.max(
      0,

      Math.floor(
        Number(
          payload.baseMinutes ||
          0
        )
      )
    );


  const capturedDate =
    new Date(
      payload.capturedAt ||
      ''
    );


  if (
    !spotifyId
  ) {
    throw new Error(
      'Spotify ID ausente.'
    );
  }


  if (
    !Number.isFinite(
      baseMinutes
    )
  ) {
    throw new Error(
      'Minutos inválidos.'
    );
  }


  if (
    !Number.isFinite(
      capturedDate.getTime()
    )
  ) {
    throw new Error(
      'Data/hora inválida.'
    );
  }


  const capturedAt =
    capturedDate
      .toISOString();


  const profile =
    await getProfileRowBySpotifyId(
      spotifyId
    );


  if (!profile) {
    throw new Error(
      'Perfil não encontrado. Conecte o Last.fm primeiro.'
    );
  }


  const monthKey =
    cleanName(
      payload.monthKey
    ) ||
    capturedAt.slice(
      0,
      7
    );


  const monthStart =
    monthStartFromKey(
      monthKey
    );


  const rows =
    await supabaseUpsert(
      'capsule_baselines',
      {
        profile_id:
          profile.id,

        month_start:
          monthStart,

        base_minutes:
          baseMinutes,

        base_seconds:
          baseMinutes *
          60,

        captured_at:
          capturedAt,

        source:
          'spotify_manual'
      },
      'profile_id,month_start'
    );


  capsuleCache.clear();


  return baselineFromRow(
    Array.isArray(
      rows
    )
      ? rows[0]
      : null
  );
}


async function deleteBaseline(
  spotifyId,
  monthKey
) {

  const profile =
    await getProfileRowBySpotifyId(
      spotifyId
    );


  if (!profile) {
    return false;
  }


  await supabaseDelete(
    'capsule_baselines',
    {
      profile_id:
        `eq.${profile.id}`,

      month_start:
        `eq.${
          monthStartFromKey(
            monthKey
          )
        }`
    }
  );


  capsuleCache.clear();


  return true;
}


function calculateEffectiveCountedSeconds(
  history,
  counted,
  baseline
) {

  if (!baseline) {

    return {
      countedSeconds:
        counted.countedSeconds,

      secondsAfterBaseline:
        counted.countedSeconds,

      scrobblesAfterBaseline:
        counted.countedScrobbles
    };
  }


  const capturedMs =
    Date.parse(
      baseline.capturedAt ||
      ''
    );


  if (
    !Number.isFinite(
      capturedMs
    )
  ) {

    return {
      countedSeconds:
        counted.countedSeconds,

      secondsAfterBaseline:
        counted.countedSeconds,

      scrobblesAfterBaseline:
        counted.countedScrobbles
    };
  }


  const durationByTrack =
    new Map(
      counted.tracks.map(
        track => [
          track.key,

          Math.floor(
            Number(
              track.durationMs ||
              0
            ) /
            1000
          )
        ]
      )
    );


  let secondsAfterBaseline =
    0;


  let scrobblesAfterBaseline =
    0;


  for (
    const scrobble
    of history.scrobbles
  ) {

    if (
      scrobble.uts *
      1000 <=
      capturedMs
    ) {
      continue;
    }


    const seconds =
      Number(
        durationByTrack.get(
          trackKey(
            scrobble.artist,
            scrobble.name
          )
        ) ||
        0
      );


    if (
      seconds >
      0
    ) {

      secondsAfterBaseline +=
        seconds;


      scrobblesAfterBaseline +=
        1;
    }
  }


  return {
    countedSeconds:
      Number(
        baseline.baseSeconds ||
        0
      ) +
      secondsAfterBaseline,

    secondsAfterBaseline,

    scrobblesAfterBaseline
  };
}


/* =========================================================
   TOCANDO AGORA LAST.FM
   Mantido para compatibilidade.
========================================================= */

async function fetchNowPlaying(
  username
) {

  const data =
    await lastfm(
      'user.getRecentTracks',
      {
        user:
          username,

        limit:
          1,

        extended:
          1
      }
    );


  const track =
    Array.isArray(
      data
        .recenttracks
        ?.track
    )
      ? data
          .recenttracks
          .track[0]
      : data
          .recenttracks
          ?.track;


  const isNowPlaying =
    track
      ?.['@attr']
      ?.nowplaying ===
    'true';


  if (
    !track ||
    !isNowPlaying
  ) {
    return null;
  }


  return {
    name:
      cleanName(
        track.name
      ),

    artist:
      cleanName(
        track.artist?.name ||
        track.artist?.['#text'] ||
        track.artist
      ),

    album:
      cleanName(
        track.album?.['#text'] ||
        track.album?.name
      ),

    image:
      extractImage(
        track.image
      )
  };
}


/* =========================================================
   SALVA SCROBBLES NO SUPABASE
========================================================= */

async function syncScrobbles(
  profileId,
  scrobbles,
  countedTracks
) {

  if (
    !profileId ||
    !scrobbles.length
  ) {
    return;
  }


  const durationByKey =
    new Map(
      countedTracks.map(
        track => [
          track.key,

          Number(
            track.durationMs ||
            0
          )
        ]
      )
    );


  const rows =
    scrobbles.map(
      scrobble => {

        const key =
          trackKey(
            scrobble.artist,
            scrobble.name
          );


        const durationMs =
          Number(
            durationByKey.get(
              key
            ) ||
            0
          );


        return {
          profile_id:
            profileId,

          track_key:
            key,

          track_name:
            scrobble.name,

          artist_name:
            scrobble.artist,

          album_name:
            scrobble.album ||
            null,

          image_url:
            scrobble.image ||
            null,

          played_at:
            toIsoFromUnix(
              scrobble.uts
            ),

          duration_ms:
            durationMs > 0
              ? durationMs
              : null,

          counted_seconds:
            durationMs > 0
              ? Math.floor(
                  durationMs /
                  1000
                )
              : 0,

          source:
            'lastfm'
        };
      }
    );


  for (
    const chunk
    of chunkArray(
      rows,
      200
    )
  ) {

    await supabaseUpsert(
      'scrobbles',
      chunk,
      'profile_id,played_at,track_key'
    );
  }
}


/* =========================================================
   CÁPSULA MENSAL
========================================================= */

async function upsertMonthlyCapsule(
  profileId,
  capsule
) {

  const rows =
    await supabaseUpsert(
      'monthly_capsules',
      {
        profile_id:
          profileId,

        month_start:
          monthStartFromKey(
            capsule.monthKey
          ),

        counted_seconds:
          Number(
            capsule.countedSeconds ||
            0
          ),

        counted_minutes:
          Number(
            capsule.countedMinutes ||
            0
          ),

        total_scrobbles:
          Number(
            capsule.scrobbles ||
            0
          ),

        unique_tracks:
          Number(
            capsule.uniqueTracks ||
            0
          ),

        unique_artists:
          Number(
            capsule.uniqueArtists ||
            0
          ),

        unique_albums:
          Number(
            capsule.uniqueAlbums ||
            0
          ),

        days_active:
          Number(
            capsule.daysActive ||
            0
          ),

        duration_coverage_percent:
          Number(
            capsule.durationCoveragePercent ||
            0
          )
      },
      'profile_id,month_start'
    );


  return Array.isArray(
    rows
  )
    ? rows[0] ||
      null
    : null;
}


/* =========================================================
   STATS DE MÚSICAS
========================================================= */

async function syncMonthlyTrackStats(
  capsuleId,
  tracks
) {

  const rows =
    tracks.map(
      track => ({
        capsule_id:
          capsuleId,

        track_key:
          track.key,

        track_name:
          track.name,

        artist_name:
          track.artist,

        album_name:
          track.album ||
          null,

        image_url:
          track.image ||
          null,

        duration_ms:
          Number(
            track.durationMs ||
            0
          ),

        plays:
          Number(
            track.plays ||
            0
          ),

        counted_seconds:
          Number(
            track.totalListenedSeconds ||
            0
          ),

        counted_minutes:
          Number(
            track.totalListenedMinutes ||
            0
          ),

        last_played_at:
          toIsoFromUnix(
            track.lastPlayedAt
          )
      })
    );


  for (
    const chunk
    of chunkArray(
      rows,
      200
    )
  ) {

    await supabaseUpsert(
      'monthly_track_stats',
      chunk,
      'capsule_id,track_key'
    );
  }
}


/* =========================================================
   STATS DE ARTISTAS
========================================================= */

async function syncMonthlyArtistStats(
  capsuleId,
  artists
) {

  const rows =
    artists.map(
      artist => ({
        capsule_id:
          capsuleId,

        artist_key:
          artist.key,

        artist_name:
          artist.name,

        image_url:
          artist.image ||
          null,

        plays:
          Number(
            artist.plays ||
            0
          ),

        counted_seconds:
          Number(
            artist.totalListenedSeconds ||
            0
          ),

        counted_minutes:
          Number(
            artist.totalListenedMinutes ||
            0
          ),

        last_played_at:
          toIsoFromUnix(
            artist.lastPlayedAt
          )
      })
    );


  for (
    const chunk
    of chunkArray(
      rows,
      200
    )
  ) {

    await supabaseUpsert(
      'monthly_artist_stats',
      chunk,
      'capsule_id,artist_key'
    );
  }
}


/* =========================================================
   STATS DE ÁLBUNS
========================================================= */

async function syncMonthlyAlbumStats(
  capsuleId,
  albums
) {

  const rows =
    albums.map(
      album => ({
        capsule_id:
          capsuleId,

        album_key:
          album.key,

        album_name:
          album.name,

        artist_name:
          album.artist,

        image_url:
          album.image ||
          null,

        plays:
          Number(
            album.plays ||
            0
          ),

        counted_seconds:
          Number(
            album.totalListenedSeconds ||
            0
          ),

        counted_minutes:
          Number(
            album.totalListenedMinutes ||
            0
          ),

        last_played_at:
          toIsoFromUnix(
            album.lastPlayedAt
          )
      })
    );


  for (
    const chunk
    of chunkArray(
      rows,
      200
    )
  ) {

    await supabaseUpsert(
      'monthly_album_stats',
      chunk,
      'capsule_id,album_key'
    );
  }
}


/* =========================================================
   PERSISTE A CÁPSULA
========================================================= */

async function persistCapsule(
  profileRow,
  history,
  capsule
) {

  if (
    !profileRow?.id
  ) {
    return;
  }


  await supabasePatch(
    'profiles',
    {
      id:
        `eq.${profileRow.id}`
    },
    {
      avatar_url:
        capsule.avatar ||
        profileRow.avatar_url ||
        null,

      lastfm_username:
        capsule.username,

      last_seen_at:
        new Date()
          .toISOString()
    }
  );


  await syncScrobbles(
    profileRow.id,
    history.scrobbles,
    capsule.tracks
  );


  const capsuleRow =
    await upsertMonthlyCapsule(
      profileRow.id,
      capsule
    );


  if (
    !capsuleRow?.id
  ) {
    return;
  }


  await Promise.all([
    syncMonthlyTrackStats(
      capsuleRow.id,
      capsule.tracks
    ),

    syncMonthlyArtistStats(
      capsuleRow.id,
      capsule.artists
    ),

    syncMonthlyAlbumStats(
      capsuleRow.id,
      capsule.albums
    )
  ]);
}


/* =========================================================
   GERA CÁPSULA
========================================================= */

async function computeCapsule(
  username,
  tzOffsetMinutes,
  force = false
) {

  const normalized =
    cleanName(
      username
    );


  const range =
    monthWindow(
      tzOffsetMinutes
    );


  const cacheKey =
    [
      normalized
        .toLowerCase(),

      range.key,

      Number(
        tzOffsetMinutes
      ) ||
      0
    ].join(
      '|'
    );


  const cached =
    capsuleCache.get(
      cacheKey
    );


  if (
    !force &&
    cached &&
    Date.now() -
      cached.savedAt <
      CAPSULE_CACHE_SECONDS *
      1000
  ) {
    return cached.value;
  }


  const [
    history,
    userInfo
  ] =
    await Promise.all([
      fetchMonthScrobbles(
        normalized,
        tzOffsetMinutes
      ),

      lastfm(
        'user.getInfo',
        {
          user:
            normalized
        }
      )
    ]);


  const canonicalUsername =
    userInfo.user?.name ||
    normalized;


  const aggregated =
    aggregateScrobbles(
      history.scrobbles
    );


  const counted =
    await calculateCountedStats(
      aggregated
    );


  const tracks =
    [
      ...counted.tracks
    ].sort(
      (
        a,
        b
      ) =>
        b.plays -
        a.plays ||

        b.lastPlayedAt -
        a.lastPlayedAt
    );


  const artists =
    [
      ...counted.artists
    ].sort(
      (
        a,
        b
      ) =>
        b.plays -
        a.plays ||

        b.lastPlayedAt -
        a.lastPlayedAt
    );


  const albums =
    [
      ...counted.albums
    ].sort(
      (
        a,
        b
      ) =>
        b.plays -
        a.plays ||

        b.lastPlayedAt -
        a.lastPlayedAt
    );


  const profileRow =
    await getProfileRowByLastfm(
      canonicalUsername
    ).catch(
      () => null
    );


  const baseline =
    profileRow
      ? await getBaselineByProfile(
          profileRow.id,
          history.key
        ).catch(
          () => null
        )
      : null;


  const effective =
    calculateEffectiveCountedSeconds(
      history,
      counted,
      baseline
    );


  const countedSeconds =
    Math.max(
      0,

      Math.floor(
        effective.countedSeconds
      )
    );


  const countedMinutes =
    Math.floor(
      countedSeconds /
      60
    );


  const nowPlaying =
    await fetchNowPlaying(
      canonicalUsername
    ).catch(
      () => null
    );


  const value = {

    username:
      canonicalUsername,


    displayName:
      userInfo.user?.realname ||
      userInfo.user?.name ||
      normalized,


    avatar:
      extractImage(
        userInfo.user?.image
      ),


    monthKey:
      history.key,


    /*
      TOTAL DA CÁPSULA
    */

    countedMinutes,

    countedSeconds,

    countedScrobbles:
      counted.countedScrobbles,


    /*
      TOTAL PURO DO LAST.FM
      sem baseline manual.
    */

    rawCountedMinutes:
      counted.countedMinutes,

    rawCountedSeconds:
      counted.countedSeconds,


    /*
      BASE DO SPOTIFY
    */

    baseline,

    secondsAfterBaseline:
      effective.secondsAfterBaseline,

    scrobblesAfterBaseline:
      effective.scrobblesAfterBaseline,


    /*
      CONTAGENS
    */

    scrobbles:
      history
        .scrobbles
        .length,


    uniqueTracks:
      tracks.length,


    uniqueArtists:
      artists.length,


    uniqueAlbums:
      albums.length,


    daysActive:
      aggregated.daysActive,


    /*
      TODOS
    */

    tracks,

    artists,

    albums,


    /*
      TOP 5
    */

    topTracks:
      tracks.slice(
        0,
        5
      ),


    topArtists:
      artists.slice(
        0,
        5
      ),


    topAlbums:
      albums.slice(
        0,
        5
      ),


    nowPlaying,


    missingDurationScrobbles:
      counted
        .missingDurationScrobbles,


    missingDurationTracks:
      counted
        .missingDurationTracks
        .slice(
          0,
          20
        ),


    durationCoveragePercent:
      counted
        .durationCoveragePercent,


    calculationMode:
      baseline
        ? 'spotify-manual-baseline-plus-full-track-duration-per-confirmed-scrobble'
        : 'full-track-duration-per-confirmed-scrobble',


    fetchedPages:
      history.fetchedPages,


    totalPages:
      history.totalPages,


    apiReportedTotal:
      history.apiReportedTotal,


    truncated:
      false,


    updatedAt:
      new Date()
        .toISOString()
  };


  capsuleCache.set(
    cacheKey,
    {
      value,

      savedAt:
        Date.now()
    }
  );


  if (
    profileRow
  ) {

    await persistCapsule(
      profileRow,
      history,
      value
    ).catch(
      error => {
        console.error(
          '[Supabase] Falha ao persistir Cápsula:',
          error
        );
      }
    );
  }


  return value;
}


/* =========================================================
   HISTÓRICO MENSAL
========================================================= */

async function getMonthlyHistory(
  spotifyId
) {

  const profileRow =
    await getProfileRowBySpotifyId(
      spotifyId
    );


  if (!profileRow) {

    return {
      spotifyId,

      months:
        []
    };
  }


  const capsules =
    await supabaseRest(
      'monthly_capsules',
      {
        query: {
          select:
            '*',

          profile_id:
            `eq.${profileRow.id}`,

          order:
            'month_start.desc',

          limit:
            24
        }
      }
    );


  const months =
    [];


  for (
    const capsule
    of capsules ||
    []
  ) {

    const [
      topTracks,
      topArtists,
      topAlbums,
      baseline
    ] =
      await Promise.all([

        supabaseRest(
          'top_5_tracks',
          {
            query: {
              select:
                '*',

              capsule_id:
                `eq.${capsule.id}`,

              order:
                'position.asc'
            }
          }
        ),


        supabaseRest(
          'top_5_artists',
          {
            query: {
              select:
                '*',

              capsule_id:
                `eq.${capsule.id}`,

              order:
                'position.asc'
            }
          }
        ),


        supabaseRest(
          'top_5_albums',
          {
            query: {
              select:
                '*',

              capsule_id:
                `eq.${capsule.id}`,

              order:
                'position.asc'
            }
          }
        ),


        getBaselineByProfile(
          profileRow.id,

          String(
            capsule.month_start
          ).slice(
            0,
            7
          )
        )
      ]);


    months.push({

      monthKey:
        String(
          capsule.month_start
        ).slice(
          0,
          7
        ),


      countedMinutes:
        Number(
          capsule.counted_minutes ||
          0
        ),


      countedSeconds:
        Number(
          capsule.counted_seconds ||
          0
        ),


      scrobbles:
        Number(
          capsule.total_scrobbles ||
          0
        ),


      uniqueTracks:
        Number(
          capsule.unique_tracks ||
          0
        ),


      uniqueArtists:
        Number(
          capsule.unique_artists ||
          0
        ),


      uniqueAlbums:
        Number(
          capsule.unique_albums ||
          0
        ),


      daysActive:
        Number(
          capsule.days_active ||
          0
        ),


      durationCoveragePercent:
        Number(
          capsule
            .duration_coverage_percent ||
          0
        ),


      baseline,


      topTracks:
        (
          topTracks ||
          []
        ).map(
          row => ({
            name:
              row.track_name,

            artist:
              row.artist_name,

            album:
              row.album_name ||
              '',

            image:
              row.image_url ||
              '',

            plays:
              Number(
                row.plays ||
                0
              ),

            durationMs:
              Number(
                row.duration_ms ||
                0
              ),

            totalListenedSeconds:
              Number(
                row.counted_seconds ||
                0
              ),

            totalListenedMinutes:
              Number(
                row.counted_minutes ||
                0
              )
          })
        ),


      topArtists:
        (
          topArtists ||
          []
        ).map(
          row => ({
            name:
              row.artist_name,

            image:
              row.image_url ||
              '',

            plays:
              Number(
                row.plays ||
                0
              ),

            totalListenedSeconds:
              Number(
                row.counted_seconds ||
                0
              ),

            totalListenedMinutes:
              Number(
                row.counted_minutes ||
                0
              )
          })
        ),


      topAlbums:
        (
          topAlbums ||
          []
        ).map(
          row => ({
            name:
              row.album_name,

            artist:
              row.artist_name,

            image:
              row.image_url ||
              '',

            plays:
              Number(
                row.plays ||
                0
              ),

            totalListenedSeconds:
              Number(
                row.counted_seconds ||
                0
              ),

            totalListenedMinutes:
              Number(
                row.counted_minutes ||
                0
              )
          })
        ),


      updatedAt:
        capsule.updated_at
    });
  }


  return {
    spotifyId,

    displayName:
      profileRow
        .spotify_display_name,

    lastfmUser:
      profileRow
        .lastfm_username,

    months
  };
}


/* =========================================================
   RANKING
========================================================= */

async function getMonthlyCapsuleRow(
  profileId,
  monthKey
) {

  const rows =
    await supabaseRest(
      'monthly_capsules',
      {
        query: {
          select:
            '*',

          profile_id:
            `eq.${profileId}`,

          month_start:
            `eq.${
              monthStartFromKey(
                monthKey
              )
            }`,

          limit:
            1
        }
      }
    );


  return Array.isArray(
    rows
  )
    ? rows[0] ||
      null
    : null;
}


async function buildRanking(
  tzOffsetMinutes,
  force = false
) {

  const range =
    monthWindow(
      tzOffsetMinutes
    );


  const profiles =
    await getProfilesWithLastfm(
      30
    );


  const now =
    Date.now();


  /*
    Atualiza usuários
    que estão com dados velhos.
  */

  for (
    const profile
    of profiles
  ) {

    try {

      const capsuleRow =
        await getMonthlyCapsuleRow(
          profile.id,
          range.key
        );


      const updatedAt =
        capsuleRow?.updated_at
          ? Date.parse(
              capsuleRow.updated_at
            )
          : 0;


      const isFresh =
        !force &&
        updatedAt >
        0 &&
        now -
          updatedAt <
        RANKING_REFRESH_SECONDS *
        1000;


      if (
        !isFresh
      ) {

        await computeCapsule(
          profile.lastfm_username,
          tzOffsetMinutes,
          force
        );
      }

    } catch (
      error
    ) {

      console.warn(
        '[Ranking] Falha ao atualizar',
        profile.lastfm_username,
        error.message
      );
    }
  }


  if (
    !profiles.length
  ) {

    return {
      monthKey:
        range.key,

      rows:
        [],

      updatedAt:
        new Date()
          .toISOString()
    };
  }


  const profileIds =
    profiles.map(
      profile =>
        profile.id
    );


  const profileMap =
    new Map(
      profiles.map(
        profile => [
          profile.id,
          profile
        ]
      )
    );


  const capsules =
    await supabaseRest(
      'monthly_capsules',
      {
        query: {
          select:
            '*',

          month_start:
            `eq.${range.monthStart}`,

          profile_id:
            `in.(${
              profileIds.join(
                ','
              )
            })`,

          order:
            'counted_seconds.desc,total_scrobbles.desc'
        }
      }
    );


  const capsuleIds =
    (
      capsules ||
      []
    ).map(
      row =>
        row.id
    );


  const topArtistMap =
    new Map();


  const topTrackMap =
    new Map();


  if (
    capsuleIds.length
  ) {

    const [
      topArtists,
      topTracks
    ] =
      await Promise.all([

        supabaseRest(
          'top_5_artists',
          {
            query: {
              select:
                'capsule_id,artist_name,plays',

              capsule_id:
                `in.(${
                  capsuleIds.join(
                    ','
                  )
                })`,

              position:
                'eq.1'
            }
          }
        ),


        supabaseRest(
          'top_5_tracks',
          {
            query: {
              select:
                'capsule_id,track_name,artist_name,plays',

              capsule_id:
                `in.(${
                  capsuleIds.join(
                    ','
                  )
                })`,

              position:
                'eq.1'
            }
          }
        )
      ]);


    for (
      const row
      of topArtists ||
      []
    ) {
      topArtistMap.set(
        row.capsule_id,
        row
      );
    }


    for (
      const row
      of topTracks ||
      []
    ) {
      topTrackMap.set(
        row.capsule_id,
        row
      );
    }
  }


  const rows =
    (
      capsules ||
      []
    )

      .map(
        capsule => {

          const profile =
            profileMap.get(
              capsule.profile_id
            );


          if (
            !profile
              ?.lastfm_username
          ) {
            return null;
          }


          const topArtist =
            topArtistMap.get(
              capsule.id
            );


          const topTrack =
            topTrackMap.get(
              capsule.id
            );


          return {

            spotifyId:
              profile.spotify_id,


            displayName:
              profile.spotify_display_name ||
              profile.lastfm_username,


            lastfmUser:
              profile.lastfm_username,


            countedMinutes:
              Number(
                capsule.counted_minutes ||
                0
              ),


            countedSeconds:
              Number(
                capsule.counted_seconds ||
                0
              ),


            scrobbles:
              Number(
                capsule.total_scrobbles ||
                0
              ),


            topArtist:
              topArtist?.artist_name ||
              '',


            topArtistPlays:
              Number(
                topArtist?.plays ||
                0
              ),


            topTrack:
              topTrack?.track_name ||
              '',


            topTrackArtist:
              topTrack?.artist_name ||
              '',


            topTrackPlays:
              Number(
                topTrack?.plays ||
                0
              ),


            updatedAt:
              capsule.updated_at
          };
        }
      )

      .filter(
        Boolean
      )

      .sort(
        (
          a,
          b
        ) =>
          b.countedSeconds -
          a.countedSeconds ||

          b.scrobbles -
          a.scrobbles
      );


  return {
    monthKey:
      range.key,

    rows,

    updatedAt:
      new Date()
        .toISOString()
  };
}


/* =========================================================
   API
========================================================= */

async function handleApi(
  req,
  res,
  url
) {

  try {

    /* HEALTH */

    if (
      url.pathname ===
      '/api/health'
    ) {

      let supabaseOk =
        false;


      if (
        isSupabaseConfigured()
      ) {

        supabaseOk =
          await supabasePing()
            .catch(
              () => false
            );
      }


      return sendJson(
        res,
        200,
        {
          ok:
            true,

          lastfmConfigured:
            isLastfmConfigured(),

          supabaseConfigured:
            isSupabaseConfigured(),

          supabaseOk,

          version:
            '2.0-supabase'
        }
      );
    }


    /* GET PERFIL */

    if (
      url.pathname ===
        '/api/profile' &&

      req.method ===
        'GET'
    ) {

      const spotifyId =
        cleanName(
          url.searchParams.get(
            'spotifyId'
          )
        );


      return sendJson(
        res,
        200,
        {
          profile:
            spotifyId
              ? await getProfile(
                  spotifyId
                )
              : null
        }
      );
    }


    /* SALVA PERFIL */

    if (
      url.pathname ===
        '/api/profile' &&

      req.method ===
        'POST'
    ) {

      const body =
        await readBody(
          req
        );


      const profile =
        await upsertProfile(
          body
        );


      return sendJson(
        res,
        200,
        {
          profile
        }
      );
    }


    /* DESVINCULA LAST.FM */

    if (
      url.pathname ===
        '/api/profile/unlink' &&

      req.method ===
        'POST'
    ) {

      const body =
        await readBody(
          req
        );


      await unlinkProfile(
        cleanName(
          body.spotifyId
        )
      );


      return sendJson(
        res,
        200,
        {
          ok:
            true
        }
      );
    }


    /* HISTÓRICO MENSAL */

    if (
      url.pathname ===
      '/api/monthly-history'
    ) {

      const spotifyId =
        cleanName(
          url.searchParams.get(
            'spotifyId'
          )
        );


      if (
        !spotifyId
      ) {

        return sendJson(
          res,
          400,
          {
            error:
              'Spotify ID ausente.'
          }
        );
      }


      return sendJson(
        res,
        200,
        {
          history:
            await getMonthlyHistory(
              spotifyId
            )
        }
      );
    }


    /* VALIDA LAST.FM */

    if (
      url.pathname ===
      '/api/lastfm/validate'
    ) {

      const username =
        cleanName(
          url.searchParams.get(
            'username'
          )
        );


      if (
        !username
      ) {

        return sendJson(
          res,
          400,
          {
            error:
              'Digite um usuário do Last.fm.'
          }
        );
      }


      return sendJson(
        res,
        200,
        {
          user:
            await validateLastfmUser(
              username
            )
        }
      );
    }


    /* CÁPSULA */

    if (
      url.pathname ===
      '/api/capsule'
    ) {

      const username =
        cleanName(
          url.searchParams.get(
            'username'
          )
        );


      if (
        !username
      ) {

        return sendJson(
          res,
          400,
          {
            error:
              'Last.fm não conectado.'
          }
        );
      }


      const tzOffset =
        Number(
          url.searchParams.get(
            'tzOffset'
          ) ||
          0
        );


      const force =
        url.searchParams.get(
          'force'
        ) ===
        '1';


      return sendJson(
        res,
        200,
        {
          capsule:
            await computeCapsule(
              username,
              tzOffset,
              force
            )
        }
      );
    }


    /* TOCANDO AGORA LAST.FM */

    if (
      url.pathname ===
      '/api/now-playing'
    ) {

      const username =
        cleanName(
          url.searchParams.get(
            'username'
          )
        );


      if (
        !username
      ) {

        return sendJson(
          res,
          400,
          {
            error:
              'Last.fm não conectado.'
          }
        );
      }


      return sendJson(
        res,
        200,
        {
          nowPlaying:
            await fetchNowPlaying(
              username
            )
        }
      );
    }


    /* RANKING */

    if (
      url.pathname ===
      '/api/ranking'
    ) {

      const tzOffset =
        Number(
          url.searchParams.get(
            'tzOffset'
          ) ||
          0
        );


      const force =
        url.searchParams.get(
          'force'
        ) ===
        '1';


      return sendJson(
        res,
        200,
        {
          ranking:
            await buildRanking(
              tzOffset,
              force
            )
        }
      );
    }


    /* =====================================================
       BASE MANUAL

       POST:

       {
         "spotifyId": "ID_DO_USUARIO",
         "monthKey": "2026-09",
         "baseMinutes": 253,
         "capturedAt": "2026-09-04T21:00:00-03:00"
       }
    ===================================================== */

    if (
      url.pathname ===
        '/api/baseline' &&

      req.method ===
        'GET'
    ) {

      const spotifyId =
        cleanName(
          url.searchParams.get(
            'spotifyId'
          )
        );


      const monthKey =
        cleanName(
          url.searchParams.get(
            'monthKey'
          )
        );


      if (
        !spotifyId ||
        !monthKey
      ) {

        return sendJson(
          res,
          400,
          {
            error:
              'spotifyId e monthKey são obrigatórios.'
          }
        );
      }


      return sendJson(
        res,
        200,
        {
          baseline:
            await getBaselineBySpotifyId(
              spotifyId,
              monthKey
            )
        }
      );
    }


    if (
      url.pathname ===
        '/api/baseline' &&

      req.method ===
        'POST'
    ) {

      const body =
        await readBody(
          req
        );


      return sendJson(
        res,
        200,
        {
          baseline:
            await saveBaseline(
              body
            )
        }
      );
    }


    if (
      url.pathname ===
        '/api/baseline' &&

      req.method ===
        'DELETE'
    ) {

      const body =
        await readBody(
          req
        );


      const spotifyId =
        cleanName(
          body.spotifyId
        );


      const monthKey =
        cleanName(
          body.monthKey
        );


      if (
        !spotifyId ||
        !monthKey
      ) {

        return sendJson(
          res,
          400,
          {
            error:
              'spotifyId e monthKey são obrigatórios.'
          }
        );
      }


      await deleteBaseline(
        spotifyId,
        monthKey
      );


      return sendJson(
        res,
        200,
        {
          ok:
            true
        }
      );
    }


    return sendJson(
      res,
      404,
      {
        error:
          'API não encontrada.'
      }
    );

  } catch (
    error
  ) {

    console.error(
      '[API]',
      error
    );


    if (
      error.code ===
        'LASTFM_NOT_CONFIGURED' ||

      error.message ===
        'LASTFM_NOT_CONFIGURED'
    ) {

      return sendJson(
        res,
        503,
        {
          error:
            'Configure sua API Key do Last.fm em server.config.json.'
        }
      );
    }


    if (
      error.code ===
        'SUPABASE_NOT_CONFIGURED' ||

      error.message ===
        'SUPABASE_NOT_CONFIGURED'
    ) {

      return sendJson(
        res,
        503,
        {
          error:
            'Configure supabaseUrl e supabaseSecretKey em server.config.json.'
        }
      );
    }


    const status =
      error.lastfmCode ===
        6
        ? 400

        : error.lastfmCode ===
          29
          ? 429

          : error.supabaseStatus ===
            409
            ? 409

            : 500;


    return sendJson(
      res,
      status,
      {
        error:
          error.message ||
          'Erro interno.'
      }
    );
  }
}


/* =========================================================
   SEGURANÇA DOS ARQUIVOS
========================================================= */

function isPrivateStaticPath(
  requested
) {

  const path =
    String(
      requested ||
      ''
    ).toLowerCase();


  return (
    path ===
      '/server.config.json' ||

    path ===
      '/.env' ||

    path.startsWith(
      '/.git/'
    ) ||

    path.startsWith(
      '/data/'
    ) ||

    path.includes(
      '/node_modules/'
    )
  );
}


/* =========================================================
   SERVIDOR
========================================================= */

createServer(
  async (
    req,
    res
  ) => {

    try {

      const url =
        new URL(
          req.url,

          `http://${
            req.headers.host ||
            '127.0.0.1'
          }`
        );


      if (
        url.pathname.startsWith(
          '/api/'
        )
      ) {

        return await handleApi(
          req,
          res,
          url
        );
      }


      const requested =
        url.pathname ===
        '/'
          ? '/index.html'
          : decodeURIComponent(
              url.pathname
            );


      /*
        MUITO IMPORTANTE:

        bloqueia a pessoa de abrir:

        /server.config.json

        porque lá está a chave
        secreta do Supabase.
      */

      if (
        isPrivateStaticPath(
          requested
        )
      ) {

        res.writeHead(
          404,
          {
            'Content-Type':
              'text/plain; charset=utf-8'
          }
        );


        return res.end(
          'Not found'
        );
      }


      const relative =
        requested.replace(
          /^\/+/,
          ''
        );


      const filePath =
        normalize(
          join(
            ROOT,
            relative
          )
        );


      const safeRoot =
        ROOT.endsWith(
          sep
        )
          ? ROOT
          : ROOT +
            sep;


      if (
        filePath !==
          ROOT &&

        !filePath.startsWith(
          safeRoot
        )
      ) {

        throw new Error(
          'Invalid path'
        );
      }


      const data =
        await readFile(
          filePath
        );


      res.writeHead(
        200,
        {
          'Content-Type':
            MIME_TYPES[
              extname(
                filePath
              )
                .toLowerCase()
            ] ||
            'application/octet-stream',

          'Cache-Control':
            'no-store'
        }
      );


      res.end(
        data
      );

    } catch {

      res.writeHead(
        404,
        {
          'Content-Type':
            'text/plain; charset=utf-8'
        }
      );


      res.end(
        'Not found'
      );
    }
  }
)
.listen(
  PORT,
  HOST,
  () => {

    console.log(
      `Guessify rodando em http://${HOST}:${PORT}`
    );


    console.log(
      isLastfmConfigured()
        ? 'Last.fm API: OK'
        : 'Last.fm API: configure server.config.json.'
    );


    console.log(
      isSupabaseConfigured()
        ? 'Supabase: configurado'
        : 'Supabase: configure supabaseUrl e supabaseSecretKey.'
    );
  }
);