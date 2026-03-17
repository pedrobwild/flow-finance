import AlertBanner from '@/components/AlertBanner';
import DashboardStatCards from '@/components/DashboardStatCards';
import CashRunwayCard from '@/components/CashRunwayCard';
import ForecastChart from '@/components/ForecastChart';
import ForecastInsights from '@/components/ForecastInsights';
import ActionList from '@/components/ActionList';
import CostCenterBreakdown from '@/components/CostCenterBreakdown';
import ScenarioSimulator from '@/components/ScenarioSimulator';

export default function Dashboard() {
  const today = new Date();
  const greeting = today.getHours() < 12 ? 'Bom dia' : today.getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <div className="space-y-5">
      <AlertBanner />

      <div>
        <h1 className="text-2xl font-bold">{greeting} 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">Painel de controle financeiro — BWILD Finance</p>
      </div>

      <DashboardStatCards />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4">
          <CashRunwayCard />
        </div>
        <div className="lg:col-span-8">
          <ForecastChart />
        </div>
      </div>

      {/* Scenario Simulator */}
      <ScenarioSimulator />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4">
          <ForecastInsights />
        </div>
        <div className="lg:col-span-4">
          <CostCenterBreakdown />
        </div>
        <div className="lg:col-span-4">
          <ActionList />
        </div>
      </div>
    </div>
  );
}
