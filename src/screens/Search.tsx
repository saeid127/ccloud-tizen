import { useEffect, useState } from 'react'
import { api } from '../api/endpoints'
import type { Title } from '../api/types'
import { Grid } from '../components/Grid'
import { Keyboard } from '../components/Keyboard'
import { Screen } from '../components/Screen'
import { SideMenu } from '../components/SideMenu'
import { useStack } from '../nav/stack'

const DEBOUNCE_MS = 450
// Minimal characters to trigger search
const MIN_CHARS = 2

// Results refresh as the viewer types, which stands in for autocomplete.
export function Search({ active }: { active: boolean }) {
  const { push } = useStack()
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [text])

  const open = (t: Title) => push({ name: 'title', id: t.id })

  return (
    <Screen id="search" active={active} initialFocus="search-kb-first">
      <div className="page has-rail">
        <SideMenu current="search" />
        <div className="search">
          <div className="search-input">
            <div className={`search-text ${text ? '' : 'placeholder'}`} dir="auto">
              {text || 'نام فیلم، سریال یا انیمه'}
              <span className="caret" />
            </div>
            <Keyboard value={text} onChange={setText} focusKey="search-kb" />
          </div>
          <div className="search-results">
            {query.length >= MIN_CHARS ? (
              <Grid
                key={query}
                queryKey={['search', query]}
                fetchPage={(page) => api.search(query, page)}
                onOpen={open}
                columns={3}
                focusKey="search-grid"
                empty={`نتیجه‌ای برای «${query}» پیدا نشد`}
              />
            ) : (
              <p className="grid-note">دست‌کم سه حرف بنویسید.</p>
            )}
          </div>
        </div>
      </div>
    </Screen>
  )
}
