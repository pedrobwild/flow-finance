import { useState } from 'react';
import { todayISO, addDays } from '@/lib/helpers';
import DashboardPeriodFilter, { type PeriodRange } from '@/components/DashboardPeriodFilter';
import CockpitHeroKPIs from '@/components/CockpitHeroKPIs';
import CashFlowHeroChart from '@/components/CashFlowHeroChart';
import ExecutiveReportButton from '@/components/ExecutiveReportButton';

import MorningBriefing from '@/components/MorningBriefing';
import ObraCashBalance from '@/components/ObraCashBalance';
import CounterpartRiskScore from '@/components/CounterpartRiskScore';
import MoMComparison from '@/components/MoMComparison';
import DsoDpoIndicators from '@/components/DsoDpoIndicators';
import WhatIfSimulator from '@/components/WhatIfSimulator';
import MissingNFBanner from '@/components/MissingNFBanner';

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
    <div className="space-y-4 sm:space-y-5 pb-8">
      {/* === HEADER === */}
      <motion.div {...section(0)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Cockpit Financeiro</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Visão executiva em tempo real</p>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <ExecutiveReportButton />
            <DashboardPeriodFilter value={period} onChange={setPeriod} />
          </div>
        </div>
      </motion.div>

      {/* === HERO: KPIs Preditivos (dark panel) === */}
      <motion.div {...section(0.04)}>
        <CockpitHeroKPIs period={period} />
      </motion.div>

      {/* === RADAR DE CAIXA (hero chart) === */}
      <motion.div {...section(0.12)}>
        <CashFlowHeroChart period={period} />
      </motion.div>

      {/* === COMPARATIVO MoM + WHAT-IF === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div {...section(0.16)}>
          <MoMComparison />
        </motion.div>
        <motion.div {...section(0.18)}>
          <WhatIfSimulator period={period} />
        </motion.div>
      </div>

      {/* === BRIEFING IA === */}
      <motion.div {...section(0.22)}>
        <MorningBriefing period={period} />
      </motion.div>

      {/* === DSO/DPO POR OBRA === */}
      <motion.div {...section(0.26)}>
        <DsoDpoIndicators period={period} />
      </motion.div>

      {/* === SALDO POR OBRA === */}
      <ObraCashBalance period={period} />

      {/* === SCORE DE RISCO === */}
      <CounterpartRiskScore period={period} />
    </div>
  );
}
