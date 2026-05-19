'use client';

import { useState } from 'react';
import type { UserRole } from '@/lib/database.types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SaveChip, type SaveState } from '@/app/(app)/eventos/[id]/sections/save-chip';
import { updateUserRole, sendPasswordReset } from './actions';

export type UserRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string;
  role: UserRole;
  created_at: string;
};

const ROLES: UserRole[] = ['player', 'scorer', 'admin'];

export function UsersEditor({
  users: initial,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState<UserRow[]>(initial);
  const [roleSaves, setRoleSaves] = useState<Record<string, SaveState>>({});
  const [resetStates, setResetStates] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  async function changeRole(userId: string, newRole: UserRole) {
    if (!window.confirm(`Confirmás cambiar el rol a "${newRole}"?`)) return;
    setRoleSaves((s) => ({ ...s, [userId]: 'saving' }));
    setErrors((e) => ({ ...e, [userId]: null }));
    const res = await updateUserRole({ user_id: userId, role: newRole });
    if ('error' in res) {
      setRoleSaves((s) => ({ ...s, [userId]: 'error' }));
      setErrors((e) => ({ ...e, [userId]: res.error ?? null }));
    } else {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      setRoleSaves((s) => ({ ...s, [userId]: 'saved' }));
    }
  }

  async function resetPassword(userId: string) {
    setResetStates((s) => ({ ...s, [userId]: 'sending' }));
    setErrors((e) => ({ ...e, [userId]: null }));
    const res = await sendPasswordReset({ user_id: userId });
    if ('error' in res) {
      setResetStates((s) => ({ ...s, [userId]: 'error' }));
      setErrors((e) => ({ ...e, [userId]: res.error ?? null }));
    } else {
      setResetStates((s) => ({ ...s, [userId]: 'sent' }));
    }
  }

  return (
    <Card>
      <CardContent className="divide-y p-0">
        {users.map((u) => {
          const isSelf = u.id === currentUserId;
          const resetState = resetStates[u.id] ?? 'idle';
          return (
            <div key={u.id} className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-[auto_1fr_auto_auto_auto] sm:items-center">
              <div className="flex items-center gap-3">
                {u.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatar_url} alt={u.display_name} className="h-8 w-8 rounded-full" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
                    {u.display_name.charAt(0)}
                  </div>
                )}
                <div className="text-sm">
                  <div className="font-medium">
                    {u.display_name}
                    {isSelf && <span className="ml-2 text-xs text-primary">(vos)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </div>
              </div>
              <div className="hidden sm:block" />
              <div>
                <Label htmlFor={`role-${u.id}`} className="sr-only">Rol</Label>
                <select
                  id={`role-${u.id}`}
                  value={u.role}
                  onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
                  disabled={isSelf}
                  title={isSelf ? 'No podés cambiar tu propio rol' : ''}
                  className="flex h-9 rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <SaveChip state={roleSaves[u.id] ?? 'idle'} />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resetState === 'sending'}
                  onClick={() => resetPassword(u.id)}
                >
                  {resetState === 'sending'
                    ? 'Enviando...'
                    : resetState === 'sent'
                      ? '✓ Enviado'
                      : 'Reset password'}
                </Button>
              </div>
              {errors[u.id] && (
                <p className="col-span-full text-xs text-destructive">{errors[u.id]}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
