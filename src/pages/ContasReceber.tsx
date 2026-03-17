import TransactionTable from '@/components/TransactionTable';

export default function ContasReceber() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contas a Receber</h1>
        <p className="text-muted-foreground text-sm mt-1">Acompanhe todas as entradas previstas e realizadas.</p>
      </div>
      <TransactionTable type="receber" />
    </div>
  );
}
