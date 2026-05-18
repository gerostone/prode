import { requireRole } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['admin']);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Panel de admin</h1>
        <p className="text-sm text-muted-foreground">
          Cargá los resultados del Mundial y recalculá puntajes.
        </p>
      </header>
      {children}
    </div>
  );
}
