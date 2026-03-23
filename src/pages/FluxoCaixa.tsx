import { useState, useMemo, Fragment } from 'react';
import DashboardPeriodFilter, { type PeriodRange } from '@/components/DashboardPeriodFilter';
import ExportDropdown from '@/components/ExportDropdown';
import RecurrenceGenerator from '@/components/RecurrenceGenerator';
import { exportToCSV, exportToExcel, exportToPDF, cashFlowToExportRows } from '@/lib/export-utils';
import { useFinance } from '@/lib/finance-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { formatCurrency, todayISO, addDays, getDayMonth, getWeekdayName } from '@/lib/helpers';
import {
  AlertTriangle, ChevronRight, Calendar, TrendingUp, TrendingDown,
  ArrowDownRight, ArrowUpRight, Wallet, ShieldAlert, CheckCircle2,
  BarChart3, Clock, Building2, LineChart, Table2, ArrowRight,
  Users, FileText, Phone, Receipt, Target, Flame, ArrowDown, ArrowUp, List

} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Transaction } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ComposedChart, Line } from 'recharts';
import CashFlowTable from '@/components/CashFlowTable';

const sect = (delay: number) => ({
  initial: { opacity: 0, y: 14, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as const },
});

export default function FluxoCaixa() {
  const { confirmTransaction } = useFinance();
  const { filteredTransactions: transactions, isFiltered, selectedObraId, filteredBalance, filteredProjectedBalance } = useObraFilter();
  const { obras, getObraFinancials } = useObras();
  const today = todayISO();
  const [period, setPeriod] = useState<PeriodRange>({
    from: todayISO(),
    to: addDays(todayISO(), 30),
    label: '30d',
  });

  const selectedObra = useMemo(() => {
    if (!selectedObraId) return null;
    const obra = obras.find(o => o.id === selectedObraId);
    if (!obra) return null;
    return { ...obra, ...getObraFinancials(obra.id) };
  }, [selectedObraId, obras, getObraFinancials]);

  // === OPERATIONAL DATA ===
  const operationalData = useMemo(() => {
    const overduePagar = transactions.filter(t => t.type === 'pagar' && t.status === 'atrasado');
    const overdueReceber = transactions.filter(t => t.type === 'receber' && t.status === 'atrasado');

    const todayTxs = transactions.filter(t => t.dueDate === today && t.status !== 'confirmado');
    const tomorrowTxs = transactions.filter(t => t.dueDate === addDays(today, 1) && t.status !== 'confirmado');
    const next7 = transactions.filter(t => {
      const end = addDays(today, 7);
      return t.dueDate > addDays(today, 1) && t.dueDate <= end && t.status !== 'confirmado';
    });

    // Top counterparts to chase (receivables overdue or due soon)
    const recebivelUrgentes = [...overdueReceber, ...transactions.filter(
      t => t.type === 'receber' && t.status === 'pendente' && t.dueDate >= today && t.dueDate <= addDays(today, 7)
    )].sort((a, b) => b.amount - a.amount).slice(0, 5);

    // Critical payments (overdue + today + tomorrow)
    const pagamentosUrgentes = [...overduePagar, ...todayTxs.filter(t => t.type === 'pagar'), ...tomorrowTxs.filter(t => t.type === 'pagar')]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return {
      overduePagar, overdueReceber,
      todayTxs, tomorrowTxs, next7,
      recebivelUrgentes, pagamentosUrgentes,
      overduePagarTotal: overduePagar.reduce((s, t) => s + t.amount, 0),
      overdueReceberTotal: overdueReceber.reduce((s, t) => s + t.amount, 0),
    };
  }, [transactions, today]);

  // === MONTH OVER MONTH ANALYSIS + DRE ===
  const DIRECT_COST_CATEGORIES = new Set([
    'Materiais de Obra', 'Mão de Obra Terceirizada', 'Mão de Obra',
    'Materiais', 'Empreiteiro', 'Subempreitada', 'Frete',
  ]);
  const ADMIN_CATEGORIES = new Set([
    'Software/SaaS', 'Salários', 'Impostos', 'Juros', 'Empréstimo',
    'Comissão de Vendas', 'Aluguel', 'Contador', 'Seguros',
  ]);

  const isRetroactive = (t: Transaction) => {
    const desc = (t.description || '').toLowerCase();
    const notes = (t.notes || '').toLowerCase();
    return desc.includes('parcelas anteriores') || desc.includes('histórico retroativo') ||
           notes.includes('retroativ') || notes.includes('parcelas anteriores');
  };

  const monthAnalysis = useMemo(() => {
    interface MonthData {
      label: string; month: string;
      entradas: number; saidas: number; confirmadas: number; pendentes: number; txCount: number;
      receitas: number; custoDireto: number; despAdmin: number; outrasDesp: number;
      margemBruta: number; resultadoOp: number; margemBrutaPct: number; margemOpPct: number;
    }

    const months: MonthData[] = [];

    for (let m = -3; m <= 0; m++) {
      const d = new Date();
      d.setMonth(d.getMonth() + m);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

      // Exclude retroactive/initialization entries from analysis
      const monthTxs = transactions.filter(t => t.dueDate.startsWith(monthStr) && !isRetroactive(t));
      const entradas = monthTxs.filter(t => t.type === 'receber').reduce((s, t) => s + t.amount, 0);
      const saidas = monthTxs.filter(t => t.type === 'pagar').reduce((s, t) => s + t.amount, 0);
      const confirmadas = monthTxs.filter(t => t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
      const pendentes = monthTxs.filter(t => t.status !== 'confirmado').reduce((s, t) => s + t.amount, 0);

      // DRE classification
      const receitas = entradas;
      const pagamentos = monthTxs.filter(t => t.type === 'pagar');

      // Direct costs: has obra OR is in direct cost categories
      const custoDireto = pagamentos
        .filter(t => t.obraId || DIRECT_COST_CATEGORIES.has(t.category))
        .reduce((s, t) => s + t.amount, 0);

      // Admin expenses: admin cost center or admin categories (excluding what's already direct)
      const despAdmin = pagamentos
        .filter(t => !t.obraId && !DIRECT_COST_CATEGORIES.has(t.category) && (t.costCenter === 'Administrativo' || ADMIN_CATEGORIES.has(t.category)))
        .reduce((s, t) => s + t.amount, 0);

      // Other expenses (not classified as direct or admin)
      const outrasDesp = saidas - custoDireto - despAdmin;

      const margemBruta = receitas - custoDireto;
      const resultadoOp = margemBruta - despAdmin - (outrasDesp > 0 ? outrasDesp : 0);
      const margemBrutaPct = receitas > 0 ? (margemBruta / receitas) * 100 : 0;
      const margemOpPct = receitas > 0 ? (resultadoOp / receitas) * 100 : 0;

      months.push({
        label, month: monthStr, entradas, saidas, confirmadas, pendentes, txCount: monthTxs.length,
        receitas, custoDireto, despAdmin, outrasDesp: Math.max(outrasDesp, 0),
        margemBruta, resultadoOp, margemBrutaPct, margemOpPct,
      });
    }

    const current = months[months.length - 1];
    const previous = months[months.length - 2];
    const entradaMoM = previous.entradas > 0 ? ((current.entradas - previous.entradas) / previous.entradas) * 100 : 0;
    const saidaMoM = previous.saidas > 0 ? ((current.saidas - previous.saidas) / previous.saidas) * 100 : 0;

    return { months, entradaMoM, saidaMoM, current, previous };
  }, [transactions]);

  // === 30-DAY WATERFALL DATA ===
  const waterfallData = useMemo(() => {
    const data: { label: string; date: string; saldo: number; entradas: number; saidas: number; isToday: boolean; isWeekend: boolean }[] = [];
    for (let i = 0; i < 30; i++) {
      const date = addDays(today, i);
      const dayDate = new Date(date + 'T12:00:00');
      const dayTxs = transactions.filter(t => t.dueDate === date && t.status !== 'confirmado');
      const entradas = dayTxs.filter(t => t.type === 'receber').reduce((s, t) => s + t.amount, 0);
      const saidas = dayTxs.filter(t => t.type === 'pagar').reduce((s, t) => s + t.amount, 0);
      data.push({
        label: getDayMonth(date),
        date,
        saldo: filteredProjectedBalance(date),
        entradas,
        saidas: -saidas,
        isToday: date === today,
        isWeekend: dayDate.getDay() === 0 || dayDate.getDay() === 6,
      });
    }
    return data;
  }, [transactions, filteredProjectedBalance, today]);

  // === WEEKLY CASH NEEDS ===
  const weeklyNeeds = useMemo(() => {
    const weeks: { label: string; saidas: number; entradas: number; gap: number; covered: boolean }[] = [];
    for (let w = 0; w < 4; w++) {
      const start = addDays(today, w * 7);
      const end = addDays(today, (w + 1) * 7 - 1);
      const weekTxs = transactions.filter(t => t.dueDate >= start && t.dueDate <= end && t.status !== 'confirmado');
      const saidas = weekTxs.filter(t => t.type === 'pagar').reduce((s, t) => s + t.amount, 0);
      const entradas = weekTxs.filter(t => t.type === 'receber').reduce((s, t) => s + t.amount, 0);
      weeks.push({
        label: `${getDayMonth(start)} – ${getDayMonth(end)}`,
        saidas, entradas,
        gap: entradas - saidas,
        covered: entradas >= saidas,
      });
    }
    return weeks;
  }, [transactions, today]);

  const currentBal = filteredBalance?.amount ?? 0;
  const bal30 = filteredProjectedBalance(addDays(today, 30));
  const netChange = bal30 - currentBal;

  // Export helper
  const exportDays = useMemo(() => waterfallData.map(d => ({
    date: d.date,
    label: d.label,
    weekday: '',
    entradas: d.entradas,
    saidas: Math.abs(d.saidas),
    saldoDia: d.entradas + d.saidas,
    accumulated: d.saldo,
    transactions: [] as Transaction[],
    isToday: d.isToday,
    isWeekend: d.isWeekend,
    txCount: 0,
  })), [waterfallData]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const saldo = payload.find((p: any) => p.dataKey === 'saldo')?.value;
    const ent = payload.find((p: any) => p.dataKey === 'entradas')?.value;
    const sai = payload.find((p: any) => p.dataKey === 'saidas')?.value;
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs space-y-1.5">
        <p className="font-semibold">{label}</p>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Saldo:</span>
          <span className={cn('font-mono font-bold', (saldo ?? 0) >= 0 ? 'text-foreground' : 'text-destructive')}>{formatCurrency(saldo ?? 0)}</span>
        </div>
        {(ent ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-success">Entradas:</span>
            <span className="font-mono text-success">+{formatCurrency(ent)}</span>
          </div>
        )}
        {(sai ?? 0) < 0 && (
          <div className="flex items-center gap-2">
            <span className="text-destructive">Saídas:</span>
            <span className="font-mono text-destructive">{formatCurrency(Math.abs(sai))}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <motion.div {...sect(0)} className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold leading-tight tracking-tight">Fluxo de Caixa</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 flex items-center gap-2 flex-wrap">
            Visão operacional e análise
            {isFiltered && selectedObra && (
              <Badge variant="outline" className="text-[10px] border-primary/50 bg-primary/5">
                <Building2 className="w-3 h-3 mr-1" />
                {selectedObra.code} · {selectedObra.clientName}
              </Badge>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          <RecurrenceGenerator />
          <DashboardPeriodFilter value={period} onChange={setPeriod} />
          <ExportDropdown
            onCSV={() => exportToCSV(cashFlowToExportRows(exportDays), 'fluxo-caixa')}
            onExcel={() => exportToExcel(cashFlowToExportRows(exportDays), 'fluxo-caixa')}
            onPDF={() => {
              const rows = cashFlowToExportRows(exportDays);
              const headers = Object.keys(rows[0] || {});
              exportToPDF('Fluxo de Caixa', headers, rows.map(r => headers.map(h => String(r[h] ?? ''))));
            }}
          />
        </div>
      </motion.div>

      {/* Quick Status Strip */}
      <motion.div {...sect(0.04)} className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatusCard
          icon={Wallet} label="Saldo Atual" value={formatCurrency(currentBal)}
          iconBg="bg-primary/10" iconColor="text-primary"
        />
        <StatusCard
          icon={netChange >= 0 ? TrendingUp : TrendingDown}
          label="Saldo em 30d" value={formatCurrency(bal30)}
          sub={`${netChange >= 0 ? '+' : ''}${formatCurrency(netChange)}`}
          iconBg={bal30 >= 0 ? 'bg-success/10' : 'bg-destructive/10'}
          iconColor={bal30 >= 0 ? 'text-success' : 'text-destructive'}
          valueColor={bal30 >= 0 ? 'text-success' : 'text-destructive'}
        />
        <StatusCard
          icon={AlertTriangle} label="Atrasados (pagar)"
          value={operationalData.overduePagar.length > 0 ? formatCurrency(operationalData.overduePagarTotal) : '—'}
          sub={operationalData.overduePagar.length > 0 ? `${operationalData.overduePagar.length} transações` : 'Nenhum'}
          iconBg={operationalData.overduePagar.length > 0 ? 'bg-destructive/10' : 'bg-muted'}
          iconColor={operationalData.overduePagar.length > 0 ? 'text-destructive' : 'text-muted-foreground'}
          valueColor={operationalData.overduePagar.length > 0 ? 'text-destructive' : ''}
        />
        <StatusCard
          icon={Clock} label="Atrasados (receber)"
          value={operationalData.overdueReceber.length > 0 ? formatCurrency(operationalData.overdueReceberTotal) : '—'}
          sub={operationalData.overdueReceber.length > 0 ? `${operationalData.overdueReceber.length} a cobrar` : 'Nenhum'}
          iconBg={operationalData.overdueReceber.length > 0 ? 'bg-warning/10' : 'bg-muted'}
          iconColor={operationalData.overdueReceber.length > 0 ? 'text-warning' : 'text-muted-foreground'}
          valueColor={operationalData.overdueReceber.length > 0 ? 'text-warning' : ''}
        />
      </motion.div>

      {/* Main Tabs */}
      <motion.div {...sect(0.08)}>
        <Tabs defaultValue="operacional" className="space-y-4">
          <TabsList className="bg-muted/60 p-1 h-10">
            <TabsTrigger value="operacional" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
              <Target className="w-3.5 h-3.5" /> Agenda Operacional
            </TabsTrigger>
            <TabsTrigger value="projecao" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
              <LineChart className="w-3.5 h-3.5" /> Projeção 30d
            </TabsTrigger>
            <TabsTrigger value="analise" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
              <BarChart3 className="w-3.5 h-3.5" /> Análise Mensal
            </TabsTrigger>
            <TabsTrigger value="tabela" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
              <List className="w-3.5 h-3.5" /> Tabela 30d
            </TabsTrigger>
          </TabsList>

          {/* === OPERATIONAL TAB === */}
          <TabsContent value="operacional" className="mt-0 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Cobranças urgentes */}
              <div className="card-elevated overflow-hidden">
                <div className="px-4 py-3 border-b flex items-center gap-2.5 bg-warning/[0.03]">
                  <div className="w-7 h-7 rounded-lg bg-warning/10 flex items-center justify-center">
                    <Receipt className="w-3.5 h-3.5 text-warning" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Cobranças Prioritárias</h3>
                    <p className="text-[10px] text-muted-foreground">Recebíveis atrasados e próximos 7 dias</p>
                  </div>
                </div>
                <div className="divide-y max-h-[320px] overflow-y-auto">
                  {operationalData.recebivelUrgentes.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-success/50" />
                      Nenhuma cobrança urgente
                    </div>
                  ) : operationalData.recebivelUrgentes.map(tx => (
                    <div key={tx.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors group">
                      <div className={cn(
                        'w-2 h-8 rounded-full shrink-0',
                        tx.status === 'atrasado' ? 'bg-destructive' : 'bg-warning'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{tx.counterpart || tx.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{getDayMonth(tx.dueDate)}</span>
                          {tx.status === 'atrasado' && <Badge variant="destructive" className="text-[9px] h-4 px-1.5">Atrasado</Badge>}
                          {tx.obraId && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                              {obras.find(o => o.id === tx.obraId)?.code}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <span className="font-mono text-xs font-bold text-success whitespace-nowrap">
                        {formatCurrency(tx.amount)}
                      </span>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 px-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity text-success hover:text-success hover:bg-success/10 shrink-0"
                        onClick={() => confirmTransaction(tx.id, tx.amount, tx.type)}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Confirmar
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pagamentos urgentes */}
              <div className="card-elevated overflow-hidden">
                <div className="px-4 py-3 border-b flex items-center gap-2.5 bg-destructive/[0.03]">
                  <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <Flame className="w-3.5 h-3.5 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Pagamentos Urgentes</h3>
                    <p className="text-[10px] text-muted-foreground">Atrasados + hoje + amanhã</p>
                  </div>
                </div>
                <div className="divide-y max-h-[320px] overflow-y-auto">
                  {operationalData.pagamentosUrgentes.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-success/50" />
                      Nenhum pagamento urgente
                    </div>
                  ) : operationalData.pagamentosUrgentes.map(tx => (
                    <div key={tx.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors group">
                      <div className={cn(
                        'w-2 h-8 rounded-full shrink-0',
                        tx.status === 'atrasado' ? 'bg-destructive' :
                        tx.dueDate === today ? 'bg-warning' : 'bg-muted-foreground/30'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{tx.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            {tx.dueDate === today ? 'Hoje' : tx.dueDate === addDays(today, 1) ? 'Amanhã' : getDayMonth(tx.dueDate)}
                          </span>
                          {tx.status === 'atrasado' && <Badge variant="destructive" className="text-[9px] h-4 px-1.5">Atrasado</Badge>}
                          {tx.counterpart && <span className="text-[10px] text-muted-foreground truncate">{tx.counterpart}</span>}
                        </div>
                      </div>
                      <span className="font-mono text-xs font-bold text-destructive whitespace-nowrap">
                        {formatCurrency(tx.amount)}
                      </span>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 px-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity text-success hover:text-success hover:bg-success/10 shrink-0"
                        onClick={() => confirmTransaction(tx.id, tx.amount, tx.type)}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Pagar
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Weekly Cash Needs */}
            <div className="card-elevated overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Calendar className="w-3.5 h-3.5 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Necessidade de Caixa Semanal</h3>
                  <p className="text-[10px] text-muted-foreground">Próximas 4 semanas — entradas vs saídas pendentes</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x">
                {weeklyNeeds.map((week, i) => (
                  <div key={i} className={cn('p-4 space-y-3', !week.covered && 'bg-destructive/[0.03]')}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                        {i === 0 ? 'Esta semana' : `Semana ${i + 1}`}
                      </span>
                      {!week.covered && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{week.label}</p>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-success"><ArrowUp className="w-3 h-3" />Entradas</span>
                        <span className="font-mono font-medium text-success">{formatCurrency(week.entradas)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-destructive"><ArrowDown className="w-3 h-3" />Saídas</span>
                        <span className="font-mono font-medium text-destructive">{formatCurrency(week.saidas)}</span>
                      </div>
                      <div className="border-t pt-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">Gap</span>
                          <span className={cn('font-mono font-bold', week.gap >= 0 ? 'text-success' : 'text-destructive')}>
                            {week.gap >= 0 ? '+' : ''}{formatCurrency(week.gap)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* === PROJECTION TAB === */}
          <TabsContent value="projecao" className="mt-0 space-y-4">
            <div className="card-elevated p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <LineChart className="w-4 h-4 text-accent" />
                  <h3 className="font-semibold text-sm">Projeção de Saldo — 30 dias</h3>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent" />Saldo</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" />Entradas</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive" />Saídas</span>
                </div>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={waterfallData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval={2} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.5} />
                    <Bar dataKey="entradas" fill="hsl(var(--success))" opacity={0.6} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="saidas" fill="hsl(var(--destructive))" opacity={0.6} radius={[0, 0, 2, 2]} />
                    <Line type="monotone" dataKey="saldo" stroke="hsl(var(--accent))" strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          {/* === ANALYSIS TAB === */}
          <TabsContent value="analise" className="mt-0 space-y-4">
            {/* DRE Simplificado */}
            <div className="card-elevated overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center gap-2.5">
                <TrendingUp className="w-4 h-4 text-accent" />
                <div>
                  <h3 className="font-semibold text-sm">DRE Simplificado</h3>
                  <p className="text-[10px] text-muted-foreground">Receitas − Custos Diretos = Margem Bruta − Despesas Administrativas = Resultado Operacional</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-[10px] font-medium text-muted-foreground uppercase w-[200px]">Linha</th>
                      {monthAnalysis.months.map((m, i) => (
                        <th key={m.month} className="text-right px-4 py-2.5 text-[10px] font-medium text-muted-foreground uppercase capitalize">
                          {m.label} {i === monthAnalysis.months.length - 1 && <Badge variant="outline" className="text-[8px] ml-0.5">Atual</Badge>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <DRERow label="Receitas (Entradas)" values={monthAnalysis.months.map(m => m.receitas)} bold color="text-success" />
                    <DRERow label="(−) Custos Diretos" values={monthAnalysis.months.map(m => -m.custoDireto)} sub color="text-destructive" />
                    <DRERow label="= Margem Bruta" values={monthAnalysis.months.map(m => m.margemBruta)} bold highlight pctValues={monthAnalysis.months.map(m => m.margemBrutaPct)} />
                    <DRERow label="(−) Despesas Administrativas" values={monthAnalysis.months.map(m => -m.despAdmin)} sub color="text-destructive" />
                    <DRERow label="(−) Outras Despesas" values={monthAnalysis.months.map(m => -m.outrasDesp)} sub color="text-muted-foreground" />
                    <DRERow label="= Resultado Operacional" values={monthAnalysis.months.map(m => m.resultadoOp)} bold highlight pctValues={monthAnalysis.months.map(m => m.margemOpPct)} />
                  </tbody>
                </table>
              </div>
            </div>

            {/* MoM Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="card-elevated p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Entradas vs mês anterior</span>
                  {monthAnalysis.entradaMoM !== 0 && (
                    <Badge variant="outline" className={cn('text-[10px]', monthAnalysis.entradaMoM >= 0 ? 'text-success border-success/30' : 'text-destructive border-destructive/30')}>
                      {monthAnalysis.entradaMoM >= 0 ? '↑' : '↓'} {Math.abs(monthAnalysis.entradaMoM).toFixed(0)}%
                    </Badge>
                  )}
                </div>
                <p className="text-lg font-bold font-mono text-success">{formatCurrency(monthAnalysis.current.entradas)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Mês anterior: {formatCurrency(monthAnalysis.previous.entradas)}</p>
              </div>
              <div className="card-elevated p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Saídas vs mês anterior</span>
                  {monthAnalysis.saidaMoM !== 0 && (
                    <Badge variant="outline" className={cn('text-[10px]', monthAnalysis.saidaMoM <= 0 ? 'text-success border-success/30' : 'text-destructive border-destructive/30')}>
                      {monthAnalysis.saidaMoM <= 0 ? '↓' : '↑'} {Math.abs(monthAnalysis.saidaMoM).toFixed(0)}%
                    </Badge>
                  )}
                </div>
                <p className="text-lg font-bold font-mono text-destructive">{formatCurrency(monthAnalysis.current.saidas)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Mês anterior: {formatCurrency(monthAnalysis.previous.saidas)}</p>
              </div>
            </div>

            {/* Monthly Comparison Chart */}
            <div className="card-elevated p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Comparativo Mensal</h3>
              </div>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthAnalysis.months} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs space-y-1">
                            <p className="font-semibold capitalize">{label}</p>
                            {payload.map((p: any) => (
                              <div key={p.dataKey} className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                                <span>{p.dataKey === 'entradas' ? 'Entradas' : 'Saídas'}: <span className="font-mono font-medium">{formatCurrency(p.value)}</span></span>
                              </div>
                            ))}
                            <div className="border-t pt-1">
                              <span className="font-medium">Líquido: </span>
                              <span className={cn('font-mono font-bold', (payload[0]?.value - payload[1]?.value) >= 0 ? 'text-success' : 'text-destructive')}>
                                {formatCurrency((payload[0]?.value ?? 0) - (payload[1]?.value ?? 0))}
                              </span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="entradas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} opacity={0.8} />
                    <Bar dataKey="saidas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} opacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" />Entradas</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive" />Saídas</span>
              </div>
            </div>

            {/* Monthly table */}
            <div className="card-elevated overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Resumo por Mês</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Mês</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Entradas</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Saídas</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Líquido</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-medium text-muted-foreground uppercase">Transações</th>
                  </tr>
                </thead>
                <tbody>
                  {monthAnalysis.months.map((m, i) => {
                    const net = m.entradas - m.saidas;
                    const isCurrent = i === monthAnalysis.months.length - 1;
                    return (
                      <tr key={m.month} className={cn('border-b hover:bg-muted/20 transition-colors', isCurrent && 'bg-accent/[0.04]')}>
                        <td className="px-4 py-2.5 text-xs font-medium capitalize">
                          {m.label} {isCurrent && <Badge variant="outline" className="text-[9px] ml-1">Atual</Badge>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-success">{formatCurrency(m.entradas)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-destructive">{formatCurrency(m.saidas)}</td>
                        <td className={cn('px-4 py-2.5 text-right font-mono text-xs font-bold', net >= 0 ? 'text-success' : 'text-destructive')}>
                          {net >= 0 ? '+' : ''}{formatCurrency(net)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{m.txCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* === TABLE TAB === */}
          <TabsContent value="tabela" className="mt-0">
            <CashFlowTable period={period} />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}

/* ─── Sub-components ─── */
function StatusCard({ icon: Icon, label, value, sub, iconBg, iconColor, valueColor }: {
  icon: any; label: string; value: string; sub?: string;
  iconBg: string; iconColor: string; valueColor?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="card-elevated p-3.5"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', iconBg)}>
          <Icon className={cn('w-3.5 h-3.5', iconColor)} />
        </div>
        <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">{label}</span>
      </div>
      <p className={cn('text-base font-bold font-mono tracking-tight', valueColor)}>{value}</p>
      {sub && <p className="text-[10px] font-mono mt-0.5 text-muted-foreground">{sub}</p>}
    </motion.div>
  );
}

function DRERow({ label, values, bold, sub, highlight, color, pctValues }: {
  label: string; values: number[]; bold?: boolean; sub?: boolean; highlight?: boolean;
  color?: string; pctValues?: number[];
}) {
  return (
    <tr className={cn(
      'border-b transition-colors',
      highlight && 'bg-accent/[0.04]',
      sub && 'text-muted-foreground',
    )}>
      <td className={cn('px-4 py-2.5 text-xs', bold && 'font-semibold', sub && 'pl-6')}>
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className={cn(
          'px-4 py-2.5 text-right font-mono text-xs',
          bold && 'font-bold',
          color || (v >= 0 ? '' : 'text-destructive'),
          highlight && (v >= 0 ? 'text-success' : 'text-destructive'),
        )}>
          <div>{formatCurrency(Math.abs(v))}</div>
          {pctValues && (
            <div className={cn('text-[9px] mt-0.5', pctValues[i] >= 0 ? 'text-success' : 'text-destructive')}>
              {pctValues[i].toFixed(1)}%
            </div>
          )}
        </td>
      ))}
    </tr>
  );
}
