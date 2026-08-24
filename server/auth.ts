import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { anonymous, oneTap } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { eq } from 'drizzle-orm'

import { db } from './db'
import * as authSchema from './db/auth-schema'
import { projects } from './db/schema'

/**
 * better-auth server instance.
 *
 * Browser-session-first: every visitor is signed in anonymously (the
 * `anonymous` plugin, no credentials ever). When that same browser later signs
 * in with Google, `onLinkAccount` reassigns the anonymous user's projects to
 * the real account before better-auth drops the anonymous row.
 *
 * Everything Google-related is optional — with no Google env vars the module
 * still imports cleanly and anonymous auth keeps working; only the social
 * provider and One Tap degrade to unavailable.
 */

const DEV_SECRET = 'bulbus-dev-only-insecure-secret-change-me'

const secret = process.env.BETTER_AUTH_SECRET
if (!secret) {
  console.warn(
    '[auth] BETTER_AUTH_SECRET is not set — falling back to an insecure development secret. Set it before deploying.',
  )
}

const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const google =
  googleClientId && googleClientSecret
    ? { clientId: googleClientId, clientSecret: googleClientSecret }
    : undefined

if (!google) {
  console.warn(
    '[auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set — Google sign-in and One Tap are disabled. Anonymous sessions still work.',
  )
}

/**
 * Move every project owned by the anonymous user onto the account they just
 * signed into. `projects.userId` is a plain text column, so this is a single
 * UPDATE … WHERE user_id = <anonymous id>.
 */
async function reassignProjects(fromUserId: string, toUserId: string) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return
  await db
    .update(projects)
    .set({ userId: toUserId })
    .where(eq(projects.userId, fromUserId))
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3005',
  secret: secret ?? DEV_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
  socialProviders: google ? { google } : {},
  plugins: [
    anonymous({
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        try {
          await reassignProjects(anonymousUser.user.id, newUser.user.id)
        } catch (error) {
          // Never block sign-in on the merge: the user keeps their new account,
          // the orphaned projects can be reconciled later.
          console.error(
            '[auth] failed to reassign projects from anonymous user',
            anonymousUser.user.id,
            '->',
            newUser.user.id,
            error,
          )
        }
      },
    }),
    // clientId is optional: without it the One Tap callback endpoint simply
    // rejects, which is the same as the feature being off on the client.
    oneTap({ clientId: googleClientId }),
    tanstackStartCookies(),
  ],
})

export type Auth = typeof auth
