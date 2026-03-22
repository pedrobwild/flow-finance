import { useState, useMemo } from 'react';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { Obra, OBRA_STATUS_LABELS, OBRA_STATUS_COLORS, STATUS_LABELS, ObraFinancials, Transaction } from '@/lib/types';
import { formatCurrency, formatDateFull, todayISO, addDays, getDayMonth } from '@/lib/helpers';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DollarSign, ArrowUpRight, ArrowDownRight, TrendingUp, Plus,
  Check, Pencil, AlertTriangle,
} from 'lucide-react';
import TransactionFormDialog from './TransactionFormDialog';
import ObraSCurveChart from './ObraSCurveChart';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine,
} from 'recharts';

interface Props {
  obra: Obra | null;
  onClose: () => void;
}

export default function ObraDetailSheet({ obra, onClose }: Props) {
  const { getObraFinancials } = useObras();
  const { transactions, confirmTransaction, deleteTransaction } = useFinance();
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormType, setTxFormType] = useState<'pagar' | 'receber'>('receber');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);



  const fin = obra ? getObraFinancials(obra.id) : null;
  const obraTxs = obra ? transactions.filter(t => t.obraId === obra.id) : [];
  const receivables = obraTxs.filter(t => t.type === 'receber').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const payables = obraTxs.filter(t => t.type === 'pagar').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const statusColor = obra ? OBRA_STATUS_COLORS[obra.status] : null;
  const parcDiff = fin && fin.totalContractValue > 0 && Math.abs(fin.totalReceivable - fin.totalContractValue) > 1;

  // Mini cash flow chart data
  const chartData = useMemo(() => {
    const allTxs = [...receivables, ...payables].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (allTxs.length === 0) return [];
    const dateMap = new Map<string, { entradas: number; saidas: number }>();
    allTxs.forEach(tx => {
      const entry = dateMap.get(tx.dueDate) || { entradas: 0, saidas: 0 };
      if (tx.type === 'receber') entry.entradas += tx.amount;
      else entry.saidas += tx.amount;
      dateMap.set(tx.dueDate, entry);
    });
    const sorted = [...dateMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let acc = 0;
    return sorted.map(([date, { entradas, saidas }]) => {
      acc += entradas - saidas;
      return { date: getDayMonth(date), saldo: acc, entradas, saidas };
    });
  }, [receivables, payables]);

  const openAddTx = (type: 'pagar' | 'receber') => {
    setEditingTx(null);
    setTxFormType(type);
    setTxFormOpen(true);
  };

  const openEditTx = (tx: Transaction) => {
    setEditingTx(tx);
    setTxFormType(tx.type);
    setTxFormOpen(true);
  };

  if (!obra || !fin || !statusColor) {
    return (
      <Sheet open={false} onOpenChange={() => {}}>
        <SheetContent side="right" className="w-full sm:max-w-2xl" />
      </Sheet>
    );
  }

  return (
    <>
      <Sheet open={true} onOpenChange={v => !v && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-4 border-b sticky top-0 bg-background z-10">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-xs text-primary font-semibold">{obra.code}</p>
                <SheetTitle className="text-xl mt-1">{obra.clientName}</SheetTitle>
                {(obra.condominium || obra.unitNumber) && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {obra.condominium}{obra.condominium && obra.unitNumber ? ' — ' : ''}
                    {obra.unitNumber && `Un. ${obra.unitNumber}`}
                  </p>
                )}
              </div>
              <Badge className={cn('text-xs', statusColor.bg, statusColor.text)} variant="outline">
                {OBRA_STATUS_LABELS[obra.status]}
              </Badge>
            </div>
          </SheetHeader>

          <div className="p-6 space-y-6">
            {/* Financial Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Contrato', value: formatCurrency(fin.totalContractValue), icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10' },
                { label: 'Recebido', value: formatCurrency(fin.totalReceived), sub: `${fin.receivedPercentage.toFixed(0)}%`, icon: ArrowUpRight, color: 'text-success', bg: 'bg-success/10' },
                { label: 'Gasto', value: formatCurrency(fin.totalPaidCost), sub: `A pagar: ${formatCurrency(fin.totalPendingCost)}`, icon: ArrowDownRight, color: 'text-destructive', bg: 'bg-destructive/10' },
                { label: 'Margem Projetada', value: formatCurrency(fin.grossMargin), sub: `${fin.grossMarginPercentage.toFixed(0)}%`, icon: TrendingUp, color: fin.grossMargin >= 0 ? 'text-success' : 'text-destructive', bg: fin.grossMargin >= 0 ? 'bg-success/10' : 'bg-destructive/10' },
              ].map(card => (
                <div key={card.label} className="card-elevated p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className={cn('w-5 h-5 rounded flex items-center justify-center', card.bg)}>
                      <card.icon className={cn('w-3 h-3', card.color)} />
                    </div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{card.label}</span>
                  </div>
                  <p className={cn('text-sm font-bold font-mono', card.color)}>{card.value}</p>
                  {card.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</p>}
                </div>
              ))}
            </div>

            {/* Parcelas mismatch */}
            {parcDiff && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 text-xs text-warning">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Diferença entre parcelas e contrato</p>
                  <p className="mt-0.5">Parcelas: {formatCurrency(fin.totalReceivable)} · Contrato: {formatCurrency(fin.totalContractValue)} · Diferença: {formatCurrency(Math.abs(fin.totalReceivable - fin.totalContractValue))}</p>
                </div>
              </div>
            )}

            {/* Payment terms */}
            {obra.paymentTerms && (
              <div className="text-xs">
                <p className="text-muted-foreground mb-1 uppercase tracking-wide text-[10px] font-medium">Condições de Pagamento</p>
                <p className="bg-muted/50 p-2 rounded-md">{obra.paymentTerms}</p>
              </div>
            )}

            {/* Receivables Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <ArrowUpRight className="w-4 h-4 text-success" />
                  Cronograma de Recebimentos ({receivables.length})
                </h3>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openAddTx('receber')}>
                  <Plus className="w-3 h-3" /> Parcela
                </Button>
              </div>
              {receivables.length === 0 ? (
                <p className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg text-center">Nenhuma parcela cadastrada</p>
              ) : (
                <div className="card-elevated overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-3 py-2 text-[10px] font-medium text-muted-foreground">Parcela</th>
                        <th className="text-left px-3 py-2 text-[10px] font-medium text-muted-foreground">Vencimento</th>
                        <th className="text-right px-3 py-2 text-[10px] font-medium text-muted-foreground">Valor</th>
                        <th className="text-center px-3 py-2 text-[10px] font-medium text-muted-foreground">Status</th>
                        <th className="text-right px-3 py-2 text-[10px] font-medium text-muted-foreground w-20">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receivables.map(tx => (
                        <tr key={tx.id} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{tx.category || tx.description}</td>
                          <td className="px-3 py-2 text-muted-foreground">{formatDateFull(tx.dueDate)}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-success">{formatCurrency(tx.amount)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={cn('status-badge text-[9px]', `status-${tx.status}`)}>
                              {STATUS_LABELS[tx.status]}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-0.5">
                              {tx.status !== 'confirmado' && (
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => confirmTransaction(tx.id, tx.amount, 'receber')}>
                                  <Check className="w-3 h-3 text-success" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditTx(tx)}>
                                <Pencil className="w-3 h-3 text-muted-foreground" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Costs Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <ArrowDownRight className="w-4 h-4 text-destructive" />
                  Custos da Obra ({payables.length})
                </h3>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openAddTx('pagar')}>
                  <Plus className="w-3 h-3" /> Custo
                </Button>
              </div>
              {payables.length === 0 ? (
                <p className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg text-center">Nenhum custo cadastrado</p>
              ) : (
                <div className="card-elevated overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-3 py-2 text-[10px] font-medium text-muted-foreground">Descrição</th>
                        <th className="text-left px-3 py-2 text-[10px] font-medium text-muted-foreground">Fornecedor</th>
                        <th className="text-left px-3 py-2 text-[10px] font-medium text-muted-foreground">Vencimento</th>
                        <th className="text-right px-3 py-2 text-[10px] font-medium text-muted-foreground">Valor</th>
                        <th className="text-center px-3 py-2 text-[10px] font-medium text-muted-foreground">Status</th>
                        <th className="text-right px-3 py-2 text-[10px] font-medium text-muted-foreground w-20">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payables.map(tx => (
                        <tr key={tx.id} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium max-w-[120px] truncate">{tx.description}</td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[100px] truncate">{tx.counterpart || '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{formatDateFull(tx.dueDate)}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-destructive">{formatCurrency(tx.amount)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={cn('status-badge text-[9px]', `status-${tx.status}`)}>
                              {STATUS_LABELS[tx.status]}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-0.5">
                              {tx.status !== 'confirmado' && (
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => confirmTransaction(tx.id, tx.amount, 'pagar')}>
                                  <Check className="w-3 h-3 text-success" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditTx(tx)}>
                                <Pencil className="w-3 h-3 text-muted-foreground" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Mini Cash Flow Chart */}
            {chartData.length > 1 && (
              <div>
                <h3 className="text-sm font-semibold mb-3">Fluxo de Caixa da Obra</h3>
                <div className="card-elevated p-4 h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} className="text-muted-foreground" />
                      <RechartsTooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                      />
                      <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                      <Area
                        type="monotone"
                        dataKey="saldo"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary) / 0.1)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* S-Curve: Planned vs Actual */}
            <ObraSCurveChart
              obraId={obra.id}
              contractValue={obra.contractValue}
              budgetTarget={obra.budgetTarget}
              transactions={obraTxs}
              expectedStartDate={obra.expectedStartDate}
              expectedEndDate={obra.expectedEndDate}
            />

            {/* Additional info */}
            {(obra.address || obra.expectedStartDate || obra.notes) && (
              <div className="space-y-2 text-xs border-t pt-4">
                {obra.address && (
                  <p><span className="text-muted-foreground">Endereço:</span> {obra.address}</p>
                )}
                {obra.expectedStartDate && (
                  <p><span className="text-muted-foreground">Previsão:</span> {formatDateFull(obra.expectedStartDate)} — {obra.expectedEndDate ? formatDateFull(obra.expectedEndDate) : '...'}</p>
                )}
                {obra.actualStartDate && (
                  <p><span className="text-muted-foreground">Real:</span> {formatDateFull(obra.actualStartDate)} — {obra.actualEndDate ? formatDateFull(obra.actualEndDate) : 'em andamento'}</p>
                )}
                {obra.notes && (
                  <p><span className="text-muted-foreground">Obs:</span> {obra.notes}</p>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <TransactionFormDialog
        open={txFormOpen}
        onClose={() => { setTxFormOpen(false); setEditingTx(null); }}
        transaction={editingTx}
        defaultType={txFormType}
        defaultObraId={obra.id}
      />

    </>
  );
}
