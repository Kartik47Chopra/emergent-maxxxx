import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChatCircle, X, PaperPlaneRight, Sparkle } from "@phosphor-icons/react";
import { API } from "@/lib/api";

const SUGGESTIONS = [
  "Which doors are stuck at press?",
  "Any QC failures today?",
  "Summarise progress per floor",
  "What should the core station cut next?",
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useQuery({
    queryKey: ["chat-history"],
    queryFn: () => fetch(`${API}/chat/history`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])),
    enabled: open,
    onSuccess: (data) => setMessages(data),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setBusy(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok || !res.body) throw new Error("chat failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const p of parts) {
          const line = p.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const { t } = JSON.parse(payload);
            if (t) setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + t };
              return copy;
            });
          } catch {}
        }
      }
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: "Connection issue — try again in a moment." };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        data-testid="chat-open-btn"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 bg-ember text-black flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.35)] hover:bg-amber-600 transition-colors"
        title="MAXX AI Assistant"
      >
        {open ? <X size={26} weight="bold" /> : <ChatCircle size={26} weight="fill" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[92vw] max-w-md border border-white/15 bg-carbon flex flex-col h-[560px] max-h-[70vh]" data-testid="chat-panel">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
            <Sparkle size={20} weight="fill" className="text-ember" />
            <div>
              <p className="font-display font-extrabold tracking-tight leading-tight">MAXX AI</p>
              <p className="font-mono text-[9px] tracking-[0.25em] text-zinc-500">LIVE PRODUCTION DATA · ALWAYS ON</p>
            </div>
            <div className="ml-auto w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="chat-messages">
            {!messages.length && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">
                  Ask me anything about the factory floor — I can see every door, stage and QC result live.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} data-testid={`chat-suggestion-${s.slice(0, 12).replace(/\W+/g, "-").toLowerCase()}`}
                      onClick={() => send(s)}
                      className="font-mono text-[10px] tracking-wide border border-ember/40 text-ember px-3 py-2 hover:bg-ember/10 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === "user" ? "bg-ember text-black font-medium" : "bg-black/50 border border-white/10 text-zinc-200"
                }`}>
                  {m.content || (busy && i === messages.length - 1 ? <span className="font-mono text-xs text-ember animate-pulse">THINKING...</span> : "")}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 p-3 flex gap-2 shrink-0">
            <input
              data-testid="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask about any door, floor or stage..."
              className="flex-1 h-12 bg-black/50 border border-white/15 px-3 text-sm focus:outline-none focus:border-ember transition-colors"
            />
            <button data-testid="chat-send-btn" onClick={() => send()} disabled={busy || !input.trim()}
              className="h-12 w-12 bg-ember text-black flex items-center justify-center hover:bg-amber-600 transition-colors disabled:opacity-40">
              <PaperPlaneRight size={20} weight="fill" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
