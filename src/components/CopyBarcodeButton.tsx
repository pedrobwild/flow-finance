import { useState } from 'react';
import { Barcode, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  barcodeLine: string;
  compact?: boolean;
  className?: string;
}

export default function CopyBarcodeButton({ barcodeLine, compact, className }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(barcodeLine);
      setCopied(true);
      toast.success('Linha digitável copiada');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar. Copie manualmente a linha digitável.');
    }
  };

  if (compact) {
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={copy}
        title="Copiar código de barras"
        aria-label="Copiar código de barras"
        className={cn('h-7 w-7 hover:bg-primary/10', className)}
      >
        {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Barcode className="w-3.5 h-3.5 text-primary" />}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={copy}
      className={cn('h-9 w-full justify-start gap-2 text-xs font-normal', className)}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Barcode className="w-3.5 h-3.5" />}
      {copied ? 'Código copiado' : 'Copiar código de barras'}
      <span className="ml-auto font-mono text-[10px] text-muted-foreground truncate max-w-[110px]">
        {barcodeLine.slice(0, 12)}…
      </span>
    </Button>
  );
}
