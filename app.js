const cfg = window.GUESSIFY_CONFIG || {};
const API = 'https://api.spotify.com/v1';
const ACCOUNTS = 'https://accounts.spotify.com';

const CLIP_STAGES = [0.5, 1, 1.5, 2, 3, 6];
const STAGE_POINTS = [1000, 850, 700, 550, 400, 250];

const RANDOM_SNIPPETS = true;
const RANDOM_SNIPPET_MIN_MS = 12000;
const RANDOM_SNIPPET_END_PADDING_MS = 10000;

const REQUIRED_SCOPES = [
  'streaming',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-library-read',
  'playlist-read-private'
].join(' ');


const $ = (s) =>
  document.querySelector(s);


const els = {
  landing: $('#landingView'),
  setup: $('#setupView'),
  capsule: $('#capsuleView'),
  ranking: $('#rankingView'),
  game: $('#gameView'),
  finish: $('#finishView'),

  mainNav: $('#mainNav'),
  navPlay: $('#navPlay'),
  navCapsule: $('#navCapsule'),
  navRanking: $('#navRanking'),

  publicPlay: $('#publicPlayButton'),
  connect: $('#connectButton'),
  demo: $('#demoButton'),
  logout: $('#logoutButton'),
  brand: $('#brandButton'),

  publicImportCard: $('#publicImportCard'),
  publicPlaylistName: $('#publicPlaylistName'),
  publicSpotifyUrl: $('#publicSpotifyUrl'),
  publicPlaylistText: $('#publicPlaylistText'),
  publicImport: $('#publicImportButton'),
  publicImportStatus: $('#publicImportStatus'),
  spotifySources: $('#spotifySources'),

  userChip: $('#userChip'),
  playlistGrid: $('#playlistGrid'),
  playlistStatus: $('#playlistStatus'),
  liked: $('#likedSongsButton'),

  streak: $('#streakValue'),
  score: $('#scoreValue'),
  sourceLabel: $('#sourceLabel'),
  round: $('#roundValue'),
  roundTotal: $('#roundTotal'),

  play: $('#playButton'),
  playIcon: $('#playIcon'),
  waveform: $('#waveform'),
  clipCurrent: $('#clipCurrent'),
  clipLimit: $('#clipLimit'),
  stages: $('#stages'),

  answer: $('#answerInput'),
  answerScope: $('#answerScope'),
  clearAnswer: $('#clearAnswer'),
  suggestions: $('#suggestions'),
  submit: $('#submitAnswer'),
  skip: $('#skipButton'),
  attempts: $('#attempts'),
  pointsPreview: $('#pointsPreview'),

  coverShell: $('#coverShell'),
  revealCover: $('#revealCover'),
  revealMeta: $('#revealMeta'),
  resultBadge: $('#resultBadge'),
  revealTitle: $('#revealTitle'),
  revealArtist: $('#revealArtist'),
  spotifyLink: $('#spotifyLink'),

  roundFooter: $('#roundFooter'),
  roundMessage: $('#roundMessage'),
  roundPoints: $('#roundPoints'),
  next: $('#nextButton'),

  finishScore: $('#finishScore'),
  finishHits: $('#finishHits'),
  finishBestStreak: $('#finishBestStreak'),
  finishAccuracy: $('#finishAccuracy'),

  playAgain: $('#playAgainButton'),
  changeSource: $('#changeSourceButton'),

  toast: $('#toast'),

  capsuleConnect: $('#capsuleConnect'),
  capsuleDashboard: $('#capsuleDashboard'),
  capsuleRefresh: $('#capsuleRefresh'),

  lastfmUsername: $('#lastfmUsername'),
  linkLastfm: $('#linkLastfmButton'),
  unlinkLastfm: $('#unlinkLastfmButton'),
  lastfmConfigHint: $('#lastfmConfigHint'),

  capsuleAvatar: $('#capsuleAvatar'),
  capsuleUserName: $('#capsuleUserName'),
  capsuleUserHandle: $('#capsuleUserHandle'),
  capsuleUpdated: $('#capsuleUpdated'),
  capsuleMonthLabel: $('#capsuleMonthLabel'),

  nowPlayingCard: $('#nowPlayingCard'),
  nowPlayingCover: $('#nowPlayingCover'),
  nowPlayingTitle: $('#nowPlayingTitle'),
  nowPlayingArtist: $('#nowPlayingArtist'),

  capsuleMinutes: $('#capsuleMinutes'),
  capsuleScrobbles: $('#capsuleScrobbles'),
  capsuleUniqueTracks: $('#capsuleUniqueTracks'),
  capsuleUniqueArtists: $('#capsuleUniqueArtists'),
  capsuleDays: $('#capsuleDays'),

  topTracksList: $('#topTracksList'),
  topArtistsList: $('#topArtistsList'),

  rankingRefresh: $('#rankingRefresh'),
  rankingMonth: $('#rankingMonth'),
  rankingPeople: $('#rankingPeople'),
  rankingUpdated: $('#rankingUpdated'),
  rankingLoading: $('#rankingLoading'),
  rankingList: $('#rankingList'),
  rankingEmpty: $('#rankingEmpty')
};


const state = {
  accessToken: null,
  refreshToken: null,
  tokenExpiresAt: 0,

  player: null,
  deviceId: null,

  profile: null,

  source: null,
  tracks: [],
  queue: [],
  current: null,

  selectedAnswer: null,

  stage: 0,
  roundIndex: 0,

  score: 0,
  streak: 0,
  bestStreak: 0,
  hits: 0,

  attempts: [],

  resolved: false,
  playing: false,

  playTimer: null,
  progressTimer: null,

  clipStartedAt: 0,

  demo: false,

  playerError: null,
  playerReadyWaiters: [],

  connectPromise: null,

  playbackDeviceId: null,

  externalDeviceId: null,
  externalDeviceName: null,

  playerConnectResult: null,

  webPlayerUnavailableUntil: 0,

  devicesCache: [],
  devicesCacheAt: 0,

  currentTargetKind: null,
  currentTargetName: null,

  warmingPlayer: false,

  clipStartMs: 0,

  publicUserId: null,
  publicAudio: null,
  publicImportLoading: false,

  lastfmUser: null,

  capsulePollTimer: null,

  nowPlayingTimer: null,
  nowPlayingProgressTimer: null,

  nowPlayingTrack: null,
  nowPlayingFetchInFlight: false,

  rankingPollTimer: null,

  capsuleLoading: false,
  rankingLoading: false
};


let searchTimer;
let toastTimer;


init();


async function init() {
  buildWaveform();

  renderStages();

  els.roundTotal.textContent =
    cfg.roundsPerGame || 10;

  state.publicUserId =
    getOrCreatePublicUserId();

  state.publicAudio =
    new Audio();

  state.publicAudio.preload =
    'auto';

  bindEvents();


  const handled =
    await handleOAuthCallback();


  restoreTokens();


  if (
    hasValidConfig() &&
    (
      state.accessToken ||
      handled
    )
  ) {
    try {
      await ensureToken();

      await bootstrapSpotify();

    } catch (err) {
      console.error(err);

      toast(
        'O Spotify Beta não conseguiu restaurar a sessão. O modo público continua disponível.',
        true
      );

      clearTokens();
    }
  }


  await restoreLastfmProfile();


  if (
    state.accessToken &&
    state.profile
  ) {
    showView('setup');

  } else {
    showView('landing');
  }
}


function bindEvents() {
  els.publicPlay.addEventListener(
    'click',
    () => showView('setup')
  );


  els.publicImport.addEventListener(
    'click',
    importPublicPlaylist
  );


  els.connect.addEventListener(
    'click',
    loginSpotify
  );


  els.demo.addEventListener(
    'click',
    startDemo
  );


  els.navPlay.addEventListener(
    'click',
    () => showView('setup')
  );


  els.navCapsule.addEventListener(
    'click',
    openCapsule
  );


  els.navRanking.addEventListener(
    'click',
    openRanking
  );


  els.linkLastfm.addEventListener(
    'click',
    linkLastfmProfile
  );


  els.unlinkLastfm.addEventListener(
    'click',
    unlinkLastfmProfile
  );


  els.capsuleRefresh.addEventListener(
    'click',
    () => loadCapsule(true)
  );


  els.rankingRefresh.addEventListener(
    'click',
    () => loadRanking(true)
  );


  els.lastfmUsername.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter') {
        linkLastfmProfile();
      }
    }
  );


  els.logout.addEventListener(
    'click',
    () => {
      clearTokens();
      location.reload();
    }
  );


  els.brand.addEventListener(
    'click',
    () => showView('landing')
  );


  els.liked.addEventListener(
    'click',
    () =>
      loadSource({
        type: 'liked',
        name: 'Músicas Curtidas'
      })
  );


  els.play.addEventListener(
    'click',
    playClip
  );


  els.skip.addEventListener(
    'click',
    skipAttempt
  );


  els.submit.addEventListener(
    'click',
    submitAnswer
  );


  els.next.addEventListener(
    'click',
    nextRound
  );


  els.playAgain.addEventListener(
    'click',
    () =>
      startGame(
        state.source,
        [...state.tracks]
      )
  );


  els.changeSource.addEventListener(
    'click',
    () =>
      showView('setup')
  );


  els.answer.addEventListener(
    'input',
    onAnswerInput
  );


  els.answer.addEventListener(
    'keydown',
    (e) => {
      if (
        e.key === 'Enter' &&
        !els.submit.disabled
      ) {
        submitAnswer();
      }
    }
  );


  els.clearAnswer.addEventListener(
    'click',
    clearAnswer
  );


  document.addEventListener(
    'click',
    (e) => {
      if (
        !e.target.closest(
          '.answer-card'
        )
      ) {
        els.suggestions
          .classList
          .add('hidden');
      }
    }
  );
}


function showView(name) {
  stopPlayback();

  clearLiveTimers();


  [
    'landing',
    'setup',
    'capsule',
    'ranking',
    'game',
    'finish'
  ].forEach(
    key => {
      els[key]
        .classList
        .toggle(
          'hidden',
          key !== name
        );
    }
  );


  const logged =
    !!state.accessToken;


  els.logout
    .classList
    .toggle(
      'hidden',
      !logged
    );


  /*
    Navegação agora também funciona
    no modo público.
  */

  els.mainNav
    .classList
    .remove('hidden');


  els.spotifySources
    ?.classList
    .toggle(
      'hidden',
      !logged
    );


  els.userChip.textContent =
    logged
      ? `♪ ${
          state.profile
            ?.display_name ||
          'Spotify Beta'
        }`
      : '🌐 Modo público';


  els.navPlay
    .classList
    .toggle(
      'active',
      [
        'setup',
        'game',
        'finish'
      ].includes(name)
    );


  els.navCapsule
    .classList
    .toggle(
      'active',
      name === 'capsule'
    );


  els.navRanking
    .classList
    .toggle(
      'active',
      name === 'ranking'
    );


  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}


