// CCloud Data Adapter and Endpoints for Tizen TV.
// Maps CCloud Android repositories (Movie, Series, Seasons, Search, Genre, Country)
// into the app's existing UI models (Title, Page, Stream, HomeStream, Menu, etc.).

import { executeRequest } from './client'
import { API_BASE, API_KEY } from './config'
import {
  ccloudMovieToStream,
  ccloudPosterToTitle,
  ccloudSeasonsToStream,
  type AdvancedParameters,
  type CCloudCountry,
  type CCloudGenre,
  type CCloudMovie,
  type CCloudPoster,
  type CCloudSearchResult,
  type CCloudSeason,
  type CCloudSeries,
  type ContinueData,
  type HomeStream,
  type Menu,
  type MenuItem,
  type MyLists,
  type Notifications,
  type Page,
  type QrCode,
  type Stream,
  type Title,
  type User,
} from './types'

// Local cache for titles to support instant detail navigation and offline playback resume
const titleCache = new Map<number, Title>()

// Local storage keys
const STORAGE_WATCHLIST = 'ccloud.watchlist'
const STORAGE_FAVORITES = 'ccloud.favorites'
const STORAGE_CONTINUE = 'ccloud.continue_watching'

function getStoredList(key: string): number[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as number[]) : []
  } catch {
    return []
  }
}

function setStoredList(key: string, list: number[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // quota exceeded or private mode
  }
}

