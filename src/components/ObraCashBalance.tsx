import { useMemo, useState } from 'react';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, daysBetween, getDayMonth } from '@/lib/helpers';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import ObraDetailSheet from '@/components/ObraDetailSheet';
import type { Obra, Transaction } from '@/lib/types';

type Semaphore = 'pode-seguir' | 'atencao' | 'replanejar';

interface ObraRow {
  id: string | null;
  code: string;
  clientName: string;
  status: string;
  contractValue: number;
  totalReceived: number;
  totalPaid: number;
  balance: number;
  receivedPct: number;
  overdueReceivable: number;
  pendingPct: number;
  overduePct: number;
  nextEntry: Transaction | null;
  nextExit: Transaction | null;
  obra: Obra | null;
  semaphore: Semaphore;
}

const section = (delay: number) => ({
  initial: { opacity: 0, y: 18, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

export default function ObraCashBalance() {
  const { obras, getObraFinancials } = useObras();
  const { transactions, currentBalance, projectedBalance } = useFinance();
  const today = todayISO();
  const [detailObra, setDetailObra] = useState<Obra | null>(null);

  const rows = useMemo((): ObraRow[] => {
    const activeObras = obras.filter(o => o.status === 'ativa');
    const result: ObraRow[] = [];

    for (const obra of activeObras) {
      const obraTxs = transactions.filter(t => t.obraId === obra.id);
      const totalReceived = obraTxs
        .filter(t => t.type === 'receber' && t.status === 'confirmado')
        .reduce((s, t) => s + t.amount, 0);
      const totalPaid = obraTxs
        .filter(t => t.type === 'pagar' && t.status === 'confirmado')
        .reduce((s, t) => s + t.amount, 0);
      const overdueReceivable = obraTxs
        .filter(t => t.type === 'receber' && t.status === 'atrasado')
        .reduce((s, t) => s + t.amount, 0);
      const pendingReceivable = obraTxs
        .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.status !== 'atrasado')
        .reduce((s, t) => s + t.amount, 0);

      const cv = obra.contractValue || 1;
      const receivedPct = Math.min((totalReceived / cv) * 100, 100);
      const pendingPct = Math.min((pendingReceivable / cv) * 100, 100 - receivedPct);
      const overduePct = Math.min((overdueReceivable / cv) * 100, 100 - receivedPct - pendingPct);

      const nextEntry = obraTxs
        .filter(t => t.type === 'receber' && t.status !== 'confirmado')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null;
      const nextExit = obraTxs
        .filter(t => t.type === 'pagar' && t.status !== 'confirmado')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null;

      const balance = totalReceived - totalPaid;
      const hasOverdue = overdueReceivable > 0;
      const hasUpcomingIncome = nextEntry && daysBetween(today, nextEntry.dueDate) <= 15;
      const deepNegative = balance < 0 && Math.abs(balance) > obra.contractValue * 0.2;

      let semaphore: Semaphore = 'pode-seguir';
      if (deepNegative || (balance < 0 && !hasUpcomingIncome)) {
        semaphore = 'replanejar';
      } else if (balance < 0 || hasOverdue) {
        semaphore = 'atencao';
      }

      result.push({
        id: obra.id,
        code: obra.code,
        clientName: obra.clientName,
        status: obra.status,
        contractValue: obra.contractValue,
        totalReceived,
        totalPaid,
        balance,
        receivedPct,
        pendingPct,
        overduePct,
        overdueReceivable,
        nextEntry,
        nextExit,
        obra,
        semaphore,
      });
    }

    // Corporativo
    const corpTxs = transactions.filter(t => !t.obraId);
    const corpReceived = corpTxs
      .filter(t => t.type === 'receber' && t.status === 'confirmado')
      .reduce((s, t) => s + t.amount, 0);
    const corpPaid = corpTxs
      .filter(t => t.type === 'pagar' && t.status === 'confirmado')
      .reduce((s, t) => s + t.amount, 0);
    const corpNextEntry = corpTxs
      .filter(t => t.type === 'receber' && t.status !== 'confirmado')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null;
    const corpNextExit = corpTxs
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null;

    result.push({
      id: null,
      code: 'CORP',
      clientName: 'Corporativo (sem obra)',
      status: 'corporativo',
      contractValue: 0,
      totalReceived: corpReceived,
      totalPaid: corpPaid,
      balance: corpReceived - corpPaid,
      receivedPct: 0,
      pendingPct: 0,
      overduePct: 0,
      overdueReceivable: 0,
      nextEntry: corpNextEntry,
      nextExit: corpNextExit,
      obra: null,
      semaphore: (corpReceived - corpPaid) < 0 ? 'atencao' : 'pode-seguir',
    });

    // Sort: negative balance first, then ascending
    return result.sort((a, b) => a.balance - b.balance);
  }, [obras, transactions]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        received: acc.received + r.totalReceived,
        paid: acc.paid + r.totalPaid,
        balance: acc.balance + r.balance,
      }),
      { received: 0, paid: 0, balance: 0 }
    );
  }, [rows]);

  const bal = currentBalance?.amount ?? 0;
  const balDate = currentBalance?.balanceDate ?? today;
  const proj30 = projectedBalance(todayISO().replace(/\d{2}$/, '') + '30');

  function renderNextTx(tx: Transaction | null, type: 'entry' | 'exit') {
    if (!tx) return <span className="text-muted-foreground">—</span>;
    const isOverdue = tx.status === 'atrasado';
    const daysLate = isOverdue ? daysBetween(tx.dueDate, today) : 0;

    if (isOverdue) {
      return (
        <span className="text-destructive text-xs font-medium">
          ⚠ {formatCurrency(tx.amount)} atrasado há {daysLate}d
        </span>
      );
    }
    return (
      <span className="text-xs">
        <span className={type === 'entry' ? 'text-success font-medium' : 'text-foreground'}>
          {formatCurrency(tx.amount)}
        </span>
        <span className="text-muted-foreground"> em {getDayMonth(tx.dueDate)}</span>
        {type === 'exit' && tx.counterpart && (
          <span className="text-muted-foreground block truncate max-w-[120px]">({tx.counterpart})</span>
        )}
      </span>
    );
  }

  function renderProgressBar(row: ObraRow) {
    if (row.id === null) return null; // no bar for corporativo
    return (
      <div className="space-y-1 min-w-[100px]">
        <div className="flex h-2 rounded-full overflow-hidden bg-secondary">
          <div className="bg-success transition-all" style={{ width: `${row.receivedPct}%` }} />
          {row.overduePct > 0 && (
            <div className="bg-destructive pulse-alert transition-all" style={{ width: `${row.overduePct}%` }} />
          )}
          <div className="bg-muted-foreground/20 transition-all" style={{ width: `${row.pendingPct}%` }} />
        </div>
        <p className="text-[10px] text-muted-foreground">{Math.round(row.receivedPct)}% do contrato</p>
      </div>
    );
  }

  return (
    <>
      <motion.div {...section(0.24)}>
        <Card className="card-elevated">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Saldo de Caixa por Obra</CardTitle>
            <CardDescription className="text-xs">Como cada obra está impactando o caixa da empresa</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Obra</TableHead>
                    <TableHead className="text-xs text-right">Recebido</TableHead>
                    <TableHead className="text-xs text-right">Pago</TableHead>
                    <TableHead className="text-xs text-right">Saldo da Obra</TableHead>
                    <TableHead className="text-xs">Progresso</TableHead>
                    <TableHead className="text-xs">Próx. entrada</TableHead>
                    <TableHead className="text-xs">Próx. saída</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isDraining = row.balance < 0;
                    return (
                      <TableRow
                        key={row.id ?? 'corp'}
                        className={cn(
                          'cursor-pointer transition-colors',
                          isDraining && 'bg-destructive/5 hover:bg-destructive/10',
                          !isDraining && 'hover:bg-muted/50'
                        )}
                        onClick={() => row.obra && setDetailObra(row.obra)}
                      >
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'w-2 h-2 rounded-full shrink-0',
                              row.semaphore === 'pode-seguir' && 'bg-success',
                              row.semaphore === 'atencao' && 'bg-warning',
                              row.semaphore === 'replanejar' && 'bg-destructive pulse-alert',
                            )} title={
                              row.semaphore === 'pode-seguir' ? 'Pode seguir' :
                              row.semaphore === 'atencao' ? 'Atenção' : 'Replanejar'
                            } />
                            <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 shrink-0">
                              {row.code}
                            </Badge>
                            <span className="text-xs font-medium truncate max-w-[140px]">{row.clientName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <span className="text-xs text-success font-medium">{formatCurrency(row.totalReceived)}</span>
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <span className="text-xs text-destructive font-medium">{formatCurrency(row.totalPaid)}</span>
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <span
                            className={cn(
                              'font-mono font-bold text-sm',
                              isDraining ? 'text-destructive' : 'text-success'
                            )}
                          >
                            {isDraining ? '−' : '+'}{formatCurrency(Math.abs(row.balance))}
                          </span>
                          {isDraining && (
                            <span className="text-[10px] text-destructive block">⚠ dreno</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5">{renderProgressBar(row)}</TableCell>
                        <TableCell className="py-2.5">{renderNextTx(row.nextEntry, 'entry')}</TableCell>
                        <TableCell className="py-2.5">{renderNextTx(row.nextExit, 'exit')}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell className="py-2.5 text-xs">TOTAL EMPRESA</TableCell>
                    <TableCell className="py-2.5 text-right">
                      <span className="text-xs text-success">{formatCurrency(totals.received)}</span>
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      <span className="text-xs text-destructive">{formatCurrency(totals.paid)}</span>
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      <span
                        className={cn(
                          'font-mono font-bold text-sm',
                          totals.balance < 0 ? 'text-destructive' : 'text-success'
                        )}
                      >
                        {totals.balance < 0 ? '−' : '+'}{formatCurrency(Math.abs(totals.balance))}
                      </span>
                    </TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2 px-4 pb-2">
              {rows.map((row) => {
                const isDraining = row.balance < 0;
                return (
                  <div
                    key={row.id ?? 'corp'}
                    className={cn(
                      'rounded-lg border p-3 cursor-pointer transition-colors',
                      isDraining ? 'bg-destructive/5 border-destructive/20' : 'hover:bg-muted/50'
                    )}
                    onClick={() => row.obra && setDetailObra(row.obra)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 shrink-0">
                          {row.code}
                        </Badge>
                        <span className="text-xs font-medium truncate">{row.clientName}</span>
                      </div>
                      <span
                        className={cn(
                          'font-mono font-bold text-sm shrink-0',
                          isDraining ? 'text-destructive' : 'text-success'
                        )}
                      >
                        {isDraining ? '−' : '+'}{formatCurrency(Math.abs(row.balance))}
                      </span>
                    </div>
                    {row.id !== null && renderProgressBar(row)}
                    <div className="flex justify-between mt-2 gap-4">
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Próx. entrada</p>
                        {renderNextTx(row.nextEntry, 'entry')}
                      </div>
                      <div className="min-w-0 text-right">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Próx. saída</p>
                        {renderNextTx(row.nextExit, 'exit')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="border-t px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>
                Saldo atual em conta: <span className="font-medium text-foreground">{formatCurrency(bal)}</span>
                <span className="ml-1">(atualizado {getDayMonth(balDate)})</span>
              </span>
              <span>·</span>
              <span>
                Saldo projetado 30d: <span className="font-medium text-foreground">{formatCurrency(proj30)}</span>
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <ObraDetailSheet obra={detailObra} onClose={() => setDetailObra(null)} />
    </>
  );
}
