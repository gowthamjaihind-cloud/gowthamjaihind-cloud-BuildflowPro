import React from "react";
import { motion } from "motion/react";
import { Construction, ArrowRight, Loader2, ShieldCheck } from "lucide-react";

interface LoginPageProps {
  isLoggingIn: boolean;
  onLogin: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  isLoggingIn,
  onLogin,
}) => {
  return (
    <div className="h-screen flex items-center justify-center p-6 overflow-hidden relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full apple-glass rounded-[48px] p-20 shadow-2xl relative z-10 text-center border-white/50"
      >
        <div className="bg-surface-dark w-24 h-24 rounded-[32px] flex items-center justify-center mx-auto mb-10 shadow-2xl shadow-indigo-100 rotate-3">
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
          className={`w-full bg-surface-dark text-white py-6 rounded-3xl font-bold flex items-center justify-center gap-4 hover:bg-black apple-transition active:scale-[0.98] shadow-2xl shadow-slate-200 group text-[17px] ${isLoggingIn ? "opacity-50 cursor-not-allowed" : ""}`}
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

        <div className="mt-12 flex items-center justify-center gap-3 text-[13px] font-semibold text-ink-muted">
          <ShieldCheck className="w-4 h-4 text-[#34C759]" />
          Secure Enterprise Authentication
        </div>
      </motion.div>
    </div>
  );
};
