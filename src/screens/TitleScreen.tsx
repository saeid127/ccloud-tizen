import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from '../api/endpoints'
import { coverOf, isLatin, nameOf, posterOf, type MyLists, type Person, type StreamItem } from '../api/types'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { log } from '../lib/log'
import { useStack } from '../nav/stack'

export const streamQuery = (id: number) => ({ queryKey: ['stream', id], queryFn: () => api.stream(id), staleTime: 10 * 60_000 })

export function TitleScreen({ id, active }: { id: number; active: boolean }) {
  const { push } = useStack()
  const single = useQuery({ queryKey: ['single', id], queryFn: () => api.single(id), staleTime: 30 * 60_000 })
  const lists = useQuery({ queryKey: ['mylists'], queryFn: api.myLists, staleTime: 60_000 })
  const qc = useQueryClient()
  const t = single.data
  const canStream = !!t?.options.stream
  const stream = useQuery({ ...streamQuery(id), enabled: canStream && !!t?.options.is_series })

  const seasons = useMemo(() => {
    const map = new Map<number, StreamItem[]>()
    for (const item of stream.data?.hls ?? []) {
      const s = item.info.season ?? 1
      map.set(s, [...(map.get(s) ?? []), item])
    }
    return map
  }, [stream.data])
  const resume = stream.data?.continue_watching
  const [season, setSeason] = useState<number | null>(null)
  const currentSeason = season ?? (resume?.season || seasons.keys().next().value || 1)

  if (single.isError) return <p className="error center">{(single.error as Error).message}</p>
  if (!t) return <div className="spinner center" />

  const play = (fileId?: number) => push({ name: 'player', id, fileId })
  const inList = (g: 'watchlist' | 'favorite') => !!lists.data?.[g]?.post.includes(id)
  // Optimistic: flip the cached list first, then let the server answer settle it.
  const toggle = (g: 'watchlist' | 'favorite') => {
    qc.setQueryData<MyLists>(['mylists'], (old) => {
      if (!old) return old
      const posts = old[g].post
      return { ...old, [g]: { ...old[g], post: posts.includes(id) ? posts.filter((p) => p !== id) : [...posts, id] } }
    })
    api
      .toggleList(g, id)
      .then((r) => log(`list ${g}`, r.success, r.msg))
      .catch((e) => log(`list ${g}`, false, e))
      .finally(() => {
        qc.invalidateQueries({ queryKey: ['mylists'] })
        qc.invalidateQueries({ queryKey: ['mylist', g] })
      })
  }
  const person = (p: Person, role: 'actor' | 'director') => push({ name: 'list', title: p.name, source: { kind: 'person', role, name: p.name, imdb: p.imdb } })
  const directors = (t.crew?.director ?? []).slice(0, 2)
  const cast = (t.cast ?? []).slice(0, 5)
  const genres = (t.genre ?? []).map((g) => (typeof g === 'string' ? g : g.name)).join('، ')

  return (
    <Screen id={`title-${id}`} active={active} initialFocus={`title-${id}-play`}>
      <div className="title-page" style={{ backgroundImage: `url(${coverOf(t)})` }}>
        <div className="hero-shade" />
        <div className="title-body">
          <img className="title-poster" src={posterOf(t, 'large')} alt="" />
          <div className="title-info">
            <h1 className={isLatin(nameOf(t)) ? 'latin' : ''}>{nameOf(t)}</h1>
            {t.title.local && <h3 className="en latin">{t.title.english}</h3>}
            <div className="meta">
              {!!t.info.year && <span>{t.info.year}{t.info.year_end ? `–${t.info.year_end}` : ''}</span>}
              {!!t.info.time?.default && <span>{t.info.time.default} دقیقه</span>}
              {t.info.age && <span>{t.info.age}</span>}
              {!!t.score?.imdb?.score && <span className="imdb">IMDb {t.score.imdb.score}</span>}
              {t.options.persian_subtitle && <span className="badge-inline">زیرنویس فارسی</span>}
              {t.ccloudSources && t.ccloudSources.length > 0 && (
                <span className="badge-inline">
                  {t.ccloudSources.map((s) => s.quality).filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            {genres && <div className="genres">{genres}</div>}
            <p className="plot">{t.plot?.local || t.plot?.english}</p>
            {t.air?.next_episode_date?.j && (
              <p className="air">{t.air.next_episode_caption}: {t.air.next_episode_date.j}</p>
            )}
            <div className="actions">
              {canStream ? (
                <Button focusKey={`title-${id}-play`} variant="primary" onPress={() => play(resume?.file_id)}>
                  {resume && resume.time > 0 ? `▶ ادامه ${resume.episode_name ?? ''}` : '▶ پخش'}
                </Button>
              ) : (
                <Button focusKey={`title-${id}-play`} onPress={() => undefined}>
                  {t.options.coming_soon ? 'به‌زودی' : 'پخش آنلاین ندارد'}
                </Button>
              )}
              <Button className={inList('watchlist') ? 'selected' : ''} onPress={() => toggle('watchlist')}>
                {inList('watchlist') ? '✓ در لیست تماشا' : '+ لیست تماشا'}
              </Button>
              <Button className={inList('favorite') ? 'selected' : ''} onPress={() => toggle('favorite')}>
                {inList('favorite') ? '♥ علاقه‌مندی' : '♡ علاقه‌مندی'}
              </Button>
            </div>
            {(directors.length > 0 || cast.length > 0) && (
              <div className="people">
                {directors.map((p) => (
                  <Button key={`d-${p.name}`} className="person latin" onPress={() => person(p, 'director')}>
                    <span className="person-role">کارگردان</span> {p.name}
                  </Button>
                ))}
                {cast.map((p) => (
                  <Button key={`a-${p.name}`} className="person latin" onPress={() => person(p, 'actor')}>
                    {p.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
        {seasons.size > 0 && (
          <Episodes
            seasons={seasons}
            season={currentSeason}
            onSeason={setSeason}
            currentFile={resume?.file_id}
            onPlay={play}
          />
        )}
      </div>
    </Screen>
  )
}

function Episodes({ seasons, season, onSeason, currentFile, onPlay }: {
  seasons: Map<number, StreamItem[]>
  season: number
  onSeason: (s: number) => void
  currentFile?: number
  onPlay: (fileId: number) => void
}) {
  const { ref, focusKey } = useFocusable({ saveLastFocusedChild: true })
  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={ref} className="episodes">
        <div className="season-tabs">
          {[...seasons.keys()].map((s) => (
            <Button key={s} className={s === season ? 'selected' : ''} onPress={() => onSeason(s)}>
              فصل {s}
            </Button>
          ))}
        </div>
        <div className="episode-list">
          {(seasons.get(season) ?? []).map((e) => (
            <Episode key={e.info.file_id} item={e} current={e.info.file_id === currentFile} onPlay={onPlay} />
          ))}
        </div>
      </section>
    </FocusContext.Provider>
  )
}

function Episode({ item, current, onPlay }: { item: StreamItem; current: boolean; onPlay: (fileId: number) => void }) {
  const { ref, focused } = useFocusable({
    onEnterPress: () => onPlay(item.info.file_id),
    onFocus: () => ref.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }),
  })
  return (
    <div ref={ref} className={`episode ${focused ? 'focused' : ''} ${current ? 'current' : ''}`} onClick={() => onPlay(item.info.file_id)}>
      <span className="episode-num">{item.info.episode_number ?? item.info.episode}</span>
      <span>{item.info.episode_name}</span>
    </div>
  )
}
