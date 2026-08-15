import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { BrandLogo } from "../components/BrandLogo";
import {
  ArrowRight,
  CircleNotch as Loader2,
  WarningCircle as AlertCircle,
  TreeStructure,
  Truck,
  Users,
  CurrencyInr,
  TelegramLogo,
  FileText,
  Calculator,
  FolderLock,
  Check,
  DeviceMobile,
  ChartLineUp,
  ShieldCheck,
  List,
  X,
  Lightning,
} from "@phosphor-icons/react";

interface LandingPageProps {
  isLoggingIn: boolean;
  onLogin: () => void;
  loginError?: string | null;
}

const features = [
  { icon: TreeStructure, title: "WBS & Scheduling", body: "Break projects into a work-breakdown structure with a live Gantt, dependencies and auto-shifting dates." },
  { icon: Truck, title: "Procurement & GRN", body: "Raise purchase orders, record goods receipts, and keep vendor ledgers and inventory in perfect step." },
  { icon: Users, title: "Labor Tracking", body: "Log daily manpower by trade and task, with rate cards, billing and per-task consumption rollups." },
  { icon: CurrencyInr, title: "Cost Management", body: "Track budgeted vs actual in real time, with CPI, forecasts and an AI-assisted cost analysis." },
  { icon: FileText, title: "Daily Logs & Reports", body: "Site diaries with progress, materials, labour and photos — exportable as clean PDF reports." },
  { icon: Calculator, title: "Client Estimates", body: "Build estimates, track change orders, and compare against your live budget at any moment." },
  { icon: FolderLock, title: "Document Vault", body: "Keep drawings, approvals and compliance docs organised and access-controlled per project." },
  { icon: ChartLineUp, title: "Portfolio View", body: "See every active project's health, completion and risk from one executive dashboard." },
];

const steps = [
  { n: "01", title: "Set up your project", body: "Create the workspace, add your WBS, tasks and team in minutes." },
  { n: "02", title: "Log from the field", body: "Site teams record progress, materials and labour — from the app or Telegram." },
  { n: "03", title: "Stay in control", body: "Watch cost, schedule and procurement update live across your whole portfolio." },
];

const plans = [
  {
    name: "Starter",
    price: "Free",
    tag: "For a first project",
    features: ["1 active project", "Up to 3 users", "WBS & daily logs", "Basic reports"],
    highlight: false,
  },
  {
    name: "Pro",
    price: "₹2,999",
    per: "/ org / month",
    tag: "For growing contractors",
    features: ["Unlimited projects", "Unlimited users", "Telegram field logging", "Procurement, labor & cost", "AI cost analysis", "Client estimates"],
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    tag: "For multi-site firms",
    features: ["Everything in Pro", "SSO & advanced roles", "Document vault", "Priority support", "Dedicated onboarding"],
    highlight: false,
  },
];

