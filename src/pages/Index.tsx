import { useState } from 'react';
import { formatCurrency, todayISO, addDays } from '@/lib/helpers';
import { formatCurrency, todayISO, addDays } from '@/lib/helpers';
import { Link } from 'react-router-dom';
import DashboardPeriodFilter, { type PeriodRange } from '@/components/DashboardPeriodFilter';
import TodayTomorrowActions from '@/components/TodayTomorrowActions';
import DashboardKPIs from '@/components/DashboardKPIs';
import CashFlowHeroChart from '@/components/CashFlowHeroChart';
import CashRunwayCard from '@/components/CashRunwayCard';
import ForecastInsights from '@/components/ForecastInsights';
import ActionList from '@/components/ActionList';
import CostCenterBreakdown from '@/components/CostCenterBreakdown';
import { Beaker, ChevronRight, AlertTriangle, Building2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const section = (delay: number) => ({
  initial: { opacity: 0, y: 18, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

export default function Dashboard() {
  const today = new Date();
  const greeting = today.getHours() < 12 ? 'Bom dia' : today.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const { getActiveObrasWithFinancials } = useObras();

  const [period, setPeriod] = useState<PeriodRange>({
    from: todayISO(),
    to: addDays(todayISO(), 30),
    label: '30d',
  });

  const activeObras = getActiveObrasWithFinancials();

  const overdueObras = useMemo(() => {
    return activeObras.filter(o => o.totalOverdueReceivable > 0);
  }, [activeObras]);

  const totalOverdueReceivable = overdueObras.reduce((s, o) => s + o.totalOverdueReceivable, 0);

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

      {/* Obras em andamento */}
      {activeObras.length > 0 && (
        <motion.div {...section(0.33)} className="space-y-3">
          {/* Overdue alert */}
          {overdueObras.length > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-destructive/[0.06] border border-destructive/15 text-sm">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p>
                <span className="font-semibold text-destructive">{overdueObras.length} obra(s)</span>
                <span className="text-muted-foreground"> com parcelas atrasadas: </span>
                <span className="font-mono font-bold text-destructive">{formatCurrency(totalOverdueReceivable)}</span>
                <span className="text-muted-foreground"> a cobrar</span>
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-primary" />
              Obras em andamento
            </h2>
            <Link to="/obras" className="text-xs text-primary hover:underline">Ver todas →</Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeObras.slice(0, 6).map(obra => {
              const receivedPct = obra.totalContractValue > 0 ? Math.round(obra.totalReceived / obra.totalContractValue * 100) : 0;
              return (
                <Link key={obra.id} to="/obras" className="card-elevated p-3 hover:border-primary/30 transition-colors block">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[10px] text-primary font-semibold">{obra.code}</span>
                    <span className="text-[10px] text-muted-foreground">{OBRA_STATUS_LABELS[obra.status]}</span>
                  </div>
                  <p className="text-xs font-medium truncate">{obra.clientName}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-success rounded-full transition-all" style={{ width: `${receivedPct}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">{receivedPct}%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Margem: <span className={cn('font-mono font-semibold', obra.grossMarginPercentage >= 0 ? 'text-success' : 'text-destructive')}>
                      {obra.grossMarginPercentage.toFixed(0)}%
                    </span>
                    {obra.nextReceivable && (
                      <> · Próx: {formatCurrency(obra.nextReceivable.amount)}</>
                    )}
                  </p>
                </Link>
              );
            })}
          </div>
        </motion.div>
      )}

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
