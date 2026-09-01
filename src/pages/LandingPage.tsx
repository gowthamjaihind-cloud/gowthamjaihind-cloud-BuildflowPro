import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "../i18n";
import { BrandLogo } from "../components/BrandLogo";
import { TERMS_URL, PRIVACY_URL, REFUND_URL, SHIPPING_URL, CONTACT_URL, stashPendingConsent } from "../lib/legal";
import { useAuthStore } from "../store";
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
  { icon: TreeStructure, title: "WBS & Scheduling", taTitle: "பணிப் பிரிவு & அட்டவணை", body: "Break projects into a work-breakdown structure with a live Gantt, dependencies and auto-shifting dates.", taBody: "செயல்திட்டங்களை நேரடி Gantt, சார்புகள் மற்றும் தானாக மாறும் தேதிகளுடன் பணிப் பிரிவு அமைப்பாகப் பிரிக்கவும்." },
  { icon: Truck, title: "Procurement & GRN", taTitle: "கொள்முதல் & GRN", body: "Raise purchase orders, record goods receipts, and keep vendor ledgers and inventory in perfect step.", taBody: "கொள்முதல் ஆணைகளை உருவாக்கி, பொருள் ரசீதுகளைப் பதிவு செய்து, சப்ளையர் லெட்ஜர்களையும் ஸ்டாக்கையும் சரியாக ஒத்திசைக்கவும்." },
  { icon: Users, title: "Labor Tracking", taTitle: "தொழிலாளர் கண்காணிப்பு", body: "Log daily manpower by trade and task, with rate cards, billing and per-task consumption rollups.", taBody: "விலை அட்டைகள், பில்லிங் மற்றும் பணி வாரியான பயன்பாட்டுடன் தினசரி மனித சக்தியைத் தொழில் மற்றும் பணி வாரியாகப் பதிவு செய்யவும்." },
  { icon: CurrencyInr, title: "Cost Management", taTitle: "செலவு மேலாண்மை", body: "Track budgeted vs actual in real time, with CPI, forecasts and an AI-assisted cost analysis.", taBody: "CPI, முன்னறிவிப்புகள் மற்றும் AI உதவி செலவு பகுப்பாய்வுடன் பட்ஜெட் vs உண்மையை நிகழ்நேரத்தில் கண்காணிக்கவும்." },
  { icon: FileText, title: "Daily Logs & Reports", taTitle: "தினசரி பதிவுகள் & அறிக்கைகள்", body: "Site diaries with progress, materials, labour and photos — exportable as clean PDF reports.", taBody: "முன்னேற்றம், பொருட்கள், தொழிலாளர் மற்றும் புகைப்படங்களுடன் தள நாட்குறிப்புகள் — சுத்தமான PDF அறிக்கைகளாக எக்ஸ்போர்ட் செய்யலாம்." },
  { icon: Calculator, title: "Client Estimates", taTitle: "வாடிக்கையாளர் எஸ்டிமேட்", body: "Build estimates, track change orders, and compare against your live budget at any moment.", taBody: "மதிப்பீடுகளை உருவாக்கி, மாற்ற ஆணைகளைக் கண்காணித்து, எந்த நேரத்திலும் உங்கள் நேரடி பட்ஜெட்டுடன் ஒப்பிடவும்." },
  { icon: FolderLock, title: "Document Vault", taTitle: "ஆவணங்கள்", body: "Keep drawings, approvals and compliance docs organised and access-controlled per project.", taBody: "வரைபடங்கள், அனுமதிகள் மற்றும் இணக்க ஆவணங்களை ஒவ்வொரு செயல்திட்டத்திற்கும் ஒழுங்குபடுத்தி அணுகல் கட்டுப்பாட்டுடன் வைத்திருங்கள்." },
  { icon: ChartLineUp, title: "Portfolio View", taTitle: "போர்ட்ஃபோலியோ காட்சி", body: "See every active project's health, completion and risk from one executive dashboard.", taBody: "ஒரே நிர்வாக டாஷ்போர்டில் இருந்து ஒவ்வொரு செயலில் உள்ள செயல்திட்டத்தின் ஆரோக்கியம், நிறைவு மற்றும் ஆபத்தைப் பார்க்கவும்." },
];