function hasValidConfig() {
  return (
    cfg.spotifyClientId &&
    !cfg.spotifyClientId
      .includes('COLE_') &&
    cfg.redirectUri
  );
}


function getOrCreatePublicUserId() {
  const storageKey =
    'guessify_public_user_id';


  let value =
    localStorage.getItem(
      storageKey
    );


  if (value) {
    return value;
  }


  const id =
    typeof crypto.randomUUID ===
      'function'
      ? crypto.randomUUID()
      : randomString(32);


  value =
    `public-${id}`;


  localStorage.setItem(
    storageKey,
    value
  );


  return value;
}


function getProfileKey() {
  return (
    state.profile?.id ||
    state.publicUserId ||
    getOrCreatePublicUserId()
  );
}


function getProfileDisplayName() {
  return (
    state.profile
      ?.display_name ||
    state.lastfmUser ||
    'Usuário Guessify'
  );
}


function setPublicImportStatus(
  text,
  kind = ''
) {
  if (
    !els.publicImportStatus
  ) {
    return;
  }


  els.publicImportStatus.textContent =
    text;


  els.publicImportStatus
    .classList
    .toggle(
      'success',
      kind === 'success'
    );


  els.publicImportStatus
    .classList
    .toggle(
      'error',
      kind === 'error'
    );
}


async function loginSpotify() {
  if (!hasValidConfig()) {
    toast(
      'Primeiro cole seu Client ID no arquivo config.js.',
      true
    );

    return;
  }


  const verifier =
    randomString(64);


  const challenge =
    await sha256Base64Url(
      verifier
    );


  const oauthState =
    randomString(24);


  localStorage.setItem(
    'guessify_verifier',
    verifier
  );


  localStorage.setItem(
    'guessify_oauth_state',
    oauthState
  );


  const url =
    new URL(
      `${ACCOUNTS}/authorize`
    );


  url.search =
    new URLSearchParams({
      client_id:
        cfg.spotifyClientId,

      response_type:
        'code',

      redirect_uri:
        cfg.redirectUri,

      scope:
        REQUIRED_SCOPES,

      code_challenge_method:
        'S256',

      code_challenge:
        challenge,

      state:
        oauthState,

      show_dialog:
        'true'
    });


  location.href =
    url.toString();
}


async function handleOAuthCallback() {
  const params =
    new URLSearchParams(
      location.search
    );


  const code =
    params.get('code');


  const returnedState =
    params.get('state');


  const error =
    params.get('error');


  if (error) {
    history.replaceState(
      {},
      '',
      location.pathname
    );


    toast(
      `Spotify: ${error}`,
      true
    );


    return false;
  }


  if (!code) {
    return false;
  }


  const verifier =
    localStorage.getItem(
      'guessify_verifier'
    );


  const expectedState =
    localStorage.getItem(
      'guessify_oauth_state'
    );


  if (
    !verifier ||
    !returnedState ||
    returnedState !==
      expectedState
  ) {
    history.replaceState(
      {},
      '',
      location.pathname
    );


    toast(
      'Falha ao validar o login do Spotify.',
      true
    );


    return false;
  }


  const response =
    await fetch(
      `${ACCOUNTS}/api/token`,
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded'
        },

        body:
          new URLSearchParams({
            client_id:
              cfg.spotifyClientId,

            grant_type:
              'authorization_code',

            code,

            redirect_uri:
              cfg.redirectUri,

            code_verifier:
              verifier
          })
      }
    );


  if (!response.ok) {
    throw new Error(
      `Token exchange failed: ${response.status}`
    );
  }


  const token =
    await response.json();


  saveTokens(token);


  localStorage.removeItem(
    'guessify_verifier'
  );


  localStorage.removeItem(
    'guessify_oauth_state'
  );


  history.replaceState(
    {},
    '',
    location.pathname
  );


  return true;
}


function saveTokens(token) {
  state.accessToken =
    token.access_token;


  state.refreshToken =
    token.refresh_token ||
    state.refreshToken;


  state.tokenExpiresAt =
    Date.now() +
    (
      token.expires_in ||
      3600
    ) *
    1000 -
    30000;


  localStorage.setItem(
    'guessify_access_token',
    state.accessToken
  );


  if (
    state.refreshToken
  ) {
    localStorage.setItem(
      'guessify_refresh_token',
      state.refreshToken
    );
  }


  localStorage.setItem(
    'guessify_expires_at',
    String(
      state.tokenExpiresAt
    )
  );
}


function restoreTokens() {
  state.accessToken =
    state.accessToken ||
    localStorage.getItem(
      'guessify_access_token'
    );


  state.refreshToken =
    state.refreshToken ||
    localStorage.getItem(
      'guessify_refresh_token'
    );


  state.tokenExpiresAt =
    state.tokenExpiresAt ||
    Number(
      localStorage.getItem(
        'guessify_expires_at'
      ) ||
      0
    );
}


function clearTokens() {
  stopPlayback();


  [
    'guessify_access_token',
    'guessify_refresh_token',
    'guessify_expires_at',
    'guessify_verifier',
    'guessify_oauth_state'
  ].forEach(
    key =>
      localStorage.removeItem(
        key
      )
  );


  state.accessToken =
    null;

  state.refreshToken =
    null;

  state.tokenExpiresAt =
    0;


  if (state.player) {
    state.player.disconnect();
  }
}


async function ensureToken() {
  restoreTokens();


  if (
    state.accessToken &&
    Date.now() <
      state.tokenExpiresAt
  ) {
    return state.accessToken;
  }


  if (!state.refreshToken) {
    throw new Error(
      'No refresh token'
    );
  }


  const response =
    await fetch(
      `${ACCOUNTS}/api/token`,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded'
        },

        body:
          new URLSearchParams({
            client_id:
              cfg.spotifyClientId,

            grant_type:
              'refresh_token',

            refresh_token:
              state.refreshToken
          })
      }
    );


  if (!response.ok) {
    throw new Error(
      `Refresh failed: ${response.status}`
    );
  }


  const token =
    await response.json();


  saveTokens(token);


  return state.accessToken;
}


async function spotifyFetch(
  path,
  options = {}
) {
  const token =
    await ensureToken();


  const response =
    await fetch(
      `${API}${path}`,
      {
        ...options,

        headers: {
          Authorization:
            `Bearer ${token}`,

          ...(
            options.body
              ? {
                  'Content-Type':
                    'application/json'
                }
              : {}
          ),

          ...(
            options.headers ||
            {}
          )
        }
      }
    );


  if (
    response.status ===
    204
  ) {
    return null;
  }


  if (
    response.status ===
    429
  ) {
    throw new Error(
      'Spotify quota/rate limit atingido. Tente de novo depois.'
    );
  }


  if (!response.ok) {
    const text =
      await response.text();


    throw new Error(
      `Spotify ${response.status}: ${text}`
    );
  }


  return response.json();
}


async function bootstrapSpotify() {
  const [
    profile,
    playlists
  ] =
    await Promise.all([
      spotifyFetch('/me'),

      spotifyFetch(
        '/me/playlists?limit=20'
      )
    ]);


  state.profile =
    profile;


  els.userChip.textContent =
    `♪ ${
      profile.display_name ||
      'Spotify'
    }`;


  renderPlaylists(
    playlists?.items ||
    []
  );


  if (
    profile.product &&
    profile.product !==
      'premium'
  ) {
    state.playerError =
      'PREMIUM_REQUIRED';


    console.warn(
      '[Guessify] Conta sem Premium. product =',
      profile.product
    );


    toast(
      'Sua conta Spotify não está como Premium. O catálogo funciona, mas a reprodução do jogo exige Premium.',
      true
    );


    return;
  }


  warmSpotifyPlayback();
}


function renderPlaylists(
  playlists
) {
  els.playlistGrid.innerHTML =
    '';


  const usable =
    playlists.filter(
      playlist =>
        playlist &&
        playlist.id
    );


  els.playlistStatus.textContent =
    usable.length
      ? `${usable.length} encontradas`
      : 'Nenhuma disponível';


  usable.forEach(
    playlist => {
      const button =
        document.createElement(
          'button'
        );


      button.className =
        'playlist-card';


      const image =
        playlist
          .images
          ?.[0]
          ?.url ||
        '';


      button.innerHTML =
        `
          ${
            image
              ? `
                  <img
                    class="playlist-cover"
                    src="${escapeAttr(image)}"
                    alt=""
                  >
                `
              : `
                  <div
                    class="playlist-cover"
                  ></div>
                `
          }

          <strong>
            ${escapeHtml(
              playlist.name
            )}
          </strong>

          <span>
            ${
              playlist.items?.total ??
              playlist.tracks?.total ??
              ''
            } músicas
          </span>
        `;


      button.addEventListener(
        'click',
        () =>
          loadSource({
            type:
              'playlist',

            id:
              playlist.id,

            name:
              playlist.name
          })
      );


      els.playlistGrid
        .appendChild(
          button
        );
    }
  );
}


async function loadSource(source) {
  try {
    toast(
      'Montando sua partida...'
    );


    let tracks = [];


    if (
      source.type ===
      'liked'
    ) {
      const data =
        await spotifyFetch(
          '/me/tracks?limit=50'
        );


      tracks =
        (
          data?.items ||
          []
        )
          .map(
            item =>
              item.track
          )
          .filter(
            validTrack
          );

    } else {
      const data =
        await spotifyFetch(
          `/playlists/${
            encodeURIComponent(
              source.id
            )
          }/items?limit=50`
        );


      tracks =
        (
          data?.items ||
          []
        )
          .map(
            item =>
              item.item ||
              item.track
          )
          .filter(
            validTrack
          );
    }


    if (
      tracks.length <
      2
    ) {
      throw new Error(
        'Essa fonte precisa ter pelo menos 2 músicas disponíveis.'
      );
    }


    startGame(
      source,
      tracks
    );

  } catch (err) {
    console.error(err);


    toast(
      err.message ||
      'Não consegui carregar essa playlist.',
      true
    );
  }
}


function parsePublicLines(
  raw
) {
  const lines =
    String(
      raw ||
      ''
    )
      .split(/\r?\n/)
      .map(
        line =>
          line
            .replace(
              /^\s*\d+[\s.)-]+/,
              ''
            )
            .trim()
      )
      .filter(Boolean);


  return [
    ...new Set(
      lines
    )
  ].slice(
    0,
    40
  );
}


