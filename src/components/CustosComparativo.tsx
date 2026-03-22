import { useMemo } from 'react';
import { formatCurrency } from '@/lib/helpers';
import { COST_CENTER_COLORS } from '@/lib/types';
import type { CostCenter, Transaction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  allTransactions: Transaction[];
  year: number;
  month: number;
}

function getMonthRange(year: number, month: number) {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function getMonthLabel(year: number, month: number) {
  return new Date(year, month).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

function variationPct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function VariationBadge({ current, previous }: { current: number; previous: number }) {
  const pct = variationPct(current, previous);
  if (pct === null) return <span className="text-xs text-muted-foreground">–</span>;

  const isUp = pct > 0;
  const isNeutral = Math.abs(pct) < 1;

  if (isNeutral) {
    return (
      <Badge variant="outline" className="gap-1 text-[10px] font-mono">
        <Minus className="w-3 h-3" /> 0%
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`gap-1 text-[10px] font-mono ${isUp ? 'border-destructive/30 text-destructive' : 'border-emerald-500/30 text-emerald-600'}`}
    >
      {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {isUp ? '+' : ''}{pct.toFixed(1)}%
    </Badge>
  );
}

export default function CustosComparativo({ allTransactions, year, month }: Props) {
  const currentRange = getMonthRange(year, month);
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const prevRange = getMonthRange(prevYear, prevMonth);

  const currentLabel = getMonthLabel(year, month);
  const prevLabel = getMonthLabel(prevYear, prevMonth);

  const currentTxs = useMemo(() =>
    allTransactions.filter(t => t.type === 'pagar' && t.dueDate >= currentRange.from && t.dueDate <= currentRange.to),
    [allTransactions, currentRange.from, currentRange.to]
  );

  const prevTxs = useMemo(() =>
    allTransactions.filter(t => t.type === 'pagar' && t.dueDate >= prevRange.from && t.dueDate <= prevRange.to),
    [allTransactions, prevRange.from, prevRange.to]
  );

  const currentTotal = useMemo(() => currentTxs.reduce((s, t) => s + t.amount, 0), [currentTxs]);
  const prevTotal = useMemo(() => prevTxs.reduce((s, t) => s + t.amount, 0), [prevTxs]);

  // By cost center comparison
  const costCenterComparison = useMemo(() => {
    const currMap = new Map<string, number>();
    const prevMap = new Map<string, number>();
    currentTxs.forEach(t => currMap.set(t.costCenter, (currMap.get(t.costCenter) || 0) + t.amount));
    prevTxs.forEach(t => prevMap.set(t.costCenter, (prevMap.get(t.costCenter) || 0) + t.amount));

    const allKeys = new Set([...currMap.keys(), ...prevMap.keys()]);
    return [...allKeys]
      .map(name => ({
        name,
        current: currMap.get(name) || 0,
        previous: prevMap.get(name) || 0,
        color: COST_CENTER_COLORS[name as CostCenter] || '#64748b',
      }))
      .sort((a, b) => b.current - a.current);
  }, [currentTxs, prevTxs]);

  // By category comparison
  const categoryComparison = useMemo(() => {
    const currMap = new Map<string, number>();
    const prevMap = new Map<string, number>();
    currentTxs.forEach(t => currMap.set(t.category, (currMap.get(t.category) || 0) + t.amount));
    prevTxs.forEach(t => prevMap.set(t.category, (prevMap.get(t.category) || 0) + t.amount));

    const allKeys = new Set([...currMap.keys(), ...prevMap.keys()]);
    return [...allKeys]
      .map(name => ({
        name,
        current: currMap.get(name) || 0,
        previous: prevMap.get(name) || 0,
      }))
      .sort((a, b) => b.current - a.current);
  }, [currentTxs, prevTxs]);

  const totalPct = variationPct(currentTotal, prevTotal);

  const CustomTooltip = ({ active, payload, label: tipLabel }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border rounded-lg p-2.5 shadow-xl text-xs space-y-1">
        <p className="font-semibold">{tipLabel || payload[0]?.payload?.name}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="font-mono" style={{ color: p.color }}>
            {p.name}: {formatCurrency(p.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium capitalize">{prevLabel}</p>
            <p className="text-lg font-bold font-mono mt-1">{formatCurrency(prevTotal)}</p>
            <p className="text-[10px] text-muted-foreground">{prevTxs.length} lançamentos</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium capitalize">{currentLabel}</p>
            <p className="text-lg font-bold font-mono mt-1">{formatCurrency(currentTotal)}</p>
            <p className="text-[10px] text-muted-foreground">{currentTxs.length} lançamentos</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Variação</p>
            <div className="flex items-center gap-2 mt-1">
              {totalPct !== null ? (
                <>
                  {totalPct > 1 ? (
                    <TrendingUp className="w-5 h-5 text-destructive" />
                  ) : totalPct < -1 ? (
                    <TrendingDown className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Minus className="w-5 h-5 text-muted-foreground" />
                  )}
                  <p className={`text-lg font-bold font-mono ${totalPct > 1 ? 'text-destructive' : totalPct < -1 ? 'text-emerald-600' : ''}`}>
                    {totalPct > 0 ? '+' : ''}{totalPct.toFixed(1)}%
                  </p>
                </>
              ) : (
                <p className="text-lg font-bold font-mono text-muted-foreground">–</p>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {currentTotal > prevTotal ? `+${formatCurrency(currentTotal - prevTotal)}` : currentTotal < prevTotal ? `-${formatCurrency(prevTotal - currentTotal)}` : 'Sem variação'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bar chart comparison by cost center */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Comparativo por Centro de Custo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costCenterComparison} margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="previous" name={prevLabel} fill="hsl(var(--muted-foreground))" opacity={0.4} radius={[4, 4, 0, 0]} />
                <Bar dataKey="current" name={currentLabel} fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Cost center table */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Detalhamento por Centro de Custo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Centro de Custo</TableHead>
                <TableHead className="text-xs text-right capitalize">{prevLabel}</TableHead>
                <TableHead className="text-xs text-right capitalize">{currentLabel}</TableHead>
                <TableHead className="text-xs text-right">Variação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costCenterComparison.map(d => (
                <TableRow key={d.name}>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                      {d.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-right text-muted-foreground">{formatCurrency(d.previous)}</TableCell>
                  <TableCell className="text-xs font-mono text-right font-semibold">{formatCurrency(d.current)}</TableCell>
                  <TableCell className="text-xs text-right">
                    <VariationBadge current={d.current} previous={d.previous} />
                  </TableCell>
                </TableRow>
              ))}
              {costCenterComparison.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">Sem dados para comparação</TableCell></TableRow>
              )}
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell className="text-xs">Total</TableCell>
                <TableCell className="text-xs font-mono text-right">{formatCurrency(prevTotal)}</TableCell>
                <TableCell className="text-xs font-mono text-right">{formatCurrency(currentTotal)}</TableCell>
                <TableCell className="text-xs text-right">
                  <VariationBadge current={currentTotal} previous={prevTotal} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Category table */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Detalhamento por Categoria</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Categoria</TableHead>
                <TableHead className="text-xs text-right capitalize">{prevLabel}</TableHead>
                <TableHead className="text-xs text-right capitalize">{currentLabel}</TableHead>
                <TableHead className="text-xs text-right">Variação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryComparison.map(d => (
                <TableRow key={d.name}>
                  <TableCell className="text-xs">{d.name}</TableCell>
                  <TableCell className="text-xs font-mono text-right text-muted-foreground">{formatCurrency(d.previous)}</TableCell>
                  <TableCell className="text-xs font-mono text-right font-semibold">{formatCurrency(d.current)}</TableCell>
                  <TableCell className="text-xs text-right">
                    <VariationBadge current={d.current} previous={d.previous} />
                  </TableCell>
                </TableRow>
              ))}
              {categoryComparison.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">Sem dados para comparação</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
