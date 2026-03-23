import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Bot, User, Loader2, Zap, RotateCcw, Globe, History, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  actionsExecuted?: string[];
  timestamp: Date;
}

interface ConversationSummary {
  conversation_id: string;
  first_message: string;
  last_at: string;
  count: number;
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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open && inputRef.current && !showHistory) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open, showHistory]);

  // Load conversations list
  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('conversation_id, content, created_at, role')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!data) { setConversations([]); return; }

      const grouped = new Map<string, { first: string; last: string; count: number }>();
      // data is ordered desc, so first occurrence per conv is the latest
      for (const row of data) {
        const existing = grouped.get(row.conversation_id);
        if (!existing) {
          grouped.set(row.conversation_id, { first: '', last: row.created_at, count: 1 });
        } else {
          existing.count++;
        }
      }
      // Get first user message per conversation
      for (const row of [...data].reverse()) {
        if (row.role === 'user') {
          const g = grouped.get(row.conversation_id);
          if (g && !g.first) g.first = row.content;
        }
      }

      const list: ConversationSummary[] = [];
      grouped.forEach((v, k) => {
        list.push({ conversation_id: k, first_message: v.first || 'Conversa', last_at: v.last, count: v.count });
      });
      list.sort((a, b) => b.last_at.localeCompare(a.last_at));
      setConversations(list);
    } catch (e) {
      console.error('Error loading conversations:', e);
    } finally {
      setLoadingHistory(false);
    }
  }, [user]);

  // Load a specific conversation
  const loadConversation = useCallback(async (convId: string) => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', user.id)
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (data) {
        setMessages(data.map(row => ({
          role: row.role as 'user' | 'assistant',
          content: row.content,
          actionsExecuted: row.actions_executed?.length ? row.actions_executed : undefined,
          timestamp: new Date(row.created_at),
        })));
        setConversationId(convId);
      }
      setShowHistory(false);
    } catch (e) {
      console.error('Error loading conversation:', e);
    }
  }, [user]);

  // Delete a conversation
  const deleteConversation = useCallback(async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await supabase
        .from('chat_messages')
        .delete()
        .eq('user_id', user.id)
        .eq('conversation_id', convId);
      setConversations(prev => prev.filter(c => c.conversation_id !== convId));
      if (conversationId === convId) {
        setMessages([]);
        setConversationId(null);
      }
      toast.success('Conversa excluída');
    } catch (e) {
      console.error('Error deleting conversation:', e);
    }
  }, [user, conversationId]);

  // Save a message to DB
  const saveMessage = useCallback(async (msg: Message, convId: string) => {
    if (!user) return;
    try {
      await supabase.from('chat_messages').insert({
        user_id: user.id,
        conversation_id: convId,
        role: msg.role,
        content: msg.content,
        actions_executed: msg.actionsExecuted || [],
      });
    } catch (e) {
      console.error('Error saving message:', e);
    }
  }, [user]);

  // Start new conversation
  const startNewConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    // Generate conversation ID if new
    const convId = conversationId || crypto.randomUUID();
    if (!conversationId) setConversationId(convId);

    const userMsg: Message = { role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setSearchingWeb(false);

    // Save user message
    saveMessage(userMsg, convId);

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

      // Save assistant message
      if (assistantContent) {
        saveMessage({
          role: 'assistant',
          content: assistantContent,
          actionsExecuted: actionsExecuted.length > 0 ? actionsExecuted : undefined,
          timestamp: new Date(),
        }, convId);
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
      const errMessage: Message = { role: 'assistant', content: `⚠️ ${errMsg}`, timestamp: new Date() };
      setMessages(prev => [...prev, errMessage]);
      saveMessage(errMessage, convId);
    } finally {
      setLoading(false);
      setSearchingWeb(false);
    }
  }, [messages, loading, queryClient, conversationId, saveMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleOpenHistory = () => {
    setShowHistory(true);
    loadConversations();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d atrás`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
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
            className="fixed z-50 bg-card border shadow-2xl flex flex-col overflow-hidden bottom-0 left-0 right-0 top-0 lg:bottom-6 lg:right-6 lg:left-auto lg:top-auto lg:w-[400px] lg:max-w-[calc(100vw-2rem)] lg:h-[600px] lg:max-h-[calc(100vh-6rem)] lg:rounded-2xl"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b bg-gradient-to-r from-primary/5 to-accent/5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Assistente BWILD</h3>
                  <p className="text-[10px] text-muted-foreground">
                    {showHistory ? 'Histórico de conversas' : 'Comandos em linguagem natural'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!showHistory && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={handleOpenHistory}
                      title="Histórico"
                    >
                      <History className="w-3.5 h-3.5" />
                    </Button>
                    {messages.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={startNewConversation}
                        title="Nova conversa"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </>
                )}
                {showHistory && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowHistory(false)}
                    title="Voltar"
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

            {/* History view */}
            {showHistory ? (
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="text-center py-12">
                    <History className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Nenhuma conversa salva</p>
                  </div>
                ) : (
                  conversations.map(conv => (
                    <button
                      key={conv.conversation_id}
                      onClick={() => loadConversation(conv.conversation_id)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg border hover:border-primary/30 hover:bg-primary/5 transition-colors group/item",
                        conversationId === conv.conversation_id ? 'border-primary/30 bg-primary/5' : 'border-border'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium truncate flex-1">{conv.first_message}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover/item:opacity-100 transition-opacity text-muted-foreground hover:text-destructive flex-shrink-0"
                          onClick={(e) => deleteConversation(conv.conversation_id, e)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground">{conv.count} msgs</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground">{formatDate(conv.last_at)}</span>
                      </div>
                    </button>
                  ))
                )}
                <button
                  onClick={startNewConversation}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-dashed border-border hover:border-primary/30 hover:bg-primary/5 transition-colors flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nova conversa
                </button>
              </div>
            ) : (
              <>
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
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
