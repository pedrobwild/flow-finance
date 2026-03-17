import StatCards from '@/components/StatCards';
import PriorityList from '@/components/PriorityList';
import CostCenterChart from '@/components/CostCenterChart';
import WeeklyTimeline from '@/components/WeeklyTimeline';

export default function Dashboard() {
  const today = new Date();
  const greeting = today.getHours() < 12 ? 'Bom dia' : today.getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{greeting} 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Aqui está o resumo financeiro da sua empresa.
        </p>
      </div>

      <StatCards />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <PriorityList />
        </div>
        <div className="lg:col-span-2">
          <CostCenterChart />
        </div>
      </div>

      <WeeklyTimeline />
    </div>
  );
}
