import { motion } from 'framer-motion';
import TransactionTable from '@/components/TransactionTable';

export default function ContasReceber() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="text-2xl font-bold leading-tight">Contas a Receber</h1>
        <p className="text-muted-foreground text-sm mt-1">Acompanhe todas as entradas previstas e realizadas.</p>
      </motion.div>
      <TransactionTable type="receber" />
    </div>
  );
}
