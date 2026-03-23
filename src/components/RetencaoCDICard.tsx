import { useState, useMemo } from 'react';
import { Transaction } from '@/lib/types';
import { formatCurrency, todayISO, addDays, getDayMonth, daysBetween } from '@/lib/helpers';
import { motion, AnimatePresence } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Percent, Truck, Users, Calendar, ChevronDown, ChevronUp,
  PiggyBank, TrendingUp, Shield, AlertTriangle,
} from 'lucide-react';

const SUPPLIER_CATEGORIES = [
  'Materiais de Obra',
  'Mão de Obra Terceirizada',
];

const SALARY_CATEGORY = 'Salários';

const CDI_MONTHLY = 0.009; // 0.9% ao mês

interface RetentionItem {
  txId: string;
  description: string;
  counterpart: string;
  originalAmount: number;
  retainedAmount: number;
  originalDueDate: string;
  daysUntilPayback: number;
  cdiRate: number;
  cdiYield: number;
  totalPayback: number;
  group: 'fornecedor' | 'salario';
}

interface RetencaoCDIResult {
  supplierItems: RetentionItem[];
  salaryItems: RetentionItem[];
  totalRetained: number;
  totalCdiCost: number;
  totalPayback: number;
  supplierRetained: number;
  salaryRetained: number;
  supplierCdiCost: number;
  salaryCdiCost: number;
  /** Map of txId -> reduced amount (90%) to apply to simulation */
  amountOverrides: Map<string, number>;
  /** Hypothetical payback transactions to add on paybackDate */
  paybackHypotheticals: { amount: number; description: string; dueDate: string }[];
}

interface Props {
  transactions: Transaction[];
  onApply: (result: RetencaoCDIResult) => void;
  onClear: () => void;
  isActive: boolean;
}

