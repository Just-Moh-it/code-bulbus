import { useEffect } from 'react'
import {
  ensureAnonymousSession,
  isAnonymous,
  promptOneTap,
  useSession,
} from '#/lib/auth-client'

/** Let the first paint settle before Google's overlay drops in. */
const ONE_TAP_DELAY_MS = 1500

// Module scope, not refs: these must survive StrictMode's double mount so the
// session is created once and One Tap is shown at most once per page load.
let sessionRequested = false
let oneTapShown = false

/**
 * Invisible: makes sure every visitor has (at least) an anonymous session, then
 * offers Google One Tap to the ones still anonymous. Renders nothing, and does
 * nothing during SSR — all of it runs from effects.
 */
export function OneTapPrompt() {
  const { data, isPending } = useSession()
  const user = data?.user ?? null
  // Primitives, so a fresh session object per render cannot keep rescheduling.
  const anonymous = !!user && isAnonymous(user)

  useEffect(() => {
    if (sessionRequested) return
    sessionRequested = true
    void ensureAnonymousSession().catch(() => {
      // Nothing to offer the user here; the UI stays in its signed-out state.
      sessionRequested = false
    })
  }, [])

  useEffect(() => {
    if (oneTapShown || isPending || !anonymous) return
    const timer = setTimeout(() => {
      oneTapShown = true
      void promptOneTap().catch(() => {
        // One Tap is best-effort: blocked, unsupported or dismissed is fine.
      })
    }, ONE_TAP_DELAY_MS)
    return () => clearTimeout(timer)
  }, [isPending, anonymous])

  return null
}
