'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) {
      setStatus({ kind: 'error', message: 'Ingresá un email válido.' });
      return;
    }
    setStatus({ kind: 'sending' });
    const supabase = createSupabaseBrowserClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
    });
    if (error) {
      setStatus({ kind: 'error', message: error.message });
      return;
    }
    setStatus({ kind: 'sent' });
  }

  if (status.kind === 'sent') {
    return (
      <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
        <p className="font-medium">Revisá tu correo 📧</p>
        <p className="mt-1 text-muted-foreground">
          Si <strong>{email}</strong> está registrado, te llegó un link para definir una nueva contraseña.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          disabled={status.kind === 'sending'}
        />
      </div>
      {status.kind === 'error' && <p className="text-sm text-destructive">{status.message}</p>}
      <Button type="submit" className="w-full" disabled={status.kind === 'sending'}>
        {status.kind === 'sending' ? 'Enviando link...' : 'Enviar link'}
      </Button>
    </form>
  );
}
