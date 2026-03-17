import BillsTable from '@/components/BillsTable';

export default function ContasPagar() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contas a pagar</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie todas as suas obrigações financeiras.</p>
      </div>
      <BillsTable />
    </div>
  );
}
