// CCloud and UI data types for Samsung Tizen TV app.

export type Sizes = { small?: string; medium?: string; large?: string; big?: string }
export type Formats = { webp?: string; jpg?: string }

export type TitleImage = {
  poster?: { preview?: string; webp?: Sizes; jpg?: Sizes }
  cover?: Formats
}

export type Score = { score: number | null; votes?: number | null; link?: string }

// One Title shape is shared by home rows, search, archive, lists and detail.
export type Title = {
  id: number
  post_type: 'title' | string
  options: {
    title_type: 'movie' | 'series' | 'anime' | string
    stream: boolean
    is_series: boolean
    persian_subtitle: boolean
    exclusive_subtitle?: boolean
    coming_soon: boolean
    free_stream: boolean
  }
  info: {
    seasons?: number | null
    year?: number | null
    year_end?: number | null
    age?: string | null
    time?: { default?: number | null }
  }
  title: { english: string; local: string | null }
  plot?: { english?: string | null; local?: string | null }
  genre?: ({ name: string; slug: string } | string)[]
  cast?: Person[]
  crew?: { director?: Person[] | null; creator?: Person[] | null; writer?: Person[] | null }
  image?: TitleImage
  score?: { '30nama'?: Score; imdb?: Score; rottentomatoes?: Score; metacritic?: Score; myanimelist?: Score }
  network?: string[] | null
  country?: { name: string; code: string }[] | null
  air?: {
    air_status?: string | null
    next_episode_caption?: string | null
    next_episode_date?: { g?: string; j?: string } | null
  }
  list?: { watchlist?: number; favorite?: number }
  // continue_watching entries only
  data?: ContinueData
  // Raw CCloud sources if loaded with item
  ccloudSources?: CCloudSource[]
}

// Entry in the continue_watching list. `id` is the title's post id.
export type ContinueData = {
  id: number
  episode_title?: string
  season?: number
  episode?: number
  file_id?: number
  time: number
  duration?: number
  display_time?: string
  progress: number | string
}

// Resume point inside a stream response; `file_id` identifies the episode or movie file.
export type StreamResume = {
  post_id: number
  file_id: number
  time: number
  progress?: number
  season?: number
  episode_number?: number
  episode_name?: string
}

export type Person = {
  id?: number | null
  name: string
  as?: string
  imdb?: string
  image?: { poster?: string | Formats }
}

export type Page = { posts: Title[]; page?: number; pages?: number; total?: number }

export type HomeStream = {
  hero_header?: Page
  suggested?: Page
  movies?: Page
  series?: Page
  anime?: Page
}

export type MenuItem = {
  id: number
  name: string
  slug: string
  count?: number
  image?: { webp?: { thumb?: string; full?: string }; jpg?: { thumb?: string; full?: string } }
}
export type Menu = { genres: MenuItem[]; categories: MenuItem[] }

export type User = {
  user_id: number
  user_name: string
  user_type: string
  user_allowed_to_stream: boolean
  user_avatar?: string
  user_expire?: { days: number; g?: string; j?: string }
}

export type QualitySource = {
  label: string
  default: string
  '2ch'?: string
  '6ch'?: string
  height?: number
  type?: string
}

export type StreamItem = {
  info: { file_id: number; season?: number; episode?: string; episode_number?: number; episode_name?: string }
  file: { m3u8: QualitySource[]; subtitle?: Partial<Record<'fa' | 'en', string>> | null }
  options: {
    intro_start?: string | null
    intro_end?: string | null
    previously_start?: string | null
    previously_end?: string | null
    end?: string | null
    token: string
  }
}

export type Stream = {
  info: { post_id: number; title: { english: string; local: string | null } }
  image?: TitleImage
  continue_watching?: StreamResume | null
  hls: StreamItem[]
}

export type QrCode = { code: string; url: string }

export type Notification = {
  id: number
  title?: string
  text?: string
  message?: string
  content?: string
  read?: boolean | number
  date?: string | { g?: string; j?: string }
  post_id?: number
}
export type Notifications = { notifications: Notification[]; total_unread?: number; page?: number; pages?: number }

export type AdvancedParameters = {
  genre: { name: string; value: string | number }[]
  type: { name: string; value: string | number }[]
  imdb_rate: { name: string; value: string | number }[]
  country: { name: string; value: string | number }[]
  language: { name: string; value: string | number }[]
  min_year: number
  max_year: number
}
export type MyLists = Record<'favorite' | 'watchlist' | 'downloadlist' | 'notify', { post: number[] }>

// ==========================================
// CCloud Native Data Models (from Android App)
// ==========================================

export interface CCloudGenre {
  id: number
  title: string
}

export interface CCloudSource {
  id: number
  quality: string
  type: string
  url: string
}

