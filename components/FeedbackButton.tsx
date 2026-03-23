"use client";

import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [mood, setMood] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const form = new FormData();
      form.append("email", email);
      form.append("message", message);
      if (mood) form.append("mood", mood);

      const res = await fetch("https://formspree.io/f/xyknryng", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: form,
      });

      if (!res.ok) {
        setError("Could not send feedback. Please try again.");
        return;
      }

      setSent(true);
      setEmail("");
      setMessage("");
      setMood(null);
      setTimeout(() => {
        setSent(false);
        setOpen(false);
      }, 2000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-20 right-5 z-50 flex flex-col items-end gap-2">
      {open ? (
        <div className="w-64 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/50">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-100">Send feedback</span>
            <button
              onClick={() => setOpen(false)}
              className="text-zinc-500 transition-colors hover:text-zinc-300"
              type="button"
            >
              <X size={13} />
            </button>
          </div>

          {sent ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="text-2xl">🙌</div>
              <p className="text-xs text-zinc-400">Thanks! Got it.</p>
            </div>
          ) : (
            <form
              action="https://formspree.io/f/xyknryng"
              method="POST"
              onSubmit={(e) => void handleSend(e)}
            >
              <div className="mb-3 flex gap-2">
                {["😍", "🙂", "😐", "😞"].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setMood(emoji)}
                    className={`flex-1 rounded-xl py-2 text-base transition-all hover:scale-110 active:scale-95 ${
                      mood === emoji
                        ? "bg-emerald-500/20 ring-1 ring-emerald-500/40"
                        : "bg-zinc-800 hover:bg-zinc-700"
                    }`}
                    type="button"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <input type="hidden" name="mood" value={mood ?? ""} />

              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Your email"
                className="mb-2.5 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />

              <textarea
                rows={2}
                name="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                placeholder="What could be better?"
                className="mb-2.5 w-full resize-none rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />

              {error ? <p className="mb-2 text-[11px] text-rose-400">{error}</p> : null}

              <button
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2 text-xs font-semibold text-white transition-all hover:bg-emerald-400 active:scale-[0.98]"
                type="submit"
                disabled={sending}
              >
                <Send size={11} />
                {sending ? "Sending..." : "Send"}
              </button>
            </form>
          )}
        </div>
      ) : null}

      <button
        onClick={() => setOpen(!open)}
        className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-400 shadow-xl shadow-black/40 transition-all duration-200 hover:scale-110 hover:border-zinc-500 hover:text-zinc-100 active:scale-95"
        type="button"
      >
        <div className="pointer-events-none absolute inset-0 animate-ping rounded-full border border-emerald-500/20 opacity-30" />
        <MessageCircle size={15} />
        <div className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
          Feedback
        </div>
      </button>
    </div>
  );
}
