import { useState } from 'react'
import { LogOut, RotateCcw, User } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  isAnonymous,
  logOut,
  resetSession,
  signInWithGoogle,
  useSession,
} from '#/lib/auth-client'
import { cn } from '#/lib/utils.ts'

/** Derived from the hook so this file keeps compiling when the auth client changes shape. */
type SessionUser = NonNullable<ReturnType<typeof useSession>['data']>['user']

const AVATAR_CLASS =
  'size-7 shrink-0 overflow-hidden rounded-full border border-border p-0'

/** Two initials from the display name, else the first two letters of the email. */
function initialsOf(user: SessionUser): string | null {
  const name = user.name?.trim()
  if (name) {
    const letters = name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
    if (letters) return letters.toUpperCase()
  }
  const email = user.email?.trim()
  if (email) return email.slice(0, 2).toUpperCase()
  return null
}

/** Google's "G" mark — their branding requires the multicolour glyph. */
function GoogleMark({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  )
}

function Avatar({ user }: { user: SessionUser | null }) {
  const initials = user ? initialsOf(user) : null
  if (user?.image)
    return (
      <img
        src={user.image}
        alt=""
        className="size-full object-cover"
        referrerPolicy="no-referrer"
      />
    )
  if (initials)
    return (
      <span className="text-[11px] font-semibold tracking-tight">
        {initials}
      </span>
    )
  return <User className="size-3.5 text-muted-foreground" />
}

/**
 * Avatar button + account dropdown, shared by the editor top bar and the site
 * header. Anonymous visitors get a sign-in path and a session reset; signed-in
 * users get a log out.
 */
export function UserMenu({
  className,
  withName = false,
}: {
  className?: string
  /** Show the display name (or "Guest") beside the avatar. */
  withName?: boolean
}) {
  const { data, isPending } = useSession()
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)

  const user = data?.user ?? null
  const anonymous = !user || isAnonymous(user)

  const run = async (action: () => Promise<void>, message: string) => {
    try {
      await action()
    } catch {
      toast.error(message, { duration: 5000 })
      return false
    }
    return true
  }

  // Placeholder of the same size while the session resolves, so nothing shifts.
  if (isPending && !user)
    return (
      <div
        className={cn(AVATAR_CLASS, 'animate-pulse bg-muted', className)}
        aria-hidden
      />
    )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size={withName ? 'sm' : 'icon'}
            className={cn(
              withName ? 'gap-2 pr-1 pl-2.5' : AVATAR_CLASS,
              className,
            )}
            aria-label="Account menu"
          >
            {withName && (
              <span className="max-w-28 truncate text-muted-foreground">
                {anonymous ? 'Guest' : user.name || 'Account'}
              </span>
            )}
            <Avatar user={user} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {anonymous ? (
            <>
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span>Guest session</span>
                {user && (
                  <span className="truncate font-mono text-[12px] font-normal text-muted-foreground">
                    {user.id.slice(0, 8)}
                  </span>
                )}
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() =>
                  void run(signInWithGoogle, 'Unable to start sign-in.')
                }
              >
                <GoogleMark />
                Continue with Google
              </DropdownMenuItem>
              {user && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setConfirmReset(true)}>
                    <RotateCcw />
                    Reset session
                  </DropdownMenuItem>
                </>
              )}
            </>
          ) : (
            <>
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="truncate">{user.name || 'Signed in'}</span>
                {user.email && (
                  <span className="truncate text-[12px] font-normal text-muted-foreground">
                    {user.email}
                  </span>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void run(logOut, 'Unable to log out.')}
              >
                <LogOut />
                Log out
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Reset Session</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            <h5 className="text-sm font-semibold">
              Reset this guest session? It starts a new temporary user, and you
              lose access to the projects made under this one.
            </h5>
            <Button
              size="sm"
              variant="destructive"
              disabled={resetting}
              onClick={async () => {
                setResetting(true)
                const ok = await run(resetSession, 'Unable to reset session.')
                setResetting(false)
                if (ok) setConfirmReset(false)
              }}
            >
              Reset
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
