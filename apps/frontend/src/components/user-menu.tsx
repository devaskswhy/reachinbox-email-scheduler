'use client';

import { LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export interface UserMenuProps {
  name: string | null | undefined;
  email: string | null | undefined;
  image: string | null | undefined;
}

/** Two-letter fallback for when Google returns no avatar image. */
function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = name?.trim() ?? email?.trim() ?? '';
  if (source === '') return '?';
  const parts = source.split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase() || source[0]!.toUpperCase();
}

export function UserMenu({ name, email, image }: UserMenuProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2.5 rounded-full border bg-card py-1 pl-1 pr-1.5 shadow-sm sm:pr-3">
        <Avatar className="size-7">
          {image != null && <AvatarImage src={image} alt={name ?? email ?? 'User'} />}
          <AvatarFallback className="text-[11px]">{initials(name, email)}</AvatarFallback>
        </Avatar>
        {/* Identity collapses on small screens; the avatar stays as the anchor. */}
        <div className="hidden leading-tight sm:block">
          <p className="text-[13px] font-medium">{name ?? 'Signed in'}</p>
          <p className="text-[11px] text-muted-foreground">{email}</p>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="size-9 text-muted-foreground hover:text-foreground"
        title="Log out"
        onClick={() => void signOut({ callbackUrl: '/login' })}
      >
        <LogOut aria-hidden />
        <span className="sr-only">Log out</span>
      </Button>
    </div>
  );
}
