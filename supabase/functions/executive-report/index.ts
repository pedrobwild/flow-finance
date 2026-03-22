import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch data
    const [txRes, obrasRes, balRes] = await Promise.all([
      supabase.from("transactions").select("*").order("due_date", { ascending: true }),
      supabase.from("obras").select("*"),
      supabase.from("cash_balance").select("*").order("balance_date", { ascending: false }).limit(1),
    ]);

    const transactions = txRes.data || [];
    const obras = obrasRes.data || [];
    const balance = balRes.data?.[0]?.amount || 0;
    const today = new Date().toISOString().split("T")[0];

    // Compute KPIs
    const pagar = transactions.filter((t: any) => t.type === "pagar");
    const receber = transactions.filter((t: any) => t.type === "receber");

    const overduePayable = pagar.filter((t: any) => t.status === "atrasado" || (t.due_date < today && !t.paid_at && t.status !== "confirmado"));
    const overdueReceivable = receber.filter((t: any) => t.status === "atrasado" || (t.due_date < today && !t.paid_at && t.status !== "confirmado"));

    const next30 = new Date();
    next30.setDate(next30.getDate() + 30);
    const next30Str = next30.toISOString().split("T")[0];

    const upcoming30Pagar = pagar.filter((t: any) => t.due_date >= today && t.due_date <= next30Str && t.status !== "confirmado");
    const upcoming30Receber = receber.filter((t: any) => t.due_date >= today && t.due_date <= next30Str && t.status !== "confirmado");

    const totalUpPagar = upcoming30Pagar.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalUpReceber = upcoming30Receber.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalOverduePagar = overduePayable.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalOverdueReceber = overdueReceivable.reduce((s: number, t: any) => s + Number(t.amount), 0);

    const projectedBalance = balance + totalUpReceber - totalUpPagar;

    // Per-obra summary
    const obraSummaries = obras.filter((o: any) => o.status === "ativa").map((o: any) => {
      const obraTxs = transactions.filter((t: any) => t.obra_id === o.id);
      const received = obraTxs.filter((t: any) => t.type === "receber" && t.status === "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const costs = obraTxs.filter((t: any) => t.type === "pagar").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const margin = Number(o.contract_value) > 0 ? ((received - costs) / Number(o.contract_value)) * 100 : 0;
      return {
        code: o.code,
        client: o.client_name,
        contractValue: Number(o.contract_value),
        received,
        costs,
        margin: Math.round(margin),
      };
    });

    // Counterpart concentration
    const counterpartTotals: Record<string, number> = {};
    receber.forEach((t: any) => {
      if (t.counterpart) counterpartTotals[t.counterpart] = (counterpartTotals[t.counterpart] || 0) + Number(t.amount);
    });
    const totalRec = Object.values(counterpartTotals).reduce((s, v) => s + v, 0);
    const topCounterparts = Object.entries(counterpartTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, vol]) => ({ name, volume: vol, pct: totalRec > 0 ? Math.round((vol / totalRec) * 100) : 0 }));

    // Build financial summary for AI
    const financialSummary = `
Relatório Executivo Semanal - Data: ${today}
Saldo Atual: R$ ${balance.toLocaleString('pt-BR')}
Saldo Projetado (30d): R$ ${projectedBalance.toLocaleString('pt-BR')}

Próximos 30 dias:
- A Pagar: R$ ${totalUpPagar.toLocaleString('pt-BR')} (${upcoming30Pagar.length} transações)
- A Receber: R$ ${totalUpReceber.toLocaleString('pt-BR')} (${upcoming30Receber.length} transações)

Atrasados:
- Pagar: R$ ${totalOverduePagar.toLocaleString('pt-BR')} (${overduePayable.length})
- Receber: R$ ${totalOverdueReceber.toLocaleString('pt-BR')} (${overdueReceivable.length})

Obras Ativas: ${obraSummaries.length}
${obraSummaries.map((o: any) => `- ${o.code} (${o.client}): Contrato R$ ${o.contractValue.toLocaleString('pt-BR')}, Recebido R$ ${o.received.toLocaleString('pt-BR')}, Custos R$ ${o.costs.toLocaleString('pt-BR')}, Margem ${o.margin}%`).join('\n')}

Top 5 Contrapartes (Receita):
${topCounterparts.map(c => `- ${c.name}: R$ ${c.volume.toLocaleString('pt-BR')} (${c.pct}%)`).join('\n')}
`;

    let aiInsights = "";
    if (lovableApiKey) {
      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `Você é um CFO estratégico. Analise os dados financeiros e gere um briefing executivo conciso em português com:
1. RESUMO EXECUTIVO (2-3 frases do cenário geral)
2. ALERTAS CRÍTICOS (riscos imediatos, máximo 3)
3. OPORTUNIDADES (ações recomendadas, máximo 3)
4. PROJEÇÃO (outlook para próximas 4 semanas)
Seja direto, objetivo e use dados concretos. Não use markdown, apenas texto plano com quebras de linha.`,
              },
              { role: "user", content: financialSummary },
            ],
            max_tokens: 1000,
            temperature: 0.3,
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          aiInsights = aiData.choices?.[0]?.message?.content || "";
        }
      } catch (e) {
        console.error("AI error:", e);
      }
    }

    // Build HTML report
    const formatBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório Executivo Semanal</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { border-bottom: 3px solid #0C3547; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 22px; color: #0C3547; }
    .header p { font-size: 12px; color: #666; margin-top: 4px; }
    .section { margin-bottom: 24px; }
    .section h2 { font-size: 15px; color: #0C3547; border-left: 3px solid #1A6B8A; padding-left: 8px; margin-bottom: 12px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
    .kpi-value { font-size: 18px; font-weight: 700; color: #0C3547; }
    .kpi-label { font-size: 10px; color: #666; margin-top: 2px; }
    .kpi.danger .kpi-value { color: #dc2626; }
    .kpi.success .kpi-value { color: #059669; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #0C3547; color: #fff; padding: 8px; text-align: left; font-weight: 600; }
    td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
    .ai-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; white-space: pre-line; font-size: 12px; line-height: 1.6; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #999; text-align: center; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Relatório Executivo Semanal</h1>
    <p>BWILD Finance · Gerado em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
  </div>

  <div class="section">
    <h2>Indicadores Chave</h2>
    <div class="kpi-grid">
      <div class="kpi ${balance >= 0 ? 'success' : 'danger'}">
        <div class="kpi-value">${formatBRL(balance)}</div>
        <div class="kpi-label">Saldo Atual</div>
      </div>
      <div class="kpi ${projectedBalance >= 0 ? 'success' : 'danger'}">
        <div class="kpi-value">${formatBRL(projectedBalance)}</div>
        <div class="kpi-label">Projeção 30d</div>
      </div>
      <div class="kpi danger">
        <div class="kpi-value">${formatBRL(totalOverdueReceber)}</div>
        <div class="kpi-label">Atrasados a Receber</div>
      </div>
      <div class="kpi">
        <div class="kpi-value">${obraSummaries.length}</div>
        <div class="kpi-label">Obras Ativas</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Fluxo Próximos 30 Dias</h2>
    <div class="kpi-grid" style="grid-template-columns: repeat(2, 1fr);">
      <div class="kpi success">
        <div class="kpi-value">${formatBRL(totalUpReceber)}</div>
        <div class="kpi-label">Entradas Previstas (${upcoming30Receber.length})</div>
      </div>
      <div class="kpi danger">
        <div class="kpi-value">${formatBRL(totalUpPagar)}</div>
        <div class="kpi-label">Saídas Previstas (${upcoming30Pagar.length})</div>
      </div>
    </div>
  </div>

  ${obraSummaries.length > 0 ? `
  <div class="section">
    <h2>Performance por Obra</h2>
    <table>
      <thead>
        <tr><th>Obra</th><th>Cliente</th><th>Contrato</th><th>Recebido</th><th>Custos</th><th>Margem</th></tr>
      </thead>
      <tbody>
        ${obraSummaries.map((o: any) => `
        <tr>
          <td><strong>${o.code}</strong></td>
          <td>${o.client}</td>
          <td>${formatBRL(o.contractValue)}</td>
          <td>${formatBRL(o.received)}</td>
          <td>${formatBRL(o.costs)}</td>
          <td style="color: ${o.margin >= 0 ? '#059669' : '#dc2626'}">${o.margin}%</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${topCounterparts.length > 0 ? `
  <div class="section">
    <h2>Concentração de Receita</h2>
    <table>
      <thead>
        <tr><th>Contraparte</th><th>Volume</th><th>Concentração</th></tr>
      </thead>
      <tbody>
        ${topCounterparts.map(c => `
        <tr>
          <td>${c.name}</td>
          <td>${formatBRL(c.volume)}</td>
          <td>${c.pct}%</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${aiInsights ? `
  <div class="section">
    <h2>🤖 Análise Estratégica (IA)</h2>
    <div class="ai-box">${aiInsights}</div>
  </div>` : ''}

  <div class="footer">
    Relatório gerado automaticamente pelo BWILD Finance · ${new Date().toLocaleString('pt-BR')}
  </div>
</body>
</html>`;

    return new Response(JSON.stringify({ html, summary: { balance, projectedBalance, totalUpPagar, totalUpReceber, totalOverduePagar, totalOverdueReceber, obrasCount: obraSummaries.length } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
