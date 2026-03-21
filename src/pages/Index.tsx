import { useState } from 'react';
import { todayISO, addDays } from '@/lib/helpers';
import DashboardPeriodFilter, { type PeriodRange } from '@/components/DashboardPeriodFilter';
import TodayTomorrowActions from '@/components/TodayTomorrowActions';
import DashboardKPIs from '@/components/DashboardKPIs';
import MorningBriefing from '@/components/MorningBriefing';
import WeeklyCashProjection from '@/components/WeeklyCashProjection';
import ObraCashBalance from '@/components/ObraCashBalance';
import DecisionAlerts from '@/components/DecisionAlerts';
import CashRunwayChart from '@/components/CashRunwayChart';
import HealthScore from '@/components/HealthScore';
import MacroIndicators from '@/components/MacroIndicators';
import RealVsProjected from '@/components/RealVsProjected';
import ObraRanking from '@/components/ObraRanking';
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
      {/* === HEADER + MACRO === */}
      <motion.div {...section(0)}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Cockpit Financeiro</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Visão executiva em tempo real</p>
          </div>
          <DashboardPeriodFilter value={period} onChange={setPeriod} />
        </div>
        <MacroIndicators />
      </motion.div>

      {/* === ROW 1: BRIEFING + HEALTH SCORE === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div {...section(0.04)} className="lg:col-span-2">
          <MorningBriefing />
        </motion.div>
        <motion.div {...section(0.08)}>
          <HealthScore />
        </motion.div>
      </div>

      {/* === ALERTAS DE DECISÃO === */}
      <motion.div {...section(0.10)}>
        <DecisionAlerts />
      </motion.div>

      {/* === AÇÕES IMEDIATAS === */}
      <motion.div {...section(0.14)}>
        <TodayTomorrowActions />
      </motion.div>

      {/* === KPIs COM SPARKLINES === */}
      <motion.div {...section(0.18)}>
        <DashboardKPIs period={period} />
      </motion.div>

      {/* Real vs Projetado oculto por decisão do usuário */}

      {/* === RUNWAY === */}
      <CashRunwayChart />

      {/* === PROJEÇÃO SEMANAL === */}
      <motion.div {...section(0.28)}>
        <WeeklyCashProjection />
      </motion.div>

      {/* === SALDO POR OBRA === */}
      <ObraCashBalance />
    </div>
  );
}
