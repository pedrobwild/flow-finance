import { useMemo } from 'react';
import { useFinance } from '@/lib/finance-context';
import { useObras } from '@/lib/obras-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatCurrency, todayISO, daysBetween } from '@/lib/helpers';
import { motion } from 'framer-motion';
import { AlertTriangle, Shield, ShieldAlert, TrendingDown, Users } from 'lucide-react';

interface CounterpartRisk {
  name: string;
  type: 'cliente' | 'fornecedor';
  totalVolume: number;
  overdueCount: number;
  overdueAmount: number;
  avgDelayDays: number;
  concentrationPct: number;
  riskScore: number; // 0-100
  riskLevel: 'baixo' | 'médio' | 'alto' | 'crítico';
  transactionCount: number;
}

function getRiskLevel(score: number): 'baixo' | 'médio' | 'alto' | 'crítico' {
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

const RISK_ICONS: Record<string, React.ElementType> = {
  baixo: Shield,
  médio: Shield,
  alto: ShieldAlert,
  crítico: AlertTriangle,
};

export default function CounterpartRiskScore() {
  const { transactions } = useFinance();
  const today = todayISO();

  const risks = useMemo(() => {
    const counterparts = new Map<string, {
      type: 'cliente' | 'fornecedor';
      total: number;
      overdue: number;
      overdueAmt: number;
      delays: number[];
      count: number;
    }>();

    const totalReceber = transactions
      .filter(t => t.type === 'receber')
      .reduce((s, t) => s + t.amount, 0);
    const totalPagar = transactions
      .filter(t => t.type === 'pagar')
      .reduce((s, t) => s + t.amount, 0);

    transactions.forEach(tx => {
      if (!tx.counterpart) return;
      const key = tx.counterpart;
      if (!counterparts.has(key)) {
        counterparts.set(key, {
          type: tx.type === 'receber' ? 'cliente' : 'fornecedor',
          total: 0, overdue: 0, overdueAmt: 0, delays: [], count: 0,
        });
      }
      const cp = counterparts.get(key)!;
      cp.total += tx.amount;
      cp.count += 1;

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
      const avgDelay = data.delays.length > 0
        ? data.delays.reduce((s, d) => s + d, 0) / data.delays.length
        : 0;
      const totalRef = data.type === 'cliente' ? totalReceber : totalPagar;
      const concentration = totalRef > 0 ? (data.total / totalRef) * 100 : 0;

      // Score: weighted formula
      const delayScore = Math.min(avgDelay / 30 * 30, 30); // max 30 pts
      const overdueRatioScore = data.count > 0 ? (data.overdue / data.count) * 25 : 0; // max 25
      const concentrationScore = Math.min(concentration / 100 * 25, 25); // max 25
      const volumeScore = Math.min(data.overdueAmt / 50000 * 20, 20); // max 20

      const riskScore = Math.round(delayScore + overdueRatioScore + concentrationScore + volumeScore);

      result.push({
        name,
        type: data.type,
        totalVolume: data.total,
        overdueCount: data.overdue,
        overdueAmount: data.overdueAmt,
        avgDelayDays: Math.round(avgDelay),
        concentrationPct: Math.round(concentration),
        riskScore: Math.min(100, riskScore),
        riskLevel: getRiskLevel(Math.min(100, riskScore)),
        transactionCount: data.count,
      });
    });

    return result
      .filter(r => r.transactionCount >= 2)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 12);
  }, [transactions, today]);

  if (risks.length === 0) return null;

  const criticalCount = risks.filter(r => r.riskLevel === 'crítico' || r.riskLevel === 'alto').length;

  return (
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
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
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
  );
}
