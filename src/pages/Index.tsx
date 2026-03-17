import AlertBanner from '@/components/AlertBanner';
import DashboardStatCards from '@/components/DashboardStatCards';
import ActionList from '@/components/ActionList';
import CashFlowMiniChart from '@/components/CashFlowMiniChart';

export default function Dashboard() {
  const today = new Date();
  const greeting = today.getHours() < 12 ? 'Bom dia' : today.getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <div className="space-y-6">
      <AlertBanner />

      <div>
        <h1 className="text-2xl font-bold">{greeting} 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">Painel financeiro operacional — BWILD Finance</p>
      </div>

      <DashboardStatCards />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <ActionList />
        </div>
        <div className="lg:col-span-2">
          <CashFlowMiniChart />
        </div>
      </div>
    </div>
  );
}
