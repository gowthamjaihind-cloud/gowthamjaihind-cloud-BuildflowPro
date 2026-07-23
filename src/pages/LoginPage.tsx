import React from "react";
import { motion } from "motion/react";
import {
  Barricade as Construction,
  ArrowRight,
  CircleNotch as Loader2,
  ShieldCheck,
  WarningCircle as AlertCircle,
} from "@phosphor-icons/react";

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
  return (
    <div className="h-screen flex items-center justify-center p-6 overflow-hidden relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full apple-glass rounded-[48px] p-20 shadow-2xl relative z-10 text-center border-white/50"
      >
        <div className="bg-surface-dark w-24 h-24 rounded-[32px] flex items-center justify-center mx-auto mb-10 shadow-2xl shadow-primary/20 rotate-3">
          <Construction className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-[48px] font-bold text-ink mb-6 tracking-tight leading-none">
          BuildFlow
        </h1>
        <p className="text-[17px] text-ink-muted mb-12 leading-relaxed font-medium">
          Precision Infrastructure Orchestration for modern enterprises.
        </p>

        <button
          onClick={onLogin}
          disabled={isLoggingIn}
          className={`w-full bg-surface-dark text-white py-6 rounded-3xl font-bold flex items-center justify-center gap-4 hover:bg-onyx apple-transition active:scale-[0.98] shadow-2xl shadow-drab/10 group text-[17px] ${isLoggingIn ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {isLoggingIn ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <img
                src="https://www.social-auth.com/static/google.png"
                className="w-6 h-6 grayscale brightness-200"
                alt=""
              />
              Continue with Google
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 apple-transition" />
            </>
          )}
        </button>

        {loginError && (
          <div className="mt-6 flex items-start gap-3 text-[13px] font-medium text-[#9C3B2E] bg-[#9C3B2E]/10 p-4 rounded-2xl text-left border border-[#9C3B2E]/20">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{loginError}</p>
          </div>
        )}

        <div className="mt-12 flex items-center justify-center gap-3 text-[13px] font-semibold text-ink-muted">
          <ShieldCheck className="w-4 h-4 text-[#3E8388]" />
          Secure Enterprise Authentication
        </div>
      </motion.div>
    </div>
  );
};
