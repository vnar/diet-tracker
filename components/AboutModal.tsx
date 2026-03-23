"use client";

import { useEffect, useState, type ElementType, type ReactNode } from "react";
import {
  Activity,
  Circle,
  Database,
  GitBranch,
  Globe,
  HardDrive,
  Lock,
  Server,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type Tab = "problem" | "features" | "architecture" | "tech";

function Section({
  color,
  label,
  children,
}: {
  color: "rose" | "emerald" | "blue";
  label: string;
  children: ReactNode;
}) {
  const bar = {
    rose: "bg-rose-500",
    emerald: "bg-emerald-500",
    blue: "bg-blue-500",
  }[color];

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className={`h-4 w-1 rounded-full ${bar}`} />
        <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function CheckIcon() {
  return (
    <div className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/15">
      <svg
        width="8"
        height="8"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#10b981"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  );
}

function ArchNode({
  color,
  icon: Icon,
  label,
}: {
  color: string;
  icon: ElementType;
  label: string;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[10px] font-medium ${color}`}
    >
      <Icon size={10} />
      {label}
    </div>
  );
}

function ProblemTab() {
  return (
    <div className="space-y-5">
      <Section color="rose" label="Problem Statement">
        <p className="leading-relaxed text-zinc-300 sm:text-sm">
          Most people tracking their weight make emotional decisions based on{" "}
          <strong className="font-medium text-zinc-100">noise masquerading as signal</strong>.
          A +0.8 kg morning reading triggers panic, but that number is almost never fat.
        </p>
        <p className="mt-2 leading-relaxed text-zinc-400 sm:text-sm">
          Without context, daily scale changes can be misleading. Ojas-Health frames the data so
          trend and behavior are clearer than short-term fluctuation.
        </p>
      </Section>

      <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 p-4">
        <Section color="emerald" label="Business Need">
          <ul className="space-y-2.5">
            {[
              "Separate signal from noise using trend-aware visuals.",
              "Contextual insights before users react emotionally.",
              "Fast daily logging that remains sustainable over months.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <CheckIcon />
                <p className="text-xs leading-relaxed text-zinc-300">{item}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section color="blue" label="Who It's For">
        <p className="leading-relaxed text-zinc-400 sm:text-sm">
          People pursuing fat loss or body recomposition who want calm, data-backed guidance.
        </p>
      </Section>
    </div>
  );
}

function FeaturesTab() {
  const features = [
    { title: "Daily Log", description: "Morning/night weight, nutrition, steps, sleep, and habit flags." },
    { title: "AI Insights", description: "Rule-based explanations for spikes from sodium, sleep, and routines." },
    { title: "Weight Trend", description: "Daily values and moving average to reduce decision noise." },
    { title: "Progress Photos", description: "S3-backed visual timeline for body-composition context." },
    { title: "Goal Tracking", description: "Start-to-goal progress and target-date awareness." },
    { title: "42-Day Calendar", description: "Visual history with quick access to prior days." },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {features.map((feature) => (
          <div key={feature.title} className="rounded-xl border border-zinc-800 bg-zinc-800/40 p-3.5">
            <p className="mb-2 text-xs font-semibold text-zinc-200">{feature.title}</p>
            <p className="text-[11px] leading-relaxed text-zinc-500">{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-zinc-700 p-3.5">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-zinc-600">Coming Soon</p>
        <div className="flex flex-wrap gap-1.5">
          {["Freeform Notes", "Data Export (CSV)", "Weekly Email Summary", "Apple Health Sync"].map((tag) => (
            <span key={tag} className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] text-zinc-500">
              {tag}
            </span>
          ))}
        </div>
      </div>
      {/* <FreeformWidget /> — coming soon */}
    </div>
  );
}

function ArchitectureTab() {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="space-y-5">
          <div>
            <p className="mb-3 text-[9px] uppercase tracking-widest text-zinc-600">CI / CD Pipeline</p>
            <div className="flex flex-wrap items-center gap-2">
              <ArchNode color="border-zinc-700 bg-zinc-900 text-zinc-300" icon={GitBranch} label="GitHub" />
              <span className="text-xs text-zinc-700">→</span>
              <ArchNode color="border-orange-800/50 bg-orange-950/40 text-orange-300" icon={Zap} label="Amplify CI/CD" />
              <span className="text-xs text-zinc-700">→</span>
              <ArchNode color="border-orange-800/50 bg-orange-950/40 text-orange-300" icon={Globe} label="Amplify Hosting" />
              <span className="text-xs text-zinc-700">→</span>
              <ArchNode color="border-zinc-600 bg-zinc-800 text-zinc-200" icon={Activity} label="Next.js App" />
            </div>
          </div>

          <div>
            <p className="mb-3 text-[9px] uppercase tracking-widest text-zinc-600">User Request Flow</p>
            <div className="flex flex-wrap items-center gap-2">
              <ArchNode color="border-zinc-700 bg-zinc-900 text-zinc-400" icon={Circle} label="User" />
              <span className="text-xs text-zinc-700">→</span>
              <ArchNode color="border-red-800/50 bg-red-950/40 text-red-300" icon={Lock} label="Cognito Auth" />
              <span className="text-xs text-zinc-700">→</span>
              <ArchNode color="border-pink-800/50 bg-pink-950/40 text-pink-300" icon={Globe} label="API Gateway" />
              <span className="text-xs text-zinc-700">→</span>
              <ArchNode color="border-orange-700/50 bg-orange-950/40 text-orange-300" icon={Server} label="Lambda" />
            </div>
          </div>

          <div>
            <p className="mb-3 text-[9px] uppercase tracking-widest text-zinc-600">Storage Layer</p>
            <div className="flex flex-wrap items-center gap-2">
              <ArchNode color="border-blue-800/50 bg-blue-950/40 text-blue-300" icon={Database} label="DynamoDB Entries" />
              <ArchNode color="border-blue-800/50 bg-blue-950/40 text-blue-300" icon={Database} label="DynamoDB Settings" />
              <ArchNode color="border-green-800/50 bg-green-950/40 text-green-300" icon={HardDrive} label="S3 Photos" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[
          "Serverless by default: scale to zero and pay per request.",
          "JWT auth via Cognito: stateless and reliable for edge-hosted UI.",
          "Split tables for entries/settings keeps access patterns simple.",
          "Presigned S3 uploads avoid Lambda payload bottlenecks.",
        ].map((decision) => (
          <div key={decision} className="flex items-start gap-2 rounded-lg bg-zinc-800/30 p-2.5">
            <Circle size={6} className="mt-1.5 flex-shrink-0 fill-emerald-500 text-emerald-500" />
            <p className="text-[11px] text-zinc-400">{decision}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TechTab() {
  const frontend = ["Next.js", "TypeScript", "Tailwind CSS", "Recharts", "Framer Motion", "Lucide", "Zustand"];
  const backend = ["Lambda (Node.js)", "API Gateway (HTTP)", "DynamoDB (Entries + Settings)", "S3"];
  const deploy = ["Cognito", "Amplify Hosting", "GitHub", "CDK / Amplify CLI"];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-800/30 p-4">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-zinc-500">Frontend</p>
        <div className="flex flex-wrap gap-2">
          {frontend.map((item) => (
            <span key={item} className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300">
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-800/30 p-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-zinc-500">Backend (AWS)</p>
          <div className="space-y-1.5">
            {backend.map((item) => (
              <p key={item} className="text-xs text-zinc-400">• {item}</p>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-800/30 p-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-zinc-500">Auth & Deploy</p>
          <div className="space-y-1.5">
            {deploy.map((item) => (
              <p key={item} className="text-xs text-zinc-400">• {item}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AboutModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("problem");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.99 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-800 px-6 pb-4 pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500">
                <Activity size={13} className="text-white" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-zinc-100">About Ojas-Health</h2>
                <p className="text-[10px] text-zinc-500">Daily Awareness Dashboard · v1.0.0</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 text-zinc-500 transition-all hover:bg-zinc-700 hover:text-zinc-200"
              aria-label="Close about modal"
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex flex-shrink-0 gap-1 px-6 pb-0 pt-3">
            {(["problem", "features", "architecture", "tech"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                  tab === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                }`}
              >
                {t === "tech" ? "Tech Stack" : t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {tab === "problem" && <ProblemTab />}
            {tab === "features" && <FeaturesTab />}
            {tab === "architecture" && <ArchitectureTab />}
            {tab === "tech" && <TechTab />}
          </div>

          <div className="flex flex-shrink-0 items-center justify-between border-t border-zinc-800 px-6 py-3.5">
            <p className="text-[10px] text-zinc-600">
              Built by{" "}
              <a
                href="https://linkedin.com/in/viharnar"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 underline underline-offset-2 transition-colors hover:text-zinc-300"
              >
                Vihar Nar
              </a>{" "}
              · Open to feedback
            </p>
            <button
              onClick={onClose}
              className="h-7 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-xs text-zinc-400 transition-all hover:bg-zinc-700 hover:text-zinc-200"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

