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

    const [txRes, obrasRes, balRes, negRes] = await Promise.all([
      supabase.from("transactions").select("*").order("due_date", { ascending: true }),
      supabase.from("obras").select("*"),
      supabase.from("cash_balance").select("*").order("balance_date", { ascending: false }).limit(1),
      supabase.from("negotiations").select("*").order("created_at", { ascending: false }),
    ]);

    const transactions = txRes.data || [];
    const obras = obrasRes.data || [];
    const balance = balRes.data?.[0]?.amount || 0;
    const negotiations = negRes.data || [];
    const today = new Date().toISOString().split("T")[0];
    const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;

    // ── Compute comprehensive KPIs ──
    const pagar = transactions.filter((t: any) => t.type === "pagar");
    const receber = transactions.filter((t: any) => t.type === "receber");

    const overduePagar = pagar.filter((t: any) => t.status === "atrasado" || (t.due_date < today && !t.paid_at && t.status !== "confirmado"));
    const overdueReceber = receber.filter((t: any) => t.status === "atrasado" || (t.due_date < today && !t.paid_at && t.status !== "confirmado"));

    const d = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().split("T")[0]; };
    const next7 = d(7), next14 = d(14), next30 = d(30);

    const upPagar30 = pagar.filter((t: any) => t.due_date >= today && t.due_date <= next30 && t.status !== "confirmado");
    const upReceber30 = receber.filter((t: any) => t.due_date >= today && t.due_date <= next30 && t.status !== "confirmado");
    const upPagar7 = pagar.filter((t: any) => t.due_date >= today && t.due_date <= next7 && t.status !== "confirmado");
    const upReceber7 = receber.filter((t: any) => t.due_date >= today && t.due_date <= next7 && t.status !== "confirmado");

    const sum = (arr: any[]) => arr.reduce((s: number, t: any) => s + Number(t.amount), 0);

    const totalUpPagar30 = sum(upPagar30), totalUpReceber30 = sum(upReceber30);
    const totalUpPagar7 = sum(upPagar7), totalUpReceber7 = sum(upReceber7);
    const totalOverduePagar = sum(overduePagar), totalOverdueReceber = sum(overdueReceber);
    const projectedBalance = balance + totalUpReceber30 - totalUpPagar30;

    // Runway calculation
    const dailyBurn = totalUpPagar30 / 30;
    const runwayDays = dailyBurn > 0 ? Math.round(balance / dailyBurn) : 999;

    // ── Per-obra summaries ──
    const activeObras = obras.filter((o: any) => o.status === "ativa");
    const obraSummaries = activeObras.map((o: any) => {
      const obraTxs = transactions.filter((t: any) => t.obra_id === o.id);
      const received = obraTxs.filter((t: any) => t.type === "receber" && t.status === "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalReceivable = obraTxs.filter((t: any) => t.type === "receber").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const costs = obraTxs.filter((t: any) => t.type === "pagar").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const paidCosts = obraTxs.filter((t: any) => t.type === "pagar" && t.status === "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const margin = Number(o.contract_value) > 0 ? ((Number(o.contract_value) - costs) / Number(o.contract_value)) * 100 : 0;
      const overdueRec = obraTxs.filter((t: any) => t.type === "receber" && (t.status === "atrasado" || (t.due_date < today && !t.paid_at && t.status !== "confirmado")));
      const cashFlow = received - paidCosts;
      return {
        code: o.code, client: o.client_name, contractValue: Number(o.contract_value),
        received, totalReceivable, costs, paidCosts, margin: Math.round(margin),
        overdueCount: overdueRec.length, overdueAmount: sum(overdueRec), cashFlow,
        receivedPct: Number(o.contract_value) > 0 ? Math.round((received / Number(o.contract_value)) * 100) : 0,
      };
    }).sort((a: any, b: any) => a.cashFlow - b.cashFlow);

    // ── Counterpart risk ──
    const cpTotals: Record<string, { total: number; overdue: number; overdueAmt: number; count: number; type: string }> = {};
    const totalRec = sum(receber);
    receber.forEach((t: any) => {
      if (!t.counterpart) return;
      if (!cpTotals[t.counterpart]) cpTotals[t.counterpart] = { total: 0, overdue: 0, overdueAmt: 0, count: 0, type: "cliente" };
      cpTotals[t.counterpart].total += Number(t.amount);
      cpTotals[t.counterpart].count++;
      if (t.status === "atrasado" || (t.due_date < today && !t.paid_at && t.status !== "confirmado")) {
        cpTotals[t.counterpart].overdue++;
        cpTotals[t.counterpart].overdueAmt += Number(t.amount);
      }
    });
    const topRisks = Object.entries(cpTotals)
      .map(([name, d]) => ({ name, ...d, concentration: totalRec > 0 ? Math.round((d.total / totalRec) * 100) : 0 }))
      .filter(r => r.count >= 2)
      .sort((a, b) => b.overdueAmt - a.overdueAmt)
      .slice(0, 5);

    // ── Negotiation summary ──
    const activeNegs = negotiations.filter((n: any) => n.result === "pendente" || n.result === "em_andamento");
    const closedNegs = negotiations.filter((n: any) => n.result === "acordo_fechado");
    const negSavings = closedNegs.reduce((s: number, n: any) => s + (Number(n.original_amount) - (Number(n.proposed_amount) || Number(n.original_amount))), 0);

    // ── Weekly cash flow projection ──
    const weeklyProjection: { week: string; inflow: number; outflow: number; balance: number }[] = [];
    let runBal = balance;
    for (let w = 0; w < 4; w++) {
      const wStart = d(w * 7);
      const wEnd = d((w + 1) * 7);
      const wIn = receber.filter((t: any) => t.due_date >= wStart && t.due_date < wEnd && t.status !== "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const wOut = pagar.filter((t: any) => t.due_date >= wStart && t.due_date < wEnd && t.status !== "confirmado").reduce((s: number, t: any) => s + Number(t.amount), 0);
      runBal += wIn - wOut;
      weeklyProjection.push({ week: `Semana ${w + 1}`, inflow: wIn, outflow: wOut, balance: runBal });
    }

    // ── AI Strategic Analysis ──
    const financialContext = `
Relatório Executivo - ${today}
Saldo: ${fmt(balance)} | Projeção 30d: ${fmt(projectedBalance)} | Runway: ${runwayDays} dias
Próx 7d: Entradas ${fmt(totalUpReceber7)} / Saídas ${fmt(totalUpPagar7)}
Próx 30d: Entradas ${fmt(totalUpReceber30)} / Saídas ${fmt(totalUpPagar30)}
Atrasados: Receber ${fmt(totalOverdueReceber)} (${overdueReceber.length}) / Pagar ${fmt(totalOverduePagar)} (${overduePagar.length})
Obras ativas: ${activeObras.length}
${obraSummaries.map((o: any) => `- ${o.code} (${o.client}): Contrato ${fmt(o.contractValue)}, Recebido ${o.receivedPct}%, Margem ${o.margin}%, ${o.overdueCount > 0 ? `${o.overdueCount} atraso(s) ${fmt(o.overdueAmount)}` : 'sem atrasos'}`).join("\n")}
Negociações ativas: ${activeNegs.length} (economia acumulada: ${fmt(negSavings)})
Riscos: ${topRisks.map(r => `${r.name}: ${fmt(r.overdueAmt)} atrasado, ${r.concentration}% concentração`).join("; ")}
Projeção semanal: ${weeklyProjection.map(w => `${w.week}: Saldo ${fmt(w.balance)}`).join(" | ")}
`;

    let aiAnalysis = "";
    if (lovableApiKey) {
      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableApiKey}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: `Você é um CFO estratégico. Produza um briefing executivo semanal em português com exatamente estas seções (use os títulos exatos):

RESUMO EXECUTIVO
2-3 frases do cenário geral com dados concretos.

ALERTAS CRÍTICOS
Até 3 riscos imediatos com quantificação de impacto.

AÇÕES RECOMENDADAS
Até 4 ações priorizadas por impacto, cada uma com: ação específica, valor/impacto esperado, e prazo.

PROJEÇÃO 4 SEMANAS
Outlook semanal com cenários otimista e conservador.

OPORTUNIDADES
Até 2 oportunidades de otimização financeira identificadas.

Seja direto, use dados concretos. Texto plano, sem markdown.` },
              { role: "user", content: financialContext },
            ],
            max_tokens: 1500,
            temperature: 0.3,
          }),
        });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          aiAnalysis = aiData.choices?.[0]?.message?.content || "";
        }
      } catch (e) { console.error("AI error:", e); }
    }

    // ── Parse AI sections ──
    const aiSections: Record<string, string> = {};
    if (aiAnalysis) {
      const sectionNames = ["RESUMO EXECUTIVO", "ALERTAS CRÍTICOS", "AÇÕES RECOMENDADAS", "PROJEÇÃO 4 SEMANAS", "OPORTUNIDADES"];
      sectionNames.forEach((name, i) => {
        const start = aiAnalysis.indexOf(name);
        if (start === -1) return;
        const contentStart = start + name.length;
        const nextSection = sectionNames.slice(i + 1).find(n => aiAnalysis.indexOf(n) > contentStart);
        const end = nextSection ? aiAnalysis.indexOf(nextSection) : aiAnalysis.length;
        aiSections[name] = aiAnalysis.slice(contentStart, end).trim();
      });
    }

    // ── Generate PDF-optimized HTML ──
    const dateFormatted = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const balColor = balance >= 0 ? "#059669" : "#dc2626";
    const projColor = projectedBalance >= 0 ? "#059669" : "#dc2626";
    const runwayColor = runwayDays > 60 ? "#059669" : runwayDays > 30 ? "#d97706" : "#dc2626";

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório Executivo Semanal — BWILD Finance</title>
<style>
@page { size: A4; margin: 20mm 15mm; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } .page-break { page-break-before: always; } }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a2e; background: #fff; padding: 32px; max-width: 210mm; margin: 0 auto; font-size: 11px; line-height: 1.5; }
.header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0C3547; padding-bottom: 12px; margin-bottom: 20px; }
.header h1 { font-size: 20px; color: #0C3547; letter-spacing: -0.3px; }
.header .meta { text-align: right; font-size: 10px; color: #666; }
.section { margin-bottom: 18px; }
.section-title { font-size: 12px; font-weight: 700; color: #0C3547; border-left: 3px solid #1A6B8A; padding-left: 8px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center; }
.kpi-value { font-size: 16px; font-weight: 800; }
.kpi-label { font-size: 9px; color: #666; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.3px; }
.kpi-sub { font-size: 9px; color: #999; margin-top: 1px; }
.kpi.success .kpi-value { color: #059669; }
.kpi.danger .kpi-value { color: #dc2626; }
.kpi.warning .kpi-value { color: #d97706; }
table { width: 100%; border-collapse: collapse; font-size: 10px; }
th { background: #0C3547; color: #fff; padding: 6px 8px; text-align: left; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; }
td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
tr:nth-child(even) { background: #f8fafc; }
.bar-container { width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; }
.ai-section { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 12px; margin-bottom: 10px; }
.ai-section h4 { font-size: 11px; font-weight: 700; color: #0C3547; margin-bottom: 6px; }
.ai-section p, .ai-section li { font-size: 10px; line-height: 1.6; color: #334155; }
.risk-badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 8px; font-weight: 700; }
.risk-high { background: #fef2f2; color: #dc2626; }
.risk-medium { background: #fffbeb; color: #d97706; }
.risk-low { background: #f0fdf4; color: #059669; }
.dual-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #999; text-align: center; }
.print-btn { position: fixed; top: 16px; right: 16px; background: #0C3547; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
.print-btn:hover { background: #1A6B8A; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">📄 Salvar como PDF</button>

<div class="header">
  <div>
    <h1>📊 Relatório Executivo Semanal</h1>
    <p style="font-size:10px;color:#666;margin-top:2px;">Análise financeira consolidada com projeções e recomendações estratégicas</p>
  </div>
  <div class="meta">
    <strong>BWILD Finance</strong><br>
    ${dateFormatted}<br>
    Gerado automaticamente
  </div>
</div>

<!-- KPIs -->
<div class="section">
  <div class="section-title">Indicadores Chave</div>
  <div class="kpi-grid">
    <div class="kpi ${balance >= 0 ? "success" : "danger"}">
      <div class="kpi-value">${fmt(balance)}</div>
      <div class="kpi-label">Saldo Atual</div>
    </div>
    <div class="kpi ${projectedBalance >= 0 ? "success" : "danger"}">
      <div class="kpi-value">${fmt(projectedBalance)}</div>
      <div class="kpi-label">Projeção 30d</div>
    </div>
    <div class="kpi ${runwayDays > 60 ? "success" : runwayDays > 30 ? "warning" : "danger"}">
      <div class="kpi-value">${runwayDays > 365 ? "+365" : runwayDays} dias</div>
      <div class="kpi-label">Runway</div>
    </div>
    <div class="kpi danger">
      <div class="kpi-value">${fmt(totalOverdueReceber)}</div>
      <div class="kpi-label">Atrasados Receber</div>
      <div class="kpi-sub">${overdueReceber.length} transações</div>
    </div>
    <div class="kpi">
      <div class="kpi-value">${activeObras.length}</div>
      <div class="kpi-label">Obras Ativas</div>
    </div>
  </div>
</div>

<!-- Cash Flow 7d vs 30d -->
<div class="section">
  <div class="section-title">Fluxo de Caixa</div>
  <div class="dual-grid">
    <div>
      <p style="font-size:10px;font-weight:700;margin-bottom:6px;">Próximos 7 dias</p>
      <div class="kpi-grid" style="grid-template-columns: 1fr 1fr;">
        <div class="kpi success"><div class="kpi-value" style="font-size:14px;">${fmt(totalUpReceber7)}</div><div class="kpi-label">Entradas (${upReceber7.length})</div></div>
        <div class="kpi danger"><div class="kpi-value" style="font-size:14px;">${fmt(totalUpPagar7)}</div><div class="kpi-label">Saídas (${upPagar7.length})</div></div>
      </div>
    </div>
    <div>
      <p style="font-size:10px;font-weight:700;margin-bottom:6px;">Próximos 30 dias</p>
      <div class="kpi-grid" style="grid-template-columns: 1fr 1fr;">
        <div class="kpi success"><div class="kpi-value" style="font-size:14px;">${fmt(totalUpReceber30)}</div><div class="kpi-label">Entradas (${upReceber30.length})</div></div>
        <div class="kpi danger"><div class="kpi-value" style="font-size:14px;">${fmt(totalUpPagar30)}</div><div class="kpi-label">Saídas (${upPagar30.length})</div></div>
      </div>
    </div>
  </div>
</div>

<!-- Weekly Projection -->
<div class="section">
  <div class="section-title">Projeção Semanal de Caixa</div>
  <table>
    <thead><tr><th>Semana</th><th style="text-align:right">Entradas</th><th style="text-align:right">Saídas</th><th style="text-align:right">Saldo Projetado</th><th>Tendência</th></tr></thead>
    <tbody>
      ${weeklyProjection.map((w) => `<tr>
        <td><strong>${w.week}</strong></td>
        <td style="text-align:right;color:#059669">${fmt(w.inflow)}</td>
        <td style="text-align:right;color:#dc2626">${fmt(w.outflow)}</td>
        <td style="text-align:right;font-weight:700;color:${w.balance >= 0 ? "#059669" : "#dc2626"}">${fmt(w.balance)}</td>
        <td>${w.balance >= balance ? "📈" : "📉"} ${w.inflow > w.outflow ? "Positivo" : "Negativo"}</td>
      </tr>`).join("")}
    </tbody>
  </table>
</div>

<!-- Obras -->
${obraSummaries.length > 0 ? `
<div class="section">
  <div class="section-title">Performance por Obra</div>
  <table>
    <thead><tr><th>Obra</th><th>Cliente</th><th style="text-align:right">Contrato</th><th style="text-align:right">Recebido</th><th style="text-align:right">Custos</th><th style="text-align:center">Margem</th><th style="text-align:center">Receb.</th><th>Atrasos</th></tr></thead>
    <tbody>
      ${obraSummaries.map((o: any) => `<tr>
        <td><strong>${o.code}</strong></td>
        <td>${o.client}</td>
        <td style="text-align:right">${fmt(o.contractValue)}</td>
        <td style="text-align:right;color:#059669">${fmt(o.received)}</td>
        <td style="text-align:right;color:#dc2626">${fmt(o.paidCosts)}</td>
        <td style="text-align:center"><span class="risk-badge ${o.margin >= 20 ? "risk-low" : o.margin >= 10 ? "risk-medium" : "risk-high"}">${o.margin}%</span></td>
        <td style="text-align:center">
          <div class="bar-container"><div class="bar-fill" style="width:${Math.min(o.receivedPct, 100)}%;background:${o.receivedPct >= 50 ? "#059669" : "#d97706"};"></div></div>
          <span style="font-size:8px;color:#666">${o.receivedPct}%</span>
        </td>
        <td>${o.overdueCount > 0 ? `<span class="risk-badge risk-high">${o.overdueCount} (${fmt(o.overdueAmount)})</span>` : '<span class="risk-badge risk-low">OK</span>'}</td>
      </tr>`).join("")}
    </tbody>
  </table>
</div>` : ""}

<!-- Counterpart Risk -->
${topRisks.length > 0 ? `
<div class="section">
  <div class="section-title">Risco por Contraparte</div>
  <table>
    <thead><tr><th>Contraparte</th><th style="text-align:right">Volume Total</th><th style="text-align:right">Em Atraso</th><th style="text-align:center">Concentração</th><th style="text-align:center">Risco</th></tr></thead>
    <tbody>
      ${topRisks.map((r) => {
        const riskLevel = r.overdueAmt > 0 && r.concentration > 20 ? "high" : r.overdueAmt > 0 ? "medium" : "low";
        return `<tr>
          <td><strong>${r.name}</strong></td>
          <td style="text-align:right">${fmt(r.total)}</td>
          <td style="text-align:right;color:#dc2626">${fmt(r.overdueAmt)} (${r.overdue})</td>
          <td style="text-align:center">${r.concentration}%</td>
          <td style="text-align:center"><span class="risk-badge risk-${riskLevel}">${riskLevel === "high" ? "Alto" : riskLevel === "medium" ? "Médio" : "Baixo"}</span></td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>
</div>` : ""}

<!-- Negotiations -->
${(activeNegs.length > 0 || closedNegs.length > 0) ? `
<div class="section">
  <div class="section-title">Negociações</div>
  <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="kpi warning"><div class="kpi-value" style="font-size:14px;">${activeNegs.length}</div><div class="kpi-label">Em Andamento</div></div>
    <div class="kpi success"><div class="kpi-value" style="font-size:14px;">${closedNegs.length}</div><div class="kpi-label">Acordos Fechados</div></div>
    <div class="kpi success"><div class="kpi-value" style="font-size:14px;">${fmt(negSavings)}</div><div class="kpi-label">Economia Total</div></div>
  </div>
</div>` : ""}

<!-- AI Analysis -->
${Object.keys(aiSections).length > 0 ? `
<div class="page-break"></div>
<div class="section">
  <div class="section-title">🤖 Análise Estratégica (IA)</div>
  ${aiSections["RESUMO EXECUTIVO"] ? `<div class="ai-section"><h4>Resumo Executivo</h4><p>${aiSections["RESUMO EXECUTIVO"].replace(/\n/g, "<br>")}</p></div>` : ""}
  ${aiSections["ALERTAS CRÍTICOS"] ? `<div class="ai-section" style="border-color:#fecaca;background:#fef2f2;"><h4>⚠️ Alertas Críticos</h4><p>${aiSections["ALERTAS CRÍTICOS"].replace(/\n/g, "<br>")}</p></div>` : ""}
  ${aiSections["AÇÕES RECOMENDADAS"] ? `<div class="ai-section" style="border-color:#bbf7d0;background:#f0fdf4;"><h4>✅ Ações Recomendadas</h4><p>${aiSections["AÇÕES RECOMENDADAS"].replace(/\n/g, "<br>")}</p></div>` : ""}
  ${aiSections["PROJEÇÃO 4 SEMANAS"] ? `<div class="ai-section"><h4>📈 Projeção 4 Semanas</h4><p>${aiSections["PROJEÇÃO 4 SEMANAS"].replace(/\n/g, "<br>")}</p></div>` : ""}
  ${aiSections["OPORTUNIDADES"] ? `<div class="ai-section" style="border-color:#c4b5fd;background:#f5f3ff;"><h4>💡 Oportunidades</h4><p>${aiSections["OPORTUNIDADES"].replace(/\n/g, "<br>")}</p></div>` : ""}
</div>` : (aiAnalysis ? `
<div class="page-break"></div>
<div class="section">
  <div class="section-title">🤖 Análise Estratégica (IA)</div>
  <div class="ai-section"><p>${aiAnalysis.replace(/\n/g, "<br>")}</p></div>
</div>` : "")}

<div class="footer">
  Relatório gerado automaticamente pelo BWILD Finance · ${new Date().toLocaleString("pt-BR")} · Dados sujeitos a atualização em tempo real
</div>
</body>
</html>`;

    return new Response(JSON.stringify({
      html,
      summary: { balance, projectedBalance, runwayDays, totalUpPagar30, totalUpReceber30, totalOverduePagar, totalOverdueReceber, obrasCount: activeObras.length },
    }), {
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
