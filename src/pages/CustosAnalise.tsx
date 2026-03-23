import { useState, useMemo } from 'react';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { formatCurrency, formatDate } from '@/lib/helpers';
import { COST_CENTER_COLORS } from '@/lib/types';
import type { CostCenter, Transaction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, TrendingDown, Layers, Tag, Building2, Calendar, GitCompareArrows, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import CustosComparativo from '@/components/CustosComparativo';
import CustosIndicadores from '@/components/CustosIndicadores';

function getMonthLabel(year: number, month: number) {
  const d = new Date(year, month);
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function getMonthRange(year: number, month: number) {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

const CATEGORY_COLORS = [
  '#0C3547', '#7c3aed', '#059669', '#d97706', '#dc2626',
  '#6366f1', '#64748b', '#1A6B8A', '#0891b2', '#be185d',
  '#4f46e5', '#ca8a04', '#15803d', '#9333ea', '#e11d48',
];

export default function CustosAnalise() {
  const { filteredTransactions } = useObraFilter();
  const { obras } = useObras();
  const [expandedCostCenters, setExpandedCostCenters] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCostCenter = (name: string) => {
    setExpandedCostCenters(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const toggleCategory = (name: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const label = getMonthLabel(year, month);
  const { from, to } = getMonthRange(year, month);

  const prev = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const next = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const monthTxs = useMemo(() =>
    filteredTransactions.filter(t => t.type === 'pagar' && t.dueDate >= from && t.dueDate <= to),
    [filteredTransactions, from, to]
  );

  const totalMonth = useMemo(() => monthTxs.reduce((s, t) => s + t.amount, 0), [monthTxs]);
  const confirmedTotal = useMemo(() => monthTxs.filter(t => t.status === 'confirmado').reduce((s, t) => s + t.amount, 0), [monthTxs]);
  const pendingTotal = totalMonth - confirmedTotal;

  // By cost center
  const byCostCenter = useMemo(() => {
    const map = new Map<string, { total: number; confirmed: number; count: number }>();
    monthTxs.forEach(t => {
      const prev = map.get(t.costCenter) || { total: 0, confirmed: 0, count: 0 };
      prev.total += t.amount;
      prev.count++;
      if (t.status === 'confirmado') prev.confirmed += t.amount;
      map.set(t.costCenter, prev);
    });
    return [...map.entries()]
      .map(([name, d]) => ({ name, ...d, color: COST_CENTER_COLORS[name as CostCenter] || '#64748b' }))
      .sort((a, b) => b.total - a.total);
  }, [monthTxs]);

  // By category
  const byCategory = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    monthTxs.forEach(t => {
      const prev = map.get(t.category) || { total: 0, count: 0 };
      prev.total += t.amount;
      prev.count++;
      map.set(t.category, prev);
    });
    return [...map.entries()]
      .map(([name, d], i) => ({ name, ...d, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))
      .sort((a, b) => b.total - a.total);
  }, [monthTxs]);

  // By obra
  const byObra = useMemo(() => {
    const map = new Map<string | null, { total: number; count: number }>();
    monthTxs.forEach(t => {
      const prev = map.get(t.obraId) || { total: 0, count: 0 };
      prev.total += t.amount;
      prev.count++;
      map.set(t.obraId, prev);
    });
    return [...map.entries()]
      .map(([obraId, d]) => {
        const obra = obraId ? obras.find(o => o.id === obraId) : null;
        return { name: obra ? `${obra.code} · ${obra.clientName}` : 'Corporativo', ...d };
      })
      .sort((a, b) => b.total - a.total);
  }, [monthTxs, obras]);

  const CustomTooltip = ({ active, payload, label: tipLabel }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border rounded-lg p-2.5 shadow-xl text-xs space-y-1">
        <p className="font-semibold">{tipLabel || payload[0]?.payload?.name}</p>
        <p className="font-mono">{formatCurrency(payload[0].value)}</p>
        {totalMonth > 0 && (
          <p className="text-muted-foreground">{Math.round(payload[0].value / totalMonth * 100)}%</p>
        )}
      </div>
    );
  };

  const PieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-card border rounded-lg p-2.5 shadow-xl text-xs space-y-1">
        <p className="font-semibold">{d.name}</p>
        <p className="font-mono">{formatCurrency(d.total)}</p>
        {totalMonth > 0 && <p className="text-muted-foreground">{Math.round(d.total / totalMonth * 100)}%</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-accent" />
            Análise de Custos
          </h1>
          <p className="text-sm text-muted-foreground">Visualização mensal por centro de custo e categoria</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prev}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border text-sm font-medium min-w-[180px] justify-center capitalize">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            {label}
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={next}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </motion.div>

      {/* Summary KPIs */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total do Mês</p>
            <p className="text-lg font-bold font-mono mt-1">{formatCurrency(totalMonth)}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Confirmado</p>
            <p className="text-lg font-bold font-mono mt-1 text-success">{formatCurrency(confirmedTotal)}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Pendente</p>
            <p className="text-lg font-bold font-mono mt-1 text-warning">{formatCurrency(pendingTotal)}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Lançamentos</p>
            <p className="text-lg font-bold font-mono mt-1">{monthTxs.length}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs */}
      <Tabs defaultValue="costcenter" className="space-y-4">
        <TabsList className="bg-card border">
          <TabsTrigger value="costcenter" className="gap-1.5 text-xs">
            <Layers className="w-3.5 h-3.5" /> Centro de Custo
          </TabsTrigger>
          <TabsTrigger value="category" className="gap-1.5 text-xs">
            <Tag className="w-3.5 h-3.5" /> Categoria
          </TabsTrigger>
          <TabsTrigger value="obra" className="gap-1.5 text-xs">
            <Building2 className="w-3.5 h-3.5" /> Por Obra
          </TabsTrigger>
          <TabsTrigger value="comparativo" className="gap-1.5 text-xs">
            <GitCompareArrows className="w-3.5 h-3.5" /> Comparativo
          </TabsTrigger>
          <TabsTrigger value="indicadores" className="gap-1.5 text-xs">
            <Sparkles className="w-3.5 h-3.5" /> Indicadores
          </TabsTrigger>
        </TabsList>

        {/* Cost Center Tab */}
        <TabsContent value="costcenter" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Distribuição por Centro de Custo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byCostCenter} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={100} strokeWidth={2} stroke="hsl(var(--card))">
                        {byCostCenter.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Ranking</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byCostCenter} layout="vertical" margin={{ left: 80, right: 16, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                        {byCostCenter.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="border-none shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Centro de Custo</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-right">Confirmado</TableHead>
                    <TableHead className="text-xs text-right">%</TableHead>
                    <TableHead className="text-xs text-right">Qtd</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byCostCenter.map(d => {
                    const isExpanded = expandedCostCenters.has(d.name);
                    const txs = isExpanded ? monthTxs.filter(t => t.costCenter === d.name).sort((a, b) => b.amount - a.amount) : [];
                    return (
                      <>
                        <TableRow key={d.name} className="cursor-pointer hover:bg-muted/70" onClick={() => toggleCostCenter(d.name)}>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                              {d.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-right font-semibold">{formatCurrency(d.total)}</TableCell>
                          <TableCell className="text-xs font-mono text-right text-success">{formatCurrency(d.confirmed)}</TableCell>
                          <TableCell className="text-xs font-mono text-right text-muted-foreground">{totalMonth > 0 ? `${Math.round(d.total / totalMonth * 100)}%` : '–'}</TableCell>
                          <TableCell className="text-xs font-mono text-right">{d.count}</TableCell>
                        </TableRow>
                        {isExpanded && txs.map(tx => (
                          <TableRow key={tx.id} className="bg-muted/20">
                            <TableCell className="text-[11px] pl-12 text-muted-foreground">{tx.description} <span className="text-muted-foreground/60">· {tx.counterpart}</span></TableCell>
                            <TableCell className="text-[11px] font-mono text-right">{formatCurrency(tx.amount)}</TableCell>
                            <TableCell className="text-[11px] font-mono text-right">
                              <Badge variant="outline" className="text-[9px] font-normal">{tx.status}</Badge>
                            </TableCell>
                            <TableCell className="text-[11px] font-mono text-right text-muted-foreground">{formatDate(tx.dueDate)}</TableCell>
                            <TableCell className="text-[11px] font-mono text-right text-muted-foreground">{tx.category}</TableCell>
                          </TableRow>
                        ))}
                      </>
                    );
                  })}
                  {byCostCenter.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">Sem custos neste mês</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Category Tab */}
        <TabsContent value="category" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Distribuição por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byCategory} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={100} strokeWidth={2} stroke="hsl(var(--card))">
                        {byCategory.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Ranking</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byCategory} layout="vertical" margin={{ left: 100, right: 16, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={95} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                        {byCategory.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="border-none shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Categoria</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-right">%</TableHead>
                    <TableHead className="text-xs text-right">Qtd</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byCategory.map(d => (
                    <TableRow key={d.name}>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                          {d.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-right font-semibold">{formatCurrency(d.total)}</TableCell>
                      <TableCell className="text-xs font-mono text-right text-muted-foreground">{totalMonth > 0 ? `${Math.round(d.total / totalMonth * 100)}%` : '–'}</TableCell>
                      <TableCell className="text-xs font-mono text-right">{d.count}</TableCell>
                    </TableRow>
                  ))}
                  {byCategory.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">Sem custos neste mês</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Obra Tab */}
        <TabsContent value="obra" className="space-y-4">
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Custos por Obra / Corporativo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byObra} margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                    <YAxis tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="total" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Obra</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-right">%</TableHead>
                    <TableHead className="text-xs text-right">Qtd</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byObra.map(d => (
                    <TableRow key={d.name}>
                      <TableCell className="text-xs font-medium">{d.name}</TableCell>
                      <TableCell className="text-xs font-mono text-right font-semibold">{formatCurrency(d.total)}</TableCell>
                      <TableCell className="text-xs font-mono text-right text-muted-foreground">{totalMonth > 0 ? `${Math.round(d.total / totalMonth * 100)}%` : '–'}</TableCell>
                      <TableCell className="text-xs font-mono text-right">{d.count}</TableCell>
                    </TableRow>
                  ))}
                  {byObra.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">Sem custos neste mês</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Comparativo Tab */}
        <TabsContent value="comparativo">
          <CustosComparativo allTransactions={filteredTransactions} year={year} month={month} />
        </TabsContent>

        {/* Indicadores Tab */}
        <TabsContent value="indicadores">
          <CustosIndicadores allTransactions={filteredTransactions} year={year} month={month} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
