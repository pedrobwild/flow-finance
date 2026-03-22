import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileText, Loader2 } from 'lucide-react';

export default function ExecutiveReportButton() {
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('executive-report');
      if (error) throw error;

      const html = data?.html;
      if (!html) throw new Error('Relatório vazio');

      // Open in new window with auto-print
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        // Auto-trigger print after content loads
        printWindow.onload = () => {
          setTimeout(() => printWindow.print(), 500);
        };
        toast.success('Relatório gerado! Clique "Salvar como PDF" ou use Ctrl+P.');
      } else {
        // Fallback: download as HTML
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio-executivo-${new Date().toISOString().split('T')[0]}.html`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Relatório baixado como HTML');
      }
    } catch (err: any) {
      toast.error(`Erro ao gerar relatório: ${err.message}`);
    }
    setLoading(false);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleGenerate} disabled={loading}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileText className="w-4 h-4 mr-1" />}
      Relatório PDF
    </Button>
  );
}
