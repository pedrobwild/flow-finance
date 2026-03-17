import { useState } from 'react';
import { Link } from 'react-router-dom';
import AlertBanner from '@/components/AlertBanner';
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

export default function Dashboard() {
  const today = new Date();
  const greeting = today.getHours() < 12 ? 'Bom dia' : today.getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  const [period, setPeriod] = useState<PeriodRange>({
    from: todayISO(),
    to: addDays(todayISO(), 30),
    label: '30d',
  });

  return (
    <div className="space-y-5">
      <AlertBanner />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{greeting} 👋</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Painel de controle financeiro — BWILD Finance</p>
        </div>
        <DashboardPeriodFilter value={period} onChange={setPeriod} />
      </div>

      <DashboardKPIs period={period} />

      {/* Hero Chart - full width, maximum prominence */}
      <CashFlowHeroChart period={period} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4">
          <CashRunwayCard />
        </div>
        <div className="lg:col-span-8">
          <ActionList />
        </div>
      </div>

      {/* Simulator CTA */}
      <Link
        to="/simulador"
        className="card-elevated p-4 flex items-center justify-between hover:border-accent/30 hover:bg-accent/5 transition-all group block"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
            <Beaker className="w-4.5 h-4.5 text-accent" />
          </div>
          <div>
            <h2 className="font-semibold text-sm group-hover:text-accent transition-colors">Simulador de Cenários</h2>
            <p className="text-[11px] text-muted-foreground">E se eu adiar ou excluir pagamentos? Simule decisões e veja o impacto.</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6">
          <ForecastInsights />
        </div>
        <div className="lg:col-span-6">
          <CostCenterBreakdown />
        </div>
      </div>
    </div>
  );
}
