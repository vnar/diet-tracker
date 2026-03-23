"use client";

import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [mood, setMood] = useState<string | null>(null);

  function handleSend() {
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setOpen(false);
      setMood(null);
    }, 2000);
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
            <>
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

              <textarea
                rows={2}
                placeholder="What could be better?"
                className="mb-2.5 w-full resize-none rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />

              <button
                onClick={handleSend}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2 text-xs font-semibold text-white transition-all hover:bg-emerald-400 active:scale-[0.98]"
                type="button"
              >
                <Send size={11} />
                Send
              </button>
            </>
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
