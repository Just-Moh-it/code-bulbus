import { useEffect } from 'react'

/** Suffix every page carries, so a pinned tab still reads as ours. */
const SUFFIX = 'bulbus'

/**
 * Set `document.title` for as long as this component is mounted.
 *
 * Route `head()` covers static pages; this covers titles that only exist once
 * client state has loaded (a project's name, whether it is simulating), which
 * is every canvas page. Pass `null` while the name is still unknown so the
 * route's own head title stays.
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title === SUFFIX ? SUFFIX : `${title} · ${SUFFIX}`
    return () => {
      document.title = previous
    }
  }, [title])
}