export interface CCloudCountry {
  id: number
  title: string
  image?: string
}

export interface CCloudMovie {
  id: number
  type: string
  title: string
  description: string
  year: number
  imdb: number
  rating: number
  duration: string | null
  image: string
  cover: string
  genres: CCloudGenre[]
  sources: CCloudSource[]
  country: CCloudCountry[]
}

export interface CCloudSeries {
  id: number
  type: string
  title: string
  description: string
  year: number
  imdb: number
  rating: number
  duration: string | null
  image: string
  cover: string
  genres: CCloudGenre[]
  country: CCloudCountry[]
}

export interface CCloudEpisode {
  id: number
  title: string
  description: string | null
  duration: string | null
  image?: string | null
  sources: CCloudSource[]
}

export interface CCloudSeason {
  id: number
  title: string
  episodes: CCloudEpisode[]
}

export interface CCloudPoster {
  id: number
  title: string
  type: string
  description: string
  year: number
  imdb: number
  rating: number
  duration: string | null
  image: string
  cover: string
  genres: CCloudGenre[]
  sources?: CCloudSource[]
  country: CCloudCountry[]
}

export interface CCloudSearchResult {
  posters: CCloudPoster[]
}

// ==========================================
// Parsing & Mapping Utilities
// ==========================================

export interface ParsedDescription {
  localTitle?: string
  englishTitle?: string
  plot?: string
  director?: string
  cast?: string[]
  age?: string
  hasPersianSub: boolean
  isDubbed: boolean
}

export function parseCCloudDescription(desc: string | null | undefined): ParsedDescription {
  if (!desc) {
    return { hasPersianSub: true, isDubbed: false }
  }

  const clean = desc.replace(/\r/g, '')

  // Extract Persian Title
  const localMatch = clean.match(/(?:نام پارسی(?: سریال)?|نام فیلم)\s*:\s*([^\n]+)/i)
  const localTitle = localMatch ? localMatch[1].trim().split(',')[0].trim() : undefined

  // Extract English / Original Title
  const enMatch = clean.match(/(?:نام اصلی(?: سریال)?)\s*:\s*([^\n]+)/i)
  const englishTitle = enMatch ? enMatch[1].trim() : undefined

  // Extract Director
  const dirMatch = clean.match(/کارگردان\s*:\s*([^\n]+)/i)
  const director = dirMatch ? dirMatch[1].trim() : undefined

  // Extract Cast / Stars
  const castMatch = clean.match(/(?:ستارگان|بازیگران(?: فیلم)?)\s*:\s*([^\n]+)/i)
  let cast: string[] | undefined
  if (castMatch) {
    cast = castMatch[1]
      .split(/[,،—]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1 && !s.startsWith('-'))
  }

  // Extract Age
  const ageMatch = clean.match(/رده سنی\s*:\s*([^\n]+)/i)
  const age = ageMatch ? ageMatch[1].trim() : undefined

  // Extract Plot / Summary
  const plotMatch = clean.match(/خلاصه (?:داستان|سریال)\s*[:]?\s*([\s\S]*?)(?=(?:\n\s*زیرنویس|\n\s*وضعیت|\n\s*برای تماشای|$))/i)
  let plot: string | undefined
  if (plotMatch) {
    plot = plotMatch[1].trim()
  } else {
    // If no explicit plot header, strip technical headers and use remainder
    const stripped = clean
      .replace(/^[^\n]*\b(نام|امتیاز|ژانر|محصول|زبان|سال|رده|فرمت|کیفیت|حجم|کارگردان|ستارگان|بازیگران)[^\n]*$/gim, '')
      .trim()
    if (stripped.length > 20) plot = stripped
  }

  const hasPersianSub = /زیرنویس/i.test(clean)
  const isDubbed = /دوبله/i.test(clean)

  return { localTitle, englishTitle, plot, director, cast, age, hasPersianSub, isDubbed }
}

export function parseDurationMinutes(dur?: string | null): number | null {
  if (!dur) return null
  const num = parseInt(dur, 10)
  return Number.isFinite(num) && num > 0 ? num : null
}

export function parseHeightFromQuality(quality: string): number {
  if (/1080/i.test(quality)) return 1080
  if (/720/i.test(quality)) return 720
  if (/480/i.test(quality)) return 480
  if (/2160|4k/i.test(quality)) return 2160
  return 0
}

