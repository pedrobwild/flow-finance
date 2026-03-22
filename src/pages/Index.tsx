import { useState } from 'react';
import { todayISO, addDays } from '@/lib/helpers';
import DashboardPeriodFilter, { type PeriodRange } from '@/components/DashboardPeriodFilter';
import CockpitHeroKPIs from '@/components/CockpitHeroKPIs';
import CashFlowHeroChart from '@/components/CashFlowHeroChart';

import MorningBriefing from '@/components/MorningBriefing';
import ObraCashBalance from '@/components/ObraCashBalance';
import CounterpartRiskScore from '@/components/CounterpartRiskScore';

import { motion } from 'framer-motion';

const section = (delay: number) => ({
  initial: { opacity: 0, y: 14 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

export default function Dashboard() {
  const [period, setPeriod] = useState<PeriodRange>({
    from: todayISO(),
    to: addDays(todayISO(), 30),
    label: '30d',
  });

  return (
    <div className="space-y-5 pb-8">
      {/* === HEADER === */}
      <motion.div {...section(0)}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Cockpit Financeiro</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Visão executiva em tempo real</p>
          </div>
          <DashboardPeriodFilter value={period} onChange={setPeriod} />
        </div>
      </motion.div>

      {/* === HERO: KPIs Preditivos (dark panel) === */}
      <motion.div {...section(0.04)}>
        <CockpitHeroKPIs period={period} />
      </motion.div>


      {/* === RADAR DE CAIXA (hero chart) === */}
      <motion.div {...section(0.16)}>
        <CashFlowHeroChart period={period} />
      </motion.div>

      {/* === BRIEFING IA === */}
      <motion.div {...section(0.22)}>
        <MorningBriefing />
      </motion.div>

      {/* === SALDO POR OBRA === */}
      <ObraCashBalance period={period} />
    </div>
  );
}
