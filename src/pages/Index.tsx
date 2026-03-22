import { useState } from 'react';
import { todayISO, addDays } from '@/lib/helpers';
import DashboardPeriodFilter, { type PeriodRange } from '@/components/DashboardPeriodFilter';
import DashboardKPIs from '@/components/DashboardKPIs';
import HealthScoreCompact from '@/components/HealthScoreCompact';
import TodayTomorrowActions from '@/components/TodayTomorrowActions';
import UnifiedAlerts from '@/components/UnifiedAlerts';
import MorningBriefing from '@/components/MorningBriefing';
import WeeklyCashProjection from '@/components/WeeklyCashProjection';
import ObraCashBalance from '@/components/ObraCashBalance';
import CashRunwayChart from '@/components/CashRunwayChart';
import WarRoomPanel from '@/components/WarRoomPanel';

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
    <div className="space-y-6 pb-8">
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

      {/* === WAR ROOM (when negative cash projected) === */}
      <WarRoomPanel period={period} />

      {/* === ROW 1: KPIs + HEALTH (números primeiro) === */}
      <motion.div {...section(0.04)}>
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <DashboardKPIs period={period} />
          </div>
          <div className="lg:w-[220px] flex-shrink-0">
            <HealthScoreCompact />
          </div>
        </div>
      </motion.div>

      {/* === ROW 2: AÇÕES IMEDIATAS === */}
      <motion.div {...section(0.08)}>
        <TodayTomorrowActions />
      </motion.div>

      {/* === ROW 3: ALERTAS UNIFICADOS (due + decision) === */}
      <motion.div {...section(0.12)}>
        <UnifiedAlerts />
      </motion.div>

      {/* === ROW 4: BRIEFING IA (colapsável) === */}
      <motion.div {...section(0.16)}>
        <MorningBriefing />
      </motion.div>

      {/* === ROW 5: RUNWAY === */}
      <CashRunwayChart />

      {/* === ROW 6: PROJEÇÃO SEMANAL === */}
      <motion.div {...section(0.24)}>
        <WeeklyCashProjection />
      </motion.div>

      {/* === ROW 7: SALDO POR OBRA === */}
      <ObraCashBalance />
    </div>
  );
}
