// Samsung remote key codes (Tizen TV) plus desktop equivalents for development.
export const Keys = {
  Back: [10009, 8, 27], // Return, Backspace, Escape
  Enter: [13],
  PlayPause: [10252, 32], // MediaPlayPause, Space
  Play: [415],
  Pause: [19],
  Stop: [413],
  FastForward: [417, 190], // MediaFastForward, "."
  Rewind: [412, 188], // MediaRewind, ","
  NextTrack: [10233, 78], // MediaTrackNext, "n"
  PrevTrack: [10232, 80], // MediaTrackPrevious, "p"
  Red: [403, 82], // ColorF0Red, "r" opens the debug log
} as const

export const is = (e: KeyboardEvent, k: keyof typeof Keys) => (Keys[k] as readonly number[]).includes(e.keyCode)

type TizenInput = { registerKey: (name: string) => void }
type TizenApp = { getCurrentApplication: () => { exit: () => void } }
type AppCommon = { setScreenSaver: (state: number) => void; AppCommonScreenSaverState: { SCREEN_SAVER_OFF: number; SCREEN_SAVER_ON: number } }
export type AVPlayTrack = {
  type: 'VIDEO' | 'AUDIO' | 'TEXT'
  index: number
  extra_info:
    | string
    | {
        track_lang?: string
        language?: string
        fourCC?: string
        sub_type?: string
        track_num?: number
      }
}

export type AVPlayListener = {
  onbufferingstart?: () => void
  onbufferingprogress?: (percent: number) => void
  onbufferingcomplete?: () => void
  oncurrentplaytime?: (timeMs: number) => void
  onsubtitlechange?: (duration: number, text: string, data3?: unknown, data4?: unknown) => void
  onstreamcompleted?: () => void
  onerror?: (eventType: string) => void
}

export type WebapisAvplay = {
  open: (url: string) => void
  close: () => void
  prepare: () => void
  prepareAsync: (successCallback?: () => void, errorCallback?: (err: unknown) => void) => void
  play: () => void
  pause: () => void
  stop: () => void
  seekTo: (milliseconds: number, successCallback?: () => void, errorCallback?: (err: unknown) => void) => void
  getState: () => 'NONE' | 'IDLE' | 'READY' | 'PLAYING' | 'PAUSED'
  getCurrentTime: () => number
  getDuration: () => number
  setDisplayRect: (x: number, y: number, width: number, height: number) => void
  setDisplayMethod: (
    method: 'PLAYER_DISPLAY_MODE_LETTER_BOX' | 'PLAYER_DISPLAY_MODE_FULL_SCREEN' | 'PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO',
  ) => void
  setListener: (listener: AVPlayListener) => void
  getTotalTrackInfo: () => AVPlayTrack[]
  setSelectTrack: (trackType: 'TEXT' | 'AUDIO', index: number) => void
  setSilentSubtitle: (silent: boolean) => void
  setSubtitlePosition?: (offsetMs: number) => void
}

declare global {
  interface Window {
    tizen?: { tvinputdevice?: TizenInput; application?: TizenApp }
    // Samsung product API, loaded by index.html from $WEBAPIS on the TV only.
    webapis?: { appcommon?: AppCommon; avplay?: WebapisAvplay }
  }
}

export const isTizen = () => typeof window.tizen !== 'undefined'
export const isAvplaySupported = () =>
  typeof window !== 'undefined' && typeof window.webapis?.avplay !== 'undefined'

// Media and color keys are not delivered to web apps until they are registered.
export function registerTvKeys() {
  const input = window.tizen?.tvinputdevice
  if (!input) return
  for (const name of ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'MediaTrackNext', 'MediaTrackPrevious', 'ColorF0Red']) {
    try {
      input.registerKey(name)
    } catch {
      // Older firmware lacks some keys; the remote still works without them.
    }
  }
}

// Scroll areas are real scrollers (for GPU scrolling), so the browser would also scroll them on
// arrow keys. Spatial navigation owns the arrows; the browser's default is switched off.
export function blockNativeArrowScroll() {
  window.addEventListener('keydown', (e) => {
    if (e.keyCode >= 37 && e.keyCode <= 40) e.preventDefault()
  })
}

// The TV starts its screensaver after a few idle minutes, even over HTML5 video.
export function setScreenSaver(on: boolean) {
  const app = window.webapis?.appcommon
  if (!app) return
  try {
    const s = app.AppCommonScreenSaverState
    app.setScreenSaver(on ? s.SCREEN_SAVER_ON : s.SCREEN_SAVER_OFF)
  } catch {
    // Not every firmware exposes it; playback works without it.
  }
}

export function exitApp() {
  window.tizen?.application?.getCurrentApplication().exit()
}
