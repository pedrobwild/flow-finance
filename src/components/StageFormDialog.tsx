import { useState, useEffect } from 'react';
import { ObraStage, StageStatus, STAGE_NAMES, STAGE_STATUS_OPTIONS, STAGE_STATUS_LABELS } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  open: boolean;
  onClose: () => void;
  obraId: string;
  stage: ObraStage | null;
  onSave: (data: Omit<ObraStage, 'id' | 'createdAt'>) => void;
  nextSortOrder: number;
}

export default function StageFormDialog({ open, onClose, obraId, stage, onSave, nextSortOrder }: Props) {
  const [name, setName] = useState('');
  const [customName, setCustomName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [estimatedStartDate, setEstimatedStartDate] = useState('');
  const [estimatedEndDate, setEstimatedEndDate] = useState('');
  const [status, setStatus] = useState<StageStatus>('planejada');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      if (stage) {
        const isPreset = STAGE_NAMES.includes(stage.name);
        setName(isPreset ? stage.name : 'Outro');
        setCustomName(isPreset ? '' : stage.name);
        setSupplier(stage.supplier);
        setEstimatedValue(stage.estimatedValue > 0 ? String(stage.estimatedValue) : '');
        setEstimatedStartDate(stage.estimatedStartDate || '');
        setEstimatedEndDate(stage.estimatedEndDate || '');
        setStatus(stage.status);
        setNotes(stage.notes);
      } else {
        setName('');
        setCustomName('');
        setSupplier('');
        setEstimatedValue('');
        setEstimatedStartDate('');
        setEstimatedEndDate('');
        setStatus('planejada');
        setNotes('');
      }
    }
  }, [open, stage]);

  const handleSave = () => {
    const finalName = name === 'Outro' ? customName : name;
    if (!finalName.trim()) return;

    onSave({
      obraId,
      name: finalName.trim(),
      supplier: supplier.trim(),
      estimatedValue: Number(estimatedValue) || 0,
      estimatedStartDate: estimatedStartDate || null,
      estimatedEndDate: estimatedEndDate || null,
      actualStartDate: stage?.actualStartDate || null,
      actualEndDate: stage?.actualEndDate || null,
      status,
      notes: notes.trim(),
      sortOrder: stage?.sortOrder ?? nextSortOrder,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{stage ? 'Editar Etapa' : 'Nova Etapa'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Etapa</Label>
            <Select value={name} onValueChange={setName}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione a etapa" />
              </SelectTrigger>
              <SelectContent>
                {STAGE_NAMES.map(n => (
                  <SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {name === 'Outro' && (
              <Input
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="Nome da etapa"
                className="h-9 text-xs mt-1"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Fornecedor</Label>
            <Input
              value={supplier}
              onChange={e => setSupplier(e.target.value)}
              placeholder="Nome do fornecedor"
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Valor estimado</Label>
            <Input
              type="number"
              value={estimatedValue}
              onChange={e => setEstimatedValue(e.target.value)}
              placeholder="0"
              className="h-9 text-xs font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Início previsto</Label>
              <Input
                type="date"
                value={estimatedStartDate}
                onChange={e => setEstimatedStartDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fim previsto</Label>
              <Input
                type="date"
                value={estimatedEndDate}
                onChange={e => setEstimatedEndDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={v => setStatus(v as StageStatus)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s} className="text-xs">{STAGE_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notas sobre esta etapa..."
              className="text-xs min-h-[60px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">Cancelar</Button>
          <Button size="sm" onClick={handleSave} className="text-xs" disabled={!(name === 'Outro' ? customName.trim() : name)}>
            {stage ? 'Salvar' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
