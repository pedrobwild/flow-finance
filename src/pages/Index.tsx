import { useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardPeriodFilter, { type PeriodRange } from '@/components/DashboardPeriodFilter';
import TodayTomorrowActions from '@/components/TodayTomorrowActions';
import DashboardKPIs from '@/components/DashboardKPIs';
import CashFlowHeroChart from '@/components/CashFlowHeroChart';
import CashRunwayCard from '@/components/CashRunwayCard';
import ForecastInsights from '@/components/ForecastInsights';
import ActionList from '@/components/ActionList';
import CostCenterBreakdown from '@/components/CostCenterBreakdown';
import { Beaker, ChevronRight } from 'lucide-react';
import { todayISO, addDays } from '@/lib/helpers';
import { motion } from 'framer-motion';

const section = (delay: number) => ({
  initial: { opacity: 0, y: 18, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] },
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

      {/* Runway + Actions side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <motion.div {...section(0.24)} className="lg:col-span-5">
          <CashRunwayCard />
        </motion.div>
        <motion.div {...section(0.30)} className="lg:col-span-7">
          <ActionList />
        </motion.div>
      </div>

      {/* Simulator CTA */}
      <motion.div {...section(0.36)}>
        <Link
          to="/simulador"
          className="card-elevated p-4 flex items-center justify-between group block hover:shadow-md active:scale-[0.985] transition-all duration-200"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
              <Beaker className="w-[18px] h-[18px] text-accent" />
            </div>
            <div>
              <h2 className="font-semibold text-sm group-hover:text-accent transition-colors">Simulador de Cenários</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">E se eu adiar ou excluir pagamentos? Simule decisões e veja o impacto.</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
        </Link>
      </motion.div>

      {/* Forecast + Cost Center */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <motion.div {...section(0.42)} className="lg:col-span-6">
          <ForecastInsights />
        </motion.div>
        <motion.div {...section(0.48)} className="lg:col-span-6">
          <CostCenterBreakdown />
        </motion.div>
      </div>
    </div>
  );
}
