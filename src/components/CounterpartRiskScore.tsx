import { useState, useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatCurrency, formatDate, todayISO, daysBetween } from '@/lib/helpers';
import type { PeriodRange } from './DashboardPeriodFilter';
import { Transaction } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, Shield, ShieldAlert, Users, Clock, Calendar,
  TrendingDown, BarChart3, PieChart, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────
interface CounterpartRisk {
  name: string;
  type: 'cliente' | 'fornecedor';
  totalVolume: number;
  overdueCount: number;
  overdueAmount: number;
  avgDelayDays: number;
  maxDelayDays: number;
  concentrationPct: number;
  riskScore: number;
  riskLevel: 'baixo' | 'médio' | 'alto' | 'crítico';
  transactionCount: number;
  confirmedCount: number;
  confirmedOnTime: number;
  delayHistory: number[];
  scoreBreakdown: { delay: number; overdueRatio: number; concentration: number; volume: number };
}

function getRiskLevel(score: number): CounterpartRisk['riskLevel'] {
  if (score >= 75) return 'crítico';
  if (score >= 50) return 'alto';
  if (score >= 25) return 'médio';
  return 'baixo';
}

const RISK_COLORS: Record<string, string> = {
  baixo: 'text-emerald-600 bg-emerald-500/10',
  médio: 'text-amber-600 bg-amber-500/10',
  alto: 'text-orange-600 bg-orange-500/10',
  crítico: 'text-destructive bg-destructive/10',
};

const RISK_LABELS: Record<string, string> = {
  baixo: 'Baixo', médio: 'Médio', alto: 'Alto', crítico: 'Crítico',
};

const RISK_ICONS: Record<string, React.ElementType> = {
  baixo: Shield, médio: Shield, alto: ShieldAlert, crítico: AlertTriangle,
};

// ── Main Component ─────────────────────────────────────────
interface Props {
  period?: PeriodRange;
}

