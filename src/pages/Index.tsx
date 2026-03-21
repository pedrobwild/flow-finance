import { useState } from 'react';
import { formatCurrency, todayISO, addDays } from '@/lib/helpers';
import DashboardPeriodFilter, { type PeriodRange } from '@/components/DashboardPeriodFilter';
import TodayTomorrowActions from '@/components/TodayTomorrowActions';
import DashboardKPIs from '@/components/DashboardKPIs';
import CashFlowHeroChart from '@/components/CashFlowHeroChart';
import ObraCashBalance from '@/components/ObraCashBalance';
import DecisionAlerts from '@/components/DecisionAlerts';
import { motion } from 'framer-motion';

const section = (delay: number) => ({
  initial: { opacity: 0, y: 18, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

export default function Dashboard() {
  const today = new Date();
  const greeting = today.getHours() < 12 ? 'Bom dia' : today.getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  const [period, setPeriod] = useState<PeriodRange>({
    from: todayISO(),
    to: addDays(todayISO(), 30),
    label: '30d',
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div {...section(0)} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">
            {today.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-2xl font-bold leading-tight">{greeting} 👋</h1>
        </div>
        <DashboardPeriodFilter value={period} onChange={setPeriod} />
      </motion.div>

      {/* Urgent: Today & Tomorrow */}
      <motion.div {...section(0.06)}>
        <TodayTomorrowActions />
      </motion.div>

      {/* KPIs */}
      <motion.div {...section(0.12)}>
        <DashboardKPIs period={period} />
      </motion.div>

      {/* Hero Chart */}
      <motion.div {...section(0.18)}>
        <CashFlowHeroChart period={period} />
      </motion.div>

      {/* === METADE INFERIOR === */}

      {/* Saldo de caixa por obra */}
      <ObraCashBalance />

      {/* Alertas de decisão */}
      <DecisionAlerts />
    </div>
  );
}
