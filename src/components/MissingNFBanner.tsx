import { useMemo } from 'react';
import { useObraFilter } from '@/lib/obra-filter-context';
import { motion } from 'framer-motion';
import { FileWarning } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/helpers';

export default function MissingNFBanner() {
  const { filteredTransactions } = useObraFilter();
  const navigate = useNavigate();

  const missing = useMemo(() => {
    const items = filteredTransactions.filter(
      t => t.type === 'pagar' && t.status === 'confirmado' && !t.attachmentUrl
    );
    return {
      count: items.length,
      total: items.reduce((s, t) => s + t.amount, 0),
    };
  }, [filteredTransactions]);

  if (missing.count === 0) return null;

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => navigate('/pagar')}
      className="w-full rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-center gap-3 text-left hover:bg-warning/10 transition-colors cursor-pointer"
    >
      <div className="rounded-full bg-warning/15 p-2">
        <FileWarning className="w-4 h-4 text-warning" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-warning">
          {missing.count} pagamento{missing.count > 1 ? 's' : ''} sem nota fiscal
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Total: {formatCurrency(missing.total)} — Clique para gerenciar
        </p>
      </div>
    </motion.button>
  );
}