async function importPublicPlaylist() {
  if (
    state.publicImportLoading
  ) {
    return;
  }


  const lines =
    parsePublicLines(
      els.publicPlaylistText.value
    );


  if (
    lines.length <
    2
  ) {
    setPublicImportStatus(
      'Cole pelo menos 2 músicas, uma por linha.',
      'error'
    );

    toast(
      'Cole pelo menos 2 músicas para montar a partida.',
      true
    );

    return;
  }


  state.publicImportLoading =
    true;


  els.publicImport.disabled =
    true;


  const original =
    els.publicImport.textContent;


  els.publicImport.textContent =
    'PROCURANDO PRÉVIAS...';


  setPublicImportStatus(
    `Procurando prévias para ${lines.length} música(s)...`
  );


  try {
    const data =
      await apiFetch(
        '/api/public/resolve-tracks',
        {
          method:
            'POST',

          body:
            JSON.stringify({
              lines,

              spotifyUrl:
                els.publicSpotifyUrl
                  .value
                  .trim()
            })
        }
      );


    const tracks =
      (
        data.tracks ||
        []
      ).filter(
        track =>
          validPublicTrack(
            track
          )
      );


    if (
      tracks.length <
      2
    ) {
      throw new Error(
        'Não encontrei prévias suficientes. Tente usar “Música | Artista” em cada linha.'
      );
    }


    const playlistName =
      els.publicPlaylistName
        .value
        .trim() ||
      'Minha Playlist';


    setPublicImportStatus(
      `${tracks.length} músicas prontas${
        data.unmatched?.length
          ? ` · ${data.unmatched.length} não encontradas`
          : ''
      }`,
      'success'
    );


    toast(
      `${tracks.length} músicas prontas. Boa partida!`
    );


    startGame(
      {
        type:
          'public',

        name:
          playlistName,

        spotifyUrl:
          els.publicSpotifyUrl
            .value
            .trim() ||
          ''
      },

      tracks
    );

  } catch (err) {
    console.error(
      '[Guessify] Importação pública:',
      err
    );


    setPublicImportStatus(
      err.message ||
      'Não consegui montar essa playlist.',
      'error'
    );


    toast(
      err.message ||
      'Não consegui montar essa playlist.',
      true
    );

  } finally {
    state.publicImportLoading =
      false;


    els.publicImport.disabled =
      false;


    els.publicImport.textContent =
      original;
  }
}


function validPublicTrack(
  track
) {
  return (
    track &&
    track.type ===
      'track' &&
    track.preview_url &&
    track.name &&
    track.artists?.length
  );
}


function validTrack(track) {
  return (
    track &&
    track.type ===
      'track' &&
    track.uri &&
    !track.is_local &&
    track.name &&
    track.artists?.length
  );
}


function startGame(
  source,
  tracks
) {
  state.demo =
    false;


  state.source =
    source;


  state.tracks =
    tracks;


  els.answerScope.textContent =
    (
      source.type ===
        'playlist' ||
      source.type ===
        'public'
    )
      ? 'SÓ DESTA PLAYLIST'
      : 'SÓ DESTA SELEÇÃO';


  els.answer.placeholder =
    (
      source.type ===
        'playlist' ||
      source.type ===
        'public'
    )
      ? 'Digite uma música desta playlist...'
      : 'Digite música ou artista...';


  if (
    source.type !==
      'public'
  ) {
    warmSpotifyPlayback();
  }


  state.queue =
    shuffle(
      [...tracks]
    ).slice(
      0,

      Math.min(
        cfg.roundsPerGame ||
        10,

        tracks.length
      )
    );


  state.roundIndex = 0;

  state.score = 0;

  state.streak = 0;

  state.bestStreak = 0;

  state.hits = 0;


  els.score.textContent =
    '0';


  els.streak.textContent =
    '0';


  els.sourceLabel.textContent =
    source.name.toUpperCase();


  els.roundTotal.textContent =
    state.queue.length;


  showView('game');


  prepareRound();
}


function prepareRound() {
  stopPlayback();


  state.current =
    state.queue[
      state.roundIndex
    ];


  state.clipStartMs =
    chooseClipStartMs(
      state.current
    );


  console.log(
    '[Guessify] Trecho aleatório:',
    state.current?.name,
    formatAbsolutePosition(
      state.clipStartMs
    )
  );


  state.stage =
    0;


  state.selectedAnswer =
    null;


  state.attempts =
    [];


  state.resolved =
    false;


  els.round.textContent =
    state.roundIndex + 1;


  els.answer.value =
    '';


  els.submit.disabled =
    true;


  els.clearAnswer
    .classList
    .add('hidden');


  els.suggestions
    .classList
    .add('hidden');


  els.attempts.innerHTML =
    '';


  els.roundFooter
    .classList
    .add('hidden');


  els.revealMeta
    .classList
    .add('hidden');


  els.revealCover
    .classList
    .add('hidden');


  $('.mystery-cover')
    .classList
    .remove('hidden');


  els.play
    .classList
    .remove('hidden');


  els.stages
    .classList
    .remove('hidden');


  els.answer.disabled =
    false;


  els.skip.disabled =
    false;


  updateStageUI();
}


async function initPlayer({
  connect = true
} = {}) {
  if (!window.Spotify) {
    await waitForSpotifySdk();
  }


  if (!state.player) {
    state.player =
      new Spotify.Player({
        name:
          'Guessify Web Player',


        getOAuthToken:
          callback => {
            ensureToken()
              .then(
                token =>
                  callback(token)
              )
              .catch(
                err => {
                  console.error(
                    '[Guessify] Falha ao entregar token ao SDK:',
                    err
                  );


                  state.playerError =
                    `Falha de autenticação: ${
                      err.message ||
                      err
                    }`;


                  rejectPlayerWaiters(
                    err
                  );
                }
              );
          },


        volume:
          0.75
      });


    state.player.addListener(
      'ready',

      async ({
        device_id
      }) => {
        console.log(
          '[Guessify] Spotify player pronto:',
          device_id
        );


        state.deviceId =
          device_id;


        state.playbackDeviceId =
          device_id;


        state.externalDeviceId =
          null;


        state.externalDeviceName =
          null;


        state.playerError =
          null;


        resolvePlayerWaiters(
          device_id
        );


        try {
          await spotifyFetch(
            '/me/player',
            {
              method:
                'PUT',

              body:
                JSON.stringify({
                  device_ids: [
                    device_id
                  ],

                  play:
                    false
                })
            }
          );

        } catch (err) {
          console.warn(
            '[Guessify] Transfer playback:',
            err
          );
        }
      }
    );


    state.player.addListener(
      'not_ready',

      ({
        device_id
      }) => {
        console.warn(
          '[Guessify] Player ficou indisponível:',
          device_id
        );


        if (
          state.deviceId ===
          device_id
        ) {
          state.deviceId =
            null;
        }


        if (
          state.playbackDeviceId ===
          device_id
        ) {
          state.playbackDeviceId =
            null;
        }
      }
    );


    const playerError =
      label =>
        ({
          message
        }) => {
          const text =
            `${label}: ${message}`;


          console.error(
            '[Guessify]',
            text
          );


          state.playerError =
            text;


          rejectPlayerWaiters(
            new Error(text)
          );


          toast(
            text,
            true
          );
        };


    state.player.addListener(
      'initialization_error',
      playerError(
        'Player não iniciou'
      )
    );


    state.player.addListener(
      'authentication_error',
      playerError(
        'Falha de autenticação'
      )
    );


    state.player.addListener(
      'account_error',
      playerError(
        'Conta Spotify'
      )
    );


    state.player.addListener(
      'playback_error',
      playerError(
        'Erro ao reproduzir'
      )
    );


    state.player.addListener(
      'autoplay_failed',
      () => {
        console.warn(
          '[Guessify] Autoplay bloqueado pelo navegador.'
        );


        toast(
          'O navegador bloqueou o áudio. Clique em tocar novamente.',
          true
        );
      }
    );
  }


  if (connect) {
    await connectPlayer();
  }


  return state.player;
}


async function connectPlayer() {
  if (
    state.deviceId
  ) {
    return true;
  }


  if (!state.player) {
    await initPlayer({
      connect:
        false
    });
  }


  if (
    state.connectPromise
  ) {
    return state.connectPromise;
  }


  state.playerError =
    null;


  state.connectPromise =
    (
      async () => {
        const connected =
          await state.player
            .connect();


        state.playerConnectResult =
          connected;


        console.log(
          '[Guessify] player.connect():',
          connected
        );


        if (!connected) {
          throw new Error(
            'CONNECT_RETURNED_FALSE'
          );
        }


        return connected;
      }
    )();


  try {
    return await state.connectPromise;

  } finally {
    state.connectPromise =
      null;
  }
}


function waitForSpotifySdk(
  timeoutMs = 12000
) {
  if (
    window.Spotify
  ) {
    return Promise.resolve();
  }


  return new Promise(
    (
      resolve,
      reject
    ) => {
      const previous =
        window
          .onSpotifyWebPlaybackSDKReady;


      const timer =
        setTimeout(
          () =>
            reject(
              new Error(
                'O SDK do Spotify demorou para carregar.'
              )
            ),

          timeoutMs
        );


      window
        .onSpotifyWebPlaybackSDKReady =
        () => {
          clearTimeout(
            timer
          );


          if (
            typeof previous ===
            'function'
          ) {
            try {
              previous();
            } catch {}
          }


          resolve();
        };
    }
  );
}


function resolvePlayerWaiters(
  deviceId
) {
  const waiters =
    state.playerReadyWaiters
      .splice(0);


  waiters.forEach(
    ({
      resolve,
      timer
    }) => {
      clearTimeout(timer);

      resolve(
        deviceId
      );
    }
  );
}


function rejectPlayerWaiters(
  error
) {
  const waiters =
    state.playerReadyWaiters
      .splice(0);


  waiters.forEach(
    ({
      reject,
      timer
    }) => {
      clearTimeout(timer);

      reject(error);
    }
  );
}


function waitForPlayerReady(
  timeoutMs = 10000
) {
  if (
    state.deviceId
  ) {
    return Promise.resolve(
      state.deviceId
    );
  }


  if (
    state.playerError
  ) {
    return Promise.reject(
      new Error(
        state.playerError
      )
    );
  }


  return new Promise(
    (
      resolve,
      reject
    ) => {
      const timer =
        setTimeout(
          () => {
            const index =
              state
                .playerReadyWaiters
                .findIndex(
                  waiter =>
                    waiter.resolve ===
                    resolve
                );


            if (
              index >= 0
            ) {
              state
                .playerReadyWaiters
                .splice(
                  index,
                  1
                );
            }


            reject(
              new Error(
                'O navegador não registrou o dispositivo do Spotify a tempo.'
              )
            );
          },

          timeoutMs
        );


      state
        .playerReadyWaiters
        .push({
          resolve,
          reject,
          timer
        });
    }
  );
}


async function ensurePlayerReady(
  timeoutMs = 2500
) {
  if (
    state.profile?.product &&
    state.profile.product !==
      'premium'
  ) {
    throw new Error(
      'PREMIUM_REQUIRED'
    );
  }


  if (!state.player) {
    await initPlayer({
      connect:
        false
    });
  }


  if (
    state.deviceId
  ) {
    return state.deviceId;
  }


  state.playerError =
    null;


  await connectPlayer();


  return waitForPlayerReady(
    timeoutMs
  );
}


