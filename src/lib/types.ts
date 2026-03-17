export type BillStatus = 'planejado' | 'pendente' | 'pago' | 'atrasado';

export type CostCenter = 
  | 'Operação'
  | 'Marketing'
  | 'Vendas'
  | 'Produto'
  | 'RH'
  | 'Jurídico'
  | 'Administrativo'
  | 'Diretoria';

export type Recurrence = 'única' | 'mensal' | 'semanal' | 'trimestral' | 'anual';

export interface Bill {
  id: string;
  description: string;
  supplier: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  status: BillStatus;
  costCenter: CostCenter;
  category: string;
  recurrence: Recurrence;
  notes: string;
}

export const COST_CENTERS: CostCenter[] = [
  'Operação', 'Marketing', 'Vendas', 'Produto', 'RH', 'Jurídico', 'Administrativo', 'Diretoria'
];

export const STATUS_OPTIONS: BillStatus[] = ['planejado', 'pendente', 'pago', 'atrasado'];

export const RECURRENCE_OPTIONS: Recurrence[] = ['única', 'mensal', 'semanal', 'trimestral', 'anual'];

export const CATEGORIES = [
  'Software', 'Aluguel', 'Salários', 'Impostos', 'Serviços', 'Consultoria',
  'Infraestrutura', 'Benefícios', 'Viagens', 'Outros'
];

export const STATUS_LABELS: Record<BillStatus, string> = {
  planejado: 'Planejado',
  pendente: 'Pendente',
  pago: 'Pago',
  atrasado: 'Atrasado',
};

export const COST_CENTER_COLORS: Record<CostCenter, string> = {
  'Operação': '#2563eb',
  'Marketing': '#7c3aed',
  'Vendas': '#059669',
  'Produto': '#d97706',
  'RH': '#dc2626',
  'Jurídico': '#6366f1',
  'Administrativo': '#64748b',
  'Diretoria': '#0891b2',
};