// Rotating end-phrase for the hero headline. Placed on its own line so the
// changing width never shifts surrounding text.
const HERO_PHRASES = ["on schedule.", "in budget.", "under control.", "in real time.", "from your phone."];
const RotatingPhrase: React.FC = () => {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % HERO_PHRASES.length), 2400);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="relative inline-block text-primary align-top" style={{ minHeight: "1.1em" }}>
      <AnimatePresence mode="wait">
        <motion.span
          key={i}
          initial={{ y: "0.5em", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-0.5em", opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
          className="inline-block"
        >
          {HERO_PHRASES[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({ isLoggingIn, onLogin, loginError }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const CTA = ({ label, className = "", full = false }: { label: string; className?: string; full?: boolean }) => (
    <button
      onClick={onLogin}
      disabled={isLoggingIn}
      className={`inline-flex items-center justify-center gap-2 font-bold apple-transition active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${full ? "w-full" : ""} ${className}`}
    >
      {isLoggingIn ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" /> Connecting…
        </>
      ) : (
        <>
          {label} <ArrowRight weight="bold" className="w-4 h-4" />
        </>
      )}
    </button>
  );

  return (
    <div className="min-h-[100dvh] bg-page text-ink font-sans overflow-x-hidden">
      {/* NAV */}
      <header className="sticky top-0 z-50 bg-page/80 backdrop-blur-md border-b border-divider/60">
        <nav className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandLogo className="w-9 h-9 rounded-xl" />
            <span className="font-brand font-bold text-xl tracking-tight">Sitetru</span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-ink-muted">
            <a href="#features" className="hover:text-ink apple-transition">Features</a>
            <a href="#telegram" className="hover:text-ink apple-transition">Field logging</a>
            <a href="#pricing" className="hover:text-ink apple-transition">Pricing</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={onLogin} disabled={isLoggingIn} className="text-sm font-bold text-ink hover:text-primary apple-transition disabled:opacity-60">
              Sign in
            </button>
            <CTA label="Get started" className="bg-primary text-white text-sm px-5 py-2.5 rounded-xl hover:bg-[#B85F3B] shadow-lg shadow-primary/20" />
          </div>

          <button className="md:hidden p-2 -mr-2 text-ink" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
            {menuOpen ? <X className="w-6 h-6" /> : <List className="w-6 h-6" />}
          </button>
        </nav>

        {menuOpen && (
          <div className="md:hidden border-t border-divider/60 bg-page px-5 py-4 flex flex-col gap-3">
            <a href="#features" onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-ink-muted py-1">Features</a>
            <a href="#telegram" onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-ink-muted py-1">Field logging</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-ink-muted py-1">Pricing</a>
            <CTA label="Get started" full className="bg-primary text-white text-sm px-5 py-3 rounded-xl mt-1" />
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-14 md:pt-24 pb-16 md:pb-24 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
        {/* Animated aurora backdrop (motion-safe via global MotionConfig) */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
          <motion.div
            className="absolute -top-24 -left-10 w-[420px] h-[420px] rounded-full bg-primary/25 blur-3xl"
            animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
            transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute top-10 right-0 w-[380px] h-[380px] rounded-full bg-sage/25 blur-3xl"
            animate={{ x: [0, -30, 0], y: [0, 40, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2 bg-sage/15 text-[#3E8388] px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest mb-6">
            <Lightning weight="fill" className="w-3.5 h-3.5" /> Built for construction teams
          </div>
          <h1 className="font-display font-bold text-[42px] leading-[1.05] sm:text-6xl tracking-tight mb-6">
            Run your whole site,<br />
            <RotatingPhrase />
          </h1>
          <p className="text-lg text-ink-muted font-medium leading-relaxed max-w-lg mb-8">
            Schedule, procurement, labor, cost and daily progress — connected in real time, with field logging as simple as a Telegram message.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <CTA label="Get started free" className="bg-primary text-white text-base px-7 py-4 rounded-2xl hover:bg-[#B85F3B] shadow-xl shadow-primary/20" />
            <a href="#features" className="inline-flex items-center justify-center gap-2 font-bold text-base px-7 py-4 rounded-2xl bg-panel border border-divider text-ink hover:bg-surface apple-transition">
              See features
            </a>
          </div>
          {loginError && (
            <div className="mt-6 flex items-start gap-3 text-[13px] font-medium text-danger bg-danger/10 p-3 rounded-xl border border-danger/20 max-w-md">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{loginError}</p>
            </div>
          )}
          <div className="mt-8 flex items-center gap-2 text-xs font-semibold text-ink-muted">
            <ShieldCheck weight="duotone" className="w-4 h-4 text-success" /> Secure Google sign-in · No credit card to start
          </div>
        </motion.div>

        {/* App preview mockup */}
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.1 }} className="relative">
          <div className="soft-card rounded-[28px] p-5 md:p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="font-display font-bold text-lg tracking-tight">Ramkumar-Othakadai</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Control Center</p>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#3E8388] bg-[#87BCBF]/15 px-3 py-1.5 rounded-full">Active</span>
            </div>

            <div className="bg-surface-dark rounded-2xl p-5 text-white mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold">Substructure</span>
                <span className="text-xs font-mono">98%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full w-[98%] bg-primary rounded-full" />
              </div>
              <div className="flex items-center gap-2 mt-3 text-success text-xs font-bold">
                <Check weight="bold" className="w-4 h-4" /> On track
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="soft-card rounded-2xl p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-ink-muted">Cost (Actual)</p>
                <p className="font-mono font-bold text-lg">₹24.8L</p>
              </div>
              <div className="soft-card rounded-2xl p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-ink-muted">Manpower</p>
                <p className="font-mono font-bold text-lg">42</p>
              </div>
            </div>

            <div className="bg-[#6E8CA0]/10 rounded-2xl p-3 flex items-start gap-3">
              <div className="bg-[#229ED9] w-8 h-8 rounded-xl flex items-center justify-center shrink-0">
                <TelegramLogo weight="fill" className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold">Excavation — 80% ✅</p>
                <p className="text-[11px] text-ink-muted">Logged via Telegram · 2 min ago</p>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* FEATURES */}
      <section id="features" className="max-w-6xl mx-auto px-5 sm:px-8 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">Everything a project needs, in one workspace</h2>
          <p className="text-ink-muted font-medium">Stop stitching together spreadsheets, WhatsApp groups and paper diaries. Sitetru connects the whole site.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f) => (
            <div key={f.title} className="soft-card rounded-3xl p-6">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <f.icon weight="duotone" className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg tracking-tight mb-2">{f.title}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TELEGRAM HIGHLIGHT */}
      <section id="telegram" className="max-w-6xl mx-auto px-5 sm:px-8 py-8 md:py-16">
        <div className="bg-surface-dark rounded-[32px] p-8 md:p-14 grid lg:grid-cols-2 gap-10 items-center overflow-hidden">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/10 text-white px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest mb-6">
              <DeviceMobile weight="duotone" className="w-4 h-4" /> The differentiator
            </div>
            <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight text-white mb-4">
              Your site team already has Telegram. That's all they need.
            </h2>
            <p className="text-white/70 font-medium leading-relaxed mb-8">
              No app to train the crew on. Foremen log progress, materials, labour and photos straight from a chat — and it lands live in your dashboards, cost sheets and inventory.
            </p>
            <CTA label="Get started free" className="bg-primary text-white text-base px-7 py-4 rounded-2xl hover:bg-[#B85F3B]" />
          </div>
          <div className="space-y-3">
            {[
              { t: "/log", s: "Start a progress update" },
              { t: "Excavation → 80%", s: "Pick a task, set progress" },
              { t: "📦 Cement · 50 bags", s: "Add materials & labour" },
              { t: "✅ Logged", s: "Synced to cost, WBS & inventory" },
            ].map((m, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="bg-[#229ED9] w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                  <TelegramLogo weight="fill" className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{m.t}</p>
                  <p className="text-[11px] text-white/50">{m.s}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-16 md:py-24">
        <div className="text-center mb-14">
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">Up and running in a day</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div key={s.n} className="soft-card rounded-3xl p-8">
              <p className="font-display font-bold text-4xl text-primary/30 mb-4">{s.n}</p>
              <h3 className="font-bold text-lg mb-2">{s.title}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="max-w-6xl mx-auto px-5 sm:px-8 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">Simple pricing that grows with you</h2>
          <p className="text-ink-muted font-medium">Start free. Upgrade when your projects do.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {plans.map((p) => (
            <div key={p.name} className={`rounded-3xl p-8 ${p.highlight ? "bg-surface-dark text-white shadow-2xl shadow-drab/20 md:-mt-4 md:pb-12" : "soft-card"}`}>
              {p.highlight && <span className="inline-block text-[10px] font-black uppercase tracking-widest bg-primary text-white px-3 py-1 rounded-full mb-4">Most popular</span>}
              <p className={`text-sm font-black uppercase tracking-widest mb-2 ${p.highlight ? "text-white/60" : "text-ink-muted"}`}>{p.name}</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="font-display font-bold text-4xl tracking-tight">{p.price}</span>
                {p.per && <span className={`text-sm font-medium mb-1.5 ${p.highlight ? "text-white/60" : "text-ink-muted"}`}>{p.per}</span>}
              </div>
              <p className={`text-xs font-semibold mb-6 ${p.highlight ? "text-white/50" : "text-ink-muted"}`}>{p.tag}</p>
              <ul className="space-y-3 mb-8">
                {p.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2.5 text-sm">
                    <Check weight="bold" className={`w-4 h-4 mt-0.5 shrink-0 ${p.highlight ? "text-success" : "text-success"}`} />
                    <span className={p.highlight ? "text-white/90" : "text-ink"}>{feat}</span>
                  </li>
                ))}
              </ul>
              <CTA
                label={p.name === "Enterprise" ? "Contact us" : "Get started"}
                full
                className={`text-sm py-3.5 rounded-2xl ${p.highlight ? "bg-primary text-white hover:bg-[#B85F3B]" : "bg-panel border border-divider text-ink hover:bg-surface"}`}
              />
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-ink-muted mt-8">Prices in INR, exclusive of GST. Enterprise billing is custom.</p>
      </section>

      {/* FINAL CTA */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pb-20">
        <div className="soft-card rounded-[32px] p-10 md:p-16 text-center">
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">Bring your next project under control</h2>
          <p className="text-ink-muted font-medium max-w-lg mx-auto mb-8">Set up your first workspace free — no card required.</p>
          <div className="flex justify-center">
            <CTA label="Get started free" className="bg-primary text-white text-base px-8 py-4 rounded-2xl hover:bg-[#B85F3B] shadow-xl shadow-primary/20" />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-divider/60">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <BrandLogo className="w-8 h-8 rounded-lg" />
            <span className="font-brand font-bold tracking-tight">Sitetru</span>
          </div>
          <p className="text-xs text-ink-muted">© {new Date().getFullYear()} Sitetru · Truth, reported from site.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