async function warmSpotifyPlayback() {
  if (
    state.warmingPlayer ||
    state.demo ||
    !state.accessToken ||
    state.profile?.product !==
      'premium'
  ) {
    return;
  }


  state.warmingPlayer =
    true;


  try {
    if (
      !state.player
    ) {
      await initPlayer({
        connect:
          false
      });
    }


    connectPlayer()
      .catch(
        err =>
          console.warn(
            '[Guessify] Pré-conexão do Web Player:',
            err
          )
      );


    getSpotifyDevices()
      .catch(
        () => {}
      );

  } catch (err) {
    console.warn(
      '[Guessify] Não consegui pré-aquecer o player:',
      err
    );

  } finally {
    state.warmingPlayer =
      false;
  }
}


async function getSpotifyDevices({
  force = false
} = {}) {
  if (
    !force &&
    state.devicesCache.length &&
    Date.now() -
      state.devicesCacheAt <
      30000
  ) {
    return state.devicesCache;
  }


  try {
    const data =
      await spotifyFetch(
        '/me/player/devices'
      );


    const devices =
      (
        data?.devices ||
        []
      ).filter(
        device =>
          device &&
          device.id
      );


    state.devicesCache =
      devices;


    state.devicesCacheAt =
      Date.now();


    return devices;

  } catch (err) {
    console.warn(
      '[Guessify] Não consegui consultar dispositivos Spotify:',
      err
    );


    return (
      state.devicesCache ||
      []
    );
  }
}


async function ensurePlayableDevice({
  forceRefresh = false
} = {}) {
  if (
    state.profile?.product &&
    state.profile.product !==
      'premium'
  ) {
    throw new Error(
      'PREMIUM_REQUIRED'
    );
  }


  if (
    state.deviceId
  ) {
    state.playbackDeviceId =
      state.deviceId;


    return {
      id:
        state.deviceId,

      kind:
        'web',

      name:
        'Guessify Web Player',

      isActive:
        true
    };
  }


  if (
    !forceRefresh &&
    state.externalDeviceId
  ) {
    return {
      id:
        state.externalDeviceId,

      kind:
        'external',

      name:
        state.externalDeviceName ||
        'Spotify',

      isActive:
        true
    };
  }


  if (
    !forceRefresh &&
    state.devicesCache.length
  ) {
    const cached =
      state.devicesCache
        .find(
          device =>
            device.is_active &&
            !device.is_restricted &&
            device.id &&
            device.id !==
              state.deviceId
        );


    if (cached) {
      state.externalDeviceId =
        cached.id;


      state.externalDeviceName =
        cached.name ||
        'Spotify';


      state.playbackDeviceId =
        cached.id;


      return {
        id:
          cached.id,

        kind:
          'external',

        name:
          cached.name ||
          'Spotify',

        isActive:
          true
      };
    }
  }


  let webErr =
    null;


  if (
    Date.now() >=
    state
      .webPlayerUnavailableUntil
  ) {
    try {
      const id =
        await ensurePlayerReady(
          1200
        );


      state.playbackDeviceId =
        id;


      return {
        id,

        kind:
          'web',

        name:
          'Guessify Web Player',

        isActive:
          true
      };

    } catch (err) {
      webErr =
        err;


      state.webPlayerUnavailableUntil =
        Date.now() +
        60000;


      console.warn(
        '[Guessify] Web Playback SDK não ficou pronto. Usando fallback por 60s.',
        err
      );
    }
  }


  const devices =
    await getSpotifyDevices({
      force:
        forceRefresh
    });


  const usable =
    devices.filter(
      device =>
        !device.is_restricted &&
        device.id &&
        device.id !==
          state.deviceId
    );


  const fallback =
    usable.find(
      device =>
        device.is_active
    ) ||
    usable[0];


  if (fallback) {
    state.externalDeviceId =
      fallback.id;


    state.externalDeviceName =
      fallback.name ||
      'Spotify';


    state.playbackDeviceId =
      fallback.id;


    return {
      id:
        fallback.id,

      kind:
        'external',

      name:
        fallback.name ||
        'Spotify',

      isActive:
        !!fallback.is_active
    };
  }


  const reason =
    String(
      webErr?.message ||
      webErr ||
      'nenhum dispositivo encontrado'
    );


  throw new Error(
    `NO_PLAYABLE_DEVICE | ${reason}`
  );
}


function friendlyPlayerError(
  err
) {
  const msg =
    String(
      err?.message ||
      err ||
      ''
    );


  if (
    /PREMIUM_REQUIRED|premium|account/i
      .test(msg)
  ) {
    return (
      'Essa conta não está como Spotify Premium. ' +
      'O login e as playlists funcionam, mas tocar músicas pelo jogo exige Premium.'
    );
  }


  if (
    /NO_PLAYABLE_DEVICE/i
      .test(msg)
  ) {
    return (
      'O navegador não virou um dispositivo Spotify e não achei outro aparelho ativo. ' +
      'Abra o Spotify no PC ou celular, dê play em qualquer música por 1 segundo, pause e tente de novo.'
    );
  }


  if (
    /eme|encrypted|protection|initialize|iniciou/i
      .test(msg)
  ) {
    return (
      'O navegador bloqueou reprodução protegida (DRM). ' +
      'Tente Chrome ou Edge e permita conteúdo protegido.'
    );
  }


  if (
    /auth|token/i
      .test(msg)
  ) {
    return (
      'O Spotify recusou a autenticação do player. ' +
      'Clique em SAIR, conecte novamente e aceite as permissões.'
    );
  }


  if (
    /403/.test(msg)
  ) {
    return (
      'O Spotify recusou o comando de reprodução (403). ' +
      'Confirme que a conta do app e a conta conectada têm Premium e estão autorizadas no app.'
    );
  }


  return (
    'Não consegui iniciar o Spotify Player. Detalhe: ' +
    msg.slice(
      0,
      180
    )
  );
}


async function playTrackOnTarget(
  target
) {
  if (
    target.kind ===
      'external' &&
    !target.isActive
  ) {
    await spotifyFetch(
      '/me/player',
      {
        method:
          'PUT',

        body:
          JSON.stringify({
            device_ids: [
              target.id
            ],

            play:
              false
          })
      }
    );


    await sleep(120);
  }


  await spotifyFetch(
    `/me/player/play?device_id=${
      encodeURIComponent(
        target.id
      )
    }`,
    {
      method:
        'PUT',

      body:
        JSON.stringify({
          uris: [
            state.current.uri
          ],

          position_ms:
            state.clipStartMs ||
            0
        })
    }
  );
}


async function playClip() {
  if (
    state.resolved ||
    state.playing
  ) {
    return;
  }


  if (state.demo) {
    animateFakeClip();
    return;
  }


  if (
    state.source?.type ===
      'public'
  ) {
    await playPublicClip();
    return;
  }


  try {
    if (
      !state.player &&
      window.Spotify
    ) {
      await initPlayer({
        connect:
          false
      });
    }


    state.player
      ?.activateElement
      ?.();

  } catch (err) {
    console.warn(
      '[Guessify] activateElement:',
      err
    );
  }


  try {
    const alreadyWarm =
      !!(
        state.deviceId ||
        state.externalDeviceId
      );


    if (!alreadyWarm) {
      toast(
        'Conectando ao Spotify...'
      );
    }


    let target =
      await ensurePlayableDevice();


    await stopPlayback();


    try {
      await playTrackOnTarget(
        target
      );

    } catch (firstErr) {
      console.warn(
        '[Guessify] Primeira tentativa falhou; renovando dispositivo:',
        firstErr
      );


      if (
        target.kind ===
        'external'
      ) {
        state.externalDeviceId =
          null;


        state.externalDeviceName =
          null;


        state.devicesCache =
          [];


        state.devicesCacheAt =
          0;

      } else {
        state.deviceId =
          null;


        state.webPlayerUnavailableUntil =
          Date.now() +
          30000;
      }


      target =
        await ensurePlayableDevice({
          forceRefresh:
            true
        });


      await playTrackOnTarget(
        target
      );
    }


    state.playing =
      true;


    state.playbackDeviceId =
      target.id;


    state.currentTargetKind =
      target.kind;


    state.currentTargetName =
      target.name;


    state.clipStartedAt =
      performance.now();


    setPlayIcon(true);


    startProgressTicker();


    state.playTimer =
      setTimeout(
        () =>
          stopPlayback(),

        CLIP_STAGES[
          state.stage
        ] *
        1000
      );

  } catch (err) {
    state.playing =
      false;


    setPlayIcon(false);


    console.error(
      '[Guessify] Falha ao tocar:',
      err
    );


    toast(
      friendlyPlayerError(
        err
      ),
      true
    );
  }
}


async function playPublicClip() {
  const previewUrl =
    state.current
      ?.preview_url;


  if (!previewUrl) {
    toast(
      'Essa música ficou sem prévia disponível.',
      true
    );

    return;
  }


  try {
    await stopPlayback();


    const audio =
      state.publicAudio ||
      new Audio();


    state.publicAudio =
      audio;


    if (
      audio.src !==
      previewUrl
    ) {
      audio.src =
        previewUrl;

      audio.preload =
        'auto';
    }


    const previewDurationMs =
      Number(
        state.current
          ?.preview_duration_ms ||
        30000
      );


    const safeMax =
      Math.max(
        0,

        previewDurationMs -
        (
          Math.max(
            ...CLIP_STAGES
          ) *
          1000
        ) -
        250
      );


    const seekMs =
      Math.min(
        Math.max(
          0,
          Number(
            state.clipStartMs ||
            0
          )
        ),
        safeMax
      );


    const seekSeconds =
      seekMs /
      1000;


    if (
      audio.readyState <
      1
    ) {
      await new Promise(
        (
          resolve,
          reject
        ) => {
          const done =
            () => {
              cleanup();
              resolve();
            };


          const fail =
            () => {
              cleanup();
              reject(
                new Error(
                  'A prévia não carregou.'
                )
              );
            };


          const cleanup =
            () => {
              audio.removeEventListener(
                'loadedmetadata',
                done
              );

              audio.removeEventListener(
                'error',
                fail
              );
            };


          audio.addEventListener(
            'loadedmetadata',
            done,
            {
              once:
                true
            }
          );


          audio.addEventListener(
            'error',
            fail,
            {
              once:
                true
            }
          );


          audio.load();
        }
      );
    }


    audio.currentTime =
      Math.min(
        seekSeconds,
        Math.max(
          0,
          (
            Number(
              audio.duration ||
              30
            ) -
            Math.max(
              ...CLIP_STAGES
            ) -
            0.25
          )
        )
      );


    audio.volume =
      0.82;


    await audio.play();


    state.playing =
      true;


    state.playbackDeviceId =
      null;


    state.currentTargetKind =
      'public';


    state.currentTargetName =
      'Prévia pública';


    state.clipStartedAt =
      performance.now();


    setPlayIcon(
      true
    );


    startProgressTicker();


    state.playTimer =
      setTimeout(
        () =>
          stopPlayback(),

        CLIP_STAGES[
          state.stage
        ] *
        1000
      );

  } catch (err) {
    state.playing =
      false;


    setPlayIcon(
      false
    );


    console.error(
      '[Guessify] Prévia pública:',
      err
    );


    toast(
      'Não consegui tocar essa prévia. Tente novamente ou use outra música.',
      true
    );
  }
}


