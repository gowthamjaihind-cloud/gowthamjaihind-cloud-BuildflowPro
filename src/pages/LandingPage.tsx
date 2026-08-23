import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "../i18n";
import { BrandLogo } from "../components/BrandLogo";
import { TERMS_URL, PRIVACY_URL, stashPendingConsent } from "../lib/legal";
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
  Buildings,
  RoadHorizon,
  HouseLine,
  ClipboardText,
  PaintRoller,
  FlowArrow,
  Sparkle,
  Stack,
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

const audience = [
  { icon: Buildings, title: "Building contractors", body: "Residential & commercial. Keep every site's schedule, cost and labour in one place." },
  { icon: RoadHorizon, title: "Civil & infrastructure", body: "Roads, water and structures. Track RA bills, GRNs and vendor ledgers without the paperwork." },
  { icon: HouseLine, title: "Developers & builders", body: "See the health of every project in your portfolio from one executive dashboard." },
  { icon: ClipboardText, title: "PMCs & consultants", body: "Run multiple clients' sites with role-based access and clean, exportable reports." },
  { icon: PaintRoller, title: "Interior & fit-out", body: "Manage procurement, labour and change orders on fast-moving jobs." },
];

const whySitetru = [
  { icon: TelegramLogo, title: "The field logs itself, over Telegram", body: "No app to train the crew on — foremen report progress, materials and labour from a chat, and it lands live in your dashboards." },
  { icon: FlowArrow, title: "Everything is connected", body: "Schedule, procurement, labour and cost update each other in real time. Change one, and the rest follows." },
  { icon: Sparkle, title: "AI that reads your paperwork", body: "Scan a vendor invoice and Sitetru matches it to the PO, flags rate and quantity discrepancies, and updates inventory." },
  { icon: CurrencyInr, title: "Made for Indian construction", body: "GST-aware invoices, INR costing, RA bills, GRNs and CGST/SGST/IGST — not a foreign tool bent to fit." },
  { icon: Stack, title: "One source of truth", body: "Replace five spreadsheets, three WhatsApp groups and a paper diary with a single workspace." },
];

const solutions = [
  { icon: TreeStructure, pain: "Schedule slipping?", fix: "Live WBS + Gantt with dependencies and auto-shifting dates." },
  { icon: ChartLineUp, pain: "Costs overrunning?", fix: "Budget vs. actual in real time, CPI, forecasts and AI cost analysis." },
  { icon: Truck, pain: "Procurement leaking?", fix: "POs, goods receipts, vendor ledgers and AI invoice-matching that keep inventory honest." },
  { icon: Users, pain: "Labour untracked?", fix: "Daily manpower by trade and task, rate cards and per-task consumption." },
  { icon: DeviceMobile, pain: "Blind to the site?", fix: "Daily logs with photos, a portfolio health view, and Telegram field updates." },
];

// Project-based pricing. You pay for the number of active projects you run;
// need more than your plan includes? Add extra projects at the overage rate.
// Prices in INR. Annual is billed yearly at ~2 months free (shown as an
// effective monthly rate). Free is permanent; Starter offers a 14-day free
// trial (upgrade to any plan anytime). `fixed` plans ignore the monthly/annual
// toggle.
const OVERAGE_RATE = 99;

const freePlan = {
  name: "Free",
  projects: "1 active project",
  features: ["1 active project", "Up to 2 users", "WBS & daily logs", "Telegram field logging"],
};

