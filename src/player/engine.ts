import Hls from 'hls.js'
import type { QualitySource } from '../api/types'
import { isAvplaySupported } from '../lib/tv'
import { log } from '../lib/log'

export type Level = { index: number; height: number; label?: string }

export type TextTrackInfo = {
  index: number
  language: string
  label: string
}

export type Engine = {
  play: () => void
  pause: () => void
  seek: (seconds: number) => void
  currentTime: () => number
  duration: () => number
  isPaused: () => boolean
  levels: () => Level[]
  // -1 = automatic
  setLevel: (index: number) => void
  currentLevel: () => number
  textTracks: () => TextTrackInfo[]
  setSubtitleTrack: (index: number) => void
  setSubtitleLang: (lang: 'fa' | 'en' | 'off') => void
  destroy: () => void
}

export type Prefs = {
  // Audio channel count to prefer when a quality offers stereo and 5.1 ("2" or "6").
  channels: string
  // 0 = automatic; otherwise the highest height to start at and stay on.
  maxHeight: number
  // Preferred subtitle language: 'fa' | 'en' | 'off'
  subLang?: 'fa' | 'en' | 'off'
}

export type EngineCallbacks = {
  onTimeUpdate?: (seconds: number) => void
  onDurationChange?: (seconds: number) => void
  onBuffering?: (isBuffering: boolean) => void
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
  onError?: (msg: string) => void
  onSubtitleChange?: (text: string) => void
  onTracksReady?: (tracks: TextTrackInfo[]) => void
}

function pickInitialIndex(availableSources: QualitySource[], prefs: Prefs): number {
  if (availableSources.length <= 1) return 0

  // Filter out teaser/trailers if full video sources exist
  const nonTeasers = availableSources
    .map((s, idx) => ({ s, idx }))
    .filter(({ s }) => !/تیزر|trailer/i.test(s.label))
  let pool = nonTeasers.length > 0 ? nonTeasers : availableSources.map((s, idx) => ({ s, idx }))

  // If subtitles are requested (not 'off'), prioritize sources that offer subtitles over dubbed
  if (prefs.subLang !== 'off') {
    const subPool = pool.filter(
      ({ s }) => /زیرنویس|sub/i.test(s.label) || /sub/i.test(s.default),
    )
    if (subPool.length > 0) {
      pool = subPool
    }
  }

  if (prefs.maxHeight > 0) {
    let match = pool.find(({ s }) => (s.height ?? 0) === prefs.maxHeight)
    if (!match) {
      match = pool
        .filter(({ s }) => (s.height ?? 0) <= prefs.maxHeight)
        .sort((a, b) => (b.s.height ?? 0) - (a.s.height ?? 0))[0]
    }
    if (match) return match.idx
  }

  // Default: choose highest available non-teaser resolution
  const sorted = [...pool].sort((a, b) => (b.s.height ?? 0) - (a.s.height ?? 0))
  return sorted[0].idx
}

// Media player engine:
// 1. On Samsung Tizen TV: uses native webapis.avplay with hardware decoding,
//    container demuxing, and embedded MKV/MP4 subtitle track selection and rendering.
// 2. On desktop browser fallback: uses HLS.js or native HTML5 <video>.
export function attach(
  container: HTMLElement,
  video: HTMLVideoElement | null,
  url: string,
  prefs: Prefs,
  callbacks: EngineCallbacks,
  sources?: QualitySource[],
  startAt = 0,
): Engine {
  if (isAvplaySupported()) {
    log('player_engine', true, 'using native Samsung Tizen AVPlay engine')
    return attachAVPlay(container, video, url, prefs, callbacks, sources, startAt)
  }

  log('player_engine', true, 'using HTML5/HLS fallback engine')
  return attachHTML5(video, url, prefs, callbacks, sources, startAt)
}

