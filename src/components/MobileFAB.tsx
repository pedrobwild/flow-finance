import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import TransactionFormDialog from '@/components/TransactionFormDialog';
import type { TransactionType } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';

export default function MobileFAB() {
  const [open, setOpen] = useState(false);
  const [txType, setTxType] = useState<TransactionType>('pagar');
  const [showPicker, setShowPicker] = useState(false);

  const handlePick = (type: TransactionType) => {
    setTxType(type);
    setShowPicker(false);
    setOpen(true);
  };

  return (
    <>
      {/* Type picker overlay */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-[45] bg-black/30 backdrop-blur-sm"
            onClick={() => setShowPicker(false)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="absolute bottom-[140px] right-4 bg-card border rounded-2xl shadow-2xl p-2 min-w-[180px]"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => handlePick('pagar')}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-destructive/5 transition-colors text-left min-h-[48px]"
              >
                <span className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive text-sm font-bold">−</span>
                <div>
                  <p className="text-sm font-semibold">Saída</p>
                  <p className="text-[11px] text-muted-foreground">Conta a pagar</p>
                </div>
              </button>
              <button
                onClick={() => handlePick('receber')}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-success/5 transition-colors text-left min-h-[48px]"
              >
                <span className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center text-success text-sm font-bold">+</span>
                <div>
                  <p className="text-sm font-semibold">Entrada</p>
                  <p className="text-[11px] text-muted-foreground">Conta a receber</p>
                </div>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB button */}
      <button
        onClick={() => setShowPicker(v => !v)}
        className={cn(
          'lg:hidden fixed z-[45] bottom-[72px] right-4 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-90',
          'bg-primary text-primary-foreground hover:shadow-xl',
          showPicker && 'rotate-45 bg-muted text-muted-foreground'
        )}
      >
        <Plus className="w-6 h-6" />
      </button>

      <TransactionFormDialog
        open={open}
        onClose={() => setOpen(false)}
        transaction={null}
        defaultType={txType}
      />
    </>
  );
}
