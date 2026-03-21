import { useMemo, useState } from 'react';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth, daysBetween } from '@/lib/helpers';
import { Transaction } from '@/lib/types';
import { motion } from 'framer-motion';
import { Building2, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TimelineTx {
  id: string;
  description: string;
  counterpart: string;
  amount: number;
  dueDate: string;
  type: 'pagar' | 'receber';
  dayOffset: number;
}

interface ObraRow {
  id: string | null;
  label: string;
  code: string;
  transactions: TimelineTx[];
  balance: number; // received - paid
}

interface WeekSummary {
  weekStart: string;
  weekEnd: string;
  total: number;
  label: string;
}

export default function ObrasTimeline() {
  const { obras } = useObras();
  const { transactions } = useFinance();
  const today = todayISO();
  const endDate = addDays(today, 30);

  const { rows, weekMarkers, weekSummaries, totals } = useMemo(() => {
    const activeObras = obras.filter(o => o.status === 'ativa');
    const pending = transactions.filter(
      t => t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= endDate
    );

    // Build rows per obra
    const obraRows: ObraRow[] = activeObras.map(obra => {
      const obraTxs = pending.filter(t => t.obraId === obra.id);
      const allObraTxs = transactions.filter(t => t.obraId === obra.id);
      const received = allObraTxs.filter(t => t.type === 'receber' && t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
      const paid = allObraTxs.filter(t => t.type === 'pagar' && t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);

      return {
        id: obra.id,
        label: obra.clientName,
        code: obra.code,
        transactions: obraTxs.map(t => ({
          id: t.id,
          description: t.description,
          counterpart: t.counterpart,
          amount: t.amount,
          dueDate: t.dueDate,
          type: t.type as 'pagar' | 'receber',
          dayOffset: daysBetween(today, t.dueDate),
        })),
        balance: received - paid,
      };
    });

    // Corporate row (no obra)
    const corpTxs = pending.filter(t => !t.obraId);
    const corpRow: ObraRow = {
      id: null,
      label: 'Corporativo',
      code: 'CORP',
      transactions: corpTxs.map(t => ({
        id: t.id,
        description: t.description,
        counterpart: t.counterpart,
        amount: t.amount,
        dueDate: t.dueDate,
        type: t.type as 'pagar' | 'receber',
        dayOffset: daysBetween(today, t.dueDate),
      })),
      balance: 0,
    };

    const allRows = [...obraRows.filter(r => r.transactions.length > 0), corpRow].filter(r => r.transactions.length > 0);

    // Week markers for the 30-day span
    const weeks: { start: number; end: number; label: string; startDate: string; endDate: string }[] = [];
    for (let d = 0; d < 30; d += 7) {
      const s = addDays(today, d);
      const e = addDays(today, Math.min(d + 6, 29));
      weeks.push({ start: d, end: Math.min(d + 6, 29), label: `${getDayMonth(s)}`, startDate: s, endDate: e });
    }

    // Week summaries (total per week across all rows)
    const wSummaries: WeekSummary[] = weeks.map(w => {
      const total = pending
        .filter(t => {
          const off = daysBetween(today, t.dueDate);
          return off >= w.start && off <= w.end;
        })
        .reduce((s, t) => s + (t.type === 'pagar' ? t.amount : 0), 0);
      return { weekStart: w.startDate, weekEnd: w.endDate, total, label: w.label };
    });

    // Totals
    const totalSaidas = pending.filter(t => t.type === 'pagar').reduce((s, t) => s + t.amount, 0);
    const totalEntradas = pending.filter(t => t.type === 'receber').reduce((s, t) => s + t.amount, 0);
    const carteiraAtiva = activeObras.reduce((s, o) => s + o.contractValue, 0);

    return {
      rows: allRows,
      weekMarkers: weeks,
      weekSummaries: wSummaries,
      totals: { carteira: carteiraAtiva, saidas: totalSaidas, entradas: totalEntradas },
    };
  }, [obras, transactions, today, endDate]);

  if (rows.length === 0) return null;

  const maxAmount = Math.max(...rows.flatMap(r => r.transactions.map(t => t.amount)), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="card-elevated p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-accent" />
          <h2 className="font-semibold text-sm">Pressão de Caixa por Obra — Próximos 30 dias</h2>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <span>Carteira ativa: <strong className="text-foreground">{formatCurrency(totals.carteira)}</strong></span>
          <span>Saídas previstas: <strong className="text-destructive">{formatCurrency(totals.saidas)}</strong></span>
          <span>Entradas previstas: <strong className="text-success">{formatCurrency(totals.entradas)}</strong></span>
        </div>
      </div>

      {/* Timeline Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Week headers */}
          <div className="flex items-center ml-[160px] mr-[80px] mb-1">
            {weekMarkers.map((w, i) => (
              <div
                key={i}
                className="text-[10px] text-muted-foreground font-medium"
                style={{ width: `${((w.end - w.start + 1) / 30) * 100}%` }}
              >
                {w.label}
              </div>
            ))}
          </div>

          {/* Rows */}
          {rows.map((row, ri) => {
            // Check if any week has high concentration for this row
            const weekHighlight = weekMarkers.map(w => {
              const weekTotal = row.transactions
                .filter(t => t.type === 'pagar' && t.dayOffset >= w.start && t.dayOffset <= w.end)
                .reduce((s, t) => s + t.amount, 0);
              return weekTotal > 15000;
            });

            return (
              <div key={row.id || 'corp'} className="flex items-center group">
                {/* Label */}
                <div className="w-[160px] flex-shrink-0 pr-3 py-2 border-b border-border/50">
                  <p className="text-xs font-medium truncate">{row.code}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{row.label}</p>
                </div>

                {/* Bubble track */}
                <div className="flex-1 relative h-12 border-b border-border/50 mr-[80px]">
                  {/* Week background highlights */}
                  {weekMarkers.map((w, wi) => (
                    <div
                      key={wi}
                      className={cn(
                        'absolute top-0 bottom-0 border-r border-border/30',
                        weekHighlight[wi] && 'bg-destructive/5'
                      )}
                      style={{
                        left: `${(w.start / 30) * 100}%`,
                        width: `${((w.end - w.start + 1) / 30) * 100}%`,
                      }}
                    />
                  ))}

                  {/* Bubbles */}
                  {row.transactions.map(tx => {
                    const size = Math.max(12, Math.min(32, (tx.amount / maxAmount) * 32));
                    const leftPct = (tx.dayOffset / 30) * 100;
                    const isOut = tx.type === 'pagar';

                    return (
                      <Tooltip key={tx.id}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              'absolute rounded-full border-2 cursor-default transition-transform hover:scale-125 z-10',
                              isOut
                                ? 'bg-destructive/20 border-destructive/60'
                                : 'bg-success/20 border-success/60'
                            )}
                            style={{
                              width: size,
                              height: size,
                              left: `${leftPct}%`,
                              top: '50%',
                              transform: 'translate(-50%, -50%)',
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px]">
                          <p className="font-medium text-xs">{tx.description}</p>
                          {tx.counterpart && <p className="text-[10px] text-muted-foreground">{tx.counterpart}</p>}
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn('text-xs font-semibold', isOut ? 'text-destructive' : 'text-success')}>
                              {isOut ? '-' : '+'}{formatCurrency(tx.amount)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{getDayMonth(tx.dueDate)}</span>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>

                {/* Balance badge */}
                <div className="w-[80px] flex-shrink-0 flex justify-end py-2 border-b border-border/50">
                  {row.id && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] font-mono',
                        row.balance >= 0 ? 'text-success border-success/30' : 'text-destructive border-destructive/30'
                      )}
                    >
                      {row.balance >= 0 ? '+' : ''}{formatCurrency(row.balance)}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}

          {/* Weekly totals row */}
          <div className="flex items-center">
            <div className="w-[160px] flex-shrink-0 pr-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total/semana</p>
            </div>
            <div className="flex-1 flex mr-[80px]">
              {weekSummaries.map((ws, i) => {
                const width = ((weekMarkers[i].end - weekMarkers[i].start + 1) / 30) * 100;
                const isHigh = ws.total > 0; // show all non-zero

                return (
                  <div
                    key={i}
                    className="flex items-center justify-center py-2"
                    style={{ width: `${width}%` }}
                  >
                    {ws.total > 0 && (
                      <span
                        className={cn(
                          'text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded',
                          ws.total > 30000
                            ? 'bg-destructive/10 text-destructive'
                            : 'text-muted-foreground'
                        )}
                      >
                        {formatCurrency(ws.total)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="w-[80px] flex-shrink-0" />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-destructive/20 border-2 border-destructive/60" />
          <span>Saída</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-success/20 border-2 border-success/60" />
          <span>Entrada</span>
        </div>
        <span className="ml-auto">Tamanho = valor proporcional</span>
      </div>
    </motion.div>
  );
}
