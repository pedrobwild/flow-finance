import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';

interface Props {
  onCSV: () => void;
  onExcel: () => void;
  onPDF: () => void;
}

export default function ExportDropdown({ onCSV, onExcel, onPDF }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Download className="w-3.5 h-3.5" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onPDF} className="gap-2 text-xs">
          <FileText className="w-3.5 h-3.5" /> PDF (imprimir)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExcel} className="gap-2 text-xs">
          <FileSpreadsheet className="w-3.5 h-3.5" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCSV} className="gap-2 text-xs">
          <FileText className="w-3.5 h-3.5" /> CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