const steps = [
  { n: "01", title: "Set up your project", taTitle: "உங்கள் செயல்திட்டத்தை அமைக்கவும்", body: "Create the workspace, add your WBS, tasks and team in minutes.", taBody: "நிமிடங்களில் பணியிடத்தை உருவாக்கி, உங்கள் WBS, பணிகள் மற்றும் அணியைச் சேர்க்கவும்." },
  { n: "02", title: "Log from the field", taTitle: "களத்திலிருந்து பதிவு செய்யுங்கள்", body: "Site teams record progress, materials and labour — from the app or Telegram.", taBody: "தள அணிகள் முன்னேற்றம், பொருட்கள் மற்றும் தொழிலாளரை — ஆப் அல்லது டெலிகிராம் மூலம் பதிவு செய்கின்றன." },
  { n: "03", title: "Stay in control", taTitle: "கட்டுப்பாட்டில் இருங்கள்", body: "Watch cost, schedule and procurement update live across your whole portfolio.", taBody: "உங்கள் முழு போர்ட்ஃபோலியோ முழுவதும் செலவு, அட்டவணை மற்றும் கொள்முதல் நேரடியாகப் புதுப்பிப்பதைப் பாருங்கள்." },
];

const audience = [
  { icon: Buildings, title: "Building contractors", taTitle: "கட்டிட ஒப்பந்தக்காரர்கள்", body: "Residential & commercial. Keep every site's schedule, cost and labour in one place.", taBody: "குடியிருப்பு & வணிக. ஒவ்வொரு தளத்தின் அட்டவணை, செலவு மற்றும் தொழிலாளரை ஒரே இடத்தில் வைத்திருங்கள்." },
  { icon: RoadHorizon, title: "Civil & infrastructure", taTitle: "சிவில் & உள்கட்டமைப்பு", body: "Roads, water and structures. Track RA bills, GRNs and vendor ledgers without the paperwork.", taBody: "சாலைகள், நீர் மற்றும் கட்டமைப்புகள். காகிதப்பணி இல்லாமல் RA பில்கள், GRN மற்றும் சப்ளையர் லெட்ஜர்களைக் கண்காணிக்கவும்." },
  { icon: HouseLine, title: "Developers & builders", taTitle: "டெவலப்பர்கள் & பில்டர்கள்", body: "See the health of every project in your portfolio from one executive dashboard.", taBody: "ஒரே நிர்வாக டாஷ்போர்டில் இருந்து உங்கள் போர்ட்ஃபோலியோவில் உள்ள ஒவ்வொரு செயல்திட்டத்தின் ஆரோக்கியத்தைப் பார்க்கவும்." },
  { icon: ClipboardText, title: "PMCs & consultants", taTitle: "PMC & ஆலோசகர்கள்", body: "Run multiple clients' sites with role-based access and clean, exportable reports.", taBody: "பங்கு அடிப்படையிலான அணுகல் மற்றும் சுத்தமான, எக்ஸ்போர்ட் செய்யக்கூடிய அறிக்கைகளுடன் பல வாடிக்கையாளர்களின் தளங்களை நிர்வகிக்கவும்." },
  { icon: PaintRoller, title: "Interior & fit-out", taTitle: "உள்ளமைப்பு & ஃபிட்-அவுட்", body: "Manage procurement, labour and change orders on fast-moving jobs.", taBody: "வேகமாக நகரும் வேலைகளில் கொள்முதல், தொழிலாளர் மற்றும் மாற்ற ஆணைகளை நிர்வகிக்கவும்." },
];

