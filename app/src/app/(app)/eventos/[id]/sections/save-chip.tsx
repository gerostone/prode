export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const LABEL: Record<SaveState, string> = {
  idle: '',
  dirty: 'Editando...',
  saving: 'Guardando...',
  saved: '✓ Guardado',
  error: 'Error al guardar',
};

const CLASS: Record<SaveState, string> = {
  idle: 'text-muted-foreground',
  dirty: 'text-muted-foreground',
  saving: 'text-muted-foreground',
  saved: 'text-emerald-600',
  error: 'text-destructive',
};

export function SaveChip({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  return <span className={`text-xs ${CLASS[state]}`}>{LABEL[state]}</span>;
}