function animateFakeClip() {
  stopPlayback();


  state.playing =
    true;


  state.clipStartedAt =
    performance.now();


  setPlayIcon(true);


  startProgressTicker();


  state.playTimer =
    setTimeout(
      stopPlayback,

      CLIP_STAGES[
        state.stage
      ] *
      1000
    );
}


function startProgressTicker() {
  clearInterval(
    state.progressTimer
  );


  state.progressTimer =
    setInterval(
      () => {
        const elapsed =
          Math.min(
            (
              performance.now() -
              state.clipStartedAt
            ) /
            1000,

            CLIP_STAGES[
              state.stage
            ]
          );


        els.clipCurrent.textContent =
          formatTime(
            elapsed
          );


        const bars =
          [
            ...els
              .waveform
              .children
          ];


        const active =
          Math.floor(
            (
              elapsed /
              CLIP_STAGES[
                state.stage
              ]
            ) *
            bars.length
          );


        bars.forEach(
          (
            bar,
            index
          ) =>
            bar
              .classList
              .toggle(
                'active',
                index <
                  active
              )
        );
      },

      80
    );
}


async function stopPlayback() {
  clearTimeout(
    state.playTimer
  );


  clearInterval(
    state.progressTimer
  );


  state.playTimer =
    null;


  state.progressTimer =
    null;


  if (
    state.publicAudio &&
    !state.publicAudio.paused
  ) {
    try {
      state.publicAudio.pause();
    } catch {}
  }


  const shouldPause =
    state.playing &&
    !state.demo &&
    state.playbackDeviceId &&
    state.accessToken;


  state.playing =
    false;


  setPlayIcon(false);


  if (shouldPause) {
    try {
      if (
        state.currentTargetKind ===
          'web' &&
        typeof state.player?.pause ===
          'function'
      ) {
        await state.player
          .pause();

      } else {
        await spotifyFetch(
          `/me/player/pause?device_id=${
            encodeURIComponent(
              state.playbackDeviceId
            )
          }`,
          {
            method:
              'PUT'
          }
        );
      }

    } catch (err) {
      console.warn(
        '[Guessify] Falha ao pausar:',
        err
      );
    }
  }
}


function chooseClipStartMs(
  track
) {
  if (!RANDOM_SNIPPETS) {
    return 0;
  }


  const duration =
    Number(
      (
        state.source?.type ===
          'public'
          ? track?.preview_duration_ms
          : track?.duration_ms
      ) ||
      0
    );


  const maxClipMs =
    Math.max(
      ...CLIP_STAGES
    ) *
    1000;


  /*
    No modo público trabalhamos com
    uma prévia curta (~30 s), então
    sorteamos dentro dela sem aplicar
    as margens usadas em faixas inteiras.
  */

  if (
    state.source?.type ===
      'public'
  ) {
    const lower =
      1500;


    const upper =
      Math.max(
        lower,

        duration -
        maxClipMs -
        1200
      );


    return Math.floor(
      lower +
      Math.random() *
      Math.max(
        1,
        upper -
        lower
      )
    );
  }


  if (
    !duration ||
    duration <=
      maxClipMs +
      6000
  ) {
    return 0;
  }


  const lower =
    Math.max(
      RANDOM_SNIPPET_MIN_MS,

      Math.floor(
        duration *
        0.15
      )
    );


  const upper =
    Math.min(
      Math.floor(
        duration *
        0.78
      ),

      duration -
      maxClipMs -
      RANDOM_SNIPPET_END_PADDING_MS
    );


  if (
    upper <= lower
  ) {
    return Math.max(
      0,

      Math.floor(
        (
          duration -
          maxClipMs
        ) /
        2
      )
    );
  }


  return Math.floor(
    lower +
    Math.random() *
    (
      upper -
      lower
    )
  );
}


function formatAbsolutePosition(
  ms
) {
  const totalSeconds =
    Math.max(
      0,

      Math.floor(
        ms /
        1000
      )
    );


  const minutes =
    Math.floor(
      totalSeconds /
      60
    );


  const seconds =
    String(
      totalSeconds %
      60
    ).padStart(
      2,
      '0'
    );


  return (
    `${minutes}:${seconds}`
  );
}


function setPlayIcon(
  isPlaying
) {
  els.playIcon.innerHTML =
    isPlaying
      ? '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>'
      : '<path d="M8 5v14l11-7z"/>';
}


function skipAttempt() {
  if (
    state.resolved
  ) {
    return;
  }


  if (
    state.stage <
    CLIP_STAGES.length -
    1
  ) {
    addAttempt(
      'Pulou a tentativa'
    );


    state.stage++;


    updateStageUI();


    clearAnswer();

  } else {
    resolveRound(
      false
    );
  }
}


async function submitAnswer() {
  if (
    state.resolved ||
    !els.answer.value.trim()
  ) {
    return;
  }


  const correct =
    isCorrectAnswer();


  if (correct) {
    resolveRound(
      true
    );

  } else {
    addAttempt(
      els.answer.value.trim()
    );


    state.streak =
      0;


    els.streak.textContent =
      state.streak;


    if (
      state.stage <
      CLIP_STAGES.length -
      1
    ) {
      state.stage++;


      updateStageUI();


      clearAnswer();


      els.answer.focus();

    } else {
      resolveRound(
        false
      );
    }
  }
}


function isCorrectAnswer() {
  if (state.demo) {
    return normalize(
      els.answer.value
    ).includes(
      'blinding lights'
    );
  }


  if (
    state.selectedAnswer?.id &&
    state.current?.id
  ) {
    return (
      state.selectedAnswer.id ===
      state.current.id
    );
  }


  const q =
    normalize(
      els.answer.value
    );


  const title =
    normalize(
      state.current.name
    );


  const titleBase =
    title
      .replace(
        /\s*[-–(].*$/,
        ''
      )
      .trim();


  const artists =
    state.current.artists
      .map(
        artist =>
          normalize(
            artist.name
          )
      );


  return (
    q === title ||
    q === titleBase ||

    artists.some(
      artist =>
        q ===
          `${title} ${artist}` ||

        q ===
          `${titleBase} ${artist}`
    )
  );
}


async function resolveRound(
  hit
) {
  await stopPlayback();


  state.resolved =
    true;


  els.answer.disabled =
    true;


  els.submit.disabled =
    true;


  els.skip.disabled =
    true;


  els.suggestions
    .classList
    .add('hidden');


  let points =
    0;


  if (hit) {
    points =
      STAGE_POINTS[
        state.stage
      ];


    state.score +=
      points;


    state.hits++;


    state.streak++;


    state.bestStreak =
      Math.max(
        state.bestStreak,
        state.streak
      );

  } else {
    state.streak =
      0;
  }


  els.score.textContent =
    state.score;


  els.streak.textContent =
    state.streak;


  revealCurrent(
    hit
  );


  els.roundMessage.textContent =
    hit
      ? (
          state.stage ===
          0
            ? 'De primeira! 🔥'
            : 'Mandou bem!'
        )
      : 'Essa escapou 😵';


  els.roundPoints.textContent =
    points;


  els.roundFooter
    .classList
    .remove('hidden');
}


function revealCurrent(
  hit
) {
  const track =
    state.current;


  const cover =
    track
      ?.album
      ?.images
      ?.[0]
      ?.url ||
    '';


  if (cover) {
    els.revealCover.src =
      cover;


    els.revealCover
      .classList
      .remove('hidden');


    $('.mystery-cover')
      .classList
      .add('hidden');
  }


  els.revealTitle.textContent =
    track?.name ||
    'Blinding Lights';


  els.revealArtist.textContent =
    track
      ?.artists
      ?.map(
        artist =>
          artist.name
      )
      .join(', ') ||
    'The Weeknd';


  els.spotifyLink.href =
    track
      ?.external_urls
      ?.spotify ||
    'https://open.spotify.com/';


  els.resultBadge.textContent =
    hit
      ? 'ACERTOU'
      : 'ERA ESSA';


  els.resultBadge
    .classList
    .toggle(
      'wrong',
      !hit
    );


  els.revealMeta
    .classList
    .remove('hidden');
}


function nextRound() {
  if (
    state.roundIndex >=
    state.queue.length -
    1
  ) {
    finishGame();

    return;
  }


  state.roundIndex++;


  prepareRound();
}


function finishGame() {
  showView(
    'finish'
  );


  els.finishScore.textContent =
    state.score;


  els.finishHits.textContent =
    state.hits;


  els.finishBestStreak.textContent =
    state.bestStreak;


  els.finishAccuracy.textContent =
    `${
      Math.round(
        (
          state.hits /
          state.queue.length
        ) *
        100
      )
    }%`;
}


function updateStageUI() {
  els.clipLimit.textContent =
    formatTime(
      CLIP_STAGES[
        state.stage
      ]
    );


  els.clipCurrent.textContent =
    '0.0s';


  els.pointsPreview.textContent =
    STAGE_POINTS[
      state.stage
    ];


  [
    ...els
      .stages
      .children
  ].forEach(
    (
      element,
      index
    ) => {
      element
        .classList
        .toggle(
          'active',
          index ===
            state.stage
        );


      element
        .classList
        .toggle(
          'passed',
          index <
            state.stage
        );
    }
  );


  [
    ...els
      .waveform
      .children
  ].forEach(
    bar =>
      bar
        .classList
        .remove(
          'active'
        )
  );
}


function renderStages() {
  els.stages.innerHTML =
    CLIP_STAGES
      .map(
        (
          seconds,
          index
        ) =>
          `
            <div
              class="stage${
                index === 0
                  ? ' active'
                  : ''
              }"
            >
              ${
                formatStage(
                  seconds
                )
              }
            </div>
          `
      )
      .join('');
}


function buildWaveform() {
  const heights = [
    26,58,37,78,45,66,
    31,88,55,34,73,49,
    92,44,61,28,76,53,
    39,86,48,65,33,72,
    42,83,51,69,29,75,
    46,90,38,62,27,80,
    52,68,35,74,43,85,
    31,58,41,70,36,79
  ];


  els.waveform.innerHTML =
    heights
      .map(
        height =>
          `<i style="height:${height}%"></i>`
      )
      .join('');
}


function addAttempt(text) {
  state.attempts.push(
    text
  );


  const row =
    document.createElement(
      'div'
    );


  row.className =
    'attempt';


  row.innerHTML =
    `
      <span class="x">
        ×
      </span>

      <span>
        ${escapeHtml(text)}
      </span>
    `;


  els.attempts.prepend(
    row
  );
}


function onAnswerInput() {
  state.selectedAnswer =
    null;


  els.clearAnswer
    .classList
    .toggle(
      'hidden',
      !els.answer.value
    );


  els.submit.disabled =
    !els.answer.value.trim();


  clearTimeout(
    searchTimer
  );


  const query =
    els.answer.value.trim();


  if (
    query.length < 2 ||
    state.demo
  ) {
    els.suggestions
      .classList
      .add('hidden');

    return;
  }


  searchTimer =
    setTimeout(
      () =>
        searchTracks(
          query
        ),

      70
    );
}


async function searchTracks(
  q
) {
  const query =
    normalize(q);


  if (!query) {
    els.suggestions
      .classList
      .add('hidden');

    return;
  }


  const terms =
    query
      .split(' ')
      .filter(Boolean);


  const seen =
    new Set();


  const ranked =
    [];


  for (
    const track
    of state.tracks
  ) {
    if (
      !track?.id ||
      seen.has(
        track.id
      )
    ) {
      continue;
    }


    seen.add(
      track.id
    );


    const title =
      normalize(
        track.name
      );


    const artists =
      normalize(
        (
          track.artists ||
          []
        )
          .map(
            artist =>
              artist.name
          )
          .join(' ')
      );


    const haystack =
      `${title} ${artists}`;


    if (
      !terms.every(
        term =>
          haystack.includes(
            term
          )
      )
    ) {
      continue;
    }


    let score =
      0;


    if (
      title === query
    ) {
      score +=
        100;
    }


    if (
      title.startsWith(
        query
      )
    ) {
      score +=
        60;
    }


    if (
      artists.startsWith(
        query
      )
    ) {
      score +=
        35;
    }


    if (
      title.includes(
        query
      )
    ) {
      score +=
        25;
    }


    if (
      artists.includes(
        query
      )
    ) {
      score +=
        15;
    }


    score -=
      Math.min(
        title.length,
        80
      ) /
      100;


    ranked.push({
      track,
      score
    });
  }


  ranked.sort(
    (
      a,
      b
    ) =>
      b.score -
      a.score
  );


  renderSuggestions(
    ranked
      .slice(
        0,
        6
      )
      .map(
        item =>
          item.track
      )
  );
}


function renderSuggestions(
  items
) {
  if (
    !items.length ||
    state.resolved
  ) {
    els.suggestions
      .classList
      .add('hidden');

    return;
  }


  els.suggestions.innerHTML =
    '';


  items.forEach(
    track => {
      const button =
        document.createElement(
          'button'
        );


      button.className =
        'suggestion';


      button.innerHTML =
        `
          ${
            track
              .album
              ?.images
              ?.[2]
              ?.url

              ? `
                  <img
                    src="${
                      escapeAttr(
                        track
                          .album
                          .images[2]
                          .url
                      )
                    }"
                    alt=""
                  >
                `

              : ''
          }

          <div>
            <strong>
              ${
                escapeHtml(
                  track.name
                )
              }
            </strong>

            <span>
              ${
                escapeHtml(
                  track
                    .artists
                    .map(
                      artist =>
                        artist.name
                    )
                    .join(', ')
                )
              }
            </span>
          </div>
        `;


      button.addEventListener(
        'click',
        () => {
          state.selectedAnswer =
            track;


          els.answer.value =
            `${
              track.name
            } — ${
              track
                .artists
                .map(
                  artist =>
                    artist.name
                )
                .join(', ')
            }`;


          els.suggestions
            .classList
            .add('hidden');


          els.clearAnswer
            .classList
            .remove('hidden');


          els.submit.disabled =
            false;
        }
      );


      els.suggestions
        .appendChild(
          button
        );
    }
  );


  els.suggestions
    .classList
    .remove('hidden');
}