function attachAVPlay(
  container: HTMLElement,
  video: HTMLVideoElement | null,
  url: string,
  prefs: Prefs,
  callbacks: EngineCallbacks,
  sources?: QualitySource[],
  startAt = 0,
): Engine {
  // Make sure body and layers are transparent so the hardware video overlay is visible
  document.body.classList.add('avplay-active')

  if (video) {
    video.style.display = 'none'
    try {
      video.pause()
      video.removeAttribute('src')
      video.load()
    } catch {
      // ignore
    }
  }

  let avplayObj = container.querySelector<HTMLObjectElement>('object[type="application/avplayer"]')
  if (!avplayObj) {
    avplayObj = document.createElement('object')
    avplayObj.type = 'application/avplayer'
    avplayObj.className = 'avplay-object'
    container.appendChild(avplayObj)
  }

  const availableSources = sources && sources.length > 0 ? sources : [{ label: 'اصلی', default: url }]
  let currentIdx = pickInitialIndex(availableSources, prefs)
  let activeUrl = availableSources[currentIdx]?.default || url

  const avplay = window.webapis!.avplay!
  let curTime = startAt
  let curDuration = 0
  let isPausedState = true
  let isDestroyed = false
  let availableTracks: TextTrackInfo[] = []
  let selectedSubLang = prefs.subLang ?? 'fa'
  let pendingTrackIndex: number | null = null
  let subClearTimer: ReturnType<typeof setTimeout> | undefined

  const isPersian = (lang: string, name: string): boolean => {
    const l = (lang || '').trim().toLowerCase()
    const n = (name || '').trim().toLowerCase()
    return (
      l.startsWith('fa') ||
      l.startsWith('pe') ||
      /فارسی|farsi|persian/i.test(n)
    )
  }

  const isEnglish = (lang: string, name: string): boolean => {
    const l = (lang || '').trim().toLowerCase()
    const n = (name || '').trim().toLowerCase()
    return (
      l.startsWith('en') ||
      /انگلیسی|english/i.test(n)
    )
  }

  const safeClose = () => {
    clearTimeout(subClearTimer)
    try {
      const state = avplay.getState()
      if (state !== 'NONE' && state !== 'IDLE') {
        avplay.stop()
      }
      if (state !== 'NONE') {
        avplay.close()
      }
    } catch (e) {
      log('avplay_close_err', false, e)
    }
  }

  const queryTextTracks = (): TextTrackInfo[] => {
    try {
      const rawTracks = avplay.getTotalTrackInfo() || []
      const textTracks: TextTrackInfo[] = []
      for (const t of rawTracks) {
        if (t.type === 'TEXT') {
          let lang = ''
          let name = ''
          if (t.extra_info) {
            try {
              const extra =
                typeof t.extra_info === 'string'
                  ? (JSON.parse(t.extra_info) as Record<string, string>)
                  : (t.extra_info as Record<string, string>)
              lang = (extra.track_lang || extra.language || '').toLowerCase()
              name = extra.track_name || extra.name || extra.title || ''
            } catch {
              // ignore malformed extra_info
            }
          }
          let label = ''
          if (isPersian(lang, name)) {
            label = 'فارسی'
          } else if (isEnglish(lang, name)) {
            label = 'انگلیسی'
          } else if (name) {
            label = name
          } else {
            label = `زیرنویس ${textTracks.length + 1}${lang ? ` (${lang.trim()})` : ''}`
          }
          textTracks.push({ index: t.index, language: lang.trim(), label })
        }
      }
      return textTracks
    } catch (e) {
      log('avplay_trackinfo_err', false, e)
      return []
    }
  }

  const applySubtitleSelection = (tracks: TextTrackInfo[], lang: 'fa' | 'en' | 'off') => {
    log('avplay_apply_subs', true, `lang=${lang}, tracks=${tracks.length}`)
    if (lang === 'off') {
      try {
        avplay.setSilentSubtitle(true)
        log('avplay_silent', true, 'true (off)')
      } catch (e) {
        log('avplay_silent_err', false, e)
      }
      callbacks.onSubtitleChange?.('')
      pendingTrackIndex = null
      return
    }

    if (tracks.length === 0) {
      log('avplay_subs', false, 'no text tracks found')
      return
    }

    // Priority: find Persian track, or English if requested, otherwise first available
    const track =
      tracks.find((t) =>
        lang === 'fa'
          ? isPersian(t.language, t.label)
          : isEnglish(t.language, t.label),
      ) || tracks[0]

    if (track) {
      try {
        avplay.setSilentSubtitle(false)
        const state = avplay.getState()
        if (state === 'PLAYING' || state === 'PAUSED') {
          avplay.setSelectTrack('TEXT', track.index)
          log('avplay_select_track', true, `track ${track.index} (${track.label})`)
          pendingTrackIndex = null
        } else {
          // In READY state, setSelectTrack throws PLAYER_ERROR_INVALID_STATE.
          // Store it to apply as soon as play() enters PLAYING state.
          pendingTrackIndex = track.index
          log('avplay_defer_track', true, `track ${track.index} in state ${state}`)
        }
      } catch (err) {
        log('avplay_select_track_err', false, err)
      }
    }
  }

  const loadAndStart = (targetUrl: string, resumeTime = 0) => {
    safeClose()
    try {
      callbacks.onBuffering?.(true)
      log('avplay_open', true, targetUrl)
      avplay.open(targetUrl)
      avplay.setDisplayRect(0, 0, 1920, 1080)
      avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX')

      try {
        if (selectedSubLang === 'off') {
          avplay.setSilentSubtitle(true)
        } else {
          avplay.setSilentSubtitle(false)
        }
      } catch {
        // ignore
      }

      avplay.setListener({
        onbufferingstart: () => callbacks.onBuffering?.(true),
        onbufferingprogress: () => callbacks.onBuffering?.(true),
        onbufferingcomplete: () => {
          callbacks.onBuffering?.(false)
          // Late track discovery if headers took initial packets
          if (availableTracks.length === 0) {
            const tracks = queryTextTracks()
            if (tracks.length > 0) {
              availableTracks = tracks
              log('avplay_late_tracks', true, `${tracks.length} tracks detected after buffer`)
              callbacks.onTracksReady?.(tracks)
              applySubtitleSelection(tracks, selectedSubLang)
            }
          }
        },
        oncurrentplaytime: (timeMs: number) => {
          curTime = timeMs / 1000
          callbacks.onTimeUpdate?.(curTime)
        },
        onsubtitlechange: (duration: number | string, text: string) => {
          clearTimeout(subClearTimer)
          const clean = text ? text.replace(/\r/g, '').trim() : ''
          log('avplay_onsubtitlechange', true, clean ? clean.slice(0, 30) : 'empty')
          if (selectedSubLang !== 'off' && clean) {
            callbacks.onSubtitleChange?.(clean)
            const durMs = parseInt(String(duration), 10)
            if (Number.isFinite(durMs) && durMs > 0) {
              subClearTimer = setTimeout(() => {
                callbacks.onSubtitleChange?.('')
              }, durMs)
            }
          } else {
            callbacks.onSubtitleChange?.('')
          }
        },
        onstreamcompleted: () => {
          callbacks.onEnded?.()
        },
        onerror: (eventType: string) => {
          log('avplay_onerror', false, eventType)
          callbacks.onError?.(`خطای پخش تایزن: ${eventType}`)
        },
      })

      avplay.prepareAsync(
        () => {
          if (isDestroyed) return
          log('avplay_prepared', true, 'ready')
          const durMs = avplay.getDuration() || 0
          curDuration = durMs > 0 ? durMs / 1000 : 0
          if (curDuration > 0) callbacks.onDurationChange?.(curDuration)

          // Query native subtitle tracks
          availableTracks = queryTextTracks()
          log(
            'avplay_text_tracks',
            true,
            `${availableTracks.length} tracks: ${availableTracks.map((t) => `${t.index}:${t.label}`).join(', ')}`,
          )
          callbacks.onTracksReady?.(availableTracks)
          applySubtitleSelection(availableTracks, selectedSubLang)

          if (resumeTime > 0) {
            try {
              avplay.seekTo(Math.max(100, Math.floor(resumeTime * 1000)))
            } catch {
              // ignore
            }
          }

          avplay.play()
          isPausedState = false
          callbacks.onPlay?.()
          callbacks.onBuffering?.(false)

          // In Tizen AVPlay, setSelectTrack is ONLY valid in PLAYING or PAUSED state!
          // Apply deferred track selection as soon as playback starts.
          const applyPending = () => {
            if (isDestroyed) return
            try {
              const s = avplay.getState()
              if (s === 'PLAYING' || s === 'PAUSED') {
                if (pendingTrackIndex !== null) {
                  avplay.setSelectTrack('TEXT', pendingTrackIndex)
                  log('avplay_apply_deferred', true, `track ${pendingTrackIndex}`)
                  pendingTrackIndex = null
                }
              }
            } catch (e) {
              log('avplay_deferred_err', false, e)
            }
          }
          setTimeout(applyPending, 150)
          setTimeout(applyPending, 500)
        },
        (err: unknown) => {
          if (isDestroyed) return
          const msg = (err as { message?: string })?.message || String(err)
          log('avplay_prepare_err', false, msg)
          callbacks.onError?.(`خطا در آماده‌سازی پخش تایزن: ${msg}`)
        },
      )
    } catch (e) {
      callbacks.onError?.(`خطا در شروع پخش: ${(e as Error).message}`)
    }
  }

  loadAndStart(activeUrl, startAt)

  return {
    play: () => {
      try {
        const s = avplay.getState()
        if (s === 'PAUSED' || s === 'READY') {
          avplay.play()
          isPausedState = false
          callbacks.onPlay?.()
        }
      } catch {
        // ignore
      }
    },
    pause: () => {
      try {
        const s = avplay.getState()
        if (s === 'PLAYING') {
          avplay.pause()
          isPausedState = true
          callbacks.onPause?.()
        }
      } catch {
        // ignore
      }
    },
    seek: (seconds: number) => {
      try {
        const ms = Math.max(100, Math.floor(seconds * 1000))
        avplay.seekTo(
          ms,
          () => {
            curTime = seconds
            callbacks.onTimeUpdate?.(curTime)
          },
          () => undefined,
        )
      } catch {
        // ignore
      }
    },
    currentTime: () => {
      try {
        const t = avplay.getCurrentTime()
        if (Number.isFinite(t) && t >= 0) curTime = t / 1000
      } catch {
        // ignore
      }
      return curTime
    },
    duration: () => {
      try {
        const d = avplay.getDuration()
        if (Number.isFinite(d) && d > 0) curDuration = d / 1000
      } catch {
        // ignore
      }
      return curDuration
    },
    isPaused: () => isPausedState,
    levels: () =>
      availableSources.map((s, index) => ({
        index,
        height: s.height ?? 0,
        label: s.label,
      })),
    setLevel: (newIdx: number) => {
      if (newIdx < 0 || newIdx >= availableSources.length || newIdx === currentIdx) return
      currentIdx = newIdx
      activeUrl = availableSources[newIdx].default
      const savedTime = curTime
      loadAndStart(activeUrl, savedTime)
    },
    currentLevel: () => currentIdx,
    textTracks: () => availableTracks,
    setSubtitleTrack: (index: number) => {
      try {
        avplay.setSilentSubtitle(false)
        const s = avplay.getState()
        if (s === 'PLAYING' || s === 'PAUSED') {
          avplay.setSelectTrack('TEXT', index)
          log('avplay_select_track', true, `manual track ${index}`)
          pendingTrackIndex = null
        } else {
          pendingTrackIndex = index
        }
      } catch (e) {
        log('avplay_select_track_err', false, e)
      }
    },
    setSubtitleLang: (lang: 'fa' | 'en' | 'off') => {
      selectedSubLang = lang
      applySubtitleSelection(availableTracks, lang)
    },
    destroy: () => {
      isDestroyed = true
      document.body.classList.remove('avplay-active')
      safeClose()
      if (avplayObj && avplayObj.parentNode) {
        avplayObj.parentNode.removeChild(avplayObj)
      }
    },
  }
}

