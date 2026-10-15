import { getCurrentFocusKey, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OBSERVER_EVERY_S } from '../api/config'
import { api } from '../api/endpoints'
import { hms, nameOf, type StreamItem } from '../api/types'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { log } from '../lib/log'
import { settings, useSettings } from '../lib/settings'
import { is, setScreenSaver } from '../lib/tv'
import { useStack } from '../nav/stack'
import { streamQuery } from '../screens/TitleScreen'
import { attach, type Engine, type Level, type TextTrackInfo } from './engine'
import { cueAt, loadCues, type Cue } from './subtitles'

type SubLang = 'fa' | 'en' | 'off'
type Panel = 'main' | 'quality' | 'subs' | 'episodes'

const HIDE_AFTER_MS = 5000
// Seek presses accumulate into one jump, applied once the viewer stops pressing.
const SEEK_COMMIT_MS = 700
const SEEK_BURST_MS = 450
const PEEK_MS = 2500
// Countdown before the next episode starts on its own.
const AUTO_NEXT_S = 10
// Without an "end" (credits) marker, the countdown starts this close to the end.
const TAIL_S = 25

const clock = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '--:--'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function cleanSubtitle(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '') // remove HTML/VTT tags
    .replace(/\{[^}]+\}/g, '') // remove ASS/SSA override tags like {\an8}
    .replace(/﻿/g, '')
    .replace(/\r/g, '')
    .trim()
}

