import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const [{ data: obras }, { data: transactions }, { data: cashBalance }] = await Promise.all([
      supabase.from("obras").select("*").order("code"),
      supabase.from("transactions").select("*").order("due_date"),
      supabase.from("cash_balance").select("*").order("balance_date", { ascending: false }).limit(1),
    ]);

    const today = new Date().toISOString().split("T")[0];
    const currentBalance = cashBalance?.[0]?.amount ?? 0;

    // Pre-compute financial summaries for the AI
    const allTx = transactions || [];
    const pendingPayables = allTx.filter((t: any) => t.type === "pagar" && t.status !== "confirmado");
    const pendingReceivables = allTx.filter((t: any) => t.type === "receber" && t.status !== "confirmado");
    const overdueTx = allTx.filter((t: any) => t.status !== "confirmado" && t.due_date < today);
    const confirmedThisMonth = allTx.filter((t: any) => t.status === "confirmado" && t.paid_at?.startsWith(today.slice(0, 7)));

    const totalPendingPayables = pendingPayables.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalPendingReceivables = pendingReceivables.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalOverdue = overdueTx.reduce((s: number, t: any) => s + Number(t.amount), 0);

    // Compute 30-day projection data for AI context
    const projectionDays = 60;
    const projectionData: { date: string; balance: number; entries: number; exits: number }[] = [];
    let runningBalance = Number(currentBalance);
    for (let i = 0; i <= projectionDays; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      const dayEntries = allTx.filter((t: any) => t.type === "receber" && t.due_date === dateStr && t.status !== "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const dayExits = allTx.filter((t: any) => t.type === "pagar" && t.due_date === dateStr && t.status !== "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
      runningBalance += dayEntries - dayExits;
      projectionData.push({ date: dateStr, balance: Math.round(runningBalance * 100) / 100, entries: dayEntries, exits: dayExits });
    }

    const firstNegativeDay = projectionData.find(p => p.balance < 0);
    const minBalance = Math.min(...projectionData.map(p => p.balance));
    const maxBalance = Math.max(...projectionData.map(p => p.balance));

    // Per-obra summary
    const obraSummaries = (obras || []).map((o: any) => {
      const obraTx = allTx.filter((t: any) => t.obra_id === o.id);
      const received = obraTx.filter((t: any) => t.type === "receber" && t.status === "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const costs = obraTx.filter((t: any) => t.type === "pagar" && t.status === "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const pendingRec = obraTx.filter((t: any) => t.type === "receber" && t.status !== "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const pendingPay = obraTx.filter((t: any) => t.type === "pagar" && t.status !== "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const margin = o.contract_value > 0 ? ((received - costs) / o.contract_value * 100).toFixed(1) : "N/A";
      return `  ${o.code} (${o.client_name}): Contrato R$ ${o.contract_value} | Recebido R$ ${received} | Custos R$ ${costs} | Margem ${margin}% | A receber R$ ${pendingRec} | A pagar R$ ${pendingPay}`;
    }).join("\n");

    const systemPrompt = `Você é o assistente financeiro inteligente da BWILD Finance, uma empresa de reformas e obras de interiores de alto padrão.
Você pode CONVERSAR, ANALISAR CENÁRIOS, FAZER PROJEÇÕES e EXECUTAR AÇÕES no sistema financeiro.

DATA DE HOJE: ${today}

=== RESUMO FINANCEIRO ===
Saldo atual: R$ ${currentBalance}
Total a pagar (pendente): R$ ${totalPendingPayables} (${pendingPayables.length} transações)
Total a receber (pendente): R$ ${totalPendingReceivables} (${pendingReceivables.length} transações)
Total em atraso: R$ ${totalOverdue} (${overdueTx.length} transações)
Saldo mínimo projetado (60 dias): R$ ${minBalance}
Saldo máximo projetado (60 dias): R$ ${maxBalance}
${firstNegativeDay ? `⚠️ ALERTA: Saldo ficará NEGATIVO em ${firstNegativeDay.date} (R$ ${firstNegativeDay.balance})` : "✅ Saldo se mantém positivo nos próximos 60 dias"}

=== PROJEÇÃO DIÁRIA (próximos 60 dias) ===
${projectionData.filter((_, i) => i % 3 === 0 || projectionData[i].balance < 0).map(p => `${p.date}: Saldo R$ ${p.balance} | +R$ ${p.entries} -R$ ${p.exits}`).join("\n")}

=== SAÚDE POR OBRA ===
${obraSummaries}

=== OBRAS CADASTRADAS ===
${(obras || []).map((o: any) => `- ${o.code} | Cliente: ${o.client_name} | Status: ${o.status} | Contrato: R$ ${o.contract_value} | ID: ${o.id}`).join("\n")}

=== TRANSAÇÕES (últimas 200) ===
${allTx.slice(0, 200).map((t: any) => {
  const obraRef = t.obra_id ? (obras || []).find((o: any) => o.id === t.obra_id) : null;
  return `- ID: ${t.id} | ${t.type} | ${t.description} | ${t.counterpart} | R$ ${t.amount} | Venc: ${t.due_date} | Status: ${t.status} | Pago em: ${t.paid_at || "não"} | Cobranças: ${t.billing_count}${obraRef ? ` | Obra: ${obraRef.code}` : ""}`;
}).join("\n")}

=== CAPACIDADES ===
Além de executar ações, você pode responder a perguntas analíticas complexas:

**Análise de Cenários** ("E se..."):
- "E se eu adiar o pagamento X por 15 dias?"
- "E se o cliente Y não pagar até o fim do mês?"
- "Qual o impacto de antecipar a parcela da obra Z?"
→ Use a ferramenta analyze_scenario para calcular e apresentar o impacto

**Projeções**:
- "Qual o saldo projetado para daqui 30 dias?"
- "Quando o saldo ficará negativo?"
- "Qual a tendência de caixa desta semana?"
→ Use a ferramenta cash_projection para gerar projeções detalhadas

**Análise por Obra**:
- "Como está a saúde financeira da obra X?"
- "Qual obra tem maior risco?"
- "Compare a rentabilidade das obras ativas"
→ Use a ferramenta obra_analysis para análises detalhadas

**Resumos Executivos**:
- "Faça um resumo financeiro da semana"
- "Quais são os maiores riscos agora?"
→ Use a ferramenta executive_summary para relatórios estruturados

=== REGRAS ===
1. Quando o usuário pedir para confirmar/marcar como pago, use confirm_transactions
2. Quando pedir para criar transação, use create_transaction
3. Quando pedir para atualizar cobrança, use update_billing
4. Quando pedir para alterar transação, use update_transaction
5. Para perguntas analíticas, use as ferramentas de análise (analyze_scenario, cash_projection, obra_analysis, executive_summary)
6. Interprete linguagem natural: "já foram pagas" = confirmar, "e se..." = cenário
7. Ao confirmar parcelas, identifique pelo cliente, obra, período ou descrição
8. NÃO peça confirmação antes de executar — execute diretamente e resuma o que foi feito
9. Responda SEMPRE em português brasileiro
10. Seja conciso mas completo nas análises
11. Use formatação markdown: tabelas, negrito, listas
12. Quando o contexto for ambíguo, pergunte para esclarecer
13. Após executar ações, resuma o que foi feito

=== CENÁRIO CRÍTICO: HISTÓRICO RETROATIVO ===
O usuário pode estar começando a usar o sistema agora e NÃO ter parcelas passadas cadastradas.
Quando o usuário disser algo como "as parcelas passadas do cliente X já foram pagas":
1. PRIMEIRO: Verifique se existem parcelas pendentes desse cliente com vencimento anterior a hoje
2. SE EXISTIREM: Use confirm_transactions para marcá-las como pagas
3. SE NÃO EXISTIREM parcelas passadas no sistema: Pergunte se deseja registrar retroativamente
4. Para NOVAS obras, todas as parcelas estarão no sistema desde o início

=== REGRAS DE REGISTRO RETROATIVO ===
Quando o usuário pedir para registrar parcelas passadas já pagas:
- Use create_transaction com status "confirmado" e paid_at = due_date
- Vincule à obra correta usando o obra_id
- Use a descrição "Parcela [N]" ou o que o usuário informar
- Defina category como "Parcela" e type como "receber"`;

    const tools = [
      {
        type: "function",
        function: {
          name: "confirm_transactions",
          description: "Confirma (marca como pago) uma ou mais transações pelo ID.",
          parameters: {
            type: "object",
            properties: {
              transaction_ids: { type: "array", items: { type: "string" } },
              paid_date: { type: "string" },
            },
            required: ["transaction_ids"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "create_transaction",
          description: "Cria uma nova transação no sistema.",
          parameters: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["pagar", "receber"] },
              description: { type: "string" },
              counterpart: { type: "string" },
              amount: { type: "number" },
              due_date: { type: "string" },
              category: { type: "string" },
              obra_id: { type: "string" },
              notes: { type: "string" },
              status: { type: "string", enum: ["pendente", "previsto", "confirmado"] },
              paid_at: { type: "string" },
            },
            required: ["type", "description", "amount", "due_date"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "update_billing",
          description: "Atualiza o contador de cobranças de uma transação recebível.",
          parameters: {
            type: "object",
            properties: {
              transaction_id: { type: "string" },
              billing_count: { type: "number" },
              billing_sent_at: { type: "string" },
              notes: { type: "string" },
            },
            required: ["transaction_id"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "update_transaction",
          description: "Atualiza campos de uma transação existente.",
          parameters: {
            type: "object",
            properties: {
              transaction_id: { type: "string" },
              updates: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  counterpart: { type: "string" },
                  amount: { type: "number" },
                  due_date: { type: "string" },
                  status: { type: "string" },
                  notes: { type: "string" },
                  category: { type: "string" },
                  payment_method: { type: "string" },
                },
                additionalProperties: false,
              },
            },
            required: ["transaction_id", "updates"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "analyze_scenario",
          description: "Analisa um cenário hipotético ('e se...') e retorna o impacto no fluxo de caixa. Use para perguntas como 'e se adiar pagamento', 'e se cliente não pagar', 'qual impacto de antecipar'.",
          parameters: {
            type: "object",
            properties: {
              scenario_description: { type: "string", description: "Descrição do cenário a analisar" },
              affected_transaction_ids: { type: "array", items: { type: "string" }, description: "IDs das transações afetadas" },
              modifications: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    transaction_id: { type: "string" },
                    action: { type: "string", enum: ["defer", "cancel", "reduce", "anticipate"] },
                    new_due_date: { type: "string" },
                    new_amount: { type: "number" },
                  },
                  required: ["transaction_id", "action"],
                },
                description: "Modificações hipotéticas nas transações",
              },
              analysis_period_days: { type: "number", description: "Período de análise em dias (padrão: 30)" },
            },
            required: ["scenario_description", "modifications"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "cash_projection",
          description: "Gera projeção detalhada do fluxo de caixa para um período. Use para perguntas sobre saldo futuro, tendências, previsões.",
          parameters: {
            type: "object",
            properties: {
              period_days: { type: "number", description: "Período em dias (padrão: 30)" },
              granularity: { type: "string", enum: ["diario", "semanal"], description: "Granularidade da projeção" },
              include_overdue: { type: "boolean", description: "Incluir transações atrasadas na projeção" },
              filter_obra_id: { type: "string", description: "Filtrar por obra específica" },
            },
            required: ["period_days"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "obra_analysis",
          description: "Análise financeira detalhada de uma ou mais obras. Use para saúde financeira, comparação de rentabilidade, riscos por obra.",
          parameters: {
            type: "object",
            properties: {
              obra_ids: { type: "array", items: { type: "string" }, description: "IDs das obras a analisar. Vazio = todas ativas." },
              analysis_type: { type: "string", enum: ["health", "comparison", "risk", "timeline"], description: "Tipo de análise" },
            },
            required: ["analysis_type"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "executive_summary",
          description: "Gera resumo executivo do estado financeiro. Use para relatórios, visão geral, resumo da semana/mês.",
          parameters: {
            type: "object",
            properties: {
              period: { type: "string", enum: ["hoje", "semana", "mes", "trimestre"], description: "Período do resumo" },
              focus: { type: "string", enum: ["geral", "riscos", "oportunidades", "cobranças"], description: "Foco do resumo" },
            },
            required: ["period"],
            additionalProperties: false,
          },
        },
      },
    ];

    // Helper to execute tool calls
    async function executeToolCalls(toolCalls: any[]) {
      const results: any[] = [];
      const actionsExecuted: string[] = [];

      for (const toolCall of toolCalls) {
        const fn = toolCall.function;
        const args = JSON.parse(fn.arguments);
        let result: any;
        actionsExecuted.push(fn.name);

        try {
          switch (fn.name) {
            case "confirm_transactions": {
              const paidDate = args.paid_date || today;
              const { data, error } = await supabase
                .from("transactions")
                .update({ status: "confirmado", paid_at: paidDate })
                .in("id", args.transaction_ids)
                .select();
              if (error) throw error;
              result = { success: true, confirmed: data?.length || 0, ids: args.transaction_ids };
              break;
            }
            case "create_transaction": {
              const insertData: any = {
                type: args.type,
                description: args.description,
                counterpart: args.counterpart || "",
                amount: args.amount,
                due_date: args.due_date,
                category: args.category || "Outros",
                obra_id: args.obra_id || null,
                notes: args.notes || "",
                status: args.status || "pendente",
              };
              if (args.paid_at) insertData.paid_at = args.paid_at;
              const { data, error } = await supabase
                .from("transactions")
                .insert(insertData)
                .select()
                .single();
              if (error) throw error;
              result = { success: true, transaction: data };
              break;
            }
            case "update_billing": {
              const updates: any = {};
              if (args.billing_count !== undefined) updates.billing_count = args.billing_count;
              if (args.billing_sent_at) updates.billing_sent_at = args.billing_sent_at;
              if (args.notes) updates.notes = args.notes;
              const { data, error } = await supabase
                .from("transactions")
                .update(updates)
                .eq("id", args.transaction_id)
                .select()
                .single();
              if (error) throw error;
              result = { success: true, transaction: data };
              break;
            }
            case "update_transaction": {
              const { data, error } = await supabase
                .from("transactions")
                .update(args.updates)
                .eq("id", args.transaction_id)
                .select()
                .single();
              if (error) throw error;
              result = { success: true, transaction: data };
              break;
            }
            case "analyze_scenario": {
              // Compute scenario impact
              const periodDays = args.analysis_period_days || 30;
              const modMap = new Map<string, any>();
              for (const mod of args.modifications || []) {
                modMap.set(mod.transaction_id, mod);
              }

              // Original projection
              let origBalance = Number(currentBalance);
              let scenBalance = Number(currentBalance);
              const comparison: any[] = [];

              for (let i = 0; i <= periodDays; i++) {
                const d = new Date();
                d.setDate(d.getDate() + i);
                const dateStr = d.toISOString().split("T")[0];

                // Original
                const origEntries = allTx.filter((t: any) => t.type === "receber" && t.due_date === dateStr && t.status !== "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
                const origExits = allTx.filter((t: any) => t.type === "pagar" && t.due_date === dateStr && t.status !== "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
                origBalance += origEntries - origExits;

                // Scenario: apply modifications
                let scenEntries = 0;
                let scenExits = 0;
                for (const t of allTx) {
                  if (t.status === "confirmado") continue;
                  const mod = modMap.get(t.id);
                  let effectiveDate = t.due_date;
                  let effectiveAmount = Number(t.amount);
                  let cancelled = false;

                  if (mod) {
                    if (mod.action === "cancel") { cancelled = true; }
                    if (mod.action === "defer" && mod.new_due_date) { effectiveDate = mod.new_due_date; }
                    if (mod.action === "anticipate" && mod.new_due_date) { effectiveDate = mod.new_due_date; }
                    if (mod.action === "reduce" && mod.new_amount !== undefined) { effectiveAmount = mod.new_amount; }
                  }

                  if (!cancelled && effectiveDate === dateStr) {
                    if (t.type === "receber") scenEntries += effectiveAmount;
                    else scenExits += effectiveAmount;
                  }
                }
                scenBalance += scenEntries - scenExits;

                if (i % 3 === 0 || origBalance < 0 || scenBalance < 0) {
                  comparison.push({
                    date: dateStr,
                    original_balance: Math.round(origBalance * 100) / 100,
                    scenario_balance: Math.round(scenBalance * 100) / 100,
                    difference: Math.round((scenBalance - origBalance) * 100) / 100,
                  });
                }
              }

              const origMin = Math.min(...comparison.map(c => c.original_balance));
              const scenMin = Math.min(...comparison.map(c => c.scenario_balance));
              const origFirstNeg = comparison.find(c => c.original_balance < 0);
              const scenFirstNeg = comparison.find(c => c.scenario_balance < 0);

              result = {
                scenario: args.scenario_description,
                period_days: periodDays,
                original: { min_balance: origMin, first_negative: origFirstNeg?.date || null, end_balance: comparison[comparison.length - 1]?.original_balance },
                scenario_result: { min_balance: scenMin, first_negative: scenFirstNeg?.date || null, end_balance: comparison[comparison.length - 1]?.scenario_balance },
                impact: Math.round((scenMin - origMin) * 100) / 100,
                comparison_points: comparison,
                recommendation: scenMin > origMin ? "Cenário MELHORA o fluxo de caixa" : scenMin < origMin ? "Cenário PIORA o fluxo de caixa" : "Cenário não altera significativamente o fluxo",
              };
              break;
            }
            case "cash_projection": {
              const days = args.period_days || 30;
              const granularity = args.granularity || "diario";
              const filterObra = args.filter_obra_id || null;
              const includeOverdue = args.include_overdue ?? false;

              let balance = Number(currentBalance);
              const points: any[] = [];
              const filteredTx = filterObra ? allTx.filter((t: any) => t.obra_id === filterObra) : allTx;

              if (granularity === "semanal") {
                for (let w = 0; w < Math.ceil(days / 7); w++) {
                  const weekStart = new Date();
                  weekStart.setDate(weekStart.getDate() + w * 7);
                  const weekEnd = new Date(weekStart);
                  weekEnd.setDate(weekEnd.getDate() + 6);
                  const ws = weekStart.toISOString().split("T")[0];
                  const we = weekEnd.toISOString().split("T")[0];

                  const entries = filteredTx.filter((t: any) => t.type === "receber" && t.due_date >= ws && t.due_date <= we && (includeOverdue || t.status !== "atrasado") && t.status !== "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
                  const exits = filteredTx.filter((t: any) => t.type === "pagar" && t.due_date >= ws && t.due_date <= we && (includeOverdue || t.status !== "atrasado") && t.status !== "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
                  balance += entries - exits;
                  points.push({ period: `Semana ${w + 1} (${ws})`, entries, exits, net: entries - exits, balance: Math.round(balance * 100) / 100 });
                }
              } else {
                for (let i = 0; i <= days; i++) {
                  const d = new Date();
                  d.setDate(d.getDate() + i);
                  const dateStr = d.toISOString().split("T")[0];
                  const entries = filteredTx.filter((t: any) => t.type === "receber" && t.due_date === dateStr && (includeOverdue || t.status !== "atrasado") && t.status !== "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
                  const exits = filteredTx.filter((t: any) => t.type === "pagar" && t.due_date === dateStr && (includeOverdue || t.status !== "atrasado") && t.status !== "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
                  balance += entries - exits;
                  if (i % (days > 30 ? 3 : 1) === 0 || entries > 0 || exits > 0 || balance < 0) {
                    points.push({ date: dateStr, entries, exits, net: entries - exits, balance: Math.round(balance * 100) / 100 });
                  }
                }
              }

              const minBal = Math.min(...points.map(p => p.balance));
              const maxBal = Math.max(...points.map(p => p.balance));
              const negDays = points.filter(p => p.balance < 0);

              result = {
                period_days: days,
                granularity,
                current_balance: Number(currentBalance),
                projected_end_balance: points[points.length - 1]?.balance,
                min_balance: minBal,
                max_balance: maxBal,
                negative_periods: negDays.length,
                first_negative: negDays[0]?.date || negDays[0]?.period || null,
                data_points: points,
                health: negDays.length === 0 ? "saudável" : negDays.length <= 3 ? "atenção" : "crítico",
              };
              break;
            }
            case "obra_analysis": {
              const targetObras = args.obra_ids?.length
                ? (obras || []).filter((o: any) => args.obra_ids.includes(o.id))
                : (obras || []).filter((o: any) => o.status === "ativa");

              const analyses = targetObras.map((o: any) => {
                const obraTx = allTx.filter((t: any) => t.obra_id === o.id);
                const received = obraTx.filter((t: any) => t.type === "receber" && t.status === "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
                const costs = obraTx.filter((t: any) => t.type === "pagar" && t.status === "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
                const pendingRec = obraTx.filter((t: any) => t.type === "receber" && t.status !== "confirmado");
                const pendingPay = obraTx.filter((t: any) => t.type === "pagar" && t.status !== "confirmado");
                const overdueRec = pendingRec.filter((t: any) => t.due_date < today);
                const overduePay = pendingPay.filter((t: any) => t.due_date < today);
                const totalPendingRec = pendingRec.reduce((s: number, t: any) => s + Number(t.amount), 0);
                const totalPendingPay = pendingPay.reduce((s: number, t: any) => s + Number(t.amount), 0);
                const margin = o.contract_value > 0 ? ((received - costs) / o.contract_value * 100) : 0;
                const budgetUsage = o.budget_target > 0 ? (costs / o.budget_target * 100) : 0;
                const cashFlow = received - costs;

                let riskLevel = "baixo";
                if (overdueRec.length > 0 && margin < 10) riskLevel = "crítico";
                else if (overdueRec.length > 0 || margin < 20) riskLevel = "alto";
                else if (budgetUsage > 80) riskLevel = "médio";

                return {
                  obra_code: o.code,
                  client: o.client_name,
                  contract_value: o.contract_value,
                  received,
                  costs,
                  margin_percentage: Math.round(margin * 10) / 10,
                  budget_usage_percentage: Math.round(budgetUsage * 10) / 10,
                  cash_flow: cashFlow,
                  pending_receivables: totalPendingRec,
                  pending_payables: totalPendingPay,
                  overdue_receivables: overdueRec.length,
                  overdue_payables: overduePay.length,
                  risk_level: riskLevel,
                  next_receivable: pendingRec.sort((a: any, b: any) => a.due_date.localeCompare(b.due_date))[0]?.due_date || null,
                  next_payable: pendingPay.sort((a: any, b: any) => a.due_date.localeCompare(b.due_date))[0]?.due_date || null,
                };
              });

              result = {
                analysis_type: args.analysis_type,
                obras_analyzed: analyses.length,
                analyses,
                summary: {
                  total_contract_value: analyses.reduce((s, a) => s + a.contract_value, 0),
                  total_received: analyses.reduce((s, a) => s + a.received, 0),
                  total_costs: analyses.reduce((s, a) => s + a.costs, 0),
                  highest_risk: analyses.sort((a, b) => {
                    const riskOrder: any = { "crítico": 0, "alto": 1, "médio": 2, "baixo": 3 };
                    return (riskOrder[a.risk_level] ?? 3) - (riskOrder[b.risk_level] ?? 3);
                  })[0]?.obra_code || null,
                  best_margin: analyses.sort((a, b) => b.margin_percentage - a.margin_percentage)[0]?.obra_code || null,
                },
              };
              break;
            }
            case "executive_summary": {
              const period = args.period || "semana";
              const focus = args.focus || "geral";

              // Date ranges
              const periodStart = new Date();
              if (period === "semana") periodStart.setDate(periodStart.getDate() - 7);
              else if (period === "mes") periodStart.setMonth(periodStart.getMonth() - 1);
              else if (period === "trimestre") periodStart.setMonth(periodStart.getMonth() - 3);
              const periodStartStr = periodStart.toISOString().split("T")[0];

              const periodTx = allTx.filter((t: any) => t.due_date >= periodStartStr && t.due_date <= today);
              const confirmedInPeriod = periodTx.filter((t: any) => t.status === "confirmado");
              const receivedInPeriod = confirmedInPeriod.filter((t: any) => t.type === "receber").reduce((s: number, t: any) => s + Number(t.amount), 0);
              const paidInPeriod = confirmedInPeriod.filter((t: any) => t.type === "pagar").reduce((s: number, t: any) => s + Number(t.amount), 0);
              const overdueInPeriod = periodTx.filter((t: any) => t.due_date < today && t.status !== "confirmado");

              // Upcoming 7 days
              const next7 = new Date();
              next7.setDate(next7.getDate() + 7);
              const next7Str = next7.toISOString().split("T")[0];
              const upcoming = allTx.filter((t: any) => t.due_date >= today && t.due_date <= next7Str && t.status !== "confirmado");
              const upcomingPay = upcoming.filter((t: any) => t.type === "pagar").reduce((s: number, t: any) => s + Number(t.amount), 0);
              const upcomingRec = upcoming.filter((t: any) => t.type === "receber").reduce((s: number, t: any) => s + Number(t.amount), 0);

              result = {
                period,
                focus,
                current_balance: Number(currentBalance),
                period_summary: {
                  received: receivedInPeriod,
                  paid: paidInPeriod,
                  net_flow: receivedInPeriod - paidInPeriod,
                  overdue_count: overdueInPeriod.length,
                  overdue_total: overdueInPeriod.reduce((s: number, t: any) => s + Number(t.amount), 0),
                },
                next_7_days: {
                  payables: upcomingPay,
                  receivables: upcomingRec,
                  net: upcomingRec - upcomingPay,
                },
                projection_30d: {
                  min_balance: minBalance,
                  first_negative: firstNegativeDay?.date || null,
                  end_balance: projectionData[projectionData.length - 1]?.balance,
                },
                active_obras: (obras || []).filter((o: any) => o.status === "ativa").length,
                total_overdue: overdueTx.length,
              };
              break;
            }
            default:
              result = { error: `Unknown function: ${fn.name}` };
          }
        } catch (e) {
          console.error(`Tool ${fn.name} error:`, e);
          result = { error: e instanceof Error ? e.message : "Erro ao executar ação" };
        }

        results.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      return { results, actionsExecuted };
    }

    // First AI call - understand intent (non-streaming to check for tool calls)
    const firstResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools,
      }),
    });

    if (!firstResponse.ok) {
      const status = firstResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Erro na IA");
    }

    const aiData = await firstResponse.json();
    const choice = aiData.choices?.[0]?.message;

    // Build the messages for the streaming call
    let streamMessages: any[];
    let actionsExecuted: string[] = [];

    if (choice?.tool_calls?.length) {
      const { results, actionsExecuted: actions } = await executeToolCalls(choice.tool_calls);
      actionsExecuted = actions;
      streamMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
        choice,
        ...results,
      ];
    } else if (choice?.content) {
      const body = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          if (actionsExecuted.length > 0) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "actions", actions: actionsExecuted })}\n\n`));
          }
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "delta", content: choice.content })}\n\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        },
      });
      return new Response(body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    } else {
      streamMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
      ];
    }

    // Streaming AI call for the final response
    const streamResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: streamMessages,
        stream: true,
      }),
    });

    if (!streamResponse.ok || !streamResponse.body) {
      throw new Error("Erro ao gerar resposta streaming");
    }

    const reader = streamResponse.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const body = new ReadableStream({
      async start(controller) {
        if (actionsExecuted.length > 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "actions", actions: actionsExecuted })}\n\n`));
        }

        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let newlineIdx: number;
            while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, newlineIdx);
              buffer = buffer.slice(newlineIdx + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;

              try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", content })}\n\n`));
                }
              } catch {
                buffer = line + "\n" + buffer;
                break;
              }
            }
          }
        } catch (e) {
          console.error("Stream read error:", e);
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      },
    });

    return new Response(body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("chat-command error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
