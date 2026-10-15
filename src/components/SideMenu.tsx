import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import type { ReactNode } from 'react'
import { useStack, type Section } from '../nav/stack'

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
)

const items: { section: Section; label: string; icon: ReactNode }[] = [
  { section: 'home', label: 'خانه', icon: icon(<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />) },
  { section: 'search', label: 'جستجو', icon: icon(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5" /></>) },
  { section: 'browse', label: 'دسته‌بندی‌ها', icon: icon(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>) },
  { section: 'mylist', label: 'لیست من', icon: icon(<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />) },
  { section: 'profile', label: 'تنظیمات', icon: icon(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>) },
]

// A rail on the right (start) edge of every top-level screen; it widens to show labels while focused.
export function SideMenu({ current }: { current: Section }) {
  const { ref, focusKey, hasFocusedChild } = useFocusable({ focusKey: `menu-${current}`, trackChildren: true, saveLastFocusedChild: false })
  return (
    <FocusContext.Provider value={focusKey}>
      <nav ref={ref} className={`rail ${hasFocusedChild ? 'open' : ''}`}>
        {items.map((it) => (
          <MenuItem key={it.section} {...it} owner={current} active={it.section === current} />
        ))}
      </nav>
    </FocusContext.Provider>
  )
}

function MenuItem({ section, label, icon, active, owner }: {
  section: Section
  label: string
  icon: ReactNode
  active: boolean
  owner: Section
}) {
  const { navigate } = useStack()
  const go = () => {
    if (!active) navigate(section)
  }
  // Screens below the top stay mounted, so keys are scoped by the screen that owns the menu.
  const { ref, focused } = useFocusable({ focusKey: `menu-${owner}-${section}`, onEnterPress: go })
  return (
    <div ref={ref} className={`rail-item ${focused ? 'focused' : ''} ${active ? 'active' : ''}`} onClick={go}>
      <span className="rail-icon">
        {icon}
      </span>
      <span className="rail-label">{label}</span>
    </div>
  )
}
