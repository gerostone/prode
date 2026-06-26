'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import { Button } from '@/components/ui/button';
import { LogOut, Menu, X } from 'lucide-react';
import type { UserRole } from '@/lib/database.types';

export function AppHeader({ email, role }: { email: string; role: UserRole | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const links: { href: string; label: string }[] = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/eventos/1', label: 'Evento 1' },
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/reglamento', label: 'Reglamento' },
    ...(role === 'admin' ? [{ href: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto flex h-14 items-center justify-between gap-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold"
          onClick={() => setOpen(false)}
        >
          <span className="text-xl">⚽</span>
          <span>Prode 2026</span>
        </Link>

        {/* Desktop: navegación inline */}
        <nav className="hidden gap-4 text-sm sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href as Route}
              className="text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 sm:flex">
          <span className="max-w-[14rem] truncate text-sm text-muted-foreground">{email}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
        </div>

        {/* Mobile: botón hamburguesa */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-md border transition hover:bg-accent sm:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile: panel desplegable */}
      {open && (
        <nav className="border-t sm:hidden">
          <div className="container mx-auto flex flex-col py-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href as Route}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center justify-between gap-3 border-t pt-3">
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{email}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Salir
              </Button>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
