// PLACEHOLDER: replaced by auth workstream
//
// Typed no-op stubs so the auth UI (`src/components/auth/*`) compiles before the
// real client lands. The export list and signatures here must stay identical to
// the real module; delete this file when that one arrives.

export type AuthUser = {
  id: string
  name?: string | null
  image?: string | null
  email?: string | null
  isAnonymous?: boolean | null
}

export type AuthSession = { user: AuthUser }

/** Stands in for the better-auth React client instance. */
export const authClient = { placeholder: true as const }

export function useSession(): { data: AuthSession | null; isPending: boolean } {
  return { data: null, isPending: false }
}

/** Creates an anonymous session if the visitor has none. */
export function ensureAnonymousSession(): Promise<void> {
  return Promise.resolve()
}

export function signInWithGoogle(): Promise<void> {
  return Promise.resolve()
}

/** Shows Google's One Tap overlay (no-op when it is unavailable). */
export function promptOneTap(): Promise<void> {
  return Promise.resolve()
}

/** Wipes the temp user and starts a fresh anonymous session. */
export function resetSession(): Promise<void> {
  return Promise.resolve()
}

export function logOut(): Promise<void> {
  return Promise.resolve()
}

export function isAnonymous(user: AuthUser | null | undefined): boolean {
  return user?.isAnonymous === true
}
