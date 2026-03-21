import { Transaction, TransactionType } from './types';
import { formatCurrency, formatDateFull } from './helpers';

export function exportToCSV(rows: Record<string, string | number>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(';'),
    ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';')),
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

export function exportToExcel(rows: Record<string, string | number>[], filename: string) {
  import('xlsx').then(XLSX => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  });
}

export function exportToPDF(title: string, headers: string[], rows: string[][]) {
  const lineHeight = 18;
  const margin = 40;
  const colWidth = (595 - 2 * margin) / headers.length;
  const pageHeight = 842;
  let y = margin;

  let content = '';

  const addPage = () => {
    content += `<div style="width:595px;height:${pageHeight}px;page-break-after:always;font-family:Arial,sans-serif;font-size:9px;padding:${margin}px;box-sizing:border-box;">`;
  };
  const closePage = () => { content += '</div>'; };

  addPage();
  // Title
  content += `<div style="font-size:14px;font-weight:bold;margin-bottom:16px;">${title}</div>`;
  content += `<div style="font-size:8px;color:#666;margin-bottom:12px;">Gerado em ${new Date().toLocaleString('pt-BR')}</div>`;
  y += 50;

  // Header row
  content += '<div style="display:flex;border-bottom:1px solid #333;padding-bottom:4px;margin-bottom:4px;">';
  headers.forEach(h => {
    content += `<div style="width:${colWidth}px;font-weight:bold;font-size:8px;text-transform:uppercase;color:#555;">${h}</div>`;
  });
  content += '</div>';
  y += lineHeight;

  // Data rows
  rows.forEach((row, i) => {
    if (y + lineHeight > pageHeight - margin) {
      closePage();
      addPage();
      y = margin;
    }
    const bg = i % 2 === 0 ? '#f9f9f9' : '#fff';
    content += `<div style="display:flex;background:${bg};padding:3px 0;">`;
    row.forEach(cell => {
      content += `<div style="width:${colWidth}px;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cell}</div>`;
    });
    content += '</div>';
    y += lineHeight;
  });

  closePage();

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(`<html><head><title>${title}</title></head><body style="margin:0;">${content}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function transactionsToExportRows(txs: Transaction[], type: TransactionType) {
  const isPagar = type === 'pagar';
  return txs.map(t => ({
    'Descrição': t.description,
    [isPagar ? 'Fornecedor' : 'Cliente']: t.counterpart,
    'Valor': formatCurrency(t.amount),
    'Vencimento': formatDateFull(t.dueDate),
    'Status': t.status,
    'Categoria': t.category,
    ...(isPagar ? { 'Prioridade': t.priority, 'Centro de Custo': t.costCenter } : {}),
    'Método Pgto': t.paymentMethod || '-',
    'Notas': t.notes || '',
  }));
}

export function cashFlowToExportRows(days: { date: string; label: string; entradas: number; saidas: number; saldoDia: number; accumulated: number }[]) {
  return days.map(d => ({
    'Data': d.label,
    'Entradas': formatCurrency(d.entradas),
    'Saídas': formatCurrency(d.saidas),
    'Saldo Dia': formatCurrency(d.saldoDia),
    'Acumulado': formatCurrency(d.accumulated),
  }));
}