export function Player({ id, fileId, active }: { id: number; fileId?: number; active: boolean }) {
  const { back, replace } = useStack()
  const stream = useQuery(streamQuery(id))

  const items = useMemo(() => stream.data?.hls ?? [], [stream.data])
  // No explicit file means "resume": use the stream's saved episode, else the first file.
  const target = fileId ?? stream.data?.continue_watching?.file_id
  const index = Math.max(0, target ? items.findIndex((i) => i.info.file_id === target) : 0)
  const item: StreamItem | undefined = items[index]
  const next = items[index + 1]
  const prev = index > 0 ? items[index - 1] : undefined
  const season = item?.info.season ?? 1
  // Memoised: the focus effect depends on it, and playback re-renders several times a second.
  const seasonItems = useMemo(() => items.filter((i) => (i.info.season ?? 1) === season), [items, season])

  const playerContainerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const [levels, setLevels] = useState<Level[]>([])
  const [level, setLevel] = useState(-1)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(NaN)
  const [paused, setPaused] = useState(true)
  const [buffering, setBuffering] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [controls, setControls] = useState(true)
  const [panel, setPanel] = useState<Panel>('main')
  const prefs = useSettings()
  const subLang = prefs.subLang
  const [cues, setCues] = useState<Cue[]>([])
  const [nativeSubtitle, setNativeSubtitle] = useState<string | null>(null)
  const [textTracks, setTextTracks] = useState<TextTrackInfo[]>([])
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const introStart = hms(item?.options.intro_start)
  const introEnd = hms(item?.options.intro_end)
  const creditsAt = hms(item?.options.end)
  const inIntro = introEnd !== null && time >= (introStart ?? 0) && time < introEnd - 1
  const nearEnd = !!next && Number.isFinite(duration) && (creditsAt !== null ? time >= creditsAt : duration - time <= TAIL_S)

  // ---- seeking: presses accumulate, a bar previews the target, the jump lands on release ----
  const seekRef = useRef<number | null>(null)
  const [seekTo, setSeekTo] = useState<number | null>(null)
  const [peek, setPeek] = useState(false)
  const seekTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const peekTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const burst = useRef({ n: 0, at: 0, dir: 0 })

  const commitSeek = useCallback(() => {
    clearTimeout(seekTimer.current)
    const targetTime = seekRef.current
    if (targetTime !== null) {
      if (engineRef.current) {
        engineRef.current.seek(targetTime)
      } else if (videoRef.current) {
        videoRef.current.currentTime = targetTime
      }
      setTime(targetTime)
    }
    seekRef.current = null
    setSeekTo(null)
  }, [])

  // Drops a pending seek, so a jump made by Previous or Back is not undone when its timer fires.
  const cancelSeek = useCallback(() => {
    clearTimeout(seekTimer.current)
    seekRef.current = null
    setSeekTo(null)
  }, [])

  const nudge = useCallback(
    (dir: 1 | -1, base = 10) => {
      const curDur = duration
      const curTime = seekRef.current ?? time
      if (!Number.isFinite(curDur) || curDur <= 0) return
      const now = Date.now()
      const b = burst.current
      // Holding the key (or pressing fast) speeds up: base steps, then 3x, then 6x.
      b.n = now - b.at < SEEK_BURST_MS && b.dir === dir ? b.n + 1 : 0
      b.at = now
      b.dir = dir
      const step = base * (b.n < 4 ? 1 : b.n < 10 ? 3 : 6)
      const targetPos = Math.max(0, Math.min(curDur - 1, curTime + dir * step))
      seekRef.current = targetPos
      setSeekTo(targetPos)
      clearTimeout(seekTimer.current)
      seekTimer.current = setTimeout(commitSeek, SEEK_COMMIT_MS)
      setPeek(true)
      clearTimeout(peekTimer.current)
      peekTimer.current = setTimeout(() => setPeek(false), PEEK_MS)
    },
    [duration, time, commitSeek],
  )

  // ---- next-episode countdown, measured in playback time so pausing pauses it -------------
  const [autoFrom, setAutoFrom] = useState<number | null>(null)
  const [autoCancelled, setAutoCancelled] = useState(false)
  const countdown = nearEnd && !autoCancelled && autoFrom !== null ? Math.max(0, Math.ceil(AUTO_NEXT_S - (time - autoFrom))) : null

  // ---- progress reporting ------------------------------------------------------------------
  const lastReport = useRef(0)
  const report = useCallback(
    (currentTime?: number) => {
      const pos = currentTime ?? engineRef.current?.currentTime() ?? videoRef.current?.currentTime ?? time
      if (!item || !(pos > 0)) return
      lastReport.current = pos
      const dur = engineRef.current?.duration() ?? duration
      api.saveContinue(
        id,
        item.info.file_id,
        Math.floor(pos),
        Math.floor(Number.isFinite(dur) && dur > 0 ? dur : 0),
        {
          season: item.info.season,
          episode: item.info.episode_number,
          episode_name: item.info.episode_name,
        },
      )
      log('continue_watching_saved', true, `${Math.floor(pos)}s`)
    },
    [id, item, duration, time],
  )

  useEffect(() => () => report(), [report])

  // ---- controls ----------------------------------------------------------------------------
  const showControls = useCallback(() => {
    setControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      const isCurrentlyPaused = engineRef.current?.isPaused() ?? videoRef.current?.paused ?? false
      if (!isCurrentlyPaused) {
        setControls(false)
        setPanel('main')
      }
    }, HIDE_AFTER_MS)
  }, [])

  const togglePlay = useCallback(() => {
    if (engineRef.current) {
      if (paused) engineRef.current.play()
      else engineRef.current.pause()
    } else if (videoRef.current) {
      if (videoRef.current.paused) videoRef.current.play().catch((e) => log('play', false, e))
      else videoRef.current.pause()
    }
  }, [paused])

  const playNext = useCallback(() => {
    if (!next) return
    report()
    replace({ name: 'player', id, fileId: next.info.file_id })
  }, [next, id, replace, report])

  // Previous-track restarts the episode first, like most players; a second press goes back one.
  const playPrev = useCallback(() => {
    cancelSeek()
    const cur = engineRef.current?.currentTime() ?? videoRef.current?.currentTime ?? time
    if (cur > 10 || !prev) {
      if (engineRef.current) engineRef.current.seek(0)
      else if (videoRef.current) videoRef.current.currentTime = 0
      setTime(0)
      return
    }
    if (!prev) return
    report()
    replace({ name: 'player', id, fileId: prev.info.file_id })
  }, [prev, id, replace, report, cancelSeek, time])

  // ---- media setup -------------------------------------------------------------------------
  useEffect(() => {
    const container = playerContainerRef.current
    const video = videoRef.current
    const sources = item?.file.m3u8 ?? []
    const url = sources[0]?.default
    if (!container || !url) return
    setError(null)
    setBuffering(true)
    setNativeSubtitle(null)
    log('stream', true, `file ${item.info.file_id}`)

    const { audio, quality, subLang: savedSubLang } = settings.get()
    const resume = stream.data?.continue_watching
    const startAt = resume && resume.file_id === item.info.file_id && resume.time > 0 ? resume.time : 0

    const engine = attach(
      container,
      video,
      url,
      { channels: audio, maxHeight: quality, subLang: savedSubLang },
      {
        onTimeUpdate: (t) => {
          setTime(t)
          if (Math.abs(t - lastReport.current) >= OBSERVER_EVERY_S) report(t)
          if (nearEnd && autoFrom === null) setAutoFrom(t)
          if (!nearEnd && autoFrom !== null) setAutoFrom(null)
        },
        onDurationChange: (d) => setDuration(d),
        onBuffering: (b) => setBuffering(b),
        onPlay: () => {
          setPaused(false)
          setScreenSaver(false)
          showControls()
        },
        onPause: () => {
          setPaused(true)
          setScreenSaver(true)
          setControls(true)
          report()
        },
        onEnded: () => {
          if (next && !autoCancelled) playNext()
          else back()
        },
        onError: (msg) => {
          log('playback', false, msg)
          setError(msg)
        },
        onSubtitleChange: (text) => {
          setNativeSubtitle(text ? text.trim() : null)
        },
        onTracksReady: (tracks) => {
          setTextTracks(tracks)
        },
      },
      sources,
      startAt,
    )
    engineRef.current = engine
    setLevels(engine.levels())
    setLevel(engine.currentLevel())

    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [item, stream.data?.continue_watching])

  // External subtitle loader (fallback if remote subtitle URLs exist)
  useEffect(() => {
    const url = subLang !== 'off' ? item?.file.subtitle?.[subLang] : undefined
    setCues([])
    if (!url) return
    loadCues(url)
      .then((c) => {
        setCues(c)
        log(`subtitle ${subLang}`, true, `${c.length} cues`)
      })
      .catch((e) => log(`subtitle ${subLang}`, false, e))
  }, [item, subLang])

  // Sync subtitle language preference with player engine
  useEffect(() => {
    engineRef.current?.setSubtitleLang(subLang)
    if (subLang === 'off') setNativeSubtitle(null)
  }, [subLang])

  // Paused means the viewer is still deciding, even if the count reached zero.
  useEffect(() => {
    if (countdown === 0 && !paused) playNext()
  }, [countdown, paused, playNext])

  // Pressing Home (or switching source) hides the app: stop playback and save the position.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        engineRef.current?.pause()
        videoRef.current?.pause()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      setScreenSaver(true)
    }
  }, [])

  const skipIntro = useCallback(() => {
    if (introEnd !== null) {
      if (engineRef.current) engineRef.current.seek(introEnd)
      else if (videoRef.current) videoRef.current.currentTime = introEnd
      setTime(introEnd)
    }
  }, [introEnd])

  useEffect(() => {
    // Like Netflix: the controls open on the seek bar, where OK pauses and Left/Right seek.
    const episodeAt = Math.max(0, seasonItems.findIndex((i) => i.info.file_id === item?.info.file_id))
    const key = panel === 'main' ? 'pl-seek' : panel === 'episodes' ? `pl-episodes-${episodeAt}` : `pl-${panel}-0`
    if (controls && active) setTimeout(() => setFocus(key), 0)
  }, [controls, panel, active, seasonItems, item])

  // Captures keys before spatial navigation and the stack, so the hidden-controls
  // state can map arrows to seeking and Back to "hide controls" first.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const stop = () => {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
      if (is(e, 'PlayPause') || is(e, 'Play') || is(e, 'Pause')) return stop(), togglePlay(), showControls()
      if (is(e, 'FastForward')) return stop(), nudge(1, 30)
      if (is(e, 'Rewind')) return stop(), nudge(-1, 30)
      if (is(e, 'NextTrack')) return stop(), playNext()
      if (is(e, 'PrevTrack')) return stop(), playPrev()
      if (is(e, 'Stop')) return stop(), back()
      if (is(e, 'Back')) {
        stop()
        if (countdown !== null) setAutoCancelled(true)
        else if (seekRef.current !== null) {
          // Back during a pending seek cancels it instead of leaving.
          cancelSeek()
        } else if (controls && panel !== 'main') setPanel('main')
        else if (controls && !paused) setControls(false)
        else back()
        return
      }
      if (controls) {
        showControls()
        // On the focused seek bar, Left/Right scrub instead of moving focus. The timeline is
        // drawn left-to-right, so Right moves forward even in the RTL UI.
        if (getCurrentFocusKey() === 'pl-seek' && (e.keyCode === 37 || e.keyCode === 39)) {
          stop()
          nudge(e.keyCode === 39 ? 1 : -1)
        }
        return
      }
      stop()
      if (is(e, 'Enter')) {
        if (seekRef.current !== null) commitSeek()
        else if (countdown !== null) playNext()
        else if (inIntro) skipIntro()
        else {
          togglePlay()
          showControls()
        }
      } else if (e.keyCode === 39) nudge(1)
      else if (e.keyCode === 37) nudge(-1)
      else showControls()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, controls, panel, inIntro, countdown, paused, togglePlay, nudge, commitSeek, cancelSeek, showControls, skipIntro, playNext, playPrev, back])

  const cue = useMemo(() => cueAt(cues, time), [cues, time])
  const activeSubtitle =
    subLang !== 'off'
      ? cue?.text
        ? cleanSubtitle(cue.text)
        : nativeSubtitle
        ? cleanSubtitle(nativeSubtitle)
        : null
      : null
  const title = stream.data ? nameOf(stream.data.info) : ''
  const shown = seekTo ?? time
  const pct = Number.isFinite(duration) && duration > 0 ? (shown / duration) * 100 : 0

  if (stream.isError) return <p className="error center">{(stream.error as Error).message}</p>

  return (
    <Screen id={`player-${id}`} active={active}>
      <div ref={playerContainerRef} className="player">
        <video
          ref={videoRef}
          className="video"
          playsInline
        />
        {activeSubtitle && (
          <div className={`subtitle size-${prefs.subSize} ${controls ? 'raised' : ''}`} dir="auto">
            {activeSubtitle.split('\n').map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
        )}
        {buffering && !error && <div className="spinner center" />}
        {error && <p className="error center">خطای پخش: {error}</p>}

        {!controls && inIntro && countdown === null && <div className="prompt">OK: رد کردن تیتراژ</div>}
        {countdown !== null && (
          <div className="prompt">
            قسمت بعد تا {countdown} ثانیه دیگر · OK: پخش · بازگشت: لغو
          </div>
        )}
        {!controls && (peek || seekTo !== null) && (
          <div className="peek">
            <Timeline time={shown} duration={duration} pct={pct} />
          </div>
        )}

        {controls && paused && !buffering && (
          <div className="center-state" aria-hidden>
            <svg viewBox="0 0 24 24" width="96" height="96" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </div>
        )}
        {controls && (
          <div className="osd">
            <div className="osd-top">
              <h1>{title}</h1>
              {item?.info.episode_name && <h2>{item.info.episode_name}</h2>}
            </div>
            <div className="osd-bottom">
              <SeekBar
                time={shown}
                duration={duration}
                pct={pct}
                paused={paused}
                onPress={() => (seekRef.current !== null ? commitSeek() : countdown !== null ? playNext() : togglePlay())}
              />
              {panel === 'main' && (
                <div className="osd-actions options">
                  {inIntro && (
                    <Button onPress={skipIntro}>
                      <Icon d="M5 4l10 8-10 8zM19 5v14" />
                      رد کردن تیتراژ
                    </Button>
                  )}
                  {next && (
                    <Button onPress={playNext}>
                      <Icon d="M5 4l10 8-10 8zM19 5v14" />
                      قسمت بعد
                    </Button>
                  )}
                  {seasonItems.length > 1 && (
                    <Button onPress={() => setPanel('episodes')}>
                      <Icon d="M4 6h16M4 12h16M4 18h10" />
                      قسمت‌ها
                    </Button>
                  )}
                  <Button onPress={() => setPanel('subs')}>
                    <Icon d="M3 5h18v14H3zM7 11h3M7 15h6M14 11h3M16 15h1" />
                    زیرنویس: {subLang === 'fa' ? 'فارسی' : subLang === 'en' ? 'انگلیسی' : 'خاموش'}
                  </Button>
                  {levels.length > 0 && (
                    <Button onPress={() => setPanel('quality')}>
                      <Icon d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" />
                      کیفیت: {level === -1 ? 'خودکار' : levels[level]?.label || (levels[level]?.height ? `${levels[level].height}p` : 'اصلی')}
                    </Button>
                  )}
                </div>
              )}
              {panel === 'episodes' && (
                <div className="osd-actions options">
                  {seasonItems.map((e, i) => (
                    <Button
                      key={e.info.file_id}
                      focusKey={`pl-episodes-${i}`}
                      className={e.info.file_id === item?.info.file_id ? 'selected' : ''}
                      onPress={() => {
                        setPanel('main')
                        if (e.info.file_id === item?.info.file_id) return
                        report()
                        replace({ name: 'player', id, fileId: e.info.file_id })
                      }}
                    >
                      قسمت {e.info.episode_number ?? e.info.episode}
                    </Button>
                  ))}
                </div>
              )}
              {panel === 'subs' && (
                <div className="osd-actions">
                  {(['fa', 'en', 'off'] as SubLang[]).map((l, i) => (
                    <Button
                      key={l}
                      focusKey={`pl-subs-${i}`}
                      className={l === subLang ? 'selected' : ''}
                      onPress={() => {
                        settings.set({ subLang: l })
                        engineRef.current?.setSubtitleLang(l)
                        if (l === 'off') setNativeSubtitle(null)
                        setPanel('main')
                      }}
                    >
                      {l === 'fa' ? 'فارسی' : l === 'en' ? 'انگلیسی' : 'خاموش'}
                    </Button>
                  ))}
                  {textTracks.length > 0 &&
                    textTracks.map((tr, i) => (
                      <Button
                        key={`track-${tr.index}`}
                        focusKey={`pl-subs-track-${i}`}
                        onPress={() => {
                          engineRef.current?.setSubtitleTrack(tr.index)
                          setPanel('main')
                        }}
                      >
                        تِرَک: {tr.label}
                      </Button>
                    ))}
                </div>
              )}
              {panel === 'quality' && (
                <div className="osd-actions">
                  {levels.map((l, i) => (
                    <Button
                      key={l.index}
                      focusKey={`pl-quality-${i}`}
                      className={l.index === level ? 'selected' : ''}
                      onPress={() => {
                        engineRef.current?.setLevel(l.index)
                        setLevel(l.index)
                        setPanel('main')
                      }}
                    >
                      {l.label || (l.height ? `${l.height}p` : l.index === -1 ? 'خودکار' : `کیفیت ${i + 1}`)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Screen>
  )
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

function Timeline({ time, duration, pct, focused, paused }: { time: number; duration: number; pct: number; focused?: boolean; paused?: boolean }) {
  return (
    <div className={`timeline ${focused ? 'focused' : ''}`} dir="ltr">
      {paused !== undefined && (
        <svg className="state" viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden>
          <path d={paused ? 'M8 5v14l11-7z' : 'M7 5h4v14H7zM13 5h4v14h-4z'} />
        </svg>
      )}
      <span>{clock(time)}</span>
      <div className="bar">
        <div style={{ width: `${pct}%` }} />
        <i className="thumb" style={{ left: `${pct}%` }} />
      </div>
      <span>-{clock(Math.max(0, duration - time))}</span>
    </div>
  )
}

// Focusable timeline in the controls, Netflix style: OK plays or pauses (or lands a pending
// seek), and the player's key handler scrubs it with Left/Right.
function SeekBar({ onPress, ...props }: { time: number; duration: number; pct: number; paused: boolean; onPress: () => void }) {
  const { ref, focused } = useFocusable({ focusKey: 'pl-seek', onEnterPress: onPress })
  return (
    <div ref={ref}>
      <Timeline {...props} focused={focused} />
    </div>
  )
}
