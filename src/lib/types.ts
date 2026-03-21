export type TransactionType = 'pagar' | 'receber';
export type TransactionStatus = 'previsto' | 'pendente' | 'confirmado' | 'atrasado';
export type Priority = 'crítica' | 'alta' | 'normal' | 'baixa';
export type CostCenter = 'OPEX' | 'Marketing' | 'Vendas' | 'Produto' | 'RH' | 'Jurídico' | 'Administrativo' | 'Diretoria';
export type Recurrence = 'única' | 'mensal' | 'semanal' | 'trimestral' | 'anual';
export type PaymentMethod = 'PIX' | 'Boleto' | 'Cartão de Crédito' | 'TED' | 'Débito Automático' | 'Dinheiro' | '';

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  counterpart: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  status: TransactionStatus;
  costCenter: CostCenter;
  category: string;
  recurrence: Recurrence;
  paymentMethod: PaymentMethod;
  notes: string;
  priority: Priority;
}

export interface CashBalance {
  id: string;
  balanceDate: string;
  amount: number;
  bankAccount: string;
  notes: string;
}

export const COST_CENTERS: CostCenter[] = [
  'Operação', 'Marketing', 'Vendas', 'Produto', 'RH', 'Jurídico', 'Administrativo', 'Diretoria'
];

export const STATUS_OPTIONS: TransactionStatus[] = ['previsto', 'pendente', 'confirmado', 'atrasado'];

export const RECURRENCE_OPTIONS: Recurrence[] = ['única', 'mensal', 'semanal', 'trimestral', 'anual'];

export const PRIORITY_OPTIONS: Priority[] = ['crítica', 'alta', 'normal', 'baixa'];

export const PAYMENT_METHODS: PaymentMethod[] = ['PIX', 'Boleto', 'Cartão de Crédito', 'TED', 'Débito Automático', 'Dinheiro'];

export const PAGAR_CATEGORIES = [
  'Materiais de Obra', 'Mão de Obra Terceirizada', 'Aluguel', 'Salários', 'Encargos Trabalhistas',
  'Impostos', 'Marketing/Tráfego', 'Software/SaaS', 'Contador', 'Jurídico',
  'Veículos', 'Alimentação', 'Benefícios', 'Seguros', 'Serviços Gerais', 'Outros'
];

export const RECEBER_CATEGORIES = [
  'Contrato de Reforma (Medição)', 'Sinal de Contrato', 'Parcela de Contrato',
  'Projeto Arquitetônico', 'Consultoria', 'Reembolso', 'Outros'
];

export const STATUS_LABELS: Record<TransactionStatus, string> = {
  previsto: 'Previsto',
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  atrasado: 'Atrasado',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  'crítica': 'Crítica',
  'alta': 'Alta',
  'normal': 'Normal',
  'baixa': 'Baixa',
};

export const PRIORITY_CLASSES: Record<Priority, string> = {
  'crítica': 'priority-critica',
  'alta': 'priority-alta',
  'normal': 'priority-normal',
  'baixa': 'priority-baixa',
};

export const COST_CENTER_COLORS: Record<CostCenter, string> = {
  'Operação': '#0C3547',
  'Marketing': '#7c3aed',
  'Vendas': '#059669',
  'Produto': '#d97706',
  'RH': '#dc2626',
  'Jurídico': '#6366f1',
  'Administrativo': '#64748b',
  'Diretoria': '#1A6B8A',
};
