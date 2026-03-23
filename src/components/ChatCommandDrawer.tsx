import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Bot, User, Loader2, Zap, RotateCcw, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  actionsExecuted?: string[];
  timestamp: Date;
}

const ACTION_LABELS: Record<string, string> = {
  confirm_transactions: 'Transações confirmadas',
  create_transaction: 'Transação criada',
  update_billing: 'Cobrança atualizada',
  update_transaction: 'Transação atualizada',
  analyze_scenario: 'Cenário analisado',
  cash_projection: 'Projeção gerada',
  obra_analysis: 'Análise de obra',
  executive_summary: 'Resumo executivo',
};

const SUGGESTIONS = [
  'Qual o saldo projetado para os próximos 30 dias?',
  'E se eu adiar os pagamentos desta semana por 15 dias?',
  'Qual obra tem maior risco financeiro?',
  'Faça um resumo executivo da semana',
  'Quais transações estão atrasadas?',
  'Compare a rentabilidade das obras ativas',
];

export default function ChatCommandDrawer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setSearchingWeb(false);

    try {
      const chatHistory = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-command`;

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: chatHistory }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${resp.status}`);
      }

      if (!resp.body) throw new Error('Sem resposta do servidor');

      // Stream SSE
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      let actionsExecuted: string[] = [];
      let assistantMsgCreated = false;

      const upsertAssistant = (content: string, actions?: string[]) => {
        assistantContent = content;
        setMessages(prev => {
          if (!assistantMsgCreated) {
            assistantMsgCreated = true;
            return [...prev, {
              role: 'assistant' as const,
              content,
              actionsExecuted: actions,
              timestamp: new Date(),
            }];
          }
          return prev.map((m, i) =>
            i === prev.length - 1 && m.role === 'assistant'
              ? { ...m, content, actionsExecuted: actions || m.actionsExecuted }
              : m
          );
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();

          try {
            const parsed = JSON.parse(jsonStr);

            if (parsed.type === 'tool_status' && parsed.tool === 'web_search') {
              setSearchingWeb(true);
            } else if (parsed.type === 'actions') {
              actionsExecuted = parsed.actions;
            } else if (parsed.type === 'delta') {
              setSearchingWeb(false);
              assistantContent += parsed.content;
              upsertAssistant(assistantContent, actionsExecuted.length > 0 ? actionsExecuted : undefined);
            } else if (parsed.type === 'done') {
              setSearchingWeb(false);
              // Ensure final state
              if (assistantContent) {
                upsertAssistant(assistantContent, actionsExecuted.length > 0 ? actionsExecuted : undefined);
              }
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      // Refresh UI if actions were executed
      if (actionsExecuted.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['cash_balance'] });
        queryClient.invalidateQueries({ queryKey: ['obras'] });
        toast.success('Ações executadas com sucesso', {
          description: actionsExecuted.map((a: string) => ACTION_LABELS[a] || a).join(', '),
        });
      }
    } catch (e) {
      console.error('Chat error:', e);
      const errMsg = e instanceof Error ? e.message : 'Erro ao processar comando';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ ${errMsg}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      setSearchingWeb(false);
    }
  }, [messages, loading, queryClient]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-24 lg:bottom-6 right-6 z-50 w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center group"
          >
            <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
            {messages.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent text-accent-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                {messages.filter(m => m.role === 'assistant').length}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-6rem)] bg-card border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b bg-gradient-to-r from-primary/5 to-accent/5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Assistente BWILD</h3>
                  <p className="text-[10px] text-muted-foreground">Comandos em linguagem natural</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setMessages([])}
                    title="Limpar conversa"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setOpen(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && !loading && (
                <div className="text-center py-8">
                  <Bot className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Como posso ajudar?
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mb-5">
                    Digite comandos em linguagem natural para gerenciar suas finanças
                  </p>
                  <div className="space-y-1.5">
                    {SUGGESTIONS.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(s)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-dashed border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-xs text-muted-foreground hover:text-foreground flex items-center gap-2"
                      >
                        <Zap className="w-3 h-3 text-accent flex-shrink-0" />
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn('flex gap-2.5', msg.role === 'user' ? 'flex-row-reverse' : '')}
                >
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                    msg.role === 'user' ? 'bg-primary' : 'bg-muted'
                  )}>
                    {msg.role === 'user'
                      ? <User className="w-3.5 h-3.5 text-primary-foreground" />
                      : <Bot className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                  <div className={cn(
                    'max-w-[80%] rounded-2xl px-3.5 py-2.5',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md'
                  )}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_li]:my-0.5">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-xs leading-relaxed">{msg.content}</p>
                    )}
                    {msg.actionsExecuted && msg.actionsExecuted.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2 pt-1.5 border-t border-border/20">
                        {msg.actionsExecuted.map((a, j) => (
                          <span key={j} className="text-[9px] font-medium bg-accent/10 text-accent px-1.5 py-0.5 rounded-full">
                            ✓ {ACTION_LABELS[a] || a}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-2.5"
                >
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      {searchingWeb && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="flex items-center gap-2"
                        >
                          <Globe className="w-3.5 h-3.5 text-primary animate-pulse" />
                          <span className="text-xs font-medium text-primary">Pesquisando na web...</span>
                        </motion.div>
                      )}
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {searchingWeb ? 'Analisando resultados...' : 'Processando...'}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="px-3 py-3 border-t bg-card flex-shrink-0">
              <div className="flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-1.5 border focus-within:border-primary/30 transition-colors">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ex: parcelas do cliente X foram pagas..."
                  className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none py-1.5"
                  disabled={loading}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={!input.trim() || loading}
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
