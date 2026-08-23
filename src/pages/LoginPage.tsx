import React from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  CircleNotch as Loader2,
  ShieldCheck,
  WarningCircle as AlertCircle,
} from "@phosphor-icons/react";
import { BrandLogo } from "../components/BrandLogo";
import { useTranslation } from "../i18n";

interface LoginPageProps {
  isLoggingIn: boolean;
  onLogin: () => void;
  loginError?: string | null;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  isLoggingIn,
  onLogin,
  loginError,
}) => {
  const { t } = useTranslation();
  return (
    <div className="h-screen flex items-center justify-center p-6 overflow-hidden relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full soft-card rounded-[48px] p-20 shadow-2xl relative z-10 text-center"
      >
        <BrandLogo className="w-24 h-24 rounded-[32px] mx-auto mb-10 shadow-2xl shadow-primary/20 rotate-3" />
        <h1 className="font-brand text-[48px] font-bold text-ink mb-6 tracking-tight leading-none">
          Sitetru
        </h1>
        <p className="text-[17px] text-ink-muted mb-12 leading-relaxed font-medium">
          {t("login.tagline")}
        </p>

        <button
          onClick={onLogin}
          disabled={isLoggingIn}
          className={`w-full bg-onyx text-white py-6 rounded-3xl font-bold flex items-center justify-center gap-4 hover:bg-onyx/80 apple-transition active:scale-[0.98] shadow-2xl shadow-drab/10 group text-[17px] ${isLoggingIn ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {isLoggingIn ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              {t("login.connecting")}
            </>
          ) : (
            <>
              <img
                src="https://www.social-auth.com/static/google.png"
                className="w-6 h-6 grayscale brightness-200"
                alt=""
              />
              {t("login.continueGoogle")}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 apple-transition" />
            </>
          )}
        </button>

        {loginError && (
          <div className="mt-6 flex items-start gap-3 text-[13px] font-medium text-danger bg-danger/10 p-4 rounded-2xl text-left border border-danger/20">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{loginError}</p>
          </div>
        )}

        <div className="mt-12 flex items-center justify-center gap-3 text-[13px] font-semibold text-ink-muted">
          <ShieldCheck className="w-4 h-4 text-success" />
          {t("login.secureAuth")}
        </div>
      </motion.div>
    </div>
  );
};