export default function RetencaoCDICard({ transactions, onApply, onClear, isActive }: Props) {
  const today = todayISO();
  const [expanded, setExpanded] = useState(false);
  const [enableSuppliers, setEnableSuppliers] = useState(true);
  const [enableSalaries, setEnableSalaries] = useState(true);
  const [retentionPct, setRetentionPct] = useState(10);
  const [paybackDate, setPaybackDate] = useState('2026-06-20');
  const [supplierCdiMultiplier, setSupplierCdiMultiplier] = useState(100);
  const [salaryCdiMultiplier, setSalaryCdiMultiplier] = useState(130);

  const cutoffDate = '2026-05-31';

  const result = useMemo((): RetencaoCDIResult => {
    const pct = retentionPct / 100;
    const supplierItems: RetentionItem[] = [];
    const salaryItems: RetentionItem[] = [];
    const amountOverrides = new Map<string, number>();
    const paybackHypotheticals: { amount: number; description: string; dueDate: string }[] = [];

    const eligible = transactions.filter(
      t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= cutoffDate
    );

    for (const tx of eligible) {
      const isSupplier = enableSuppliers && SUPPLIER_CATEGORIES.includes(tx.category);
      const isSalary = enableSalaries && tx.category === SALARY_CATEGORY;

      if (!isSupplier && !isSalary) continue;

      const retained = tx.amount * pct;
      const days = Math.max(1, daysBetween(tx.dueDate, paybackDate));
      const cdiMultiplier = isSalary ? salaryCdiMultiplier / 100 : supplierCdiMultiplier / 100;
      const dailyCdi = CDI_MONTHLY / 30;
      const cdiYield = retained * dailyCdi * cdiMultiplier * days;
      const totalPayback = retained + cdiYield;

      const item: RetentionItem = {
        txId: tx.id,
        description: tx.description,
        counterpart: tx.counterpart,
        originalAmount: tx.amount,
        retainedAmount: retained,
        originalDueDate: tx.dueDate,
        daysUntilPayback: days,
        cdiRate: cdiMultiplier * 100,
        cdiYield,
        totalPayback,
        group: isSalary ? 'salario' : 'fornecedor',
      };

      if (isSalary) salaryItems.push(item);
      else supplierItems.push(item);

      amountOverrides.set(tx.id, tx.amount - retained);
    }

    const supplierRetained = supplierItems.reduce((s, i) => s + i.retainedAmount, 0);
    const salaryRetained = salaryItems.reduce((s, i) => s + i.retainedAmount, 0);
    const supplierCdiCost = supplierItems.reduce((s, i) => s + i.cdiYield, 0);
    const salaryCdiCost = salaryItems.reduce((s, i) => s + i.cdiYield, 0);
    const totalRetained = supplierRetained + salaryRetained;
    const totalCdiCost = supplierCdiCost + salaryCdiCost;
    const totalPayback = totalRetained + totalCdiCost;

    if (totalRetained > 0) {
      paybackHypotheticals.push({
        amount: totalPayback,
        description: `Quitação Retenção ${retentionPct}% (CDI) — Fornecedores + Folha`,
        dueDate: paybackDate,
      });
    }

    return {
      supplierItems, salaryItems,
      totalRetained, totalCdiCost, totalPayback,
      supplierRetained, salaryRetained,
      supplierCdiCost, salaryCdiCost,
      amountOverrides, paybackHypotheticals,
    };
  }, [transactions, today, enableSuppliers, enableSalaries, retentionPct, paybackDate, supplierCdiMultiplier, salaryCdiMultiplier]);

  const handleApply = () => {
    onApply(result);
  };

  const totalItems = result.supplierItems.length + result.salaryItems.length;

  return (
    <div className={cn(
      'card-elevated overflow-hidden transition-all',
      isActive && 'border-2 border-accent/40 shadow-lg shadow-accent/5'
    )}>
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            isActive ? 'bg-accent/15' : 'bg-primary/10'
          )}>
            <PiggyBank className={cn('w-4 h-4', isActive ? 'text-accent' : 'text-primary')} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm">Retenção Estratégica CDI</h2>
              {isActive && (
                <Badge className="text-[9px] bg-accent/10 text-accent border-accent/20 hover:bg-accent/10">
                  Ativo
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Retenha {retentionPct}% de fornecedores e salários com remuneração CDI
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!expanded && totalItems > 0 && (
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              {totalItems} parcela{totalItems > 1 ? 's' : ''} · {formatCurrency(result.totalRetained)}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t space-y-4">
              {/* Config controls */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground font-medium">Retenção (%)</label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={retentionPct}
                    onChange={e => setRetentionPct(Number(e.target.value) || 10)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground font-medium">Data quitação</label>
                  <Input
                    type="date"
                    value={paybackDate}
                    onChange={e => setPaybackDate(e.target.value)}
                    min={today}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground font-medium">CDI Fornecedores</label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={50}
                      max={200}
                      value={supplierCdiMultiplier}
                      onChange={e => setSupplierCdiMultiplier(Number(e.target.value) || 100)}
                      className="h-8 text-xs"
                    />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground font-medium">CDI Salários</label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={50}
                      max={200}
                      value={salaryCdiMultiplier}
                      onChange={e => setSalaryCdiMultiplier(Number(e.target.value) || 130)}
                      className="h-8 text-xs"
                    />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                </div>
              </div>

              {/* Group toggles */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={enableSuppliers} onCheckedChange={setEnableSuppliers} className="scale-[0.8]" />
                  <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs">Fornecedores ({result.supplierItems.length})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={enableSalaries} onCheckedChange={setEnableSalaries} className="scale-[0.8]" />
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs">Salários ({result.salaryItems.length})</span>
                </label>
              </div>

              {/* Summary metrics */}
              {totalItems > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-accent/5 rounded-lg p-3 text-center border border-accent/15">
                    <p className="text-[9px] text-accent uppercase tracking-wider font-semibold">Economia de caixa</p>
                    <p className="text-sm font-bold font-mono text-accent mt-0.5">
                      {formatCurrency(result.totalRetained)}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center border border-border">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Custo CDI</p>
                    <p className="text-sm font-bold font-mono text-foreground mt-0.5">
                      {formatCurrency(result.totalCdiCost)}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center border border-border">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Payback total</p>
                    <p className="text-sm font-bold font-mono text-foreground mt-0.5">
                      {formatCurrency(result.totalPayback)}
                    </p>
                  </div>
                  <div className="bg-success/5 rounded-lg p-3 text-center border border-success/15">
                    <p className="text-[9px] text-success uppercase tracking-wider font-semibold">vs Cheque especial</p>
                    <p className="text-sm font-bold font-mono text-success mt-0.5">
                      {formatCurrency(result.totalRetained * 0.035 * 2 - result.totalCdiCost)}
                    </p>
                    <p className="text-[8px] text-muted-foreground">economia</p>
                  </div>
                </div>
              )}

              {/* Breakdown by group */}
              {result.supplierItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                    <h3 className="text-xs font-semibold">
                      Fornecedores — {formatCurrency(result.supplierRetained)} retidos ({supplierCdiMultiplier}% CDI)
                    </h3>
                  </div>
                  <div className="border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                    <div className="grid grid-cols-[1fr_80px_80px_60px_80px] gap-2 px-3 py-1.5 bg-muted/40 text-[9px] text-muted-foreground uppercase tracking-wider font-medium border-b">
                      <span>Fornecedor</span>
                      <span className="text-right">Original</span>
                      <span className="text-right">Retido ({retentionPct}%)</span>
                      <span className="text-center">Dias</span>
                      <span className="text-right">Total 20/06</span>
                    </div>
                    {result.supplierItems.map(item => (
                      <div key={item.txId} className="grid grid-cols-[1fr_80px_80px_60px_80px] gap-2 items-center px-3 py-2 text-xs border-b last:border-0 hover:bg-muted/20">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.counterpart || item.description}</p>
                          <p className="text-[10px] text-muted-foreground">{getDayMonth(item.originalDueDate)}</p>
                        </div>
                        <span className="text-right font-mono text-muted-foreground">{formatCurrency(item.originalAmount)}</span>
                        <span className="text-right font-mono text-accent font-semibold">{formatCurrency(item.retainedAmount)}</span>
                        <span className="text-center text-muted-foreground">{item.daysUntilPayback}d</span>
                        <span className="text-right font-mono font-semibold">{formatCurrency(item.totalPayback)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.salaryItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    <h3 className="text-xs font-semibold">
                      Salários — {formatCurrency(result.salaryRetained)} retidos ({salaryCdiMultiplier}% CDI)
                    </h3>
                  </div>
                  <div className="border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                    <div className="grid grid-cols-[1fr_80px_80px_60px_80px] gap-2 px-3 py-1.5 bg-muted/40 text-[9px] text-muted-foreground uppercase tracking-wider font-medium border-b">
                      <span>Colaborador</span>
                      <span className="text-right">Salário</span>
                      <span className="text-right">Retido ({retentionPct}%)</span>
                      <span className="text-center">Dias</span>
                      <span className="text-right">Total 20/06</span>
                    </div>
                    {result.salaryItems.map(item => (
                      <div key={item.txId} className="grid grid-cols-[1fr_80px_80px_60px_80px] gap-2 items-center px-3 py-2 text-xs border-b last:border-0 hover:bg-muted/20">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.counterpart || item.description}</p>
                          <p className="text-[10px] text-muted-foreground">{getDayMonth(item.originalDueDate)}</p>
                        </div>
                        <span className="text-right font-mono text-muted-foreground">{formatCurrency(item.originalAmount)}</span>
                        <span className="text-right font-mono text-accent font-semibold">{formatCurrency(item.retainedAmount)}</span>
                        <span className="text-center text-muted-foreground">{item.daysUntilPayback}d</span>
                        <span className="text-right font-mono font-semibold">{formatCurrency(item.totalPayback)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Info banner */}
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/30 border border-dashed border-border">
                <Shield className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <p>Custo total de CDI: <strong className="text-foreground">{formatCurrency(result.totalCdiCost)}</strong>. Cheque especial equivalente custaria ~<strong className="text-destructive">{formatCurrency(result.totalRetained * 0.035 * 2)}</strong>.</p>
                  <p>Quitação programada para <strong className="text-foreground">{getDayMonth(paybackDate)}</strong> com rendimento garantido aos credores.</p>
                </div>
              </div>

              {/* Apply/Clear buttons */}
              <div className="flex items-center gap-2">
                {!isActive ? (
                  <button
                    onClick={handleApply}
                    disabled={totalItems === 0}
                    className={cn(
                      'flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2',
                      totalItems > 0
                        ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                        : 'bg-muted text-muted-foreground cursor-not-allowed'
                    )}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    Aplicar no simulador
                  </button>
                ) : (
                  <button
                    onClick={() => { onClear(); }}
                    className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center gap-2"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Remover do simulador
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