function attachHTML5(
  video: HTMLVideoElement | null,
  url: string,
  prefs: Prefs,
  callbacks: EngineCallbacks,
  sources?: QualitySource[],
  startAt = 0,
): Engine {
  if (!video) {
    throw new Error('Video element required for HTML5 engine')
  }

  video.style.display = 'block'
  const isHls = url.toLowerCase().includes('.m3u8')

  const availableSources = sources && sources.length > 0 ? sources : [{ label: 'اصلی', default: url }]
  let currentIdx = pickInitialIndex(availableSources, prefs)
  let activeUrl = availableSources[currentIdx]?.default || url

  const onTime = () => callbacks.onTimeUpdate?.(video.currentTime)
  const onDur = () => callbacks.onDurationChange?.(video.duration)
  const onPlayEv = () => callbacks.onPlay?.()
  const onPauseEv = () => callbacks.onPause?.()
  const onWaitingEv = () => callbacks.onBuffering?.(true)
  const onPlayingEv = () => callbacks.onBuffering?.(false)
  const onEndedEv = () => callbacks.onEnded?.()
  const onErrorEv = () => callbacks.onError?.(`native: ${video.error?.code ?? 'خطا در بارگذاری ویدیو'}`)

  video.addEventListener('timeupdate', onTime)
  video.addEventListener('durationchange', onDur)
  video.addEventListener('play', onPlayEv)
  video.addEventListener('pause', onPauseEv)
  video.addEventListener('waiting', onWaitingEv)
  video.addEventListener('playing', onPlayingEv)
  video.addEventListener('ended', onEndedEv)
  video.addEventListener('error', onErrorEv)

  if (isHls && Hls.isSupported()) {
    const hls = new Hls({
      maxBufferLength: 30,
      backBufferLength: 30,
      capLevelToPlayerSize: false,
      abrEwmaDefaultEstimate: 5_000_000,
    })

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
      else callbacks.onError?.(`${data.type}: ${data.details}`)
    })

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (startAt > 0) video.currentTime = startAt
      if (!prefs.maxHeight) return
      let pick = -1
      hls.levels.forEach((l, i) => {
        if (l.height <= prefs.maxHeight && (pick === -1 || l.height > hls.levels[pick].height)) pick = i
      })
      if (pick >= 0) {
        hls.startLevel = pick
        hls.currentLevel = pick
      }
    })

    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_e, data) => {
      const i = data.audioTracks.findIndex((t) => t.channels === prefs.channels)
      if (i >= 0 && hls.audioTrack !== i) hls.audioTrack = i
    })

    hls.loadSource(url)
    hls.attachMedia(video)

    return {
      play: () => video.play().catch(() => undefined),
      pause: () => video.pause(),
      seek: (s: number) => {
        video.currentTime = s
      },
      currentTime: () => video.currentTime,
      duration: () => video.duration,
      isPaused: () => video.paused,
      levels: () => hls.levels.map((l, index) => ({ index, height: l.height })),
      setLevel: (i) => (hls.currentLevel = i),
      currentLevel: () => (hls.autoLevelEnabled ? -1 : hls.currentLevel),
      textTracks: () => [],
      setSubtitleTrack: () => undefined,
      setSubtitleLang: () => undefined,
      destroy: () => {
        cleanupVideoListeners()
        hls.destroy()
      },
    }
  }

  // Direct video playback
  video.src = activeUrl
  if (startAt > 0) {
    const onMeta = () => {
      video.currentTime = startAt
      video.removeEventListener('loadedmetadata', onMeta)
    }
    video.addEventListener('loadedmetadata', onMeta)
  }

  function cleanupVideoListeners() {
    video!.removeEventListener('timeupdate', onTime)
    video!.removeEventListener('durationchange', onDur)
    video!.removeEventListener('play', onPlayEv)
    video!.removeEventListener('pause', onPauseEv)
    video!.removeEventListener('waiting', onWaitingEv)
    video!.removeEventListener('playing', onPlayingEv)
    video!.removeEventListener('ended', onEndedEv)
    video!.removeEventListener('error', onErrorEv)
  }

  return {
    play: () => video.play().catch(() => undefined),
    pause: () => video.pause(),
    seek: (s: number) => {
      video.currentTime = s
    },
    currentTime: () => video.currentTime,
    duration: () => video.duration,
    isPaused: () => video.paused,
    levels: () =>
      availableSources.map((s, index) => ({
        index,
        height: s.height ?? 0,
        label: s.label,
      })),
    setLevel: (newIdx: number) => {
      if (newIdx < 0 || newIdx >= availableSources.length || newIdx === currentIdx) return
      const targetSrc = availableSources[newIdx].default
      const savedTime = video.currentTime
      const wasPaused = video.paused

      currentIdx = newIdx
      video.src = targetSrc
      video.load()

      const onCanPlay = () => {
        if (savedTime > 0) video.currentTime = savedTime
        if (!wasPaused) video.play().catch(() => undefined)
        video.removeEventListener('canplay', onCanPlay)
      }
      video.addEventListener('canplay', onCanPlay, { once: true })
    },
    currentLevel: () => currentIdx,
    textTracks: () => [],
    setSubtitleTrack: () => undefined,
    setSubtitleLang: () => undefined,
    destroy: () => {
      cleanupVideoListeners()
      video.removeAttribute('src')
      video.load()
    },
  }
}
