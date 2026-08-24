import { createAuthClient } from 'better-auth/react'
import { anonymousClient, oneTapClient } from 'better-auth/client/plugins'

/**
 * Browser-session-first auth client.
 *
 * The app always has *some* session: on first paint `ensureAnonymousSession()`
 * mints an anonymous ("temp") user, and signing out immediately mints a fresh
 * one. Signing in with Google (button or One Tap) upgrades that anonymous user
 * — the server-side `onLinkAccount` hook moves their projects across.
 *
 * Nothing here throws at import time when Google is unconfigured; the One Tap
 * entry points become no-ops with a console warning instead.
 */

const GOOGLE_CLIENT_ID: string | undefined = import.meta.env
  .VITE_GOOGLE_CLIENT_ID

export const authClient = createAuthClient({
  plugins: [
    anonymousClient(),
    // The plugin is always registered so `authClient.oneTap` exists and stays
    // typed; `promptOneTap()` refuses to call it without a real client id.
    oneTapClient({
      clientId: GOOGLE_CLIENT_ID ?? '',
      autoSelect: false,
      cancelOnTapOutside: true,
      context: 'signin',
      promptOptions: { baseDelay: 1000, maxAttempts: 3 },
    }),
  ],
})

export const useSession = authClient.useSession

/** Shape of the extra field the anonymous plugin adds to `user`. */
type MaybeAnonymousUser = { isAnonymous?: boolean | null } | null | undefined

/** True for the auto-created temp user, false for a real (linked) account. */
export function isAnonymous(user: MaybeAnonymousUser): boolean {
  return Boolean(user?.isAnonymous)
}

const isBrowser = () => typeof window !== 'undefined'

/**
 * In-flight guard: several components may call `ensureAnonymousSession()` on
 * mount and we must not create a pile of temp users for one browser.
 */
let ensuring: Promise<void> | null = null

async function createAnonymousSession(): Promise<void> {
  const { error } = await authClient.signIn.anonymous()
  if (error) {
    console.warn('[auth] anonymous sign-in failed', error)
  }
}

/**
 * Make sure this browser has a session, creating an anonymous one if not.
 * Safe to call repeatedly and concurrently; a no-op during SSR.
 */
export async function ensureAnonymousSession(): Promise<void> {
  if (!isBrowser()) return
  if (ensuring) return ensuring

  ensuring = (async () => {
    try {
      const { data } = await authClient.getSession()
      if (data?.session) return
      await createAnonymousSession()
    } catch (error) {
      console.warn('[auth] could not establish a session', error)
    } finally {
      ensuring = null
    }
  })()

  return ensuring
}

/**
 * Redirect into Google's OAuth flow. Returns to the current URL afterwards.
 * Rejects if the server has no Google provider configured, so callers can
 * surface a toast.
 */
export async function signInWithGoogle(): Promise<void> {
  if (!isBrowser()) return
  const { error } = await authClient.signIn.social({
    provider: 'google',
    callbackURL: window.location.href,
  })
  if (error) {
    throw new Error(error.message ?? 'Google sign-in failed')
  }
}

/**
 * Show the Google One Tap prompt (the LinkedIn-style popup).
 *
 * No-op without `VITE_GOOGLE_CLIENT_ID`, and no-op once the user is a real
 * account. Every failure mode here is cosmetic — popup blockers, FedCM
 * refusals, the user dismissing the card — so errors are swallowed.
 */
export async function promptOneTap(): Promise<void> {
  if (!isBrowser()) return
  if (!GOOGLE_CLIENT_ID) {
    console.warn('[auth] VITE_GOOGLE_CLIENT_ID is not set — One Tap disabled')
    return
  }
  try {
    const { data } = await authClient.getSession()
    // Only pitch sign-in to temp users; a linked account has nothing to gain.
    if (data?.user && !isAnonymous(data.user)) return
    await authClient.oneTap({ callbackURL: window.location.href })
  } catch (error) {
    console.warn('[auth] One Tap prompt did not complete', error)
  }
}

/**
 * Drop the current session and start over as a brand-new temp user.
 * The app is never left session-less.
 */
export async function resetSession(): Promise<void> {
  if (!isBrowser()) return
  ensuring = null
  try {
    await authClient.signOut()
  } catch (error) {
    console.warn('[auth] sign-out failed', error)
  }
  await createAnonymousSession()
}

/** Sign out. Identical to {@link resetSession}: a fresh temp user takes over. */
export async function logOut(): Promise<void> {
  return resetSession()
}