function clearAnswer() {
  els.answer.value =
    '';


  state.selectedAnswer =
    null;


  els.submit.disabled =
    true;


  els.clearAnswer
    .classList
    .add('hidden');


  els.suggestions
    .classList
    .add('hidden');
}


/* =========================================================
   API DO NOSSO SERVIDOR
========================================================= */

async function apiFetch(
  path,
  options = {}
) {
  const response =
    await fetch(
      path,
      {
        ...options,

        headers: {
          ...(
            options.body
              ? {
                  'Content-Type':
                    'application/json'
                }
              : {}
          ),

          ...(
            options.headers ||
            {}
          )
        }
      }
    );


  let data = {};


  try {
    data =
      await response.json();
  } catch {}


  if (!response.ok) {
    throw new Error(
      data.error ||
      `Erro ${response.status}`
    );
  }


  return data;
}


/* =========================================================
   LAST.FM / CÁPSULA
========================================================= */

async function restoreLastfmProfile() {
  const profileKey =
    getProfileKey();


  if (!profileKey) {
    return;
  }


  try {
    const {
      profile
    } =
      await apiFetch(
        `/api/profile?spotifyId=${
          encodeURIComponent(
            profileKey
          )
        }`
      );


    state.lastfmUser =
      profile?.lastfmUser ||
      localStorage.getItem(
        `guessify_lastfm_${profileKey}`
      ) ||
      null;

  } catch (err) {
    console.warn(
      '[Guessify] Não consegui restaurar Last.fm:',
      err
    );


    state.lastfmUser =
      localStorage.getItem(
        `guessify_lastfm_${profileKey}`
      ) ||
      null;
  }
}


async function checkLastfmServer() {
  try {
    const health =
      await apiFetch(
        '/api/health'
      );


    els.lastfmConfigHint
      .classList
      .toggle(
        'hidden',
        !!health.lastfmConfigured
      );


    els.lastfmConfigHint.textContent =
      health.lastfmConfigured

        ? ''

        : (
            'Falta configurar a API Key do Last.fm em ' +
            'server.config.json. O jogo continua funcionando normalmente.'
          );


    els.linkLastfm.disabled =
      !health.lastfmConfigured;


    return (
      !!health.lastfmConfigured
    );

  } catch {
    els.lastfmConfigHint
      .classList
      .remove('hidden');


    els.lastfmConfigHint.textContent =
      'O servidor da Cápsula não respondeu. Rode o projeto com node serve.mjs.';


    els.linkLastfm.disabled =
      true;


    return false;
  }
}


async function openCapsule() {
  showView(
    'capsule'
  );


  await checkLastfmServer();


  if (
    !state.lastfmUser
  ) {
    showCapsuleConnect();

    return;
  }


  showCapsuleDashboard();


  await loadCapsule(
    false
  );


  startCapsuleTimers();
}


function showCapsuleConnect() {
  els.capsuleConnect
    .classList
    .remove('hidden');


  els.capsuleDashboard
    .classList
    .add('hidden');


  els.capsuleRefresh
    .classList
    .add('hidden');


  if (
    state.lastfmUser
  ) {
    els.lastfmUsername.value =
      state.lastfmUser;
  }
}


function showCapsuleDashboard() {
  els.capsuleConnect
    .classList
    .add('hidden');


  els.capsuleDashboard
    .classList
    .remove('hidden');


  els.capsuleRefresh
    .classList
    .remove('hidden');
}


async function linkLastfmProfile() {
  const profileKey =
    getProfileKey();


  const username =
    els
      .lastfmUsername
      .value
      .trim();


  if (!username) {
    return toast(
      'Digite seu usuário do Last.fm.',
      true
    );
  }


  const ok =
    await checkLastfmServer();


  if (!ok) {
    return;
  }


  const original =
    els.linkLastfm
      .textContent;


  els.linkLastfm.disabled =
    true;


  els.linkLastfm.textContent =
    'VERIFICANDO...';


  try {
    const {
      profile
    } =
      await apiFetch(
        '/api/profile',
        {
          method:
            'POST',

          body:
            JSON.stringify({
              /*
                O backend mantém o nome spotifyId
                por compatibilidade com o banco.
                No modo público usamos um ID local
                anônimo, sem conta Spotify.
              */

              spotifyId:
                profileKey,

              displayName:
                state.profile
                  ?.display_name ||
                username ||
                'Usuário Guessify',

              lastfmUser:
                username
            })
        }
      );


    state.lastfmUser =
      profile.lastfmUser;


    localStorage.setItem(
      `guessify_lastfm_${
        profileKey
      }`,

      state.lastfmUser
    );


    showCapsuleDashboard();


    toast(
      `Last.fm @${
        state.lastfmUser
      } conectado!`
    );


    await loadCapsule(
      true
    );


    startCapsuleTimers();

  } catch (err) {
    console.error(err);


    toast(
      err.message ||
      'Não consegui conectar o Last.fm.',
      true
    );

  } finally {
    els.linkLastfm.textContent =
      original;


    els.linkLastfm.disabled =
      false;
  }
}


async function unlinkLastfmProfile() {
  const profileKey =
    getProfileKey();


  if (!profileKey) {
    return;
  }


  try {
    await apiFetch(
      '/api/profile/unlink',
      {
        method:
          'POST',

        body:
          JSON.stringify({
            spotifyId:
              profileKey
          })
      }
    );

  } catch (err) {
    console.warn(err);
  }


  localStorage.removeItem(
    `guessify_lastfm_${
      profileKey
    }`
  );


  state.lastfmUser =
    null;


  clearLiveTimers();


  els.lastfmUsername.value =
    '';


  state.nowPlayingTrack =
    null;


  renderNowPlaying(
    null
  );


  showCapsuleConnect();


  toast(
    'Conta Last.fm desvinculada do Guessify.'
  );
}


async function loadCapsule(
  force = false
) {
  if (
    !state.lastfmUser ||
    state.capsuleLoading
  ) {
    return;
  }


  state.capsuleLoading =
    true;


  els.capsuleRefresh.disabled =
    true;


  const original =
    els
      .capsuleRefresh
      .textContent;


  if (force) {
    els.capsuleRefresh.textContent =
      'ATUALIZANDO...';
  }


  try {
    const tzOffset =
      new Date()
        .getTimezoneOffset();


    const {
      capsule
    } =
      await apiFetch(
        `/api/capsule?username=${
          encodeURIComponent(
            state.lastfmUser
          )
        }&tzOffset=${
          tzOffset
        }${
          force
            ? '&force=1'
            : ''
        }`
      );


    state.lastfmUser =
      capsule.username ||
      state.lastfmUser;


    renderCapsule(
      capsule
    );

  } catch (err) {
    console.error(err);


    toast(
      err.message ||
      'Não consegui atualizar a Cápsula.',
      true
    );

  } finally {
    state.capsuleLoading =
      false;


    els.capsuleRefresh.disabled =
      false;


    els.capsuleRefresh.textContent =
      original;
  }
}


