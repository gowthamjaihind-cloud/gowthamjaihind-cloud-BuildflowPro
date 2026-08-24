import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import {
  PaperPlaneTilt as Send,
  CheckCircle as CheckCircle2,
  Copy,
  ArrowsClockwise as RefreshCw,
  WarningCircle as AlertCircle,
  TelegramLogo,
} from "@phosphor-icons/react";
import { UserProfile } from "../types";
import { db, collection, query, where, getDocs, setDoc, doc } from "../firebase";
import { updateDoc, deleteField } from "firebase/firestore";
import { useL } from "../i18n";

interface TelegramIntegrationProps {
  currentUser: UserProfile;
}

export const TelegramIntegration: React.FC<TelegramIntegrationProps> = ({ currentUser }) => {
  const L = useL();
  const [loading, setLoading] = useState(false);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [displayCode, setDisplayCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // One-tap deep link: opens the bot and auto-sends "/start <code>", which the
  // webhook redeems just like "/link CODE" — no copy-paste needed.
  const deepLink =
    botUsername && activeCode
      ? `https://t.me/${botUsername.replace(/^@/, "")}?start=${activeCode}`
      : null;

  // Fetch the bot's username (for the deep link) from the same status endpoint
  // the "Bot Online" badge uses.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/telegram-status")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.bot?.username) setBotUsername(d.bot.username);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Render a QR of the deep link so a desktop user can scan it with their phone.
  useEffect(() => {
    if (!deepLink) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(deepLink, { margin: 1, width: 220 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [deepLink]);

  // Any signed-in member may link THEIR OWN Telegram account. (The bot is most
  // useful for Site Engineers filing daily logs, so it must not be admin-gated.)
  // Firestore rules still only allow a user to create a link code for themselves.
  const hasAccess = true;

  const fetchActiveCode = async () => {
    if (!hasAccess) return;
    try {
      setLoading(true);
      setError(null);
      const q = query(
        collection(db, "bot_link_codes"),
        where("userId", "==", currentUser.uid),
        where("used", "==", false)
      );
      const snap = await getDocs(q);
      const now = Date.now();
      
      let foundCode = null;
      let foundExpiry = null;

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.expiresAt > now) {
          foundCode = docSnap.id;
          foundExpiry = data.expiresAt;
        }
      });

      setActiveCode(foundCode);
      if (foundCode) {
        setDisplayCode(`${foundCode.slice(0,4)}-${foundCode.slice(4,8)}`);
      }
      setExpiresAt(foundExpiry);
    } catch (err: any) {
      console.error("Error fetching code:", err);
      setError(L("Failed to fetch link code","இணைப்புக் குறியீட்டைப் பெற முடியவில்லை"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveCode();
  }, [currentUser.uid, hasAccess]);

  const generateCode = async () => {
    if (!hasAccess) return;
    try {
      setLoading(true);
      setError(null);
      
      // Generate random 8-character alphanumeric code XXXX-XXXX
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let randomString = "";
      for (let i = 0; i < 8; i++) {
        randomString += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const rawCode = randomString;
      const dCode = `${rawCode.slice(0,4)}-${rawCode.slice(4,8)}`;
      
      const now = Date.now();
      const expiry = now + 15 * 60 * 1000; // 15 mins

      const data = {
        userId: currentUser.uid,
        email: currentUser.email,
        createdAt: now,
        expiresAt: expiry,
        used: false,
      };

      if (currentUser.currentOrgId) {
        (data as any).orgId = currentUser.currentOrgId;
      }

      await setDoc(doc(db, "bot_link_codes", rawCode), data);
      
      setActiveCode(rawCode);
      setDisplayCode(dCode);
      setExpiresAt(expiry);
    } catch (err: any) {
      console.error("Error generating code:", err);
      setError(L("Failed to generate code","குறியீட்டை உருவாக்க முடியவில்லை"));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (displayCode) {
      navigator.clipboard.writeText(`/link ${displayCode}`);
    }
  };

  const unlinkBot = async () => {
    try {
      setLoading(true);
      setError(null);
      await updateDoc(doc(db, "users", currentUser.uid), {
        telegramChatId: deleteField(),
        telegramLinkedAt: deleteField()
      });
      // Option: could also remove the bot session, but leaving it is probably fine or we can delete it too
    } catch (err: any) {
      console.error("Error unlinking:", err);
      setError(L("Failed to unlink bot","போட்டை இணைப்பு நீக்க முடியவில்லை"));
    } finally {
      setLoading(false);
    }
  };

  if (!hasAccess) {
    return (
      <div className="bg-surface p-6 rounded-2xl border border-divider">
        <p className="text-ink-muted text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-primary" />
          {L("You do not have permission to link a Telegram bot. Contact an Administrator.","டெலிகிராம் போட்டை இணைக்க உங்களுக்கு அனுமதி இல்லை. நிர்வாகியைத் தொடர்புகொள்ளவும்.")}
        </p>
      </div>
    );
  }

  const isLinked = !!currentUser.telegramChatId;

  return (
    <div className="space-y-6">
      <div className="bg-surface p-6 rounded-[20px] flex flex-col md:flex-row md:items-center justify-between shadow-sm border border-divider gap-4">
        <div>
          <div className="font-bold text-ink flex items-center gap-2">
            {L("Telegram Bot Status","டெலிகிராம் போட் நிலை")}
            {isLinked ? (
              <span className="px-2 py-0.5 bg-success/20 text-success text-xs rounded-full flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3 h-3" /> {L("Linked","இணைக்கப்பட்டது")} ✅
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-ice text-[#56778E] text-xs rounded-full font-medium">
                {L("Not linked","இணைக்கப்படவில்லை")}
              </span>
            )}
          </div>
          <div className="text-sm text-ink-muted mt-1 max-w-md">
            {L("Connect your Telegram account to receive real-time notifications and interact with the project bot.","நிகழ்நேர அறிவிப்புகளைப் பெறவும், செயல்திட்ட போட்டுடன் தொடர்பு கொள்ளவும் உங்கள் டெலிகிராம் கணக்கை இணைக்கவும்.")}
          </div>
        </div>
        
        {!activeCode && (
          <div className="flex items-center gap-3">
            {isLinked && (
              <button
                onClick={unlinkBot}
                disabled={loading}
                className="px-4 py-2 bg-danger/8 text-danger font-semibold rounded-xl hover:bg-danger/15 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : L("Unlink Bot","போட்டை இணைப்பு நீக்கு")}
              </button>
            )}
            <button
              onClick={generateCode}
              disabled={loading}
              className="px-4 py-2 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isLinked ? L("Generate New Link Code","புதிய இணைப்புக் குறியீட்டை உருவாக்கு") : L("Link Telegram Bot","டெலிகிராம் போட்டை இணை")}
            </button>
          </div>
        )}
      </div>

      {!isLinked && (
        <div className="bg-surface p-6 rounded-[20px] border border-divider shadow-sm">
          <div className="font-bold text-ink mb-1">{L("Connect in 3 easy steps","3 எளிய படிகளில் இணைக்கவும்")}</div>
          <p className="text-sm text-ink-muted mb-5">{L("Takes about 20 seconds — no typing needed.","சுமார் 20 வினாடிகள் ஆகும் — தட்டச்சு தேவையில்லை.")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { n: "1", emoji: "👆", title: "Tap “Connect”", taTitle: "“இணை” என்பதைத் தட்டவும்", body: "Tap the blue Connect Telegram button. On a computer, scan the QR code with your phone instead.", taBody: "நீல Connect Telegram பொத்தானைத் தட்டவும். கணினியில், அதற்குப் பதிலாக உங்கள் ஃபோனில் QR குறியீட்டை ஸ்கேன் செய்யவும்." },
              { n: "2", emoji: "▶️", title: "Tap “Start”", taTitle: "“Start” என்பதைத் தட்டவும்", body: "Telegram opens the bot. Tap the Start button at the bottom of the chat.", taBody: "டெலிகிராம் போட்டைத் திறக்கும். அரட்டையின் கீழே உள்ள Start பொத்தானைத் தட்டவும்." },
              { n: "3", emoji: "✅", title: "You’re linked", taTitle: "நீங்கள் இணைக்கப்பட்டீர்கள்", body: "That’s it. Send /log in the chat to file a daily site update from your phone.", taBody: "அவ்வளவுதான். உங்கள் ஃபோனிலிருந்து தினசரி தள புதுப்பிப்பைப் பதிவு செய்ய அரட்டையில் /log அனுப்பவும்." },
            ].map((s) => (
              <div key={s.n} className="relative bg-panel rounded-2xl p-4 border border-divider">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-7 h-7 rounded-full bg-primary text-white text-sm font-black flex items-center justify-center shrink-0">{s.n}</span>
                  <span className="text-2xl leading-none">{s.emoji}</span>
                </div>
                <div className="font-bold text-ink text-sm">{L(s.title, s.taTitle)}</div>
                <div className="text-xs text-ink-muted mt-1 leading-relaxed">{L(s.body, s.taBody)}</div>
              </div>
            ))}
          </div>
          {!activeCode && (
            <button
              onClick={generateCode}
              disabled={loading}
              className="mt-5 w-full sm:w-auto px-5 py-3 bg-[#229ED9] hover:bg-[#1c8dc4] text-white font-bold rounded-xl transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TelegramLogo weight="fill" className="w-5 h-5" />}
              {L("Start — get my connect link","தொடங்கு — என் இணைப்பு லிங்கைப் பெறு")}
            </button>
          )}
        </div>
      )}

      {activeCode && (
        <div className="bg-blue-50/50 p-6 rounded-[20px] border border-[#6E8CA0]/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#6E8CA0]"></div>
          <h4 className="font-bold text-[#27363F] mb-2">{L("Connect your Telegram","உங்கள் டெலிகிராமை இணைக்கவும்")}</h4>
          <p className="text-sm text-[#46617C] mb-4">
            {L("On this phone, tap", "இந்த ஃபோனில்,")} <b>Connect Telegram</b> {L("(on a computer, scan the QR with your phone's camera). This link expires in 15 minutes.", "என்பதைத் தட்டவும் (கணினியில், உங்கள் ஃபோன் கேமராவால் QR ஐ ஸ்கேன் செய்யவும்). இந்த லிங்க் 15 நிமிடங்களில் காலாவதியாகும்.")}
          </p>

          {deepLink && (
            <div className="flex flex-col sm:flex-row items-center gap-5 mb-5">
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="Scan to connect Telegram"
                  className="w-32 h-32 rounded-xl bg-white p-1.5 border border-[#6E8CA0]/30 shrink-0"
                />
              )}
              <div className="flex-1 w-full">
                <a
                  href={deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#229ED9] hover:bg-[#1c8dc4] text-white font-bold rounded-xl transition-colors"
                >
                  <TelegramLogo weight="fill" className="w-5 h-5" /> {L("Connect Telegram","டெலிகிராமை இணை")}
                </a>
                <p className="text-[10px] text-[#46617C] mt-2 text-center sm:text-left">
                  {L("Opens the bot and links your account automatically — no typing.","போட்டைத் திறந்து உங்கள் கணக்கைத் தானாக இணைக்கிறது — தட்டச்சு இல்லை.")}
                </p>
              </div>
            </div>
          )}

          <p className="text-[10px] font-black text-[#46617C]/70 uppercase tracking-widest mb-2">
            {L("Or send this command to the bot","அல்லது இந்தக் கட்டளையை போட்டுக்கு அனுப்பவும்")}
          </p>
          <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-[#6E8CA0]/30">
            <code className="flex-1 font-mono text-lg font-bold text-ink text-center">
              /link {displayCode}
            </code>
            <button
              onClick={copyToClipboard}
              className="p-2 hover:bg-[#6E8CA0]/10 text-[#56778E] rounded-lg transition-colors"
              title={L("Copy to clipboard","கிளிப்போர்டுக்கு நகலெடு")}
            >
              <Copy className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 flex justify-end">
             <button
                onClick={generateCode}
                disabled={loading}
                className="text-sm font-medium text-[#56778E] hover:text-[#46617C] flex items-center gap-1"
             >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {L("Generate new code","புதிய குறியீட்டை உருவாக்கு")}
             </button>
          </div>
        </div>
      )}
      
      {error && (
        <div className="p-4 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
};