const plans = [
  {
    name: "Starter",
    projects: "Up to 5 projects",
    monthly: "₹999",
    annual: "₹832",
    annualTotal: "₹9,990 billed yearly",
    tag: "For small contractors",
    features: ["Up to 5 active projects", "10 users", "Procurement, labour & cost", "GRN & vendor ledgers", "150 AI invoice scans / mo"],
    cta: "Start 14-day trial",
    highlight: false,
  },
  {
    name: "Growth",
    projects: "Up to 10 projects",
    monthly: "₹1,799",
    annual: "₹1,499",
    annualTotal: "₹17,990 billed yearly",
    tag: "For growing firms",
    features: ["Up to 10 active projects", "25 users", "Everything in Starter", "AI cost analysis & insights", "400 AI invoice scans / mo"],
    cta: "Get started",
    highlight: true,
  },
  {
    name: "Business",
    projects: "Up to 20 projects",
    monthly: "₹2,999",
    annual: "₹2,499",
    annualTotal: "₹29,990 billed yearly",
    tag: "For established firms",
    features: ["Up to 20 active projects", "60 users", "Everything in Growth", "Client estimates & document vault", "1,000 AI scans / mo", "Priority support"],
    cta: "Get started",
    highlight: false,
  },
  {
    name: "Enterprise",
    projects: "Unlimited projects",
    monthly: "Custom",
    annual: "Custom",
    per: "tailored",
    fixed: true,
    tag: "For multi-site firms",
    features: ["Unlimited projects & users", "SSO & advanced roles", "Higher AI limits", "Dedicated onboarding", "Priority SLA support"],
    cta: "Contact us",
    contactHref: "mailto:gowtham.jaihind@gmail.com?subject=Enterprise%20plan%20enquiry",
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
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  // All sign-in entry points route through a consent gate: the user must accept
  // the Terms and Privacy Policy before we start Google auth. The acceptance is
  // stashed and written onto their profile once we have a uid (see useAuth).
  const requestLogin = () => {
    setMenuOpen(false);
    setConsentOpen(true);
  };
  const confirmConsentAndLogin = () => {
    if (!agreed) return;
    stashPendingConsent();
    setConsentOpen(false);
    onLogin();
  };

  // When `href` is given, the CTA is a link (e.g. Enterprise "Contact us" →
  // mailto) rather than the login button.
  const CTA = ({ label, className = "", full = false, href }: { label: string; className?: string; full?: boolean; href?: string }) => {
    const inner = (
      <>
        {label} <ArrowRight weight="bold" className="w-4 h-4" />
      </>
    );
    const cls = `inline-flex items-center justify-center gap-2 font-bold apple-transition active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${full ? "w-full" : ""} ${className}`;
    if (href) {
      return (
        <a href={href} className={cls}>
          {inner}
        </a>
      );
    }
    return (
      <button onClick={requestLogin} disabled={isLoggingIn} className={cls}>
        {isLoggingIn ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" /> Connecting…
          </>
        ) : (
          inner
        )}
      </button>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-page text-ink font-sans overflow-x-hidden">
      {/* NAV */}
      <header className="sticky top-0 z-50 bg-page/80 backdrop-blur-md border-b border-divider/60">
        <nav className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandLogo className="w-9 h-9 rounded-xl" />
            <span className="font-brand font-bold text-xl tracking-tight">Sitetru</span>
          </div>

          <div className="hidden md:flex items-center gap-7 text-sm font-semibold text-ink-muted">
            <a href="#audience" className="hover:text-ink apple-transition">{t("land.navServe")}</a>
            <a href="#solutions" className="hover:text-ink apple-transition">{t("land.navSolutions")}</a>
            <a href="#features" className="hover:text-ink apple-transition">{t("land.navFeatures")}</a>
            <a href="#pricing" className="hover:text-ink apple-transition">{t("land.navPricing")}</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={requestLogin} disabled={isLoggingIn} className="text-sm font-bold text-ink hover:text-primary apple-transition disabled:opacity-60">
              Sign in
            </button>
            <CTA label={t("land.getStarted")} className="bg-primary text-white text-sm px-5 py-2.5 rounded-xl hover:bg-[#B85F3B] shadow-lg shadow-primary/20" />
          </div>

          <button className="md:hidden p-2 -mr-2 text-ink" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
            {menuOpen ? <X className="w-6 h-6" /> : <List className="w-6 h-6" />}
          </button>
        </nav>

        {menuOpen && (
          <div className="md:hidden border-t border-divider/60 bg-page px-5 py-4 flex flex-col gap-3">
            <a href="#audience" onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-ink-muted py-1">{t("land.navServe")}</a>
            <a href="#solutions" onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-ink-muted py-1">{t("land.navSolutions")}</a>
            <a href="#features" onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-ink-muted py-1">{t("land.navFeatures")}</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-ink-muted py-1">{t("land.navPricing")}</a>
            <CTA label={t("land.getStarted")} full className="bg-primary text-white text-sm px-5 py-3 rounded-xl mt-1" />
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
            <Lightning weight="fill" className="w-3.5 h-3.5" /> {t("land.heroEyebrow")}
          </div>
          <h1 className="font-display font-bold text-[42px] leading-[1.05] sm:text-6xl tracking-tight mb-6">
            {t("land.heroTitle")}<br />
            <RotatingPhrase />
          </h1>
          <p className="text-lg text-ink-muted font-medium leading-relaxed max-w-lg mb-8">
            {t("land.heroSubhead")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <CTA label={t("land.getStartedFree")} className="bg-primary text-white text-base px-7 py-4 rounded-2xl hover:bg-[#B85F3B] shadow-xl shadow-primary/20" />
            <a href="#features" className="inline-flex items-center justify-center gap-2 font-bold text-base px-7 py-4 rounded-2xl bg-panel border border-divider text-ink hover:bg-surface apple-transition">
              {t("land.seeFeatures")}
            </a>
          </div>
          {loginError && (
            <div className="mt-6 flex items-start gap-3 text-[13px] font-medium text-danger bg-danger/10 p-3 rounded-xl border border-danger/20 max-w-md">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{loginError}</p>
            </div>
          )}
          <div className="mt-8 flex items-center gap-2 text-xs font-semibold text-ink-muted">
            <ShieldCheck weight="duotone" className="w-4 h-4 text-success" /> {t("land.trustLine")}
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
                <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">Cost (Actual)</p>
                <p className="font-mono font-bold text-lg">₹24.8L</p>
              </div>
              <div className="soft-card rounded-2xl p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">Manpower</p>
                <p className="font-mono font-bold text-lg">42</p>
              </div>
            </div>

            <div className="bg-[#6E8CA0]/10 rounded-2xl p-3 flex items-start gap-3">
              <div className="bg-[#229ED9] w-8 h-8 rounded-xl flex items-center justify-center shrink-0">
                <TelegramLogo weight="fill" className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold">Excavation — 80% ✅</p>
                <p className="text-[10px] text-ink-muted">Logged via Telegram · 2 min ago</p>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* WHO WE SERVE */}
      <section id="audience" className="max-w-6xl mx-auto px-5 sm:px-8 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="eyebrow text-primary mb-3">{t("land.serveEyebrow")}</p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">{t("land.serveHeading")}</h2>
          <p className="text-ink-muted font-medium">
            Sitetru is made for Indian construction businesses that have outgrown spreadsheets, WhatsApp groups and paper diaries.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {audience.map((a) => (
            <div key={a.title} className="soft-card rounded-3xl p-6 flex items-start gap-4">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-sage/15 text-[#3E8388] flex items-center justify-center">
                <a.icon weight="duotone" className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg tracking-tight mb-1">{a.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{a.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="max-w-6xl mx-auto px-5 sm:px-8 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">{t("land.featuresHeading")}</h2>
          <p className="text-ink-muted font-medium">{t("land.featuresSub")}</p>
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

      {/* WHY SITETRU */}
      <section id="why" className="max-w-6xl mx-auto px-5 sm:px-8 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="eyebrow text-primary mb-3">{t("land.whyEyebrow")}</p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">{t("land.whyHeading")}</h2>
          <p className="text-ink-muted font-medium">{t("land.whySub")}</p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {whySitetru.map((w) => (
            <div key={w.title} className="soft-card rounded-3xl p-6 flex items-start gap-4">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <w.icon weight="duotone" className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg tracking-tight mb-1">{w.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{w.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SOLUTIONS */}
      <section id="solutions" className="max-w-6xl mx-auto px-5 sm:px-8 py-8 md:py-16">
        <div className="bg-surface-dark rounded-[32px] p-8 md:p-14">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="eyebrow text-sage mb-3">{t("land.solveEyebrow")}</p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight text-white mb-4">{t("land.solveHeading")}</h2>
            <p className="text-white/70 font-medium">Every messy part of running a project, answered by one connected workspace.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {solutions.map((s) => (
              <div key={s.pain} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="w-11 h-11 rounded-xl bg-primary/20 text-primary flex items-center justify-center mb-4">
                  <s.icon weight="duotone" className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-white mb-1.5">{s.pain}</h3>
                <p className="text-sm text-white/70 leading-relaxed">{s.fix}</p>
              </div>
            ))}
          </div>
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
            <CTA label={t("land.getStartedFree")} className="bg-primary text-white text-base px-7 py-4 rounded-2xl hover:bg-[#B85F3B]" />
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
                  <p className="text-[10px] text-white/50">{m.s}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-16 md:py-24">
        <div className="text-center mb-14">
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">{t("land.stepsHeading")}</h2>
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
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">{t("land.pricingHeading")}</h2>
          <p className="text-ink-muted font-medium">Pick a plan by how many projects you run. Start free, or try any paid plan free for 30 days — no credit card to start.</p>
        </div>

        {/* Monthly / annual toggle */}
        <div className="flex items-center justify-center mb-12">
          <div className="inline-flex items-center bg-panel border border-divider rounded-full p-1">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-5 py-2 rounded-full text-sm font-bold apple-transition ${billing === "monthly" ? "bg-surface-dark text-white shadow" : "text-ink-muted hover:text-ink"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("annual")}
              className={`px-5 py-2 rounded-full text-sm font-bold apple-transition flex items-center gap-2 ${billing === "annual" ? "bg-surface-dark text-white shadow" : "text-ink-muted hover:text-ink"}`}
            >
              Annual
              <span className={`text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full ${billing === "annual" ? "bg-success/20 text-success" : "bg-success/15 text-[#2E8B6F]"}`}>Save ~17%</span>
            </button>
          </div>
        </div>

        {/* Free strip */}
        <div className="mb-6 soft-card rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-black uppercase tracking-widest text-ink-muted">{freePlan.name}</span>
            <span className="font-display font-bold text-3xl tracking-tight">₹0</span>
            <span className="text-xs font-semibold text-ink-muted">{freePlan.projects} · up to 2 users · free forever</span>
          </div>
          <CTA label={t("land.startFree")} className="bg-panel border border-divider text-ink hover:bg-surface text-sm px-6 py-3 rounded-2xl" />
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          {plans.map((p) => {
            const price = p.fixed ? p.monthly : billing === "annual" ? p.annual : p.monthly;
            const per = p.fixed ? p.per : billing === "annual" ? "/ mo" : "/ org / month";
            return (
              <div key={p.name} className={`rounded-3xl p-7 flex flex-col ${p.highlight ? "bg-surface-dark text-white shadow-2xl shadow-drab/20 ring-1 ring-primary/40" : "soft-card"}`}>
                {p.highlight && <span className="inline-block self-start text-[10px] font-black uppercase tracking-widest bg-primary text-white px-3 py-1 rounded-full mb-4">Most popular</span>}
                <p className={`text-sm font-black uppercase tracking-widest mb-2 ${p.highlight ? "text-white/60" : "text-ink-muted"}`}>{p.name}</p>
                <div className="flex items-end gap-1 mb-1">
                  <span className="font-display font-bold text-4xl tracking-tight">{price}</span>
                  <span className={`text-sm font-medium mb-1.5 ${p.highlight ? "text-white/60" : "text-ink-muted"}`}>{per}</span>
                </div>
                <p className={`text-[11px] font-semibold mb-1 h-4 ${p.highlight ? "text-white/50" : "text-ink-muted"}`}>
                  {!p.fixed && billing === "annual" ? p.annualTotal : ""}
                </p>
                <div className={`inline-flex self-start items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full mb-3 ${p.highlight ? "bg-white/10 text-white" : "bg-sage/15 text-[#3E8388]"}`}>
                  <Stack weight="bold" className="w-3.5 h-3.5" /> {p.projects}
                </div>
                <p className={`text-xs font-semibold mb-6 ${p.highlight ? "text-white/50" : "text-ink-muted"}`}>{p.tag}</p>
                <ul className="space-y-3 mb-8">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5 text-sm">
                      <Check weight="bold" className="w-4 h-4 mt-0.5 shrink-0 text-success" />
                      <span className={p.highlight ? "text-white/90" : "text-ink"}>{feat}</span>
                    </li>
                  ))}
                </ul>
                <CTA
                  label={p.cta}
                  href={(p as any).contactHref}
                  full
                  className={`mt-auto text-sm py-3.5 rounded-2xl ${p.highlight ? "bg-primary text-white hover:bg-[#B85F3B]" : "bg-panel border border-divider text-ink hover:bg-surface"}`}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-8 max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-[#B85F3B] px-4 py-2 rounded-full text-sm font-bold">
            <Stack weight="duotone" className="w-4 h-4" /> Need more projects? Add extra ones any time for ₹{OVERAGE_RATE}/project&nbsp;/&nbsp;month.
          </div>
          <p className="text-xs text-ink-muted mt-4">Start free forever, or try Starter free for 14 days — no card, upgrade to any plan anytime. Prices in INR, exclusive of GST. Annual plans are billed yearly. Enterprise billing is custom.</p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pb-20">
        <div className="soft-card rounded-[32px] p-10 md:p-16 text-center">
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">{t("land.finalHeading")}</h2>
          <p className="text-ink-muted font-medium max-w-lg mx-auto mb-8">Start free on Lite, or try every feature free for 30 days — no card required.</p>
          <div className="flex justify-center">
            <CTA label={t("land.getStartedFree")} className="bg-primary text-white text-base px-8 py-4 rounded-2xl hover:bg-[#B85F3B] shadow-xl shadow-primary/20" />
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
          <div className="flex items-center gap-5 text-xs font-semibold text-ink-muted">
            <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ink apple-transition">Terms</a>
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ink apple-transition">Privacy</a>
          </div>
          <p className="text-xs text-ink-muted">© {new Date().getFullYear()} Sitetru · Truth, reported from site.</p>
        </div>
      </footer>

      {/* CONSENT GATE — shown before any Google sign-in */}
      <AnimatePresence>
        {consentOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-onyx/40 backdrop-blur-sm"
            onClick={() => setConsentOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md soft-card rounded-[24px] p-8 relative"
              role="dialog"
              aria-modal="true"
              aria-label="Continue to Sitetru"
            >
              <button
                onClick={() => setConsentOpen(false)}
                className="absolute top-5 right-5 text-ink-muted hover:text-ink apple-transition"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2.5 mb-5">
                <BrandLogo className="w-10 h-10 rounded-xl" />
                <span className="font-brand font-bold text-lg tracking-tight">Sitetru</span>
              </div>

              <h3 className="font-display font-bold text-2xl tracking-tight mb-2">Continue to Sitetru</h3>
              <p className="text-sm text-ink-muted leading-relaxed mb-6">
                You'll sign in securely with Google. Before you continue, please review and accept our terms.
              </p>

              <label className="flex items-start gap-3 mb-6 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded-md border-divider text-primary focus:ring-primary/30 shrink-0 accent-[#B85F3B]"
                />
                <span className="text-sm text-ink leading-relaxed">
                  I agree to the{" "}
                  <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">Terms of Service</a>{" "}
                  and{" "}
                  <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">Privacy Policy</a>.
                </span>
              </label>

              <button
                onClick={confirmConsentAndLogin}
                disabled={!agreed || isLoggingIn}
                className="w-full inline-flex items-center justify-center gap-2 font-bold text-base px-7 py-4 rounded-2xl bg-primary text-white hover:bg-[#B85F3B] shadow-xl shadow-primary/20 apple-transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Connecting…
                  </>
                ) : (
                  <>
                    Continue with Google <ArrowRight weight="bold" className="w-4 h-4" />
                  </>
                )}
              </button>

              {loginError && (
                <div className="mt-4 flex items-start gap-2 text-[13px] font-medium text-danger bg-danger/10 p-3 rounded-xl border border-danger/20">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{loginError}</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LandingPage;