function getStoredContinue(): Record<number, ContinueData & { title?: Title }> {
  try {
    const raw = localStorage.getItem(STORAGE_CONTINUE)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function setStoredContinue(data: Record<number, ContinueData & { title?: Title }>): void {
  try {
    localStorage.setItem(STORAGE_CONTINUE, JSON.stringify(data))
  } catch {
    // quota exceeded
  }
}

function cacheTitle(t: Title): Title {
  titleCache.set(t.id, t)
  try {
    sessionStorage.setItem(`ccloud.title.${t.id}`, JSON.stringify(t))
  } catch {
    // quota exceeded or private mode
  }
  return t
}

export const api = {
  // ---- Authentication & User ----------------------------------------------------------------
  // CCloud requires no account authentication ("No Login Required").
  // Returns a default guest profile for UI compatibility.
  qrCode: async (): Promise<QrCode> => ({ code: 'ccloud', url: 'https://github.com/code3-dev/CCloud' }),
  qrLogin: async (_code?: string) => 'ccloud-session',
  user: async (): Promise<User> => ({
    user_id: 1,
    user_name: 'کاربر CCloud',
    user_type: 'free',
    user_allowed_to_stream: true,
    user_expire: undefined,
  }),
  logout: async (): Promise<void> => {
    localStorage.removeItem(STORAGE_CONTINUE)
  },

  // ---- CCloud Repositories ------------------------------------------------------------------

  // 1. MovieRepository: /api/movie/by/filtres/{genreId}/{filterType}/{page}/{API_KEY}/
  getMovies: async (
    page = 0,
    genreId = 0,
    filterType: 'created' | 'year' | 'imdb' = 'created',
  ): Promise<Page> => {
    const url = `${API_BASE}/movie/by/filtres/${genreId}/${filterType}/${page}/${API_KEY}/`
    const movies = await executeRequest<CCloudMovie[]>(url)
    const posts = (Array.isArray(movies) ? movies : []).map((m) => {
      const t = ccloudPosterToTitle({ ...m, type: 'movie' })
      return cacheTitle(t)
    })
    return { posts, page: page + 1, pages: page + (posts.length > 0 ? 2 : 1) }
  },

  // 2. SeriesRepository: /api/serie/by/filtres/{genreId}/{filterType}/{page}/{API_KEY}/
  getSeries: async (
    page = 0,
    genreId = 0,
    filterType: 'created' | 'year' | 'imdb' = 'created',
  ): Promise<Page> => {
    const url = `${API_BASE}/serie/by/filtres/${genreId}/${filterType}/${page}/${API_KEY}/`
    const series = await executeRequest<CCloudSeries[]>(url)
    const posts = (Array.isArray(series) ? series : []).map((s) => {
      const t = ccloudPosterToTitle({ ...s, type: 'serie' })
      return cacheTitle(t)
    })
    return { posts, page: page + 1, pages: page + (posts.length > 0 ? 2 : 1) }
  },

  // 3. SeasonsRepository: /api/season/by/serie/{seriesId}/{API_KEY}/
  getSeasons: async (seriesId: number): Promise<CCloudSeason[]> => {
    const url = `${API_BASE}/season/by/serie/${seriesId}/${API_KEY}/`
    const seasons = await executeRequest<CCloudSeason[]>(url)
    return Array.isArray(seasons) ? seasons : []
  },

  // 4. SearchRepository: /api/search/{query}/{API_KEY}/
  search: async (query: string, page = 1): Promise<Page> => {
    const encoded = encodeURIComponent(query.trim()).replace(/%20/g, '+')
    const url = `${API_BASE}/search/${encoded}/${API_KEY}/`
    const result = await executeRequest<CCloudSearchResult>(url)
    const all = (result?.posters ?? []).map((p) => {
      const t = ccloudPosterToTitle(p)
      return cacheTitle(t)
    })
    // CCloud search returns all results in one response; paginate on client (18 per page)
    const pageSize = 18
    const start = (page - 1) * pageSize
    const posts = all.slice(start, start + pageSize)
    const pages = Math.ceil(all.length / pageSize) || 1
    return { posts, page, pages, total: all.length }
  },

  // 5. GenreRepository: /api/genre/all/{API_KEY}/
  getGenres: async (): Promise<CCloudGenre[]> => {
    const url = `${API_BASE}/genre/all/${API_KEY}/`
    const genres = await executeRequest<CCloudGenre[]>(url)
    return Array.isArray(genres) ? genres : []
  },

  // 6. CountryRepository: /api/country/all/{API_KEY}/
  getCountries: async (): Promise<CCloudCountry[]> => {
    const url = `${API_BASE}/country/all/${API_KEY}/`
    const countries = await executeRequest<CCloudCountry[]>(url)
    return Array.isArray(countries) ? countries : []
  },

  // 7. CountryPostersRepository: /api/poster/by/filtres/0/{countryId}/{filterType}/{page}/{API_KEY}/
  getCountryPosters: async (
    countryId: number,
    page = 0,
    filterType: 'created' | 'year' | 'imdb' = 'created',
  ): Promise<Page> => {
    const url = `${API_BASE}/poster/by/filtres/0/${countryId}/${filterType}/${page}/${API_KEY}/`
    const posters = await executeRequest<CCloudPoster[]>(url)
    const posts = (Array.isArray(posters) ? posters : []).map((p) => {
      const t = ccloudPosterToTitle(p)
      return cacheTitle(t)
    })
    return { posts, page: page + 1, pages: page + (posts.length > 0 ? 2 : 1) }
  },

  // ---- High-level Application Flows ---------------------------------------------------------

  // Home Screen: builds hero banner and categorized rows from CCloud data
  homeStream: async (): Promise<HomeStream> => {
    const [latestMovies, latestSeries, topRated, anime] = await Promise.all([
      api.getMovies(0, 0, 'created').catch(() => ({ posts: [] })),
      api.getSeries(0, 0, 'created').catch(() => ({ posts: [] })),
      api.getMovies(0, 0, 'imdb').catch(() => ({ posts: [] })),
      // Genre 3 is "انیمیشن + انیمه" in CCloud
      api.getMovies(0, 3, 'created').catch(() => ({ posts: [] })),
    ])

    // Interleave top movie and series for the hero header
    const heroPosts: Title[] = []
    if (latestMovies.posts[0]) heroPosts.push(latestMovies.posts[0])
    if (latestSeries.posts[0]) heroPosts.push(latestSeries.posts[0])
    if (latestMovies.posts[1]) heroPosts.push(latestMovies.posts[1])

    return {
      hero_header: { posts: heroPosts.length ? heroPosts : latestMovies.posts.slice(0, 3) },
      suggested: { posts: topRated.posts.slice(0, 12) },
      movies: { posts: latestMovies.posts.slice(0, 12) },
      series: { posts: latestSeries.posts.slice(0, 12) },
      anime: { posts: anime.posts.slice(0, 12) },
    }
  },

  // Browse Screen: categories and genres from CCloud
  menu: async (): Promise<Menu> => {
    const [genres, countries] = await Promise.all([
      api.getGenres().catch(() => []),
      api.getCountries().catch(() => []),
    ])

    const categories: MenuItem[] = [
      { id: 1001, name: 'فیلم‌ها', slug: 'movies' },
      { id: 1002, name: 'سریال‌ها', slug: 'series' },
      { id: 1003, name: 'برترین فیلم‌ها (IMDb)', slug: 'top-movies' },
      { id: 1004, name: 'برترین سریال‌ها (IMDb)', slug: 'top-series' },
    ]

    const genreItems: MenuItem[] = genres.map((g) => ({
      id: g.id,
      name: g.title,
      slug: `genre-${g.id}`,
    }))

    // Add country items under categories if available
    const countryItems: MenuItem[] = countries.slice(0, 20).map((c) => ({
      id: 2000 + c.id,
      name: c.title,
      slug: `country-${c.id}`,
      image: c.image ? { jpg: { thumb: c.image, full: c.image } } : undefined,
    }))

    return {
      categories: [...categories, ...countryItems],
      genres: genreItems,
    }
  },

  // Archive / Filter Grid Fetcher
  archive: async (
    slug: string,
    page = 1,
    orderBy: 'relevant' | 'year' | 'imdb' | string = 'relevant',
  ): Promise<Page> => {
    const apiPage = Math.max(0, page - 1)
    const filterType = orderBy === 'imdb' ? 'imdb' : orderBy === 'year' ? 'year' : 'created'

    if (slug === 'movies') {
      return api.getMovies(apiPage, 0, filterType)
    }
    if (slug === 'series') {
      return api.getSeries(apiPage, 0, filterType)
    }
    if (slug === 'top-movies') {
      return api.getMovies(apiPage, 0, 'imdb')
    }
    if (slug === 'top-series') {
      return api.getSeries(apiPage, 0, 'imdb')
    }
    if (slug.startsWith('genre-')) {
      const genreId = parseInt(slug.replace('genre-', ''), 10)
      return api.getMovies(apiPage, genreId, filterType)
    }
    if (slug.startsWith('country-')) {
      const countryId = parseInt(slug.replace('country-', ''), 10)
      return api.getCountryPosters(countryId, apiPage, filterType)
    }

    // Default fallback
    return api.getMovies(apiPage, 0, filterType)
  },

  // Advanced Search Parameters
  advancedSearchParameters: async (): Promise<AdvancedParameters> => {
    const [genres, countries] = await Promise.all([
      api.getGenres().catch(() => []),
      api.getCountries().catch(() => []),
    ])

    return {
      type: [
        { name: 'فیلم', value: 'movie' },
        { name: 'سریال', value: 'serie' },
      ],
      genre: genres.map((g) => ({ name: g.title, value: g.id })),
      country: countries.map((c) => ({ name: c.title, value: c.id })),
      imdb_rate: [
        { name: 'بالای ۸', value: 8 },
        { name: 'بالای ۷', value: 7 },
        { name: 'بالای ۶', value: 6 },
        { name: 'بالای ۵', value: 5 },
      ],
      language: [],
      min_year: 1950,
      max_year: 2026,
    }
  },

  // Advanced Search Query
  advancedSearch: async (
    parameters: {
      type?: string | string[]
      genre?: (string | number)[]
      country?: (string | number)[]
      imdb_rate?: number
      actor?: string
      director?: string
    },
    page = 1,
    orderBy: 'relevant' | 'year' | 'imdb' | string = 'relevant',
  ): Promise<Page> => {
    const apiPage = Math.max(0, page - 1)
    const filterType = orderBy === 'imdb' ? 'imdb' : orderBy === 'year' ? 'year' : 'created'

    // If person search (actor or director), use search query
    if (parameters.actor || parameters.director) {
      return api.search(parameters.actor || parameters.director || '', page)
    }

    const genreId = Array.isArray(parameters.genre) && parameters.genre.length > 0 ? Number(parameters.genre[0]) : 0
    const countryId = Array.isArray(parameters.country) && parameters.country.length > 0 ? Number(parameters.country[0]) : 0
    const type = Array.isArray(parameters.type) ? parameters.type[0] : parameters.type

    if (countryId > 0) {
      return api.getCountryPosters(countryId, apiPage, filterType)
    }
    if (type === 'serie') {
      return api.getSeries(apiPage, genreId, filterType)
    }
    return api.getMovies(apiPage, genreId, filterType)
  },

  // Title Details (single)
  single: async (postId: number): Promise<Title> => {
    const cached = titleCache.get(postId)
    if (cached) return cached

    try {
      const fromSession = sessionStorage.getItem(`ccloud.title.${postId}`)
      if (fromSession) {
        const parsed = JSON.parse(fromSession) as Title
        titleCache.set(postId, parsed)
        return parsed
      }
    } catch {
      // ignore
    }

    // Check continue-watching store
    const cw = getStoredContinue()[postId]
    if (cw?.title) return cacheTitle(cw.title)

    // If not in cache, fallback to search or first movie page
    try {
      const page = await api.getMovies(0, 0, 'created')
      const match = page.posts.find((p) => p.id === postId)
      if (match) return match
    } catch {
      // ignore
    }

    // Defensive minimal title object
    return {
      id: postId,
      post_type: 'title',
      options: {
        title_type: 'movie',
        stream: true,
        is_series: false,
        persian_subtitle: true,
        coming_soon: false,
        free_stream: true,
      },
      info: { year: 2026 },
      title: { english: `Title ${postId}`, local: null },
      plot: { local: 'اطلاعات این عنوان در دسترس نیست.', english: null },
    }
  },

  // Stream & Media Sources (playback)
  stream: async (postId: number): Promise<Stream> => {
    const title = titleCache.get(postId)
    const isSeries = title?.options.is_series ?? false

    if (isSeries) {
      const seasons = await api.getSeasons(postId)
      const st = ccloudSeasonsToStream(postId, seasons, title)
      // Check if continue watching exists for this series
      const saved = getStoredContinue()[postId]
      if (saved) {
        st.continue_watching = {
          post_id: postId,
          file_id: saved.file_id ?? postId,
          time: saved.time,
          season: saved.season,
          episode_number: saved.episode,
          episode_name: saved.episode_title,
        }
      }
      return st
    }

    // Movie stream
    if (title?.ccloudSources && title.ccloudSources.length > 0) {
      const movieData: CCloudMovie = {
        id: title.id,
        type: 'movie',
        title: title.title.english,
        description: title.plot?.english || '',
        year: title.info.year || 2026,
        imdb: title.score?.imdb?.score || 0,
        rating: 0,
        duration: null,
        image: title.image?.poster?.jpg?.large || '',
        cover: title.image?.cover?.jpg || '',
        genres: [],
        sources: title.ccloudSources,
        country: [],
      }
      const st = ccloudMovieToStream(movieData, title)
      const saved = getStoredContinue()[postId]
      if (saved) {
        st.continue_watching = {
          post_id: postId,
          file_id: postId,
          time: saved.time,
        }
      }
      return st
    }

    // If sources weren't cached, attempt to reload movie from movies list
    try {
      const res = await api.getMovies(0, 0, 'created')
      const refreshed = res.posts.find((p) => p.id === postId)
      if (refreshed?.ccloudSources && refreshed.ccloudSources.length > 0) {
        const movieData: CCloudMovie = {
          id: refreshed.id,
          type: 'movie',
          title: refreshed.title.english,
          description: refreshed.plot?.english || '',
          year: refreshed.info.year || 2026,
          imdb: refreshed.score?.imdb?.score || 0,
          rating: 0,
          duration: null,
          image: refreshed.image?.poster?.jpg?.large || '',
          cover: refreshed.image?.cover?.jpg || '',
          genres: [],
          sources: refreshed.ccloudSources,
          country: [],
        }
        return ccloudMovieToStream(movieData, refreshed)
      }
    } catch {
      // fallback below
    }

    throw new Error('منابع پخش برای این عنوان یافت نشد')
  },

  // Continue Watching (Local Storage Persistence)
  continueWatching: async (): Promise<Page> => {
    const record = getStoredContinue()
    const posts: Title[] = []

    for (const [idStr, data] of Object.entries(record)) {
      const id = Number(idStr)
      let t = titleCache.get(id) || data.title
      if (t) {
        t = {
          ...t,
          data: {
            id,
            episode_title: data.episode_title,
            season: data.season,
            episode: data.episode,
            file_id: data.file_id,
            time: data.time,
            progress: data.duration ? Math.round((data.time / data.duration) * 100) : 0,
          },
        }
        posts.push(t)
      }
    }

    return { posts: posts.reverse(), page: 1, pages: 1 }
  },

  saveContinue: (
    postId: number,
    fileId: number,
    time: number,
    duration: number,
    episodeInfo?: { season?: number; episode?: number; episode_name?: string },
  ): void => {
    if (time <= 5) return // Don't record trivial initial seconds
    const record = getStoredContinue()
    const title = titleCache.get(postId)
    record[postId] = {
      id: postId,
      file_id: fileId,
      time: Math.floor(time),
      duration: Math.floor(duration),
      season: episodeInfo?.season,
      episode: episodeInfo?.episode,
      episode_title: episodeInfo?.episode_name,
      progress: duration > 0 ? Math.round((time / duration) * 100) : 0,
      title,
    }
    setStoredContinue(record)
  },

  dismissContinue: async (id: number): Promise<{ success: boolean }> => {
    const record = getStoredContinue()
    delete record[id]
    setStoredContinue(record)
    return { success: true }
  },

  // Library / Watchlist & Favorites (Local Storage Persistence)
  myLists: async (): Promise<MyLists> => {
    const watchlist = getStoredList(STORAGE_WATCHLIST)
    const favorite = getStoredList(STORAGE_FAVORITES)
    return {
      watchlist: { post: watchlist },
      favorite: { post: favorite },
      downloadlist: { post: [] },
      notify: { post: [] },
    }
  },

  list: async (group: string, _page = 1): Promise<Page> => {
    const key = group === 'favorite' ? STORAGE_FAVORITES : STORAGE_WATCHLIST
    const ids = getStoredList(key)
    const posts: Title[] = []

    for (const id of ids) {
      const t = titleCache.get(id)
      if (t) posts.push(t)
    }

    return { posts, page: 1, pages: 1, total: posts.length }
  },

  toggleList: async (group: string, postId: number): Promise<{ success: boolean; msg: string }> => {
    const key = group === 'favorite' ? STORAGE_FAVORITES : STORAGE_WATCHLIST
    const list = getStoredList(key)
    const idx = list.indexOf(postId)
    let msg = ''
    if (idx >= 0) {
      list.splice(idx, 1)
      msg = 'از لیست حذف شد'
    } else {
      list.push(postId)
      msg = 'به لیست اضافه شد'
    }
    setStoredList(key, list)
    return { success: true, msg }
  },

  // Notifications (defensive stub)
  notifications: async (_page = 1): Promise<Notifications> => ({
    notifications: [],
    total_unread: 0,
    page: 1,
    pages: 1,
  }),
  readNotification: async (_id?: number): Promise<{ success: boolean }> => ({ success: true }),
}
