import { useState, useEffect } from 'react';
import { useObras } from '@/lib/obras-context';
import { Obra, ObraStatus } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ParcelasFormDialog from './ParcelasFormDialog';

interface Props {
  open: boolean;
  onClose: () => void;
  obra: Obra | null;
}

const emptyForm = {
  clientName: '',
  condominium: '',
  unitNumber: '',
  address: '',
  status: 'ativa' as ObraStatus,
  contractValue: '',
  budgetTarget: '',
  paymentTerms: '',
  expectedStartDate: '',
  expectedEndDate: '',
  actualStartDate: '',
  actualEndDate: '',
  notes: '',
};

export default function ObraFormDialog({ open, onClose, obra }: Props) {
  const { addObra, updateObra } = useObras();
  const isEdit = !!obra;
  const [form, setForm] = useState(emptyForm);
  const [parcelasOpen, setParcelasOpen] = useState(false);
  const [createdObra, setCreatedObra] = useState<{ id: string; code: string; clientName: string; contractValue: number } | null>(null);

  useEffect(() => {
    if (obra) {
      setForm({
        clientName: obra.clientName,
        condominium: obra.condominium,
        unitNumber: obra.unitNumber,
        address: obra.address,
        status: obra.status,
        contractValue: obra.contractValue.toString(),
        paymentTerms: obra.paymentTerms,
        expectedStartDate: obra.expectedStartDate || '',
        expectedEndDate: obra.expectedEndDate || '',
        actualStartDate: obra.actualStartDate || '',
        actualEndDate: obra.actualEndDate || '',
        notes: obra.notes,
      });
    } else {
      setForm(emptyForm);
    }
  }, [obra, open]);

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      clientName: form.clientName,
      condominium: form.condominium,
      unitNumber: form.unitNumber,
      address: form.address,
      status: form.status,
      contractValue: parseFloat(form.contractValue) || 0,
      paymentTerms: form.paymentTerms,
      expectedStartDate: form.expectedStartDate || null,
      expectedEndDate: form.expectedEndDate || null,
      actualStartDate: form.actualStartDate || null,
      actualEndDate: form.actualEndDate || null,
      notes: form.notes,
    };
    if (isEdit && obra) {
      updateObra(obra.id, data);
      onClose();
    } else {
      const newObra = await addObra(data);
      if (newObra) {
        setCreatedObra({
          id: newObra.id,
          code: newObra.code,
          clientName: newObra.clientName,
          contractValue: newObra.contractValue,
        });
        onClose();
        setParcelasOpen(true);
      } else {
        onClose();
      }
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Editar Obra' : 'Nova Obra'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Nome do Cliente *</Label>
                <Input value={form.clientName} onChange={e => set('clientName', e.target.value)} required autoFocus />
              </div>
              <div>
                <Label className="text-xs">Condomínio</Label>
                <Input value={form.condominium} onChange={e => set('condominium', e.target.value)} placeholder="Ex: Ed. Solar" />
              </div>
              <div>
                <Label className="text-xs">Nº da Unidade</Label>
                <Input value={form.unitNumber} onChange={e => set('unitNumber', e.target.value)} placeholder="Ex: 302" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Endereço</Label>
                <Input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Rua, número, bairro..." />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Valor do Contrato (R$) *</Label>
                <Input type="number" step="0.01" value={form.contractValue} onChange={e => set('contractValue', e.target.value)} required />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Condições de Pagamento</Label>
                <Textarea value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)} rows={2} placeholder="Ex: 50% sinal + 3 medições de ~16%" />
              </div>
              <div>
                <Label className="text-xs">Previsão de Início</Label>
                <Input type="date" value={form.expectedStartDate} onChange={e => set('expectedStartDate', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Previsão de Término</Label>
                <Input type="date" value={form.expectedEndDate} onChange={e => set('expectedEndDate', e.target.value)} />
              </div>
              {isEdit && (
                <>
                  <div>
                    <Label className="text-xs">Início Real</Label>
                    <Input type="date" value={form.actualStartDate} onChange={e => set('actualStartDate', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Término Real</Label>
                    <Input type="date" value={form.actualEndDate} onChange={e => set('actualEndDate', e.target.value)} />
                  </div>
                </>
              )}
              <div className="col-span-2">
                <Label className="text-xs">Observações</Label>
                <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit">{isEdit ? 'Salvar' : 'Cadastrar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {createdObra && (
        <ParcelasFormDialog
          open={parcelasOpen}
          onClose={() => {
            setParcelasOpen(false);
            setCreatedObra(null);
          }}
          obraId={createdObra.id}
          obraCode={createdObra.code}
          clientName={createdObra.clientName}
          contractValue={createdObra.contractValue}
        />
      )}
    </>
  );
}