function renderCapsule(
  capsule
) {
  els.capsuleUserName.textContent =
    capsule.displayName ||
    capsule.username;


  els.capsuleUserHandle.textContent =
    `@${capsule.username}`;


  els.capsuleUpdated.textContent =
    `Atualizado ${
      formatRelativeTime(
        capsule.updatedAt
      )
    }`;


  els.capsuleMonthLabel.textContent =
    monthLabel(
      capsule.monthKey
    ).toUpperCase();


  /*
    NOVO BACKEND:

    countedMinutes =
    duração da música
    × scrobbles.
  */

  els.capsuleMinutes.textContent =
    formatNumber(
      capsule.countedMinutes ??
      capsule.estimatedMinutes ??
      0
    );


  els.capsuleScrobbles.textContent =
    formatNumber(
      capsule.scrobbles
    );


  els.capsuleUniqueTracks.textContent =
    formatNumber(
      capsule.uniqueTracks
    );


  els.capsuleUniqueArtists.textContent =
    formatNumber(
      capsule.uniqueArtists
    );


  els.capsuleDays.textContent =
    formatNumber(
      capsule.daysActive
    );


  els.capsuleAvatar.innerHTML =
    capsule.avatar
      ? `
          <img
            src="${
              escapeAttr(
                capsule.avatar
              )
            }"
            alt=""
          >
        `
      : '♪';


  /*
    NÃO usamos mais
    capsule.nowPlaying aqui.

    Agora o Spotify controla
    o Tocando Agora.
  */

  renderCapsuleTracks(
    capsule.topTracks ||
    []
  );


  renderCapsuleArtists(
    capsule.topArtists ||
    []
  );


  if (
    Number(
      capsule
        .missingDurationScrobbles ||
      0
    ) >
    0
  ) {
    console.warn(
      `[Cápsula] ${
        capsule
          .missingDurationScrobbles
      } scrobble(s) ainda estão sem duração conhecida e não entraram nos minutos.`
    );
  }
}


function renderCapsuleTracks(
  items
) {
  if (!items.length) {
    els.topTracksList.innerHTML =
      '<div class="empty-mini">Ainda não há scrobbles neste mês.</div>';

    return;
  }


  els.topTracksList.innerHTML =
    items
      .map(
        (
          track,
          index
        ) => {
          const minutes =
            Number(
              track
                .totalListenedMinutes ||
              0
            );


          const extra =
            minutes > 0
              ? ` · ${formatNumber(minutes)} min`
              : '';


          return `
            <div class="capsule-list-row">

              <span class="capsule-rank">
                ${
                  String(
                    index + 1
                  ).padStart(
                    2,
                    '0'
                  )
                }
              </span>

              ${
                track.image

                  ? `
                      <img
                        class="capsule-list-image"
                        src="${
                          escapeAttr(
                            track.image
                          )
                        }"
                        alt=""
                      >
                    `

                  : `
                      <div
                        class="capsule-list-image"
                      ></div>
                    `
              }

              <div class="capsule-list-meta">

                <strong>
                  ${
                    escapeHtml(
                      track.name
                    )
                  }
                </strong>

                <span>
                  ${
                    escapeHtml(
                      track.artist
                    )
                  }
                </span>

              </div>

              <span class="play-count">
                ${
                  formatNumber(
                    track.plays
                  )
                } plays${extra}
              </span>

            </div>
          `;
        }
      )
      .join('');
}


function renderCapsuleArtists(
  items
) {
  if (!items.length) {
    els.topArtistsList.innerHTML =
      '<div class="empty-mini">Ainda não há artistas neste mês.</div>';

    return;
  }


  els.topArtistsList.innerHTML =
    items
      .map(
        (
          artist,
          index
        ) => {
          const minutes =
            Number(
              artist
                .totalListenedMinutes ||
              0
            );


          const extra =
            minutes > 0
              ? ` · ${formatNumber(minutes)} min`
              : '';


          return `
            <div
              class="capsule-list-row artist-row"
            >

              <span class="capsule-rank">
                ${
                  String(
                    index + 1
                  ).padStart(
                    2,
                    '0'
                  )
                }
              </span>

              <div class="capsule-list-meta">

                <strong>
                  ${
                    escapeHtml(
                      artist.name
                    )
                  }
                </strong>

                <span>
                  Artista #${index + 1} do mês
                </span>

              </div>

              <span class="play-count">
                ${
                  formatNumber(
                    artist.plays
                  )
                } plays${extra}
              </span>

            </div>
          `;
        }
      )
      .join('');
}


/* =========================================================
   TOCANDO AGORA — SPOTIFY

   Consulta a API do Spotify a cada 2 segundos.

   Entre as consultas, o progresso é calculado localmente
   para a barra ficar fluida.
========================================================= */

async function loadNowPlaying() {
  if (
    els.capsule
      .classList
      .contains('hidden')
  ) {
    return;
  }


  if (
    state.nowPlayingFetchInFlight
  ) {
    return;
  }


  state.nowPlayingFetchInFlight =
    true;


  try {
    /*
      Com Spotify Beta conectado:
      usamos a API do Spotify e temos
      progresso exato.

      Sem Spotify:
      usamos o "now playing" do Last.fm.
    */

    if (
      state.accessToken
    ) {
      const data =
        await spotifyFetch(
          '/me/player/currently-playing?additional_types=track'
        );


      if (
        !data?.item ||
        data.item.type !==
          'track'
      ) {
        state.nowPlayingTrack =
          null;


        renderNowPlaying(
          null
        );


        return;
      }


      const track = {
        id:
          data.item.id ||
          data.item.uri ||
          '',

        name:
          data.item.name ||
          'Música',

        artist:
          (
            data.item.artists ||
            []
          )
            .map(
              artist =>
                artist.name
            )
            .filter(Boolean)
            .join(', '),

        album:
          data.item.album?.name ||
          '',

        image:
          data.item
            .album
            ?.images
            ?.[0]
            ?.url ||
          '',

        durationMs:
          Number(
            data.item.duration_ms ||
            0
          ),

        progressMs:
          Number(
            data.progress_ms ||
            0
          ),

        isPlaying:
          Boolean(
            data.is_playing
          ),

        syncedAt:
          Date.now(),

        source:
          'spotify'
      };


      state.nowPlayingTrack =
        track;


      renderNowPlaying(
        track
      );


      return;
    }


    if (
      !state.lastfmUser
    ) {
      state.nowPlayingTrack =
        null;


      renderNowPlaying(
        null
      );


      return;
    }


    const {
      nowPlaying
    } =
      await apiFetch(
        `/api/now-playing?username=${
          encodeURIComponent(
            state.lastfmUser
          )
        }`
      );


    const track =
      nowPlaying
        ? {
            id:
              `${nowPlaying.artist || ''}::${
                nowPlaying.name ||
                ''
              }`,

            name:
              nowPlaying.name ||
              'Música',

            artist:
              nowPlaying.artist ||
              '',

            album:
              nowPlaying.album ||
              '',

            image:
              nowPlaying.image ||
              '',

            durationMs:
              0,

            progressMs:
              0,

            isPlaying:
              true,

            syncedAt:
              Date.now(),

            source:
              'lastfm'
          }
        : null;


    state.nowPlayingTrack =
      track;


    renderNowPlaying(
      track
    );

  } catch (err) {
    console.warn(
      '[Guessify] Tocando agora:',
      err
    );

  } finally {
    state.nowPlayingFetchInFlight =
      false;
  }
}


/* =========================================================
   CRIA BARRA DE PROGRESSO DO TOCANDO AGORA
========================================================= */

function ensureNowPlayingProgressUI() {
  let wrap =
    document.querySelector(
      '#nowPlayingProgress'
    );


  /*
    Se ainda não existe no HTML,
    criamos por JavaScript.
  */

  if (!wrap) {
    wrap =
      document.createElement(
        'div'
      );


    wrap.id =
      'nowPlayingProgress';


    wrap.style.gridColumn =
      '2 / -1';


    wrap.style.display =
      'grid';


    wrap.style.gridTemplateColumns =
      '38px minmax(80px, 1fr) 38px';


    wrap.style.alignItems =
      'center';


    wrap.style.gap =
      '8px';


    wrap.style.marginTop =
      '-5px';


    wrap.style.fontSize =
      '9px';


    wrap.style.color =
      '#737a76';


    wrap.style.fontVariantNumeric =
      'tabular-nums';


    wrap.innerHTML =
      `
        <span
          id="nowPlayingElapsed"
        >
          0:00
        </span>

        <div
          style="
            height:4px;
            border-radius:999px;
            background:#272b29;
            overflow:hidden;
          "
        >

          <div
            id="nowPlayingProgressFill"
            style="
              height:100%;
              width:0%;
              border-radius:999px;
              background:#1ed760;
              transition:width .22s linear;
            "
          ></div>

        </div>

        <span
          id="nowPlayingDuration"
          style="text-align:right;"
        >
          0:00
        </span>
      `;


    els.nowPlayingCard
      .appendChild(
        wrap
      );
  }


  return {
    wrap,

    elapsed:
      document.querySelector(
        '#nowPlayingElapsed'
      ),

    fill:
      document.querySelector(
        '#nowPlayingProgressFill'
      ),

    duration:
      document.querySelector(
        '#nowPlayingDuration'
      )
  };
}


/* =========================================================
   CALCULA PROGRESSO ATUAL
========================================================= */

function currentSpotifyProgressMs(
  track =
    state.nowPlayingTrack
) {
  if (!track) {
    return 0;
  }


  /*
    Se está tocando:

    progress_ms recebido
    +
    tempo passado desde
    a última consulta.
  */

  const elapsedSinceSync =
    track.isPlaying

      ? Math.max(
          0,

          Date.now() -
          Number(
            track.syncedAt ||
            Date.now()
          )
        )

      : 0;


  return Math.min(
    Math.max(
      0,

      Number(
        track.progressMs ||
        0
      ) +
      elapsedSinceSync
    ),

    Math.max(
      0,

      Number(
        track.durationMs ||
        0
      )
    )
  );
}


/* =========================================================
   FORMATA TEMPO

   65432ms → 1:05
========================================================= */

function formatPlaybackClock(
  ms
) {
  const totalSeconds =
    Math.max(
      0,

      Math.floor(
        Number(
          ms ||
          0
        ) /
        1000
      )
    );


  const minutes =
    Math.floor(
      totalSeconds /
      60
    );


  const seconds =
    String(
      totalSeconds %
      60
    ).padStart(
      2,
      '0'
    );


  return (
    `${minutes}:${seconds}`
  );
}


/* =========================================================
   ATUALIZA BARRA SEM CHAMAR API
========================================================= */

function updateNowPlayingProgressUI() {
  const ui =
    ensureNowPlayingProgressUI();


  const track =
    state.nowPlayingTrack;


  if (
    !track ||
    Number(
      track.durationMs ||
      0
    ) <= 0
  ) {
    ui.wrap.style.display =
      'none';

    return;
  }


  ui.wrap.style.display =
    'grid';


  const progressMs =
    currentSpotifyProgressMs(
      track
    );


  const durationMs =
    Math.max(
      0,

      Number(
        track.durationMs ||
        0
      )
    );


  const percent =
    durationMs > 0

      ? Math.min(
          100,

          Math.max(
            0,

            (
              progressMs /
              durationMs
            ) *
            100
          )
        )

      : 0;


  ui.elapsed.textContent =
    formatPlaybackClock(
      progressMs
    );


  ui.duration.textContent =
    formatPlaybackClock(
      durationMs
    );


  ui.fill.style.width =
    `${percent}%`;
}


/* =========================================================
   RENDERIZA TOCANDO AGORA
========================================================= */