export default function CounterpartRiskScore({ period }: Props) {
  const { transactions } = useFinance();
  const today = todayISO();
  const [selectedRisk, setSelectedRisk] = useState<CounterpartRisk | null>(null);

  const scopedTransactions = useMemo(() => {
    if (!period) return transactions;
    return transactions.filter(t => t.dueDate >= period.from && t.dueDate <= period.to);
  }, [transactions, period]);

  const risks = useMemo(() => {
    const counterparts = new Map<string, {
      type: 'cliente' | 'fornecedor';
      total: number; overdue: number; overdueAmt: number;
      delays: number[]; count: number; confirmed: number; confirmedOnTime: number;
    }>();

    const totalReceber = transactions.filter(t => t.type === 'receber').reduce((s, t) => s + t.amount, 0);
    const totalPagar = transactions.filter(t => t.type === 'pagar').reduce((s, t) => s + t.amount, 0);

    transactions.forEach(tx => {
      if (!tx.counterpart) return;
      const key = tx.counterpart;
      if (!counterparts.has(key)) {
        counterparts.set(key, {
          type: tx.type === 'receber' ? 'cliente' : 'fornecedor',
          total: 0, overdue: 0, overdueAmt: 0, delays: [],
          count: 0, confirmed: 0, confirmedOnTime: 0,
        });
      }
      const cp = counterparts.get(key)!;
      cp.total += tx.amount;
      cp.count += 1;

      if (tx.status === 'confirmado') {
        cp.confirmed += 1;
        if (tx.paidAt && tx.paidAt <= tx.dueDate) cp.confirmedOnTime += 1;
      }

      if (tx.status === 'atrasado') {
        cp.overdue += 1;
        cp.overdueAmt += tx.amount;
        cp.delays.push(daysBetween(tx.dueDate, today));
      } else if (tx.paidAt && tx.paidAt > tx.dueDate) {
        cp.delays.push(daysBetween(tx.dueDate, tx.paidAt));
      }
    });

    const result: CounterpartRisk[] = [];
    counterparts.forEach((data, name) => {
      const avgDelay = data.delays.length > 0 ? data.delays.reduce((s, d) => s + d, 0) / data.delays.length : 0;
      const maxDelay = data.delays.length > 0 ? Math.max(...data.delays) : 0;
      const totalRef = data.type === 'cliente' ? totalReceber : totalPagar;
      const concentration = totalRef > 0 ? (data.total / totalRef) * 100 : 0;

      const delayScore = Math.min(avgDelay / 30 * 30, 30);
      const overdueRatioScore = data.count > 0 ? (data.overdue / data.count) * 25 : 0;
      const concentrationScore = Math.min(concentration / 100 * 25, 25);
      const volumeScore = Math.min(data.overdueAmt / 50000 * 20, 20);
      const riskScore = Math.min(100, Math.round(delayScore + overdueRatioScore + concentrationScore + volumeScore));

      result.push({
        name, type: data.type, totalVolume: data.total,
        overdueCount: data.overdue, overdueAmount: data.overdueAmt,
        avgDelayDays: Math.round(avgDelay), maxDelayDays: Math.round(maxDelay),
        concentrationPct: Math.round(concentration),
        riskScore, riskLevel: getRiskLevel(riskScore),
        transactionCount: data.count, confirmedCount: data.confirmed,
        confirmedOnTime: data.confirmedOnTime, delayHistory: data.delays,
        scoreBreakdown: {
          delay: Math.round(delayScore), overdueRatio: Math.round(overdueRatioScore),
          concentration: Math.round(concentrationScore), volume: Math.round(volumeScore),
        },
      });
    });

    return result.filter(r => r.transactionCount >= 2).sort((a, b) => b.riskScore - a.riskScore).slice(0, 12);
  }, [transactions, today]);

  // Transaction list for detail sheet
  const counterpartTxs = useMemo(() => {
    if (!selectedRisk) return [];
    return transactions
      .filter(t => t.counterpart === selectedRisk.name)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }, [selectedRisk, transactions]);

  if (risks.length === 0) return null;

  const criticalCount = risks.filter(r => r.riskLevel === 'crítico' || r.riskLevel === 'alto').length;

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm">Score de Risco por Contraparte</CardTitle>
              </div>
              {criticalCount > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {criticalCount} risco elevado
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {risks.map((risk, idx) => {
              const Icon = RISK_ICONS[risk.riskLevel];
              return (
                <motion.div
                  key={risk.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedRisk(risk)}
                >
                  <div className={`p-1.5 rounded-md ${RISK_COLORS[risk.riskLevel]}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{risk.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {risk.type === 'cliente' ? 'Cliente' : 'Fornecedor'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <Progress value={risk.riskScore} className="h-1.5 flex-1" />
                      <span className={`text-xs font-bold ${RISK_COLORS[risk.riskLevel].split(' ')[0]}`}>
                        {risk.riskScore}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span>Vol: {formatCurrency(risk.totalVolume)}</span>
                      {risk.overdueCount > 0 && (
                        <span className="text-destructive">{risk.overdueCount} atraso(s) · Ø {risk.avgDelayDays}d</span>
                      )}
                      <span>Concentração: {risk.concentrationPct}%</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Detail Sheet ── */}
      <Sheet open={!!selectedRisk} onOpenChange={() => setSelectedRisk(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedRisk && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-base">
                  <div className={`p-1.5 rounded-md ${RISK_COLORS[selectedRisk.riskLevel]}`}>
                    {(() => { const I = RISK_ICONS[selectedRisk.riskLevel]; return <I className="w-4 h-4" />; })()}
                  </div>
                  {selectedRisk.name}
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-5 mt-4">
                {/* ── Score Summary ── */}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Progress value={selectedRisk.riskScore} className="h-2.5" />
                  </div>
                  <div className="text-right">
                    <span className={`text-2xl font-bold ${RISK_COLORS[selectedRisk.riskLevel].split(' ')[0]}`}>
                      {selectedRisk.riskScore}
                    </span>
                    <p className="text-[10px] text-muted-foreground">{RISK_LABELS[selectedRisk.riskLevel]}</p>
                  </div>
                </div>

                {/* ── Score Breakdown ── */}
                <div>
                  <p className="text-xs font-semibold mb-2">Composição do Score</p>
                  <div className="space-y-2">
                    <BreakdownBar label="Histórico Atraso" value={selectedRisk.scoreBreakdown.delay} max={30}
                      detail={selectedRisk.avgDelayDays > 0 ? `Média ${selectedRisk.avgDelayDays}d · Máx ${selectedRisk.maxDelayDays}d` : 'Sem atrasos'}
                      icon={Clock} />
                    <BreakdownBar label="Taxa Inadimplência" value={selectedRisk.scoreBreakdown.overdueRatio} max={25}
                      detail={`${selectedRisk.overdueCount} de ${selectedRisk.transactionCount} transações`}
                      icon={AlertTriangle} />
                    <BreakdownBar label="Concentração" value={selectedRisk.scoreBreakdown.concentration} max={25}
                      detail={`${selectedRisk.concentrationPct}% do volume total de ${selectedRisk.type === 'cliente' ? 'recebíveis' : 'pagamentos'}`}
                      icon={PieChart} />
                    <BreakdownBar label="Vol. em Atraso" value={selectedRisk.scoreBreakdown.volume} max={20}
                      detail={formatCurrency(selectedRisk.overdueAmount)}
                      icon={BarChart3} />
                  </div>
                </div>

                <Separator />

                {/* ── KPI Cards ── */}
                <div className="grid grid-cols-2 gap-2">
                  <MiniKPI label="Volume Total" value={formatCurrency(selectedRisk.totalVolume)}
                    icon={selectedRisk.type === 'cliente' ? ArrowDownRight : ArrowUpRight}
                    colorClass={selectedRisk.type === 'cliente' ? 'text-emerald-600' : 'text-amber-600'} />
                  <MiniKPI label="Em Atraso" value={formatCurrency(selectedRisk.overdueAmount)}
                    icon={TrendingDown} colorClass="text-destructive" />
                  <MiniKPI label="Transações" value={`${selectedRisk.transactionCount}`}
                    icon={BarChart3} colorClass="text-primary" />
                  <MiniKPI label="Pontualidade" value={
                    selectedRisk.confirmedCount > 0
                      ? `${Math.round((selectedRisk.confirmedOnTime / selectedRisk.confirmedCount) * 100)}%`
                      : '—'
                  } icon={Calendar} colorClass="text-emerald-600" />
                </div>

                {/* ── Delay Distribution ── */}
                {selectedRisk.delayHistory.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold mb-2">Distribuição de Atrasos</p>
                      <DelayDistribution delays={selectedRisk.delayHistory} />
                    </div>
                  </>
                )}

                <Separator />

                {/* ── Transaction History ── */}
                <Tabs defaultValue="all">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold">Histórico de Transações</p>
                    <TabsList className="h-7">
                      <TabsTrigger value="all" className="text-[10px] h-5 px-2">Todas</TabsTrigger>
                      <TabsTrigger value="overdue" className="text-[10px] h-5 px-2">Atrasadas</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="all" className="mt-0">
                    <TxList txs={counterpartTxs} />
                  </TabsContent>
                  <TabsContent value="overdue" className="mt-0">
                    <TxList txs={counterpartTxs.filter(t => t.status === 'atrasado' || (t.paidAt && t.paidAt > t.dueDate))} />
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────

function BreakdownBar({ label, value, max, detail, icon: Icon }: {
  label: string; value: number; max: number; detail: string; icon: React.ElementType;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="w-3 h-3" />
          <span>{label}</span>
        </div>
        <span className="font-semibold">{value}/{max}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full rounded-full ${pct >= 80 ? 'bg-destructive' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function MiniKPI({ label, value, icon: Icon, colorClass }: {
  label: string; value: string; icon: React.ElementType; colorClass: string;
}) {
  return (
    <div className="bg-muted/50 rounded-lg p-2.5">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className={`w-3 h-3 ${colorClass}`} />
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

function DelayDistribution({ delays }: { delays: number[] }) {
  const buckets = [
    { label: '1-7d', min: 1, max: 7, count: 0 },
    { label: '8-15d', min: 8, max: 15, count: 0 },
    { label: '16-30d', min: 16, max: 30, count: 0 },
    { label: '31-60d', min: 31, max: 60, count: 0 },
    { label: '60d+', min: 61, max: Infinity, count: 0 },
  ];
  delays.forEach(d => {
    const bucket = buckets.find(b => d >= b.min && d <= b.max);
    if (bucket) bucket.count++;
  });
  const maxCount = Math.max(...buckets.map(b => b.count), 1);

  return (
    <div className="flex items-end gap-1.5 h-16">
      {buckets.map(b => (
        <div key={b.label} className="flex-1 flex flex-col items-center gap-0.5">
          <span className="text-[9px] font-medium text-muted-foreground">{b.count}</span>
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${Math.max((b.count / maxCount) * 100, b.count > 0 ? 10 : 2)}%` }}
            transition={{ duration: 0.5 }}
            className={`w-full rounded-t ${b.count > 0
              ? b.min >= 31 ? 'bg-destructive/70' : b.min >= 16 ? 'bg-amber-500/70' : 'bg-primary/50'
              : 'bg-muted'
            }`}
          />
          <span className="text-[8px] text-muted-foreground">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

function TxList({ txs }: { txs: Transaction[] }) {
  if (txs.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">Nenhuma transação</p>;
  return (
    <div className="space-y-1 max-h-60 overflow-y-auto">
      {txs.map(tx => {
        const isLate = tx.status === 'atrasado' || (tx.paidAt && tx.paidAt > tx.dueDate);
        const delayDays = isLate && tx.paidAt ? daysBetween(tx.dueDate, tx.paidAt)
          : tx.status === 'atrasado' ? daysBetween(tx.dueDate, todayISO()) : 0;
        return (
          <div key={tx.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[10px] hover:bg-muted/50">
            <div className="flex-1 min-w-0">
              <span className="font-medium truncate block">{tx.description}</span>
              <span className="text-muted-foreground">{formatDate(tx.dueDate)}</span>
              {isLate && delayDays > 0 && (
                <span className="text-destructive ml-1.5">({delayDays}d atraso)</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 ml-2">
              <span className="font-medium">{formatCurrency(tx.amount)}</span>
              <Badge
                variant={tx.status === 'confirmado' ? 'default' : tx.status === 'atrasado' ? 'destructive' : 'outline'}
                className="text-[8px] px-1 h-3.5"
              >
                {tx.status}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
