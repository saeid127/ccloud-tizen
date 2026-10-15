import { useState } from 'react'
import { api } from '../api/endpoints'
import type { Page, Title } from '../api/types'
import { Button } from '../components/Button'
import { Grid } from '../components/Grid'
import { Screen } from '../components/Screen'
import { useStack, type ListSource } from '../nav/stack'

// CCloud supports three native filter orders: created (default), imdb, and year
type Order = 'created' | 'imdb' | 'year'

function fetcher(source: ListSource, order: Order): (page: number) => Promise<Page> {
  if (source.kind === 'archive') return (page) => api.archive(source.slug, page, order)
  if (source.kind === 'filter') return (page) => api.advancedSearch(source.params, page, order)
  return (page) => api.advancedSearch({ [source.role]: source.name }, page, order)
}

export function ListScreen({ title, source, active, routeKey }: { title: string; source: ListSource; active: boolean; routeKey: string }) {
  const { push } = useStack()
  const [order, setOrder] = useState<Order>('created')
  const open = (t: Title) => push({ name: 'title', id: t.id })
  const subtitle = source.kind === 'person' ? (source.role === 'actor' ? 'آثار بازیگر' : 'آثار کارگردان') : null

  return (
    <Screen id={`list-${routeKey}`} active={active}>
      <div className="page">
        <div className="scroll-page">
          <div className="page-head">
            <div>
              {subtitle && <div className="page-kicker">{subtitle}</div>}
              <h1 className={/[؀-ۿ]/.test(title) ? '' : 'latin'}>{title}</h1>
            </div>
            <div className="chips">
              <Button className={order === 'created' ? 'selected' : ''} onPress={() => setOrder('created')}>
                جدیدترین
              </Button>
              <Button className={order === 'imdb' ? 'selected' : ''} onPress={() => setOrder('imdb')}>
                برترین IMDb
              </Button>
              <Button className={order === 'year' ? 'selected' : ''} onPress={() => setOrder('year')}>
                سال ساخت
              </Button>
            </div>
          </div>
          <Grid
            key={order}
            queryKey={['list', routeKey, order]}
            fetchPage={fetcher(source, order)}
            onOpen={open}
            focusKey={`list-${routeKey}-grid`}
            autoFocus={active}
          />
        </div>
      </div>
    </Screen>
  )
}
