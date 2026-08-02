import { useMemo, useState } from 'react';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { Transaction } from '@/lib/types';
import { formatCurrency, formatDateFull, todayISO, addDays, daysBetween } from '@/lib/helpers';
import { AlertTriangle, CalendarDays, Clock, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ConfirmPaymentDialog from '@/components/ConfirmPaymentDialog';
import { cn } from '@/lib/utils';

interface Bucket {
  key: string;
  label: string;
  hint: string;
  items: Transaction[];
  total: number;
  tone: 'danger' | 'warn' | 'neutral';
}

export default function ReceivablesAging() {
  const { filteredTransactions: transactions } = useObraFilter();
  const { obras } = useObras();
  const today = todayISO();
  const [openBucket, setOpenBucket] = useState<string | null>('vencidos');
  const [confirmTx, setConfirmTx] = useState<Transaction | null>(null);

  const buckets = useMemo<Bucket[]>(() => {
    const open = transactions.filter(t => t.type === 'receber' && t.status !== 'confirmado');
    const d7 = addDays(today, 7);
    const d30 = addDays(today, 30);

    const make = (key: string, label: string, hint: string, items: Transaction[], tone: Bucket['tone']): Bucket => ({
      key, label, hint,
      items: items.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      total: items.reduce((s, t) => s + t.amount, 0),
      tone,
    });

    return [
      make('vencidos', 'Vencido', 'Recebimentos em atraso', open.filter(t => t.dueDate < today), 'danger'),
      make('hoje', 'Vence hoje', 'Previsto para hoje', open.filter(t => t.dueDate === today), 'warn'),
      make('7d', 'A vencer em 7 dias', 'Próximos 7 dias', open.filter(t => t.dueDate > today && t.dueDate <= d7), 'neutral'),
      make('30d', 'A vencer em 30 dias', 'De 8 a 30 dias', open.filter(t => t.dueDate > d7 && t.dueDate <= d30), 'neutral'),
    ];
  }, [transactions, today]);

  const hasAny = buckets.some(b => b.items.length > 0);
  if (!hasAny) return null;

  const getObraCode = (obraId: string | null) => obraId ? obras.find(o => o.id === obraId)?.code : null;

  return (
    <div className="card-elevated overflow-hidden">
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center">
            <CalendarDays className="w-3.5 h-3.5 text-success" />
          </div>
          <div>
            <p className="text-sm font-semibold">Agenda de recebimentos</p>
            <p className="text-[10px] text-muted-foreground">Vencidos e a vencer, por prazo</p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border/50">
        {buckets.map(bucket => {
          const isOpen = openBucket === bucket.key;
          const empty = bucket.items.length === 0;
          return (
            <div key={bucket.key}>
              <button
                type="button"
                disabled={empty}
                onClick={() => setOpenBucket(isOpen ? null : bucket.key)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left min-h-[52px] transition-colors',
                  !empty && 'hover:bg-muted/40',
                  empty && 'opacity-50 cursor-default'
                )}
                aria-expanded={isOpen}
              >
                <div className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                  bucket.tone === 'danger' ? 'bg-destructive/10' : bucket.tone === 'warn' ? 'bg-warning/10' : 'bg-muted'
                )}>
                  {bucket.tone === 'danger'
                    ? <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                    : <Clock className={cn('w-3.5 h-3.5', bucket.tone === 'warn' ? 'text-warning' : 'text-muted-foreground')} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{bucket.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {empty ? 'Nenhum recebimento neste prazo' : `${bucket.items.length} recebimento(s) · ${bucket.hint}`}
                  </p>
                </div>
                <span className={cn(
                  'text-sm font-mono font-bold shrink-0',
                  bucket.tone === 'danger' ? 'text-destructive' : 'text-success'
                )}>
                  {formatCurrency(bucket.total)}
                </span>
                {!empty && (
                  <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', isOpen && 'rotate-180')} />
                )}
              </button>

              {isOpen && !empty && (
                <ul className="pb-2">
                  {bucket.items.map(tx => {
                    const obraCode = getObraCode(tx.obraId);
                    const late = tx.dueDate < today ? daysBetween(tx.dueDate, today) : 0;
                    return (
                      <li key={tx.id} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/30 rounded-lg mx-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{tx.counterpart || tx.description}</p>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[10px] text-muted-foreground">{formatDateFull(tx.dueDate)}</span>
                            {obraCode && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-[16px] font-mono">{obraCode}</Badge>}
                            {late > 0 && <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-[16px]">{late}d de atraso</Badge>}
                            {tx.needsReview && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-[16px] border-warning/40 text-warning">A confirmar</Badge>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-mono font-semibold text-success shrink-0">
                          +{formatCurrency(tx.amount)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-[11px] gap-1 shrink-0"
                          onClick={() => setConfirmTx(tx)}
                        >
                          <Check className="w-3 h-3" /> Recebi
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmPaymentDialog transaction={confirmTx} onClose={() => setConfirmTx(null)} />
    </div>
  );
}