function renderNowPlaying(
  track
) {
  const active =
    !!track;


  /*
    Se pausado, deixa card
    com visual idle.
  */

  els.nowPlayingCard
    .classList
    .toggle(
      'idle',

      !active ||
      !track?.isPlaying
    );


  els.nowPlayingTitle.textContent =
    active

      ? track.name

      : 'Nada tocando agora';


  els.nowPlayingArtist.textContent =
    active

      ? (
          `${track.artist}${
            track.isPlaying
              ? ''
              : ' · pausado'
          }`
        )

      : (
          state.accessToken
            ? 'Abra o Spotify e dê play'
            : 'O Last.fm mostra aqui quando você estiver ouvindo'
        );


  els.nowPlayingCover.innerHTML =
    active &&
    track.image

      ? `
          <img
            src="${
              escapeAttr(
                track.image
              )
            }"
            alt=""
          >
        `

      : '♪';


  updateNowPlayingProgressUI();
}


/* =========================================================
   TIMERS DA CÁPSULA
========================================================= */

function startCapsuleTimers() {
  clearLiveTimers();


  loadNowPlaying();


  state.nowPlayingTimer =
    setInterval(
      loadNowPlaying,

      state.accessToken
        ? 2000
        : 5000
    );


  if (
    state.accessToken
  ) {
    state.nowPlayingProgressTimer =
      setInterval(
        updateNowPlayingProgressUI,
        250
      );
  }


  state.capsulePollTimer =
    setInterval(
      () =>
        loadCapsule(
          false
        ),

      20000
    );
}


/* =========================================================
   RANKING
========================================================= */

async function openRanking() {
  showView(
    'ranking'
  );


  await loadRanking(
    false
  );


  clearInterval(
    state.rankingPollTimer
  );


  state.rankingPollTimer =
    setInterval(
      () =>
        loadRanking(
          false
        ),

      60000
    );
}


async function loadRanking(
  force = false
) {
  if (
    state.rankingLoading
  ) {
    return;
  }


  state.rankingLoading =
    true;


  els.rankingRefresh.disabled =
    true;


  els.rankingLoading
    .classList
    .remove('hidden');


  els.rankingList
    .classList
    .add('hidden');


  els.rankingEmpty
    .classList
    .add('hidden');


  try {
    const tzOffset =
      new Date()
        .getTimezoneOffset();


    const {
      ranking
    } =
      await apiFetch(
        `/api/ranking?tzOffset=${
          tzOffset
        }${
          force
            ? '&force=1'
            : ''
        }`
      );


    renderRanking(
      ranking
    );

  } catch (err) {
    console.error(err);


    els.rankingLoading.textContent =
      err.message ||
      'Não consegui carregar o ranking.';


    toast(
      err.message ||
      'Não consegui carregar o ranking.',
      true
    );

  } finally {
    state.rankingLoading =
      false;


    els.rankingRefresh.disabled =
      false;
  }
}


function renderRanking(
  ranking
) {
  const rows =
    ranking.rows ||
    [];


  els.rankingMonth.textContent =
    monthLabel(
      ranking.monthKey
    );


  els.rankingPeople.textContent =
    rows.length;


  els.rankingUpdated.textContent =
    formatRelativeTime(
      ranking.updatedAt
    );


  els.rankingLoading
    .classList
    .add('hidden');


  if (!rows.length) {
    els.rankingEmpty
      .classList
      .remove('hidden');

    return;
  }


  els.rankingList.innerHTML =
    rows
      .map(
        (
          row,
          index
        ) => {
          const me =
            row.spotifyId &&
            row.spotifyId ===
              getProfileKey();


          const medal =
            index === 0
              ? '🥇'
              : index === 1
                ? '🥈'
                : index === 2
                  ? '🥉'
                  : `#${index + 1}`;


          return `
            <div
              class="ranking-row${
                me
                  ? ' me'
                  : ''
              }"
            >

              <div class="rank-place">
                ${medal}
              </div>

              <div class="rank-person">

                <strong>
                  ${
                    escapeHtml(
                      row.displayName
                    )
                  }${
                    me
                      ? ' · você'
                      : ''
                  }
                </strong>

                <span>
                  @${
                    escapeHtml(
                      row.lastfmUser
                    )
                  }
                </span>

              </div>

              <div class="rank-metric">

                <strong>
                  ${
                    formatNumber(
                      row.countedMinutes ??
                      row.estimatedMinutes ??
                      0
                    )
                  }
                </strong>

                <span>
                  MINUTOS
                </span>

              </div>

              <div
                class="
                  rank-metric
                  scrobble-metric
                "
              >

                <strong>
                  ${
                    formatNumber(
                      row.scrobbles
                    )
                  }
                </strong>

                <span>
                  SCROBBLES
                </span>

              </div>

              <div
                class="rank-top-artist"
              >

                <span>
                  TOP ARTISTA
                </span>

                <strong>
                  ${
                    escapeHtml(
                      row.topArtist ||
                      '—'
                    )
                  }
                </strong>

              </div>

            </div>
          `;
        }
      )
      .join('');


  els.rankingList
    .classList
    .remove('hidden');
}


/* =========================================================
   LIMPA TIMERS
========================================================= */

function clearLiveTimers() {
  clearInterval(
    state.capsulePollTimer
  );


  clearInterval(
    state.nowPlayingTimer
  );


  clearInterval(
    state.nowPlayingProgressTimer
  );


  clearInterval(
    state.rankingPollTimer
  );


  state.capsulePollTimer =
    null;


  state.nowPlayingTimer =
    null;


  state.nowPlayingProgressTimer =
    null;


  state.nowPlayingFetchInFlight =
    false;


  state.rankingPollTimer =
    null;
}


/* =========================================================
   HELPERS
========================================================= */

function monthLabel(
  key
) {
  const [
    year,
    month
  ] =
    String(
      key ||
      ''
    )
      .split('-')
      .map(Number);


  if (
    !year ||
    !month
  ) {
    return 'Este mês';
  }


  return new Intl.DateTimeFormat(
    'pt-BR',
    {
      month:
        'long',

      year:
        'numeric'
    }
  ).format(
    new Date(
      year,
      month - 1,
      1
    )
  );
}


function formatNumber(
  value
) {
  return new Intl.NumberFormat(
    'pt-BR'
  ).format(
    Number(
      value ||
      0
    )
  );
}


function formatRelativeTime(
  value
) {
  const timestamp =
    Date.parse(
      value ||
      ''
    );


  if (
    !Number.isFinite(
      timestamp
    )
  ) {
    return 'agora';
  }


  const seconds =
    Math.max(
      0,

      Math.round(
        (
          Date.now() -
          timestamp
        ) /
        1000
      )
    );


  if (
    seconds < 45
  ) {
    return 'agora';
  }


  if (
    seconds <
    3600
  ) {
    return (
      `há ${
        Math.floor(
          seconds /
          60
        )
      } min`
    );
  }


  if (
    seconds <
    86400
  ) {
    return (
      `há ${
        Math.floor(
          seconds /
          3600
        )
      } h`
    );
  }


  return (
    `há ${
      Math.floor(
        seconds /
        86400
      )
    } d`
  );
}


/* =========================================================
   DEMO
========================================================= */

function startDemo() {
  state.demo =
    true;


  els.answerScope.textContent =
    'MODO DEMO';


  state.source = {
    type:
      'demo',

    name:
      'Modo Demo'
  };


  state.tracks = [
    {
      name:
        'Blinding Lights',

      artists: [
        {
          name:
            'The Weeknd'
        }
      ],

      album: {
        images: []
      },

      external_urls: {
        spotify:
          'https://open.spotify.com/'
      },

      uri:
        'demo:track'
    }
  ];


  state.queue =
    Array.from(
      {
        length:
          5
      },

      () => ({
        ...state.tracks[0]
      })
    );


  state.roundIndex =
    0;


  state.score =
    0;


  state.streak =
    0;


  state.bestStreak =
    0;


  state.hits =
    0;


  els.sourceLabel.textContent =
    'MODO DEMO';


  els.roundTotal.textContent =
    '5';


  els.score.textContent =
    '0';


  els.streak.textContent =
    '0';


  showView(
    'game'
  );


  prepareRound();


  toast(
    'Demo visual: a resposta é “Blinding Lights”.'
  );
}


/* =========================================================
   PKCE / UTILS
========================================================= */

function randomString(
  length
) {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';


  const bytes =
    crypto.getRandomValues(
      new Uint8Array(
        length
      )
    );


  return Array.from(
    bytes,

    byte =>
      chars[
        byte %
        chars.length
      ]
  ).join('');
}


async function sha256Base64Url(
  input
) {
  const digest =
    await crypto.subtle.digest(
      'SHA-256',

      new TextEncoder()
        .encode(
          input
        )
    );


  return btoa(
    String.fromCharCode(
      ...new Uint8Array(
        digest
      )
    )
  )
    .replace(
      /\+/g,
      '-'
    )
    .replace(
      /\//g,
      '_'
    )
    .replace(
      /=+$/,
      ''
    );
}


function shuffle(
  array
) {
  for (
    let i =
      array.length - 1;

    i > 0;

    i--
  ) {
    const j =
      Math.floor(
        Math.random() *
        (
          i + 1
        )
      );


    [
      array[i],
      array[j]
    ] = [
      array[j],
      array[i]
    ];
  }


  return array;
}


function normalize(
  value = ''
) {
  return value
    .toLowerCase()

    .normalize(
      'NFD'
    )

    .replace(
      /[\u0300-\u036f]/g,
      ''
    )

    .replace(
      /[^a-z0-9]+/g,
      ' '
    )

    .trim();
}


function formatTime(
  seconds
) {
  const value =
    Math.max(
      0,
      seconds
    );


  if (
    value < 1
  ) {
    return (
      `${value.toFixed(1)}s`
    );
  }


  if (
    value < 10
  ) {
    return (
      `${value.toFixed(
        value % 1
          ? 1
          : 0
      )}s`
    );
  }


  return (
    `0:${
      Math.ceil(
        value
      )
        .toString()
        .padStart(
          2,
          '0'
        )
    }`
  );
}


function formatStage(
  seconds
) {
  return (
    `${
      Number.isInteger(
        seconds
      )
        ? seconds
        : seconds.toFixed(1)
    }s`
  );
}


function sleep(
  ms
) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


function escapeHtml(
  value = ''
) {
  return value.replace(
    /[&<>'"]/g,

    character => ({
      '&':
        '&amp;',

      '<':
        '&lt;',

      '>':
        '&gt;',

      "'":
        '&#39;',

      '"':
        '&quot;'
    })[character]
  );
}


function escapeAttr(
  value = ''
) {
  return escapeHtml(
    value
  );
}


function toast(
  message,
  error = false
) {
  clearTimeout(
    toastTimer
  );


  els.toast.textContent =
    message;


  els.toast
    .classList
    .toggle(
      'error',
      error
    );


  els.toast
    .classList
    .add('show');


  toastTimer =
    setTimeout(
      () =>
        els.toast
          .classList
          .remove('show'),

      3200
    );
}