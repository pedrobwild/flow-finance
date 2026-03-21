import { useState } from 'react';
import { useObras, Obra } from '@/lib/obras-context';
import { motion } from 'framer-motion';
import { Building2, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  ativa: { label: 'Ativa', variant: 'default' },
  concluída: { label: 'Concluída', variant: 'secondary' },
  pausada: { label: 'Pausada', variant: 'outline' },
};

const emptyForm = { clientName: '', condominium: '', unitNumber: '', status: 'ativa' as Obra['status'] };

export default function Obras() {
  const { obras, isLoading, addObra, updateObra, deleteObra } = useObras();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingObra, setEditingObra] = useState<Obra | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = obras.filter(o =>
    `${o.code} ${o.clientName} ${o.condominium} ${o.unitNumber}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const openNew = () => {
    setEditingObra(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (obra: Obra) => {
    setEditingObra(obra);
    setForm({
      clientName: obra.clientName,
      condominium: obra.condominium,
      unitNumber: obra.unitNumber,
      status: obra.status,
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingObra) {
      updateObra(editingObra.id, form);
    } else {
      addObra(form);
    }
    setDialogOpen(false);
  };

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Obras
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastro e gestão de obras — cada obra conecta despesas e receitas.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Obra
        </Button>
      </motion.div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por código, cliente, condomínio..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma obra cadastrada</p>
            <p className="text-sm mt-1">Clique em "Nova Obra" para começar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((obra, i) => (
            <motion.div
              key={obra.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-xs text-primary font-semibold">{obra.code}</p>
                      <p className="font-semibold mt-1">{obra.clientName}</p>
                    </div>
                    <Badge variant={STATUS_MAP[obra.status]?.variant || 'default'}>
                      {STATUS_MAP[obra.status]?.label || obra.status}
                    </Badge>
                  </div>
                  {(obra.condominium || obra.unitNumber) && (
                    <p className="text-sm text-muted-foreground">
                      {obra.condominium}{obra.condominium && obra.unitNumber ? ' — ' : ''}{obra.unitNumber && `Unidade ${obra.unitNumber}`}
                    </p>
                  )}
                  <div className="flex gap-1 pt-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openEdit(obra)}>
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => setDeleteId(obra.id)}>
                      <Trash2 className="h-3 w-3" /> Remover
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingObra ? 'Editar Obra' : 'Nova Obra'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-xs">Nome do Cliente *</Label>
              <Input value={form.clientName} onChange={e => set('clientName', e.target.value)} required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Condomínio</Label>
                <Input value={form.condominium} onChange={e => set('condominium', e.target.value)} placeholder="Ex: Ed. Solar" />
              </div>
              <div>
                <Label className="text-xs">Nº da Unidade</Label>
                <Input value={form.unitNumber} onChange={e => set('unitNumber', e.target.value)} placeholder="Ex: 302" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="concluída">Concluída</SelectItem>
                  <SelectItem value="pausada">Pausada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit">{editingObra ? 'Salvar' : 'Cadastrar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover obra?</AlertDialogTitle>
            <AlertDialogDescription>
              Transações vinculadas a esta obra perderão a referência. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) { deleteObra(deleteId); setDeleteId(null); } }}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