const whySitetru = [
  { icon: TelegramLogo, title: "The field logs itself, over Telegram", taTitle: "களம் தானாகவே பதிவு செய்கிறது, டெலிகிராம் மூலம்", body: "No app to train the crew on — foremen report progress, materials and labour from a chat, and it lands live in your dashboards.", taBody: "பணியாளர்களுக்குப் பயிற்சி அளிக்க ஆப் தேவையில்லை — மேற்பார்வையாளர்கள் ஒரு அரட்டையிலிருந்து முன்னேற்றம், பொருட்கள் மற்றும் தொழிலாளரை அறிக்கையிடுகிறார்கள், அது உங்கள் டாஷ்போர்டுகளில் நேரடியாக வந்து சேரும்." },
  { icon: FlowArrow, title: "Everything is connected", taTitle: "அனைத்தும் இணைக்கப்பட்டுள்ளன", body: "Schedule, procurement, labour and cost update each other in real time. Change one, and the rest follows.", taBody: "அட்டவணை, கொள்முதல், தொழிலாளர் மற்றும் செலவு ஒன்றையொன்று நிகழ்நேரத்தில் புதுப்பிக்கின்றன. ஒன்றை மாற்றினால், மற்றவை பின்தொடரும்." },
  { icon: Sparkle, title: "AI that reads your paperwork", taTitle: "உங்கள் காகிதப்பணியைப் படிக்கும் AI", body: "Scan a vendor invoice and Sitetru matches it to the PO, flags rate and quantity discrepancies, and updates inventory.", taBody: "சப்ளையர் விலைப்பட்டியலை ஸ்கேன் செய்யுங்கள், Sitetru அதை POவுடன் பொருத்தி, விலை மற்றும் அளவு முரண்பாடுகளைக் குறித்து, ஸ்டாக்கைப் புதுப்பிக்கிறது." },
  { icon: CurrencyInr, title: "Made for Indian construction", taTitle: "இந்திய கட்டுமானத்திற்காக உருவாக்கப்பட்டது", body: "GST-aware invoices, INR costing, RA bills, GRNs and CGST/SGST/IGST — not a foreign tool bent to fit.", taBody: "GST அறிந்த விலைப்பட்டியல்கள், INR செலவு, RA பில்கள், GRN மற்றும் CGST/SGST/IGST — பொருந்த வளைக்கப்பட்ட வெளிநாட்டு கருவி அல்ல." },
  { icon: Stack, title: "One source of truth", taTitle: "ஒரே உண்மை மூலம்", body: "Replace five spreadsheets, three WhatsApp groups and a paper diary with a single workspace.", taBody: "ஐந்து விரிதாள்கள், மூன்று WhatsApp குழுக்கள் மற்றும் ஒரு காகித நாட்குறிப்பை ஒரே பணியிடத்தால் மாற்றவும்." },
];

const solutions = [
  { icon: TreeStructure, pain: "Schedule slipping?", taPain: "அட்டவணை பின்தங்குகிறதா?", fix: "Live WBS + Gantt with dependencies and auto-shifting dates.", taFix: "சார்புகள் மற்றும் தானாக மாறும் தேதிகளுடன் நேரடி WBS + Gantt." },
  { icon: ChartLineUp, pain: "Costs overrunning?", taPain: "செலவுகள் மிகுதியாகின்றனவா?", fix: "Budget vs. actual in real time, CPI, forecasts and AI cost analysis.", taFix: "நிகழ்நேரத்தில் பட்ஜெட் vs உண்மை, CPI, முன்னறிவிப்புகள் மற்றும் AI செலவு பகுப்பாய்வு." },
  { icon: Truck, pain: "Procurement leaking?", taPain: "கொள்முதல் கசிகிறதா?", fix: "POs, goods receipts, vendor ledgers and AI invoice-matching that keep inventory honest.", taFix: "ஸ்டாக்கை நேர்மையாக வைத்திருக்கும் PO, பொருள் ரசீதுகள், சப்ளையர் லெட்ஜர்கள் மற்றும் AI விலைப்பட்டியல் பொருத்தம்." },
  { icon: Users, pain: "Labour untracked?", taPain: "தொழிலாளர் கண்காணிக்கப்படவில்லையா?", fix: "Daily manpower by trade and task, rate cards and per-task consumption.", taFix: "தொழில் மற்றும் பணி வாரியாக தினசரி மனித சக்தி, விலை அட்டைகள் மற்றும் பணி வாரியான பயன்பாடு." },
  { icon: DeviceMobile, pain: "Blind to the site?", taPain: "தளம் தெரியவில்லையா?", fix: "Daily logs with photos, a portfolio health view, and Telegram field updates.", taFix: "புகைப்படங்களுடன் தினசரி பதிவுகள், போர்ட்ஃபோலியோ ஆரோக்கியக் காட்சி மற்றும் டெலிகிராம் கள புதுப்பிப்புகள்." },
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
  taName: "இலவசம்",
  projects: "1 active project",
  taProjects: "1 செயலில் செயல்திட்டம்",
  features: ["1 active project", "Up to 2 users", "WBS & daily logs", "Telegram field logging"],
  taFeatures: ["1 செயலில் செயல்திட்டம்", "2 பயனர்கள் வரை", "WBS & தினசரி பதிவுகள்", "டெலிகிராம் கள பதிவு"],
};

