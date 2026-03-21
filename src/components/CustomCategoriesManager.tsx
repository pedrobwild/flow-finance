import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

interface CustomCategory {
  id: string;
  name: string;
  type: string;
  created_at: string;
}

export function useCustomCategories() {
  return useQuery({
    queryKey: ['custom_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_categories')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as CustomCategory[];
    },
  });
}

export default function CustomCategoriesManager() {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<string>('pagar');
  const qc = useQueryClient();

  const { data: categories = [], isLoading } = useCustomCategories();

  const addMutation = useMutation({
    mutationFn: async ({ name, type }: { name: string; type: string }) => {
      const { error } = await supabase.from('custom_categories').insert({ name, type });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom_categories'] });
      setNewName('');
      toast.success('Categoria criada');
    },
    onError: (err: any) => {
      if (err?.message?.includes('duplicate')) {
        toast.error('Essa categoria já existe');
      } else {
        toast.error('Erro ao criar categoria');
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom_categories'] });
      toast.success('Categoria removida');
    },
    onError: () => toast.error('Erro ao remover categoria'),
  });

  const pagarCats = categories.filter(c => c.type === 'pagar');
  const receberCats = categories.filter(c => c.type === 'receber');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Settings2 className="w-3.5 h-3.5" />
          Categorias
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Categorias Customizadas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add new */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nome da categoria..."
                className="h-9 text-sm"
              />
            </div>
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="w-[120px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pagar">Pagar</SelectItem>
                <SelectItem value="receber">Receber</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-9 gap-1"
              onClick={() => newName.trim() && addMutation.mutate({ name: newName.trim(), type: newType })}
              disabled={!newName.trim()}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Lists */}
          {pagarCats.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Pagar</p>
              <div className="flex flex-wrap gap-1.5">
                {pagarCats.map(c => (
                  <Badge key={c.id} variant="secondary" className="gap-1 text-xs pr-1">
                    {c.name}
                    <button
                      onClick={() => deleteMutation.mutate(c.id)}
                      className="ml-0.5 hover:bg-destructive/20 rounded p-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {receberCats.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Receber</p>
              <div className="flex flex-wrap gap-1.5">
                {receberCats.map(c => (
                  <Badge key={c.id} variant="secondary" className="gap-1 text-xs pr-1">
                    {c.name}
                    <button
                      onClick={() => deleteMutation.mutate(c.id)}
                      className="ml-0.5 hover:bg-destructive/20 rounded p-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {categories.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma categoria customizada ainda. Adicione acima!
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
