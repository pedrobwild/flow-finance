import { useMemo, useState, useCallback } from 'react';
import { formatCurrency } from '@/lib/helpers';
import type { Transaction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Info, Target,
  AlertTriangle, CheckCircle2, XCircle, Loader2, Sparkles, BarChart3
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

interface Props {
  allTransactions: Transaction[];
  year: number;
  month: number;
}

interface KPIData {
  id: string;
  name: string;
  value: number;
  formattedValue: string;
  description: string;
  category: 'eficiência' | 'estrutura' | 'operacional';
  icon: React.ReactNode;
  // Benchmark data from Perplexity
  benchmark?: {
    benchmark_min: number;
    benchmark_max: number;
    benchmark_label: string;
    status: 'bom' | 'atenção' | 'crítico';
    insight: string;
  };
}

function getMonthRange(year: number, month: number) {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

const STATUS_CONFIG = {
  bom: { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', icon: CheckCircle2, label: 'Saudável' },
  'atenção': { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', icon: AlertTriangle, label: 'Atenção' },
  'crítico': { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800', icon: XCircle, label: 'Crítico' },
};

const CATEGORY_LABELS = {
  'eficiência': 'Eficiência',
  'estrutura': 'Estrutura de Custos',
  'operacional': 'Operacional',
};

// Helper to compute KPI values for a given month's transactions
function computeKPIValues(payables: Transaction[], receivables: Transaction[]) {
  const totalReceita = receivables.reduce((s, t) => s + t.amount, 0);
  const totalCusto = payables.reduce((s, t) => s + t.amount, 0);
  const maoDeObra = payables.filter(t => ['Mão de Obra', 'Mão de Obra Terceirizada', 'Salários'].some(c => t.category.includes(c))).reduce((s, t) => s + t.amount, 0);
  const materiais = payables.filter(t => ['Material', 'Materiais'].some(c => t.category.includes(c))).reduce((s, t) => s + t.amount, 0);
  const custoFixo = payables.filter(t => ['Aluguel', 'Administrativo', 'Contabilidade', 'Seguros', 'Software'].some(c => t.category.includes(c) || t.costCenter === 'Administrativo')).reduce((s, t) => s + t.amount, 0);
  const adminCosts = payables.filter(t => ['Administrativo', 'Diretoria', 'Jurídico', 'RH'].includes(t.costCenter)).reduce((s, t) => s + t.amount, 0);
  const byCounterpart = new Map<string, number>();
  payables.forEach(t => byCounterpart.set(t.counterpart, (byCounterpart.get(t.counterpart) || 0) + t.amount));
  const sorted = [...byCounterpart.entries()].sort((a, b) => b[1] - a[1]);
  const top3Total = sorted.slice(0, 3).reduce((s, [, v]) => s + v, 0);

  return {
    receita_folha: maoDeObra > 0 ? totalReceita / maoDeObra : 0,
    margem_operacional: totalReceita > 0 ? ((totalReceita - totalCusto) / totalReceita) * 100 : 0,
    material_receita: totalReceita > 0 ? (materiais / totalReceita) * 100 : 0,
    fixo_total: totalCusto > 0 ? (custoFixo / totalCusto) * 100 : 0,
    overhead: totalReceita > 0 ? (adminCosts / totalReceita) * 100 : 0,
    custo_medio: payables.length > 0 ? totalCusto / payables.length : 0,
    cobertura: totalCusto > 0 ? totalReceita / totalCusto : 0,
    concentracao: totalCusto > 0 ? (top3Total / totalCusto) * 100 : 0,
  };
}

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function CustosIndicadores({ allTransactions, year, month }: Props) {
  const [benchmarks, setBenchmarks] = useState<Record<string, KPIData['benchmark']>>({});
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [showTrends, setShowTrends] = useState(true);

  const { from, to } = getMonthRange(year, month);

  const monthPayables = useMemo(() =>
    allTransactions.filter(t => t.type === 'pagar' && t.dueDate >= from && t.dueDate <= to),
    [allTransactions, from, to]
  );

  const monthReceivables = useMemo(() =>
    allTransactions.filter(t => t.type === 'receber' && t.dueDate >= from && t.dueDate <= to),
    [allTransactions, from, to]
  );

  const totalReceita = useMemo(() => monthReceivables.reduce((s, t) => s + t.amount, 0), [monthReceivables]);
  const totalCusto = useMemo(() => monthPayables.reduce((s, t) => s + t.amount, 0), [monthPayables]);

  // Breakdown by category
  const maoDeObra = useMemo(() =>
    monthPayables.filter(t => ['Mão de Obra', 'Mão de Obra Terceirizada', 'Salários'].some(c => t.category.includes(c)))
      .reduce((s, t) => s + t.amount, 0),
    [monthPayables]
  );

  const materiais = useMemo(() =>
    monthPayables.filter(t => ['Material', 'Materiais'].some(c => t.category.includes(c)))
      .reduce((s, t) => s + t.amount, 0),
    [monthPayables]
  );

  const custoFixo = useMemo(() =>
    monthPayables.filter(t => ['Aluguel', 'Administrativo', 'Contabilidade', 'Seguros', 'Software'].some(c => t.category.includes(c) || t.costCenter === 'Administrativo'))
      .reduce((s, t) => s + t.amount, 0),
    [monthPayables]
  );

  const custoVariavel = totalCusto - custoFixo;

  const kpis = useMemo<KPIData[]>(() => {
    const list: KPIData[] = [];

    // 1. Receita / Folha (Revenue to Payroll Ratio)
    const receitaFolha = maoDeObra > 0 ? totalReceita / maoDeObra : 0;
    list.push({
      id: 'receita_folha',
      name: 'Receita / Folha de Pagamento',
      value: receitaFolha,
      formattedValue: receitaFolha > 0 ? `${receitaFolha.toFixed(1)}x` : '–',
      description: 'Quanto de receita a empresa gera para cada R$1 gasto com mão de obra. Quanto maior, melhor a produtividade.',
      category: 'eficiência',
      icon: <TrendingUp className="w-4 h-4" />,
      benchmark: benchmarks['Receita / Folha de Pagamento'],
    });

    // 2. Margem Operacional
    const margem = totalReceita > 0 ? ((totalReceita - totalCusto) / totalReceita) * 100 : 0;
    list.push({
      id: 'margem_operacional',
      name: 'Margem Operacional',
      value: margem,
      formattedValue: `${margem.toFixed(1)}%`,
      description: 'Percentual de lucro após deduzir todos os custos operacionais. Reflete a eficiência geral do negócio.',
      category: 'eficiência',
      icon: margem >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />,
      benchmark: benchmarks['Margem Operacional'],
    });

    // 3. Custo de Material / Receita
    const materialRatio = totalReceita > 0 ? (materiais / totalReceita) * 100 : 0;
    list.push({
      id: 'material_receita',
      name: 'Material / Receita',
      value: materialRatio,
      formattedValue: `${materialRatio.toFixed(1)}%`,
      description: 'Proporção da receita consumida por materiais. Indica poder de compra e eficiência no uso de insumos.',
      category: 'estrutura',
      icon: <Target className="w-4 h-4" />,
      benchmark: benchmarks['Material / Receita'],
    });

    // 4. Custo Fixo / Custo Total
    const fixoRatio = totalCusto > 0 ? (custoFixo / totalCusto) * 100 : 0;
    list.push({
      id: 'fixo_total',
      name: 'Custo Fixo / Custo Total',
      value: fixoRatio,
      formattedValue: `${fixoRatio.toFixed(1)}%`,
      description: 'Peso dos custos fixos na estrutura total. Alto percentual reduz flexibilidade em períodos de baixa.',
      category: 'estrutura',
      icon: <Minus className="w-4 h-4" />,
      benchmark: benchmarks['Custo Fixo / Custo Total'],
    });

    // 5. Overhead Rate (Custo Administrativo / Receita)
    const adminCosts = monthPayables.filter(t =>
      ['Administrativo', 'Diretoria', 'Jurídico', 'RH'].includes(t.costCenter)
    ).reduce((s, t) => s + t.amount, 0);
    const overheadRate = totalReceita > 0 ? (adminCosts / totalReceita) * 100 : 0;
    list.push({
      id: 'overhead',
      name: 'Overhead (Administrativo / Receita)',
      value: overheadRate,
      formattedValue: `${overheadRate.toFixed(1)}%`,
      description: 'Custo da "máquina" administrativa em relação à receita. Overhead alto corrói a margem.',
      category: 'estrutura',
      icon: <TrendingDown className="w-4 h-4" />,
      benchmark: benchmarks['Overhead (Administrativo / Receita)'],
    });

    // 6. Custo Médio por Lançamento
    const custoMedio = monthPayables.length > 0 ? totalCusto / monthPayables.length : 0;
    list.push({
      id: 'custo_medio',
      name: 'Ticket Médio de Custo',
      value: custoMedio,
      formattedValue: formatCurrency(custoMedio),
      description: 'Valor médio de cada saída. Picos indicam concentração de risco em poucos pagamentos grandes.',
      category: 'operacional',
      icon: <Target className="w-4 h-4" />,
      benchmark: benchmarks['Ticket Médio de Custo'],
    });

    // 7. Índice de Cobertura (Receita / Custo)
    const cobertura = totalCusto > 0 ? totalReceita / totalCusto : 0;
    list.push({
      id: 'cobertura',
      name: 'Índice de Cobertura',
      value: cobertura,
      formattedValue: cobertura > 0 ? `${cobertura.toFixed(2)}x` : '–',
      description: 'Quantas vezes a receita cobre os custos. Abaixo de 1x = operação deficitária.',
      category: 'eficiência',
      icon: cobertura >= 1 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />,
      benchmark: benchmarks['Índice de Cobertura'],
    });

    // 8. Concentração Top 3 Fornecedores
    const byCounterpart = new Map<string, number>();
    monthPayables.forEach(t => {
      byCounterpart.set(t.counterpart, (byCounterpart.get(t.counterpart) || 0) + t.amount);
    });
    const sorted = [...byCounterpart.entries()].sort((a, b) => b[1] - a[1]);
    const top3Total = sorted.slice(0, 3).reduce((s, [, v]) => s + v, 0);
    const concentracao = totalCusto > 0 ? (top3Total / totalCusto) * 100 : 0;
    list.push({
      id: 'concentracao',
      name: 'Concentração Top 3 Fornecedores',
      value: concentracao,
      formattedValue: `${concentracao.toFixed(0)}%`,
      description: 'Percentual do custo total nos 3 maiores fornecedores. Alta concentração = alto risco de dependência.',
      category: 'operacional',
      icon: <AlertTriangle className="w-4 h-4" />,
      benchmark: benchmarks['Concentração Top 3 Fornecedores'],
    });

    return list;
  }, [monthPayables, monthReceivables, totalReceita, totalCusto, maoDeObra, materiais, custoFixo, custoVariavel, benchmarks]);

  const fetchBenchmarks = useCallback(async () => {
    setLoading(true);
    try {
      const kpiPayload = kpis.map(k => ({ name: k.name, value: k.formattedValue }));
      const { data, error } = await supabase.functions.invoke('kpi-benchmarks', {
        body: { kpis: kpiPayload },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.benchmarks && Array.isArray(data.benchmarks)) {
        const map: Record<string, KPIData['benchmark']> = {};
        data.benchmarks.forEach((b: any) => {
          map[b.name] = {
            benchmark_min: b.benchmark_min,
            benchmark_max: b.benchmark_max,
            benchmark_label: b.benchmark_label,
            status: b.status,
            insight: b.insight,
          };
        });
        setBenchmarks(map);
        setLastFetch(data.fetchedAt);
        toast.success('Benchmarks atualizados com dados do mercado');
      }
    } catch (e) {
      console.error('Failed to fetch benchmarks:', e);
      toast.error('Erro ao buscar benchmarks do mercado');
    } finally {
      setLoading(false);
    }
  }, [kpis]);

  const grouped = useMemo(() => {
    const groups: Record<string, KPIData[]> = {};
    kpis.forEach(k => {
      if (!groups[k.category]) groups[k.category] = [];
      groups[k.category].push(k);
    });
    return groups;
  }, [kpis]);

  // 6-month trend data
  const trendData = useMemo(() => {
    const months: { year: number; month: number; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      let m = month - i;
      let y = year;
      while (m < 0) { m += 12; y--; }
      months.push({ year: y, month: m, label: MONTH_NAMES[m] });
    }

    return months.map(({ year: y, month: m, label }) => {
      const { from: mFrom, to: mTo } = getMonthRange(y, m);
      const pay = allTransactions.filter(t => t.type === 'pagar' && t.dueDate >= mFrom && t.dueDate <= mTo);
      const rec = allTransactions.filter(t => t.type === 'receber' && t.dueDate >= mFrom && t.dueDate <= mTo);
      return { label, ...computeKPIValues(pay, rec) };
    });
  }, [allTransactions, year, month]);

  const kpiTrendConfig: { id: string; name: string; suffix: string; color: string; decimals: number }[] = [
    { id: 'receita_folha', name: 'Receita / Folha', suffix: 'x', color: 'hsl(var(--primary))', decimals: 1 },
    { id: 'margem_operacional', name: 'Margem Operacional', suffix: '%', color: 'hsl(var(--success, 142 76% 36%))', decimals: 1 },
    { id: 'material_receita', name: 'Material / Receita', suffix: '%', color: 'hsl(var(--accent))', decimals: 1 },
    { id: 'fixo_total', name: 'Custo Fixo / Total', suffix: '%', color: '#6366f1', decimals: 1 },
    { id: 'overhead', name: 'Overhead', suffix: '%', color: '#d97706', decimals: 1 },
    { id: 'cobertura', name: 'Índice de Cobertura', suffix: 'x', color: '#059669', decimals: 2 },
    { id: 'concentracao', name: 'Concentração Top 3', suffix: '%', color: '#dc2626', decimals: 0 },
    { id: 'custo_medio', name: 'Ticket Médio', suffix: '', color: '#64748b', decimals: 0 },
  ];

  // KPIs where "up is good" (true) vs "down is good" (false)
  const kpiDirection: Record<string, boolean> = {
    receita_folha: true, margem_operacional: true, cobertura: true,
    material_receita: false, fixo_total: false, overhead: false,
    concentracao: false, custo_medio: false,
  };

  // Detect consecutive decline (2+ months worsening)
  const declineAlerts = useMemo(() => {
    if (trendData.length < 3) return [];
    const alerts: { id: string; name: string; months: number; color: string; suffix: string; decimals: number; values: number[] }[] = [];

    kpiTrendConfig.forEach(cfg => {
      const vals = trendData.map(d => d[cfg.id as keyof typeof d] as number);
      const upIsGood = kpiDirection[cfg.id] ?? true;
      let consecutive = 0;

      for (let i = vals.length - 1; i >= 1; i--) {
        const worsened = upIsGood ? vals[i] < vals[i - 1] : vals[i] > vals[i - 1];
        if (worsened && vals[i - 1] !== 0) consecutive++;
        else break;
      }

      if (consecutive >= 2) {
        alerts.push({ id: cfg.id, name: cfg.name, months: consecutive, color: cfg.color, suffix: cfg.suffix, decimals: cfg.decimals, values: vals.slice(-(consecutive + 1)) });
      }
    });

    return alerts;
  }, [trendData]);

  return (
    <div className="space-y-6">
      {/* Header + Fetch Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            Indicadores Estratégicos
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            KPIs com benchmarks do setor de reformas de alto padrão
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastFetch && (
            <span className="text-[10px] text-muted-foreground">
              Atualizado: {new Date(lastFetch).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8"
            onClick={fetchBenchmarks}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {loading ? 'Buscando...' : 'Buscar Benchmarks'}
          </Button>
        </div>
      </div>

      {/* KPI Groups */}
      {Object.entries(grouped).map(([category, items]) => (
        <motion.div
          key={category}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map((kpi) => {
              const statusCfg = kpi.benchmark?.status ? STATUS_CONFIG[kpi.benchmark.status] : null;
              const StatusIcon = statusCfg?.icon;

              return (
                <Card key={kpi.id} className={`border shadow-sm transition-all ${statusCfg ? statusCfg.border : 'border-border'}`}>
                  <CardContent className="p-4 space-y-3">
                    {/* Top row: name + info */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <span className="text-muted-foreground">{kpi.icon}</span>
                        {kpi.name}
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="text-muted-foreground hover:text-foreground transition-colors">
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[280px] text-xs">
                          {kpi.description}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Value */}
                    <p className="text-2xl font-bold font-mono tracking-tight">{kpi.formattedValue}</p>

                    {/* Benchmark info */}
                    {kpi.benchmark ? (
                      <div className={`rounded-md p-2.5 space-y-1.5 ${statusCfg?.bg || 'bg-muted/50'}`}>
                        <div className="flex items-center gap-1.5">
                          {StatusIcon && <StatusIcon className={`w-3.5 h-3.5 ${statusCfg?.color}`} />}
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusCfg?.color} border-current`}>
                            {statusCfg?.label}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            Ideal: {kpi.benchmark.benchmark_label}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {kpi.benchmark.insight}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-md p-2.5 bg-muted/30 border border-dashed border-border">
                        <p className="text-[10px] text-muted-foreground text-center">
                          Clique em "Buscar Benchmarks" para comparar com o mercado
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.div>
      ))}

      {/* 6-Month Trend Charts */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Evolução 6 Meses
          </h3>
          <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setShowTrends(v => !v)}>
            {showTrends ? 'Ocultar' : 'Mostrar'}
          </Button>
        </div>
        <AnimatePresence>
          {showTrends && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 overflow-hidden"
            >
              {kpiTrendConfig.map(cfg => {
                const values = trendData.map(d => d[cfg.id as keyof typeof d] as number);
                const current = values[values.length - 1];
                const previous = values[values.length - 2];
                const variation = previous > 0 ? ((current - previous) / previous) * 100 : 0;
                const isUp = variation > 0;

                return (
                  <Card key={cfg.id} className="border shadow-sm">
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-muted-foreground truncate">{cfg.name}</span>
                        <span className={`text-[10px] font-mono font-medium flex items-center gap-0.5 ${
                          Math.abs(variation) < 1 ? 'text-muted-foreground' : isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {isUp ? <TrendingUp className="w-3 h-3" /> : variation < -1 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                          {Math.abs(variation).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-lg font-bold font-mono">
                        {cfg.id === 'custo_medio' ? formatCurrency(current) : `${current.toFixed(cfg.decimals)}${cfg.suffix}`}
                      </p>
                      <div className="h-[80px] -mx-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trendData} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
                            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                            <YAxis hide domain={['auto', 'auto']} />
                            <RechartsTooltip
                              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))' }}
                              formatter={(val: number) => [cfg.id === 'custo_medio' ? formatCurrency(val) : `${val.toFixed(cfg.decimals)}${cfg.suffix}`, cfg.name]}
                            />
                            <Line
                              type="monotone"
                              dataKey={cfg.id}
                              stroke={cfg.color}
                              strokeWidth={2}
                              dot={{ r: 3, fill: cfg.color }}
                              activeDot={{ r: 5 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <Card className="border-none shadow-sm bg-muted/30">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Receita Mês</p>
              <p className="text-sm font-bold font-mono mt-0.5">{formatCurrency(totalReceita)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Custo Mês</p>
              <p className="text-sm font-bold font-mono mt-0.5">{formatCurrency(totalCusto)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Mão de Obra</p>
              <p className="text-sm font-bold font-mono mt-0.5">{formatCurrency(maoDeObra)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Materiais</p>
              <p className="text-sm font-bold font-mono mt-0.5">{formatCurrency(materiais)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
