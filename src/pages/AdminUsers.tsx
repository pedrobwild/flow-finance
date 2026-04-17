import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Shield, User as UserIcon, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';

type RoleRow = { user_id: string; role: 'admin' | 'user' };
type ProfileRow = { id: string; full_name: string };

interface UserListItem {
  id: string;
  fullName: string;
  isAdmin: boolean;
  isCurrent: boolean;
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from('profiles').select('id, full_name'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      const adminSet = new Set((roles ?? []).filter((r: RoleRow) => r.role === 'admin').map(r => r.user_id));
      const list: UserListItem[] = (profiles ?? []).map((p: ProfileRow) => ({
        id: p.id,
        fullName: p.full_name || '(sem nome)',
        isAdmin: adminSet.has(p.id),
        isCurrent: p.id === currentUser?.id,
      }));
      list.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.fullName.localeCompare(b.fullName));
      setUsers(list);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setEmail(''); setPassword(''); setFullName(''); setMakeAdmin(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { email, password, fullName, makeAdmin },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Usuário ${email} criado com sucesso`);
      setCreateOpen(false);
      resetForm();
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar usuário');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAdmin = async (u: UserListItem) => {
    if (u.isCurrent) {
      toast.error('Você não pode alterar sua própria role');
      return;
    }
    try {
      if (u.isAdmin) {
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', u.id)
          .eq('role', 'admin');
        if (error) throw error;
        toast.success(`${u.fullName} agora é usuário comum`);
      } else {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: u.id, role: 'admin' });
        if (error) throw error;
        toast.success(`${u.fullName} agora é admin`);
      }
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar role');
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-between gap-3"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie acessos e permissões do sistema
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              Novo usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar novo usuário</DialogTitle>
              <DialogDescription>
                O usuário poderá entrar imediatamente com email e senha.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label className="text-sm">Nome completo</Label>
                <Input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Ex: Thiago Silva"
                  required
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-sm">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="usuario@bwild.com.br"
                  required
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-sm">Senha</Label>
                <Input
                  type="text"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="mt-1.5 font-mono"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm font-medium">Acesso de administrador</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Mesma visão e permissões que você
                  </p>
                </div>
                <Switch checked={makeAdmin} onCheckedChange={setMakeAdmin} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting} className="gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Criar usuário
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuários ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Nenhum usuário encontrado.
            </div>
          ) : (
            <div className="divide-y">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {u.isAdmin
                        ? <Shield className="h-4 w-4 text-primary" />
                        : <UserIcon className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-2">
                        {u.fullName}
                        {u.isCurrent && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">você</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {u.isAdmin ? 'Administrador' : 'Usuário'}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleAdmin(u)}
                    disabled={u.isCurrent}
                  >
                    {u.isAdmin ? 'Remover admin' : 'Tornar admin'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
