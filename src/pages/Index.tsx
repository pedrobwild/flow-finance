import { useState } from 'react';
import { todayISO, addDays } from '@/lib/helpers';
import DashboardPeriodFilter, { type PeriodRange } from '@/components/DashboardPeriodFilter';
import TodayTomorrowActions from '@/components/TodayTomorrowActions';
import DashboardKPIs from '@/components/DashboardKPIs';
import MorningBriefing from '@/components/MorningBriefing';
import WeeklyCashProjection from '@/components/WeeklyCashProjection';
import ObraCashBalance from '@/components/ObraCashBalance';
import CashRunwayCard from '@/components/CashRunwayCard';
import DecisionAlerts from '@/components/DecisionAlerts';
import { motion } from 'framer-motion';

const section = (delay: number) => ({
  initial: { opacity: 0, y: 18, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

export default function Dashboard() {
  const [period, setPeriod] = useState<PeriodRange>({
    from: todayISO(),
    to: addDays(todayISO(), 30),
    label: '30d',
  });

  return (
    <div className="space-y-8 pb-8">
      {/* === ROW 1: BRIEFING + RUNWAY side-by-side === */}
      <motion.div {...section(0)}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Cockpit Financeiro</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Visão executiva em tempo real</p>
          </div>
          <DashboardPeriodFilter value={period} onChange={setPeriod} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <MorningBriefing />
          </div>
          <div className="lg:col-span-1">
            <CashRunwayCard />
          </div>
        </div>
      </motion.div>

      {/* === ALERTAS DE DECISÃO (prominent, early) === */}
      <motion.div {...section(0.06)}>
        <DecisionAlerts />
      </motion.div>

      {/* === AÇÕES IMEDIATAS === */}
      <motion.div {...section(0.10)}>
        <TodayTomorrowActions />
      </motion.div>

      {/* === KPIs === */}
      <motion.div {...section(0.14)}>
        <DashboardKPIs period={period} />
      </motion.div>

      {/* === PROJEÇÃO SEMANAL === */}
      <motion.div {...section(0.18)}>
        <WeeklyCashProjection />
      </motion.div>

      {/* === SALDO POR OBRA === */}
      <ObraCashBalance />
    </div>
  );
}
