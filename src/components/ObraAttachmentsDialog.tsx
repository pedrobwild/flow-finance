import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Obra } from '@/lib/types';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Image as ImageIcon, Loader2, Trash2, Upload, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const BUCKET = 'attachments';
const ACCEPT = '.pdf,.png,.jpg,.jpeg';
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX_BYTES = 20 * 1024 * 1024;

interface FileItem { name: string; path: string; url: string; }

export default function ObraAttachmentsDialog({ obra, onClose }: { obra: Obra | null; onClose: () => void }) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const folder = obra ? `obras/${obra.id}` : '';

  const load = async () => {
    if (!obra) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, { sortBy: { column: 'created_at', order: 'desc' } });
    if (error) setError('Não foi possível carregar os arquivos.');
    setFiles((data || []).filter(f => f.id).map(f => {
      const path = `${folder}/${f.name}`;
      return { name: f.name.replace(/^\d+_/, ''), path, url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
    }));
    setLoading(false);
  };

  useEffect(() => { if (obra) load(); else setFiles([]); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [obra?.id]);

  const handleUpload = async (list: FileList | null) => {
    if (!list || !obra) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(list)) {
      if (!ALLOWED.includes(file.type)) { toast.error(`${file.name}: use PDF, PNG ou JPG`); continue; }
      if (file.size > MAX_BYTES) { toast.error(`${file.name}: máximo 20MB`); continue; }
      const safe = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_');
      const { error } = await supabase.storage.from(BUCKET).upload(`${folder}/${Date.now()}_${safe}`, file, { contentType: file.type });
      if (error) toast.error(`Erro ao enviar ${file.name}`); else ok++;
    }
    if (ok) toast.success(ok > 1 ? `${ok} arquivos anexados` : 'Arquivo anexado');
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    load();
  };

  const handleDelete = async (f: FileItem) => {
    const { error } = await supabase.storage.from(BUCKET).remove([f.path]);
    if (error) { toast.error('Erro ao remover arquivo'); return; }
    toast.success('Arquivo removido');
    load();
  };

  return (
    <Dialog open={!!obra} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anexos da obra</DialogTitle>
          <DialogDescription>{obra?.code} · {obra?.clientName} — PDF, PNG ou JPG (até 20MB)</DialogDescription>
        </DialogHeader>

        <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
        <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="w-full min-h-[44px] gap-2">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Enviando...' : 'Anexar arquivos'}
        </Button>

        <div className="max-h-72 overflow-auto divide-y divide-border/60 rounded-md border">
          {loading ? (
            <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <p className="p-6 text-center text-xs text-destructive">{error}</p>
          ) : files.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">Nenhum arquivo anexado ainda.</p>
          ) : files.map(f => (
            <div key={f.path} className="flex items-center gap-2 px-3 py-2">
              {/\.pdf$/i.test(f.name) ? <FileText className="w-4 h-4 text-destructive shrink-0" /> : <ImageIcon className="w-4 h-4 text-primary shrink-0" />}
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-xs truncate hover:underline">{f.name}</a>
              <a href={f.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${f.name}`}>
                <Button size="icon" variant="ghost" className="h-8 w-8" type="button"><ExternalLink className="w-3.5 h-3.5" /></Button>
              </a>
              <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-destructive/10" aria-label={`Remover ${f.name}`} onClick={() => handleDelete(f)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
