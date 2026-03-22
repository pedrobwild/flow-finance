import { useState } from 'react';
import { LayoutDashboard, ArrowDownCircle, ArrowUpCircle, TrendingUp, Menu, X, DollarSign, Beaker, Building2, LogOut, Shield, Settings, Siren } from 'lucide-react';
import ChatCommandDrawer from '@/components/ChatCommandDrawer';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useObras } from '@/lib/obras-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'A Pagar', icon: ArrowDownCircle, path: '/pagar' },
  { label: 'A Receber', icon: ArrowUpCircle, path: '/receber' },
  { label: 'Fluxo', icon: TrendingUp, path: '/fluxo' },
  { label: 'Simulador', icon: Beaker, path: '/simulador' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { user, isAdmin, profile, signOut } = useAuth();
  const { obras } = useObras();
  const { selectedObraId, setSelectedObraId } = useObraFilter();

  const activeObras = obras.filter(o => o.status === 'ativa');

  const initials = profile?.fullName
    ? profile.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || '??';

  const selectedObra = selectedObraId ? obras.find(o => o.id === selectedObraId) : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-sm hidden sm:block tracking-tight">BWILD Finance</span>
            </Link>

            {/* Global Obra Filter */}
            <div className="hidden sm:block ml-2">
              <Select
                value={selectedObraId ?? '__all__'}
                onValueChange={v => setSelectedObraId(v === '__all__' ? null : v)}
              >
                <SelectTrigger className={cn(
                  'h-8 w-[180px] text-xs border-dashed',
                  selectedObraId && 'border-primary/50 bg-primary/5'
                )}>
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs font-medium">
                    Visão Geral
                  </SelectItem>
                  {activeObras.map(o => (
                    <SelectItem key={o.id} value={o.id} className="text-xs">
                      {o.code} · {o.clientName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map(item => (
              <Link key={item.path} to={item.path}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'gap-2 text-muted-foreground text-xs',
                    location.pathname === item.path && 'bg-muted text-foreground'
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-8 h-8 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-opacity">
                <span className="text-[10px] font-bold text-primary-foreground">{initials}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{profile?.fullName || 'Usuário'}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                {isAdmin && (
                  <div className="flex items-center gap-1 mt-1">
                    <Shield className="h-3 w-3 text-primary" />
                    <span className="text-xs text-primary font-medium">Admin</span>
                  </div>
                )}
              </div>
              <DropdownMenuSeparator />
              {isAdmin && (
                <DropdownMenuItem onClick={() => navigate('/obras')} className="gap-2">
                  <Settings className="h-4 w-4" />
                  Área do Admin
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={signOut} className="gap-2 text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 top-14 z-30 bg-background/95 backdrop-blur-sm p-4">
          <nav className="space-y-1">
            {/* Mobile obra filter */}
            <div className="pb-3 mb-3 border-b">
              <Select
                value={selectedObraId ?? '__all__'}
                onValueChange={v => setSelectedObraId(v === '__all__' ? null : v)}
              >
                <SelectTrigger className={cn(
                  'h-9 w-full text-xs border-dashed',
                  selectedObraId && 'border-primary/50 bg-primary/5'
                )}>
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs font-medium">Visão Geral</SelectItem>
                  {activeObras.map(o => (
                    <SelectItem key={o.id} value={o.id} className="text-xs">
                      {o.code} · {o.clientName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {navItems.map(item => (
              <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)}>
                <Button
                  variant="ghost"
                  className={cn(
                    'w-full justify-start gap-3 text-muted-foreground',
                    location.pathname === item.path && 'bg-muted text-foreground'
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
      <ChatCommandDrawer />
    </div>
  );
}