const plans = [
  {
    name: "Starter",
    projects: "Up to 5 projects", taProjects: "5 செயல்திட்டங்கள் வரை",
    monthly: "₹999",
    annual: "₹832",
    annualTotal: "₹9,990 billed yearly", taAnnualTotal: "₹9,990 ஆண்டுதோறும்",
    tag: "For small contractors", taTag: "சிறிய ஒப்பந்தக்காரர்களுக்கு",
    features: ["Up to 5 active projects", "10 users", "Procurement, labour & cost", "GRN & vendor ledgers", "150 AI invoice scans / mo"],
    taFeatures: ["5 செயலில் செயல்திட்டங்கள் வரை", "10 பயனர்கள்", "கொள்முதல், தொழிலாளர் & செலவு", "GRN & சப்ளையர் லெட்ஜர்கள்", "150 AI விலைப்பட்டியல் ஸ்கேன்கள் / மாதம்"],
    cta: "Start 14-day trial", taCta: "14-நாள் சோதனையைத் தொடங்கு",
    highlight: false,
  },
  {
    name: "Growth",
    projects: "Up to 10 projects", taProjects: "10 செயல்திட்டங்கள் வரை",
    monthly: "₹1,799",
    annual: "₹1,499",
    annualTotal: "₹17,990 billed yearly", taAnnualTotal: "₹17,990 ஆண்டுதோறும்",
    tag: "For growing firms", taTag: "வளரும் நிறுவனங்களுக்கு",
    features: ["Up to 10 active projects", "25 users", "Everything in Starter", "AI cost analysis & insights", "400 AI invoice scans / mo"],
    taFeatures: ["10 செயலில் செயல்திட்டங்கள் வரை", "25 பயனர்கள்", "Starter இல் உள்ள அனைத்தும்", "AI செலவு பகுப்பாய்வு & பகுப்பாய்வு", "400 AI விலைப்பட்டியல் ஸ்கேன்கள் / மாதம்"],
    cta: "Get started", taCta: "தொடங்குங்கள்",
    highlight: true,
  },
  {
    name: "Business",
    projects: "Up to 20 projects", taProjects: "20 செயல்திட்டங்கள் வரை",
    monthly: "₹2,999",
    annual: "₹2,499",
    annualTotal: "₹29,990 billed yearly", taAnnualTotal: "₹29,990 ஆண்டுதோறும்",
    tag: "For established firms", taTag: "நிலைபெற்ற நிறுவனங்களுக்கு",
    features: ["Up to 20 active projects", "60 users", "Everything in Growth", "Client estimates & document vault", "1,000 AI scans / mo", "Priority support"],
    taFeatures: ["20 செயலில் செயல்திட்டங்கள் வரை", "60 பயனர்கள்", "Growth இல் உள்ள அனைத்தும்", "வாடிக்கையாளர் எஸ்டிமேட் & ஆவணங்கள்", "1,000 AI ஸ்கேன்கள் / மாதம்", "முன்னுரிமை ஆதரவு"],
    cta: "Get started", taCta: "தொடங்குங்கள்",
    highlight: false,
  },
  {
    name: "Enterprise",
    projects: "Unlimited projects", taProjects: "வரம்பற்ற செயல்திட்டங்கள்",
    monthly: "Custom",
    annual: "Custom",
    per: "tailored",
    fixed: true,
    tag: "For multi-site firms", taTag: "பல தள நிறுவனங்களுக்கு",
    features: ["Unlimited projects & users", "SSO & advanced roles", "Higher AI limits", "Dedicated onboarding", "Priority SLA support"],
    taFeatures: ["வரம்பற்ற செயல்திட்டங்கள் & பயனர்கள்", "SSO & மேம்பட்ட பங்குகள்", "அதிக AI வரம்புகள்", "பிரத்யேக ஆரம்ப அமைப்பு", "முன்னுரிமை SLA ஆதரவு"],
    cta: "Contact us", taCta: "எங்களைத் தொடர்புகொள்ளவும்",
    contactHref: "mailto:gowtham.jaihind@gmail.com?subject=Enterprise%20plan%20enquiry",
    highlight: false,
  },
];

