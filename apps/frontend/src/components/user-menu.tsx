'use client';

import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';

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
    <div className="flex items-center gap-3">
      <Avatar>
        {image != null && <AvatarImage src={image} alt={name ?? email ?? 'User'} />}
        <AvatarFallback>{initials(name, email)}</AvatarFallback>
      </Avatar>

      {/* Identity collapses on small screens; the avatar stays as the anchor. */}
      <div className="hidden leading-tight sm:block">
        <p className="text-sm font-medium">{name ?? 'Signed in'}</p>
        <p className="text-xs text-muted-foreground">{email}</p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => void signOut({ callbackUrl: '/login' })}
      >
        <LogOut aria-hidden />
        <span className="hidden sm:inline">Logout</span>
        <span className="sr-only sm:hidden">Logout</span>
      </Button>
    </div>
  );
}
