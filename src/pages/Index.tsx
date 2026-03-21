import { useState } from 'react';
import { todayISO, addDays } from '@/lib/helpers';
import DashboardPeriodFilter, { type PeriodRange } from '@/components/DashboardPeriodFilter';
import TodayTomorrowActions from '@/components/TodayTomorrowActions';
import DashboardKPIs from '@/components/DashboardKPIs';
import MorningBriefing from '@/components/MorningBriefing';
import WeeklyCashProjection from '@/components/WeeklyCashProjection';
import ObraCashBalance from '@/components/ObraCashBalance';

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
    <div className="space-y-6">
      {/* === BRIEFING EXECUTIVO DA MANHÃ === */}
      <motion.div {...section(0)}>
        <div className="flex justify-end mb-2">
          <DashboardPeriodFilter value={period} onChange={setPeriod} />
        </div>
        <MorningBriefing />
      </motion.div>

      {/* === AÇÕES IMEDIATAS === */}
      <motion.div {...section(0.06)}>
        <TodayTomorrowActions />
      </motion.div>

      {/* === KPIs === */}
      <motion.div {...section(0.10)}>
        <DashboardKPIs period={period} />
      </motion.div>

      {/* === PROJEÇÃO SEMANAL COM ZONAS DE SEGURANÇA === */}
      <motion.div {...section(0.14)}>
        <WeeklyCashProjection />
      </motion.div>

      {/* === SALDO DE CAIXA POR OBRA + SEMÁFORO === */}
      <ObraCashBalance />


      {/* === ALERTAS DE DECISÃO === */}
      <motion.div {...section(0.26)}>
        <DecisionAlerts />
      </motion.div>
    </div>
  );
}