// Rotating end-phrase for the hero headline. Placed on its own line so the
// changing width never shifts surrounding text.
const HERO_PHRASES = ["on schedule.", "in budget.", "under control.", "in real time.", "from your phone."];
const HERO_PHRASES_TA = ["அட்டவணைப்படி.", "பட்ஜெட்டுக்குள்.", "கட்டுப்பாட்டில்.", "நிகழ்நேரத்தில்.", "உங்கள் ஃபோனிலிருந்து."];
const RotatingPhrase: React.FC = () => {
  const { language } = useTranslation();
  const phrases = language === "ta" ? HERO_PHRASES_TA : HERO_PHRASES;
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
          {phrases[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({ isLoggingIn, onLogin, loginError }) => {
  const { t, language } = useTranslation();
  const L = (en: string, ta?: string) => (language === "ta" && ta ? ta : en);
  const [menuOpen, setMenuOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  // Email/password auth (alongside Google) inside the consent gate.
  const loginWithEmail = useAuthStore((s) => s.loginWithEmail);
  const signUpWithEmail = useAuthStore((s) => s.signUpWithEmail);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const setLoginError = useAuthStore((s) => s.setLoginError);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const switchMode = (m: "signin" | "signup" | "reset") => {
    setAuthMode(m);
    setResetMsg(null);
    setLoginError(null);
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMsg(null);
    if (authMode === "reset") {
      const ok = await resetPassword(email);
      if (ok) setResetMsg("If an account exists for that email, a reset link is on its way.");
      return;
    }
    if (!agreed) {
      setLoginError("Please accept the Terms & Privacy Policy to continue.");
      return;
    }
    stashPendingConsent();
    if (authMode === "signup") await signUpWithEmail(email, password, name);
    else await loginWithEmail(email, password);
  };

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
            <a
              href="/demo/?demo=1"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 text-primary hover:text-[#B85F3B] apple-transition font-bold"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" />
              {t("land.navDemo")}
            </a>
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
            <a
              href="/demo/?demo=1"
              target="_blank"
              rel="noopener"
              onClick={() => setMenuOpen(false)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary py-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" />
              {t("land.navDemo")}
            </a>
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
            {L(
              "Sitetru is made for Indian construction businesses that have outgrown spreadsheets, WhatsApp groups and paper diaries.",
              "விரிதாள்கள், WhatsApp குழுக்கள் மற்றும் காகித நாட்குறிப்புகளைத் தாண்டி வளர்ந்த இந்திய கட்டுமான வணிகங்களுக்காக Sitetru உருவாக்கப்பட்டுள்ளது.",
            )}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {audience.map((a) => (
            <div key={a.title} className="soft-card rounded-3xl p-6 flex items-start gap-4">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-sage/15 text-[#3E8388] flex items-center justify-center">
                <a.icon weight="duotone" className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg tracking-tight mb-1">{L(a.title, a.taTitle)}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{L(a.body, a.taBody)}</p>
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
              <h3 className="font-bold text-lg tracking-tight mb-2">{L(f.title, f.taTitle)}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{L(f.body, f.taBody)}</p>
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
                <h3 className="font-bold text-lg tracking-tight mb-1">{L(w.title, w.taTitle)}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{L(w.body, w.taBody)}</p>
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
            <p className="text-white/70 font-medium">{L("Every messy part of running a project, answered by one connected workspace.", "ஒரு செயல்திட்டத்தை நடத்துவதன் ஒவ்வொரு குழப்பமான பகுதிக்கும், ஒரே இணைந்த பணியிடம் பதிலளிக்கிறது.")}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {solutions.map((s) => (
              <div key={s.pain} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="w-11 h-11 rounded-xl bg-primary/20 text-primary flex items-center justify-center mb-4">
                  <s.icon weight="duotone" className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-white mb-1.5">{L(s.pain, s.taPain)}</h3>
                <p className="text-sm text-white/70 leading-relaxed">{L(s.fix, s.taFix)}</p>
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
              <DeviceMobile weight="duotone" className="w-4 h-4" /> {L("The differentiator", "வேறுபடுத்தும் அம்சம்")}
            </div>
            <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight text-white mb-4">
              {L("Your site team already has Telegram. That's all they need.", "உங்கள் தள அணியிடம் ஏற்கனவே டெலிகிராம் உள்ளது. அவர்களுக்கு அதுவே போதும்.")}
            </h2>
            <p className="text-white/70 font-medium leading-relaxed mb-8">
              {L(
                "No app to train the crew on. Foremen log progress, materials, labour and photos straight from a chat — and it lands live in your dashboards, cost sheets and inventory.",
                "பணியாளர்களுக்குப் பயிற்சி அளிக்க ஆப் தேவையில்லை. மேற்பார்வையாளர்கள் முன்னேற்றம், பொருட்கள், தொழிலாளர் மற்றும் புகைப்படங்களை நேரடியாக ஒரு அரட்டையிலிருந்து பதிவு செய்கிறார்கள் — அது உங்கள் டாஷ்போர்டுகள், செலவுத் தாள்கள் மற்றும் ஸ்டாக்கில் நேரடியாக வந்து சேரும்.",
              )}
            </p>
            <CTA label={t("land.getStartedFree")} className="bg-primary text-white text-base px-7 py-4 rounded-2xl hover:bg-[#B85F3B]" />
          </div>
          <div className="space-y-3">
            {[
              { t: "/log", s: "Start a progress update", sTa: "முன்னேற்றப் புதுப்பிப்பைத் தொடங்கு" },
              { t: "Excavation → 80%", s: "Pick a task, set progress", sTa: "பணியைத் தேர்ந்தெடு, முன்னேற்றத்தை அமை" },
              { t: "📦 Cement · 50 bags", s: "Add materials & labour", sTa: "பொருட்கள் & தொழிலாளர் சேர்" },
              { t: "✅ Logged", s: "Synced to cost, WBS & inventory", sTa: "செலவு, WBS & ஸ்டாக்குடன் ஒத்திசைக்கப்பட்டது" },
            ].map((m, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="bg-[#229ED9] w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                  <TelegramLogo weight="fill" className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{m.t}</p>
                  <p className="text-[10px] text-white/50">{L(m.s, m.sTa)}</p>
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
              <h3 className="font-bold text-lg mb-2">{L(s.title, s.taTitle)}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{L(s.body, s.taBody)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="max-w-6xl mx-auto px-5 sm:px-8 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">{t("land.pricingHeading")}</h2>
          <p className="text-ink-muted font-medium">{L("Pick a plan by how many projects you run. Start free, or try any paid plan free for 30 days — no credit card to start.", "நீங்கள் இயக்கும் செயல்திட்டங்களின் எண்ணிக்கைக்கு ஏற்ப ஒரு திட்டத்தைத் தேர்ந்தெடுங்கள். இலவசமாகத் தொடங்குங்கள், அல்லது எந்த கட்டண திட்டத்தையும் 30 நாட்களுக்கு இலவசமாக முயற்சிக்கவும் — தொடங்க கார்டு தேவையில்லை.")}</p>
        </div>

        {/* Monthly / annual toggle */}
        <div className="flex items-center justify-center mb-12">
          <div className="inline-flex items-center bg-panel border border-divider rounded-full p-1">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-5 py-2 rounded-full text-sm font-bold apple-transition ${billing === "monthly" ? "bg-surface-dark text-white shadow" : "text-ink-muted hover:text-ink"}`}
            >
              {t("paywall.monthly")}
            </button>
            <button
              onClick={() => setBilling("annual")}
              className={`px-5 py-2 rounded-full text-sm font-bold apple-transition flex items-center gap-2 ${billing === "annual" ? "bg-surface-dark text-white shadow" : "text-ink-muted hover:text-ink"}`}
            >
              {t("paywall.annual")}
              <span className={`text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full ${billing === "annual" ? "bg-success/20 text-success" : "bg-success/15 text-[#2E8B6F]"}`}>{t("paywall.savePct")}</span>
            </button>
          </div>
        </div>

        {/* Free strip */}
        <div className="mb-6 soft-card rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-black uppercase tracking-widest text-ink-muted">{L(freePlan.name, freePlan.taName)}</span>
            <span className="font-display font-bold text-3xl tracking-tight">₹0</span>
            <span className="text-xs font-semibold text-ink-muted">{L(`${freePlan.projects} · up to 2 users · free forever`, `${freePlan.taProjects} · 2 பயனர்கள் வரை · எப்போதும் இலவசம்`)}</span>
          </div>
          <CTA label={t("land.startFree")} className="bg-panel border border-divider text-ink hover:bg-surface text-sm px-6 py-3 rounded-2xl" />
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          {plans.map((p) => {
            const price = p.fixed ? p.monthly : billing === "annual" ? p.annual : p.monthly;
            const per = p.fixed
              ? L((p as any).per, "தனிப்பயன்")
              : billing === "annual"
                ? L("/ mo", "/ மாதம்")
                : L("/ org / month", "/ நிறுவனம் / மாதம்");
            return (
              <div key={p.name} className={`rounded-3xl p-7 flex flex-col ${p.highlight ? "bg-surface-dark text-white shadow-2xl shadow-drab/20 ring-1 ring-primary/40" : "soft-card"}`}>
                {p.highlight && <span className="inline-block self-start text-[10px] font-black uppercase tracking-widest bg-primary text-white px-3 py-1 rounded-full mb-4">{L("Most popular", "மிகவும் பிரபலம்")}</span>}
                <p className={`text-sm font-black uppercase tracking-widest mb-2 ${p.highlight ? "text-white/60" : "text-ink-muted"}`}>{p.name}</p>
                <div className="flex items-end gap-1 mb-1">
                  <span className="font-display font-bold text-4xl tracking-tight">{price}</span>
                  <span className={`text-sm font-medium mb-1.5 ${p.highlight ? "text-white/60" : "text-ink-muted"}`}>{per}</span>
                </div>
                <p className={`text-[11px] font-semibold mb-1 h-4 ${p.highlight ? "text-white/50" : "text-ink-muted"}`}>
                  {!p.fixed && billing === "annual" ? L(p.annualTotal, (p as any).taAnnualTotal) : ""}
                </p>
                <div className={`inline-flex self-start items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full mb-3 ${p.highlight ? "bg-white/10 text-white" : "bg-sage/15 text-[#3E8388]"}`}>
                  <Stack weight="bold" className="w-3.5 h-3.5" /> {L(p.projects, (p as any).taProjects)}
                </div>
                <p className={`text-xs font-semibold mb-6 ${p.highlight ? "text-white/50" : "text-ink-muted"}`}>{L(p.tag, (p as any).taTag)}</p>
                <ul className="space-y-3 mb-8">
                  {p.features.map((feat, fi) => (
                    <li key={feat} className="flex items-start gap-2.5 text-sm">
                      <Check weight="bold" className="w-4 h-4 mt-0.5 shrink-0 text-success" />
                      <span className={p.highlight ? "text-white/90" : "text-ink"}>{L(feat, (p as any).taFeatures?.[fi])}</span>
                    </li>
                  ))}
                </ul>
                <CTA
                  label={L(p.cta, (p as any).taCta)}
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
            <Stack weight="duotone" className="w-4 h-4" /> {L(`Need more projects? Add extra ones any time for ₹${OVERAGE_RATE}/project / month.`, `மேலும் செயல்திட்டங்கள் தேவையா? கூடுதலானவற்றை எந்த நேரத்திலும் தலா ₹${OVERAGE_RATE}/செயல்திட்டம் / மாதம் என்ற விலையில் சேர்க்கவும்.`)}
          </div>
          <p className="text-xs text-ink-muted mt-4">{L("Start free forever, or try Starter free for 14 days — no card, upgrade to any plan anytime. Prices in INR, exclusive of GST. Annual plans are billed yearly. Enterprise billing is custom.", "எப்போதும் இலவசமாகத் தொடங்குங்கள், அல்லது Starter ஐ 14 நாட்களுக்கு இலவசமாக முயற்சிக்கவும் — கார்டு இல்லை, எந்த திட்டத்திற்கும் எப்போது வேண்டுமானாலும் மேம்படுத்தலாம். விலைகள் INR இல், GST தவிர்த்து. ஆண்டு திட்டங்கள் ஆண்டுதோறும் பில் செய்யப்படும். Enterprise பில்லிங் தனிப்பயன்.")}</p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pb-20">
        <div className="soft-card rounded-[32px] p-10 md:p-16 text-center">
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-4">{t("land.finalHeading")}</h2>
          <p className="text-ink-muted font-medium max-w-lg mx-auto mb-8">{L("Start free on Lite, or try every feature free for 30 days — no card required.", "இலவசமாகத் தொடங்குங்கள், அல்லது ஒவ்வொரு அம்சத்தையும் 30 நாட்களுக்கு இலவசமாக முயற்சிக்கவும் — கார்டு தேவையில்லை.")}</p>
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
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-ink-muted">
            <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ink apple-transition">{L("Terms", "விதிமுறைகள்")}</a>
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ink apple-transition">{L("Privacy", "தனியுரிமை")}</a>
            <a href={REFUND_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ink apple-transition">{L("Refund", "பணத்திரும்பம்")}</a>
            <a href={SHIPPING_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ink apple-transition">{L("Delivery", "வழங்கல்")}</a>
            <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ink apple-transition">{L("Contact", "தொடர்பு")}</a>
          </div>
          <p className="text-xs text-ink-muted">© {new Date().getFullYear()} Sitetru · {L("Truth, reported from site.", "தளத்திலிருந்து அறிக்கையிடப்பட்ட உண்மை.")}</p>
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
                Sign in with Google or your email. Before you continue, please review and accept our terms.
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

              <div className="flex items-center gap-3 my-5">
                <div className="h-px bg-divider flex-1" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-ink-muted">or</span>
                <div className="h-px bg-divider flex-1" />
              </div>

              <form onSubmit={submitEmail} className="space-y-3">
                {authMode === "signup" && (
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    className="w-full bg-surface/60 border border-divider rounded-2xl px-4 py-3.5 outline-none focus:bg-surface focus:border-primary/40 apple-transition font-medium text-[15px]"
                  />
                )}
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  autoComplete="email"
                  className="w-full bg-surface/60 border border-divider rounded-2xl px-4 py-3.5 outline-none focus:bg-surface focus:border-primary/40 apple-transition font-medium text-[15px]"
                />
                {authMode !== "reset" && (
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                    className="w-full bg-surface/60 border border-divider rounded-2xl px-4 py-3.5 outline-none focus:bg-surface focus:border-primary/40 apple-transition font-medium text-[15px]"
                  />
                )}
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full inline-flex items-center justify-center gap-2 font-bold text-[15px] px-6 py-3.5 rounded-2xl bg-onyx text-white hover:bg-onyx/85 apple-transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoggingIn ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : authMode === "signup" ? (
                    "Create account"
                  ) : authMode === "reset" ? (
                    "Send reset link"
                  ) : (
                    "Sign in"
                  )}
                </button>
              </form>

              <div className="mt-3 flex items-center justify-between text-[13px]">
                {authMode === "signin" && (
                  <>
                    <button onClick={() => switchMode("signup")} className="font-semibold text-primary hover:underline">
                      Create an account
                    </button>
                    <button onClick={() => switchMode("reset")} className="font-medium text-ink-muted hover:text-ink">
                      Forgot password?
                    </button>
                  </>
                )}
                {authMode === "signup" && (
                  <button onClick={() => switchMode("signin")} className="font-medium text-ink-muted hover:text-ink">
                    Already have an account? <span className="text-primary font-semibold">Sign in</span>
                  </button>
                )}
                {authMode === "reset" && (
                  <button onClick={() => switchMode("signin")} className="font-medium text-ink-muted hover:text-ink">
                    ← Back to sign in
                  </button>
                )}
              </div>

              {resetMsg && (
                <div className="mt-4 flex items-start gap-2 text-[13px] font-medium text-primary bg-primary/8 p-3 rounded-xl border border-primary/20">
                  <Check className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{resetMsg}</p>
                </div>
              )}

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
