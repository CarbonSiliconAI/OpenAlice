import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../tabs/store'
import { getFocusedTab } from '../tabs/types'
import { SidebarRow } from './SidebarRow'

/**
 * News sidebar — phase-2 placeholder. Single "All News" item that opens
 * the existing NewsPage. Phase 3+ adds source list, category filters,
 * and saved articles, each opening filtered news tabs.
 */
export function NewsSidebar() {
  const focusedKind = useWorkspace((state) => getFocusedTab(state)?.spec.kind ?? null)
  const openOrFocus = useWorkspace((state) => state.openOrFocus)
  const { t } = useTranslation()

  return (
    <div className="py-0.5">
      <SidebarRow
        label={t('news.allNews')}
        active={focusedKind === 'news'}
        onClick={() => openOrFocus({ kind: 'news', params: {} })}
      />
    </div>
  )
}
