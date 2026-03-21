import { useState } from 'react';
import { LayoutDashboard, ArrowDownCircle, ArrowUpCircle, TrendingUp, Menu, X, DollarSign, Beaker, Building2, LogOut, Shield, Settings } from 'lucide-react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const baseNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'A Pagar', icon: ArrowDownCircle, path: '/pagar' },
  { label: 'A Receber', icon: ArrowUpCircle, path: '/receber' },
  { label: 'Fluxo de Caixa', icon: TrendingUp, path: '/fluxo' },
  { label: 'Simulador', icon: Beaker, path: '/simulador' },
];

const adminNavItems = [
  { label: 'Obras', icon: Building2, path: '/obras' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { user, isAdmin, profile, signOut } = useAuth();

  const navItems = isAdmin ? [...baseNavItems, ...adminNavItems] : baseNavItems;
  const initials = profile?.fullName
    ? profile.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || '??';

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
              <DropdownMenuItem onClick={signOut} className="gap-2 text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 top-14 z-30 bg-background/95 backdrop-blur-sm p-4">
          <nav className="space-y-1">
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
    </div>
  );
}
