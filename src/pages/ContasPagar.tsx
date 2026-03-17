import TransactionTable from '@/components/TransactionTable';

export default function ContasPagar() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contas a Pagar</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie todas as saídas financeiras da empresa.</p>
      </div>
      <TransactionTable type="pagar" />
    </div>
  );
}
