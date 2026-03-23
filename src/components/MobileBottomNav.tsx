import { useLocation, Link } from 'react-router-dom';
import { LayoutDashboard, ArrowDownCircle, ArrowUpCircle, TrendingUp, MoreHorizontal, X, Beaker, PieChart, Siren, Handshake } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const mainTabs = [
  { label: 'Visão', icon: LayoutDashboard, path: '/' },
  { label: 'Pagar', icon: ArrowDownCircle, path: '/pagar' },
  { label: 'Receber', icon: ArrowUpCircle, path: '/receber' },
  { label: 'Fluxo', icon: TrendingUp, path: '/fluxo' },
  { label: 'Mais', icon: MoreHorizontal, path: '__more__' },
];

const moreTabs = [
  { label: 'Simulador', icon: Beaker, path: '/simulador' },
  { label: 'Custos', icon: PieChart, path: '/custos' },
  { label: 'Guerra', icon: Siren, path: '/comando-de-guerra' },
  { label: 'Negociações', icon: Handshake, path: '/negociacoes' },
];

export default function MobileBottomNav() {
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const isMoreActive = moreTabs.some(t => isActive(t.path));

  return (
    <>
      {/* More menu overlay */}
      <AnimatePresence>
        {showMore && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowMore(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-[72px] left-4 right-4 bg-card border rounded-2xl shadow-2xl p-3"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b">
                <span className="text-xs font-semibold text-muted-foreground">Mais opções</span>
                <button onClick={() => setShowMore(false)} className="p-1 rounded-lg hover:bg-muted">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {moreTabs.map(item => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setShowMore(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-xl transition-colors min-h-[48px]',
                      isActive(item.path)
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom nav bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t safe-bottom">
        <div className="flex items-stretch justify-around px-1">
          {mainTabs.map(item => {
            const isMore = item.path === '__more__';
            const active = isMore ? isMoreActive || showMore : isActive(item.path);

            if (isMore) {
              return (
                <button
                  key="more"
                  onClick={() => setShowMore(v => !v)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-w-[64px] min-h-[56px] transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-w-[64px] min-h-[56px] transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <item.icon className={cn('w-5 h-5', active && 'scale-110')} />
                <span className={cn('text-[10px] font-medium leading-tight', active && 'font-bold')}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