export function ccloudPosterToTitle(p: CCloudPoster): Title {
  const isSeries = p.type === 'serie'
  const parsed = parseCCloudDescription(p.description)
  const durationMin = parseDurationMinutes(p.duration)
  const englishName = parsed.englishTitle || p.title
  const localName = parsed.localTitle || (isLatin(p.title) ? null : p.title)

  const castPersons: Person[] = (parsed.cast ?? []).map((name) => ({ name }))
  const directors: Person[] = parsed.director ? [{ name: parsed.director }] : []

  return {
    id: p.id,
    post_type: 'title',
    options: {
      title_type: isSeries ? 'series' : 'movie',
      stream: true,
      is_series: isSeries,
      persian_subtitle: parsed.hasPersianSub,
      coming_soon: false,
      free_stream: true,
    },
    info: {
      year: p.year || null,
      age: parsed.age || null,
      time: durationMin ? { default: durationMin } : undefined,
    },
    title: {
      english: englishName,
      local: localName,
    },
    plot: {
      english: p.description || null,
      local: parsed.plot || p.description || null,
    },
    genre: (p.genres ?? []).map((g) => ({ name: g.title, slug: `genre-${g.id}` })),
    cast: castPersons,
    crew: directors.length > 0 ? { director: directors } : undefined,
    image: {
      poster: {
        jpg: {
          small: p.image,
          medium: p.image,
          large: p.image,
          big: p.image,
        },
      },
      cover: {
        jpg: p.cover || p.image,
      },
    },
    score: {
      imdb: p.imdb ? { score: Math.round(p.imdb * 10) / 10 } : undefined,
    },
    country: (p.country ?? []).map((c) => ({ name: c.title, code: String(c.id) })),
    ccloudSources: p.sources,
  }
}

export function ccloudMovieToTitle(m: CCloudMovie): Title {
  return ccloudPosterToTitle({ ...m, type: 'movie' })
}

export function ccloudSeriesToTitle(s: CCloudSeries): Title {
  return ccloudPosterToTitle({ ...s, type: 'serie' })
}

export function ccloudMovieToStream(movie: CCloudMovie, titleInfo?: Partial<Title>): Stream {
  const parsed = parseCCloudDescription(movie.description)
  const englishName = titleInfo?.title?.english || parsed.englishTitle || movie.title
  const localName = titleInfo?.title?.local || parsed.localTitle || null

  const sources: QualitySource[] = (movie.sources ?? []).map((s) => ({
    label: s.quality || `${s.type.toUpperCase()}`,
    default: s.url,
    height: parseHeightFromQuality(s.quality),
    type: s.type,
  }))

  const item: StreamItem = {
    info: {
      file_id: movie.id,
      episode_name: localName || englishName,
    },
    file: {
      m3u8: sources,
      subtitle: parsed.hasPersianSub ? { fa: '' } : null,
    },
    options: {
      token: 'ccloud',
    },
  }

  return {
    info: {
      post_id: movie.id,
      title: { english: englishName, local: localName },
    },
    image: {
      poster: { jpg: { large: movie.image } },
      cover: { jpg: movie.cover || movie.image },
    },
    hls: [item],
  }
}

export function ccloudSeasonsToStream(
  seriesId: number,
  seasons: CCloudSeason[],
  titleInfo?: Partial<Title>,
): Stream {
  const englishName = titleInfo?.title?.english || 'Series'
  const localName = titleInfo?.title?.local || null

  const hls: StreamItem[] = []

  seasons.forEach((season, sIdx) => {
    const seasonNumber = sIdx + 1
    ;(season.episodes ?? []).forEach((ep, epIdx) => {
      const episodeNumber = epIdx + 1
      const sources: QualitySource[] = (ep.sources ?? []).map((src) => ({
        label: src.quality || `${src.type.toUpperCase()}`,
        default: src.url,
        height: parseHeightFromQuality(src.quality),
        type: src.type,
      }))

      hls.push({
        info: {
          file_id: ep.id,
          season: seasonNumber,
          episode_number: episodeNumber,
          episode_name: ep.title || `قسمت ${episodeNumber}`,
        },
        file: {
          m3u8: sources,
          subtitle: { fa: '' },
        },
        options: {
          token: 'ccloud',
        },
      })
    })
  })

  return {
    info: {
      post_id: seriesId,
      title: { english: englishName, local: localName },
    },
    image: titleInfo?.image,
    hls,
  }
}

// Helpers
export function nameOf(t: { title: { english: string; local: string | null } }): string {
  return t.title.local?.trim() || t.title.english
}

export const isLatin = (s: string) => !/[\u0600-\u06FF]/.test(s)

export function posterOf(t: Title, size: keyof Sizes = 'large'): string | undefined {
  const p = t.image?.poster
  return p?.webp?.[size] || p?.jpg?.[size]
}

export function coverOf(t: { image?: TitleImage }): string | undefined {
  return t.image?.cover?.webp || t.image?.cover?.jpg
}

export function hms(s?: string | null): number | null {
  if (!s) return null
  const parts = s.split(':').map(Number)
  if (parts.some(Number.isNaN)) return null
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}
