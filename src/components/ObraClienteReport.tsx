import { useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { formatCurrency } from '@/lib/helpers';
import { Building2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ObraSummary {
  obraId: string;
  obraCode: string;
  name: string;
  pending: number;
  overdue: number;
  confirmed: number;
  total: number;
  pendingCount: number;
  overdueCount: number;
  confirmedCount: number;
  totalCount: number;
}

export default function ObraClienteReport() {
  const { transactions } = useFinance();
  const { obras } = useObras();

  const report = useMemo(() => {
    const receber = transactions.filter(t => t.type === 'receber');
    const map = new Map<string, ObraSummary>();

    receber.forEach(t => {
      const obraId = t.obraId || '_none';
      const obra = obras.find(o => o.id === obraId);
      const key = obraId;
      const name = obra ? `${obra.code} · ${obra.clientName}` : (t.counterpart || 'Sem identificação');
      const entry = map.get(key) || {
        obraId, obraCode: obra?.code || '', name,
        pending: 0, overdue: 0, confirmed: 0, total: 0,
        pendingCount: 0, overdueCount: 0, confirmedCount: 0, totalCount: 0,
      };
      entry.total += t.amount;
      entry.totalCount += 1;
      if (t.status === 'confirmado') {
        entry.confirmed += t.amount;
        entry.confirmedCount += 1;
      } else if (t.status === 'atrasado') {
        entry.overdue += t.amount;
        entry.overdueCount += 1;
      } else {
        entry.pending += t.amount;
        entry.pendingCount += 1;
      }
      map.set(key, entry);
    });

    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [transactions, obras]);

  const grandTotal = useMemo(() => report.reduce((s, r) => ({
    pending: s.pending + r.pending,
    overdue: s.overdue + r.overdue,
    confirmed: s.confirmed + r.confirmed,
    total: s.total + r.total,
  }), { pending: 0, overdue: 0, confirmed: 0, total: 0 }), [report]);

  if (report.length === 0) return null;

  return (
    <div className="card-elevated overflow-hidden">
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Resumo por Obra</p>
            <p className="text-[10px] text-muted-foreground">{report.length} obra(s) com recebíveis registrados</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Obra</th>
              <th className="text-right font-medium text-muted-foreground px-4 py-2.5">
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Pendente</span>
              </th>
              <th className="text-right font-medium text-muted-foreground px-4 py-2.5">
                <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Atrasado</span>
              </th>
              <th className="text-right font-medium text-muted-foreground px-4 py-2.5">
                <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Recebido</span>
              </th>
              <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Total</th>
              <th className="text-right font-medium text-muted-foreground px-4 py-2.5 w-28">% Recebido</th>
            </tr>
          </thead>
          <tbody>
            {report.map((r) => {
              const pct = r.total > 0 ? Math.round(r.confirmed / r.total * 100) : 0;
              return (
                <tr key={r.obraId} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-foreground max-w-[200px] truncate">{r.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {r.pending > 0 ? (
                      <span className="text-muted-foreground">{formatCurrency(r.pending)} <span className="text-[10px]">({r.pendingCount})</span></span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {r.overdue > 0 ? (
                      <span className="text-destructive">{formatCurrency(r.overdue)} <span className="text-[10px]">({r.overdueCount})</span></span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {r.confirmed > 0 ? (
                      <span className="text-success">{formatCurrency(r.confirmed)} <span className="text-[10px]">({r.confirmedCount})</span></span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{formatCurrency(r.total)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="flex-1 max-w-[60px] h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", pct >= 80 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-muted-foreground/30")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 font-semibold">
              <td className="px-4 py-2.5">Total Geral</td>
              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{formatCurrency(grandTotal.pending)}</td>
              <td className="px-4 py-2.5 text-right font-mono text-destructive">{formatCurrency(grandTotal.overdue)}</td>
              <td className="px-4 py-2.5 text-right font-mono text-success">{formatCurrency(grandTotal.confirmed)}</td>
              <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(grandTotal.total)}</td>
              <td className="px-4 py-2.5 text-right font-mono text-[10px] text-muted-foreground">
                {grandTotal.total > 0 ? `${Math.round(grandTotal.confirmed / grandTotal.total * 100)}%` : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
