// === START PART 1 ===

// pages/mleo-miners.js
// v5.9-patches
import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";



// --- iOS 100vh fix (sets --app-100vh = window.innerHeight) ---
// --- iOS 100vh fix (sets --app-100vh = visual viewport height) ---
function useIOSViewportFix() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;

    const setVH = () => {
      const h = vv ? vv.height : window.innerHeight;
      root.style.setProperty("--app-100vh", `${Math.round(h)}px`);
    };

    // init + “התייצבות” אחרי שינוי אוריינטציה
    const onOrient = () => requestAnimationFrame(() => setTimeout(setVH, 250));

    setVH();
    if (vv) {
      vv.addEventListener("resize", setVH);
      vv.addEventListener("scroll", setVH); // URL bar collapse/expand
    }
    window.addEventListener("orientationchange", onOrient);

    return () => {
      if (vv) {
        vv.removeEventListener("resize", setVH);
        vv.removeEventListener("scroll", setVH);
      }
      window.removeEventListener("orientationchange", onOrient);
    };
  }, []);
}



// ====== Config ======
const LANES = 4;
const SLOTS_PER_LANE = 4;
const MAX_MINERS = LANES * SLOTS_PER_LANE;
const PADDING = 6;
const LS_KEY = "mleoMiners_v5_83_reset3";
// First–play terms acceptance gate (global versioned)
const TERMS_VERSION = "v1.2"; // ⬅️ bump to force re-accept if text changes
const TERMS_KEY = `mleoMiners_termsAccepted_${TERMS_VERSION}`;

// Assets
const IMG_BG    = "/images/bg-cave.png";
const IMG_MINER = "/images/leo-miner-4x.png";
const IMG_ROCK  = "/images/rock.png";
const IMG_COIN  = "/images/silver.png";
const IMG_TOKEN = "/images/coin3.png";
const IMG_SPAWN_ICON = "/images/coin4.png";

// SFX
const S_CLICK = "/sounds/click.mp3";
const S_MERGE = "/sounds/merge.mp3";
const S_ROCK  = "/sounds/rock.mp3";
const S_GIFT  = "/sounds/gift.mp3";

// ===== Debug helpers =====
 const DEBUG_LS = "MLEO_DEBUG_UI";
 const DEBUG_HOSTS = ["localhost","127.0.0.1","0.0.0.0"];
 function getDebugFlag(){
   try { return localStorage.getItem(DEBUG_LS) === "1"; } catch { return false; }
 }
 function setDebugFlag(on){
   try { if(on) localStorage.setItem(DEBUG_LS,"1"); else localStorage.removeItem(DEBUG_LS); } catch {}
 }
 function isLocalHost(){
   try { return DEBUG_HOSTS.includes(location.hostname); } catch { return false; }
 }
 try {
   if (typeof window !== "undefined") {
     const z = localStorage.getItem("SPAWN_ICON_ZOOM");
     const y = localStorage.getItem("SPAWN_ICON_SHIFT_Y");
     if (z) window.SPAWN_ICON_ZOOM = parseFloat(z);
     if (y) window.SPAWN_ICON_SHIFT_Y = parseInt(y,10);
   }
 } catch {}
 

// ===== UI constants =====
const UI_BTN_H_PX = 60;
const UI_SPAWN_ICON_BOX = Math.round(UI_BTN_H_PX * 0.5);
const UI_SPAWN_ICON_ZOOM =
  (typeof window !== "undefined" && window.SPAWN_ICON_ZOOM) || 1.55;
const UI_SPAWN_ICON_SHIFT_Y =
  (typeof window !== "undefined" && window.SPAWN_ICON_SHIFT_Y) || 0;

// Balance
const BASE_DPS = 2;
const LEVEL_DPS_MUL = 1.9;
const ROCK_BASE_HP = 60;
const ROCK_HP_MUL = 2.15;
const GOLD_FACTOR = 0.12;

// ===== Global gift phases (same for everyone) =====
const GIFT_PHASES = [
  { durSec: 30 * 60, intervalSec: 20 },
  { durSec: 30 * 60, intervalSec: 30 },
  { durSec: 30 * 60, intervalSec: 40 },
  { durSec: 30 * 60, intervalSec: 50 },
  { durSec: 60 * 60, intervalSec: 60 },
];
const GIFT_TOTAL_SEC = GIFT_PHASES.reduce((a, p) => a + p.durSec, 0);
const GLOBAL_ANCHOR_MS = Date.UTC(2025, 0, 1, 0, 0, 0); // 2025-01-01 00:00:00Z

function phaseAtGlobal(nowMs = Date.now()) {
  const cyc = Math.floor((nowMs - GLOBAL_ANCHOR_MS) / 1000);
  const mod = ((cyc % GIFT_TOTAL_SEC) + GIFT_TOTAL_SEC) % GIFT_TOTAL_SEC;
  let acc = 0;
  for (let i = 0; i < GIFT_PHASES.length; i++) {
    const ph = GIFT_PHASES[i];
    if (mod < acc + ph.durSec) {
      const into = mod - acc;
      const step = ph.intervalSec;
      const remainToNextGiftSec = step - (into % step || step);
      return { index:i, intervalSec: step, into, phaseRemainSec: ph.durSec - into, remainToNextGiftSec };
    }
    acc += ph.durSec;
  }
  const last = GIFT_PHASES[GIFT_PHASES.length - 1];
  return { index: GIFT_PHASES.length - 1, intervalSec: last.intervalSec, into: 0, phaseRemainSec: last.durSec, remainToNextGiftSec: last.intervalSec };
}

// === Gift timing helpers (global-cycle based) ===
// משתמשים בפאזה הגלובלית כדי לקבל את אורך המרווח הנוכחי,
// ומעדכנים s.lastGiftIntervalSec כדי שה-HUD יציג את אותו מרווח.
function getPhaseInfo(s, now = Date.now()) {
  const ph = phaseAtGlobal(now);
  return {
    index: ph.index,
    into: ph.into,
    remain: ph.remainToNextGiftSec,
    intervalSec: ph.intervalSec,
    phaseRemainSec: ph.phaseRemainSec,
  };
}

function currentGiftIntervalSec(s, now = Date.now()) {
  const ph = phaseAtGlobal(now);
  if (s) s.lastGiftIntervalSec = ph.intervalSec; // לשמירה לשכבת ה־HUD בלבד
  return ph.intervalSec;
}



// פרסים
const DIAMOND_PRIZES = [
  { key: "coins_x10",   label: "Coins ×1000% (×10 gift)" },
  { key: "dog+3",       label: "Dog +3 levels" },
  { key: "coins_x100",  label: "Coins ×10000% (×100 gift)" },
  { key: "dog+5",       label: "Dog +5 levels" },
  { key: "coins_x1000", label: "Coins ×100000% (×1000 gift)" },
  { key: "dog+7",       label: "Dog +7 levels" },
];
function rollDiamondPrize() {
  const r = Math.random();
  if (r < 0.55) return Math.random() < 0.5 ? "coins_x10" : "dog+3";
  if (r < 0.85) return Math.random() < 0.5 ? "coins_x100" : "dog+5";
  return Math.random() < 0.5 ? "coins_x1000" : "dog+7";
}


// ===== Formatting =====
const formatShort = (n) => {
  const abs = Math.abs(n || 0);
  if (abs >= 1e12) return (n / 1e12).toFixed(abs < 1e13 ? 1 : 0) + "T";
  if (abs >= 1e9)  return (n / 1e9 ).toFixed(abs < 1e10 ? 1 : 0) + "B";
  if (abs >= 1e6)  return (n / 1e6 ).toFixed(abs < 1e7  ? 1 : 0) + "M";
  if (abs >= 1e3)  return (n / 1e3 ).toFixed(abs < 1e4  ? 1 : 0) + "K";
  return String(Math.floor(n || 0));
};

// ===== Simple image cache =====
const IMG_CACHE = {};
function getImg(src) {
  if (!IMG_CACHE[src]) {
    const img = new Image();
    img.src = src;
    IMG_CACHE[src] = img;
  }
  return IMG_CACHE[src];
}

// ===== Mining Economy Layer (safe, local-only) =====
const MINING_LS_KEY = "mleoMiningEconomy_v2";

// —— Token & schedule (editable) ——
// הגדר כאן את תאריכי ההשקה (UTC ms). השאר null אם עדיין לא נקבע.
const PRESALE_START_MS = null;               // לדוגמה: Date.UTC(2025,0,15)
const PRESALE_DURATION_DAYS = 0;             // X ימים (כשיהיה)
const TGE_MS = null;                          // “השקה רשמית” של הטוקן

// האם הטוקן חי ברשת (מפעיל קליימים ל־Wallet UI)? זה נפרד מהחלון הלגאלי לפתיחה.
const TOKEN_LIVE = false; // דמו: כבוי. הפוך ל-true רק כשהחוזה וה-ABI מחוברים


// Claim unlock schedule (מצטבר): חודש 1=10%, 2=30%, 3=50%, 4=70%, 5=90%, 6+=100%
const CLAIM_SCHEDULE = [
  { monthFromTGE: 1, pct: 0.10 },
  { monthFromTGE: 2, pct: 0.30 },
  { monthFromTGE: 3, pct: 0.50 },
  { monthFromTGE: 4, pct: 0.70 },
  { monthFromTGE: 5, pct: 0.90 },
  { monthFromTGE: 6, pct: 1.00 },
];

// —— Conversion & daily limit (editable) ——
// אחוז המרה מיידית של Coins→MLEO רק משבירת סלעים (ברירת מחדל 10%)
const MLEO_FROM_COINS_PCT = 0.10;

// חיתוך רך לפי אחוז שימוש מה-DAILY_CAP – ערכי דוגמה (תוכל לשנות)
const SOFTCUT = [
  // עד 80% מהקאפ – 100% יעילות
  { upto: 0.80, factor: 1.00 },
  // 80–100% – 50% יעילות
  { upto: 1.00, factor: 0.50 },
  // 100–120% – 25% יעילות
  { upto: 1.20, factor: 0.25 },
  // מעבר לכך – 10% יעילות
  { upto: 9.99, factor: 0.10 },
];

// DPS במצב Offline יורד ב-50%
const OFFLINE_DPS_FACTOR = 0.5;

// פלח יומי כולל (דוגמה, נשאר כמו שהיה; ניתן לשנות)
const TOTAL_SUPPLY = 100_000_000_000; // 100B
const DAYS = 1825;                     // 5y
const DAILY_EMISSION = Math.floor(TOTAL_SUPPLY / DAYS);
// תקרת שחקן ליום (דוגמה: 2% מהפלח היומי)
const DAILY_CAP = Math.floor(DAILY_EMISSION * 0.02);


// ——— State I/O ———
function getTodayKey(){ return new Date().toISOString().slice(0,10); }
function loadMiningState(){
  try {
    const raw = localStorage.getItem(MINING_LS_KEY);
    if (raw) {
      const st = JSON.parse(raw);
      st.claimedTotal = st.claimedTotal || 0;
      st.history = Array.isArray(st.history) ? st.history : [];
      st.vault = st.vault || 0;
      st.claimedToWallet = st.claimedToWallet || 0; // מצטבר ל־Wallet
      return st;
    }
  } catch {}
  return { balance:0, minedToday:0, lastDay:getTodayKey(), scoreToday:0, claimedTotal:0, history:[], vault:0, claimedToWallet:0 };
}
function saveMiningState(st){
  try { localStorage.setItem(MINING_LS_KEY, JSON.stringify(st)); } catch {}
}

// ——— Terms helpers ———
function isTermsAccepted() {
  try { return localStorage.getItem(TERMS_KEY) === "yes"; } catch { return false; }
}
function acceptTerms() {
  try { localStorage.setItem(TERMS_KEY, "yes"); } catch {}
}

// ——— Softcut helpers ———
function softcutFactor(minedToday, dailyCap){
  const used = dailyCap>0 ? minedToday / dailyCap : 0;
  for (const seg of SOFTCUT){
    if (used <= seg.upto) return seg.factor;
  }
  return 0.10;
}

// === REPLACE: previewMleoFromCoins / addPlayerScorePoints / finalizeDailyRewardOncePerTick ===
const PREC = 2;
const round3 = (x) => Number((x || 0).toFixed(PREC));

// תצוגה מקדימה: כמה MLEO יתווספו עבור X Coins (כולל חיתוך רך ותקרה יומית) — עשרוני
function previewMleoFromCoins(coins){
  if (!coins || coins<=0) return 0;
  const st = loadMiningState();
  const base   = (coins * MLEO_FROM_COINS_PCT);                      // בלי floor
  const factor = softcutFactor(st.minedToday||0, DAILY_CAP);
  let eff = base * factor;
  const room = Math.max(0, (DAILY_CAP - (st.minedToday||0)));        // עשרוני
  eff = Math.min(eff, room);
  return round3(eff);
}

// נקודות “כרייה” מתווספות רק משבירת סלעים — עשרוני
function addPlayerScorePoints(_s, coinsFromRocks){
  if(!coinsFromRocks || coinsFromRocks<=0) return;
  const st = loadMiningState();
  const today = getTodayKey();
  if(st.lastDay!==today){ st.minedToday=0; st.scoreToday=0; st.lastDay=today; }

  const factor = softcutFactor(st.minedToday||0, DAILY_CAP);
  const baseMleo = (coinsFromRocks * MLEO_FROM_COINS_PCT);           // בלי floor
  let eff = baseMleo * factor;
  const room = Math.max(0, DAILY_CAP - (st.minedToday||0));
  eff = Math.min(eff, room);

  st.minedToday = round3((st.minedToday||0) + eff);
  st.balance    = round3((st.balance||0)    + eff);
  saveMiningState(st);
}

// מחסום קשיח — אם עברנו קאפ מסיבה כלשהי, לחתוך בעשרוני
function finalizeDailyRewardOncePerTick(){
  const st = loadMiningState();
  const today = getTodayKey();
  if(st.lastDay!==today) return;
  if((st.minedToday||0) > DAILY_CAP) {
    const diff = round3((st.minedToday||0) - DAILY_CAP);
    st.minedToday = round3(DAILY_CAP);
    st.balance    = round3(Math.max(0, (st.balance||0) - diff));
    saveMiningState(st);
  }
}



// ——— Claim schedule logic ———
function monthsSinceTGE(now=Date.now()){
  if (!TGE_MS) return null;
  if (now < TGE_MS) return -1;
  const diff = now - TGE_MS;
  return Math.floor(diff / (30*24*60*60*1000)); // חודש=30 יום
}
function currentClaimPct(now=Date.now()){
  const m = monthsSinceTGE(now);
  if (m===null || m<0) return 0;
  let pct = 0;
  for (const step of CLAIM_SCHEDULE){
    if (m >= step.monthFromTGE) pct = Math.max(pct, step.pct);
  }
  return pct;
}
function walletClaimEnabled(now=Date.now()){
  const m = monthsSinceTGE(now);
  return TOKEN_LIVE && m!==null && m>=1; // מותר מחודש אחרי TGE
}
function remainingWalletClaimRoom(){
  const st = loadMiningState();
  const totalAccrued = (st.claimedTotal||0) + (st.vault||0) + (st.balance||0);
  const pct = currentClaimPct();
  const maxCumulative = Math.floor(totalAccrued * pct);
  const already = st.claimedToWallet || 0;
  return Math.max(0, maxCumulative - already);
}

// === helper components: TGE countdown + release bar ===
// שים ברמת הקובץ, לא בתוך onClaimMined/useEffect/return!

function TgeCountdown() {
  const [ts, setTs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!TGE_MS) return <div className="text-xs">TGE date not set.</div>;

  const remain = Math.max(0, TGE_MS - ts);
  if (remain === 0) return <div className="text-xs">TGE has started.</div>;

  const d = Math.floor(remain / (24*3600*1000));
  const h = Math.floor((remain % (24*3600*1000)) / (3600*1000));
  const m = Math.floor((remain % (3600*1000)) / (60*1000));
  const s = Math.floor((remain % (60*1000)) / 1000);
  return <div className="text-sm">{d}d {h}h {m}m {s}s</div>;
}

function WalletReleaseBar() {
  const pct = Math.round(currentClaimPct(Date.now()) * 100);
  return (
    <div className="w-full h-2 bg-white/60 rounded overflow-hidden mb-1">
      <div className="h-2 bg-amber-500" style={{ width: `${pct}%` }} />
    </div>
  );
}


// === END PART 1 ===




// === START PART 2 ===
export default function MleoMiners() {
  useIOSViewportFix();
  const wrapRef   = useRef(null);
  const canvasRef = useRef(null);
  const rafRef    = useRef(0);
  const dragRef   = useRef({ active:false });
  const stateRef  = useRef(null);
const flagsRef = useRef({ isMobileLandscape: false, paused: true });
const { openConnectModal } = useConnectModal();
const { openAccountModal } = useAccountModal();
const { isConnected } = useAccount();



  const [ui, setUi] = useState({
    gold: 0,
    spawnCost: 50,
    dpsMult: 1,
    goldMult: 1,
    muted: false,
  });

  
  const [isDesktop,  setIsDesktop]  = useState(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);

  const [showIntro, setShowIntro] = useState(true);
  const [gamePaused, setGamePaused] = useState(true);
  const [showTerms, setShowTerms] = useState(false);
  const [firstTimeNeedsTerms, setFirstTimeNeedsTerms] = useState(false);
const [showFullHistory, setShowFullHistory] = useState(false);

  const [showHowTo, setShowHowTo] = useState(false);
const [showMiningInfo, setShowMiningInfo] = useState(false);
    const [adCooldownUntil, setAdCooldownUntil] = useState(0);
  const [showAdModal, setShowAdModal] = useState(false);
  const [adVideoEnded, setAdVideoEnded] = useState(false);
const [showMleoModal, setShowMleoModal] = useState(false);


  const [showCollect, setShowCollect] = useState(false);

  const [giftReadyFlag, setGiftReadyFlag] = useState(false);
  const [giftToast, setGiftToast] = useState(null);

  const [showDiamondInfo, setShowDiamondInfo] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
const [mounted, setMounted] = useState(false);
const [debugUI, setDebugUI] = useState(false); // ← NEW

// === Mining HUD state (CLAIM) ===
const [mining, setMining] = useState({
  balance: 0, minedToday: 0, lastDay: "", scoreToday: 0,
  vault: 0, claimedTotal: 0, history: []
});
const [claiming, setClaiming] = useState(false); // ← הוסף את זה

// === PATCH: auto-open "How it works" (Mining) once per session, when game starts ===
useEffect(() => {
  // open only after intro is closed (in mining screen)
  if (showIntro) return;
  try {
    const K = "mleo_howitworks_seen";
    if (sessionStorage.getItem(K) !== "1") {
      setShowMiningInfo(true);     // reuse the Mining modal for "how it works"
      sessionStorage.setItem(K, "1");
    }
  } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [showIntro]);


// Check terms status on mount
useEffect(() => {
  const accepted = isTermsAccepted();
  setFirstTimeNeedsTerms(!accepted);
  if (!accepted) {
    // Do not auto-open modal here; we show a banner and gate PLAY/CONNECT.
  }
}, []);

// ===== Debug UI bootstrap (URL ?debug=1, LS flag, or auto on localhost) =====
 useEffect(() => {
   let on = false;
   try {
     const qs = new URLSearchParams(window.location.search);
     if (qs.get("debug") === "1") on = true;
   } catch {}
   if (!on) on = getDebugFlag();
   if (!on && isLocalHost()) on = true; // auto-enable on localhost
   setDebugUI(on);
   if (on) setDebugFlag(true);
 
   // Shift+D toggle
   const onKey = (e) => {
     if (!e) return;
     const k = (e.key || "").toLowerCase();
     if (k === "d" && e.shiftKey) {
       setDebugUI(v => { const nv = !v; setDebugFlag(nv); return nv; });
     }
   };
   window.addEventListener("keydown", onKey);
   return () => window.removeEventListener("keydown", onKey);
 }, []);



// טוען/מרענן סטטוס ה־Mining מה־localStorage פעם בשניה (אחרי mount)
useEffect(() => {
  if (!mounted) return;
  try { setMining(loadMiningState()); } catch {}
  const id = setInterval(() => {
    try { setMining(loadMiningState()); } catch {}
  }, 1000);
  return () => clearInterval(id);
}, [mounted]);

// onClaimMined — CLAIM (Demo): תמיד שולח ל־Vault
async function onClaimMined() {
  try { play?.(S_CLICK); } catch {}

  const st  = loadMiningState();
  const amt = Number((st?.balance || 0).toFixed(2));

  if (!amt) {
    setGiftToastWithTTL("No tokens to claim");
    return;
  }

// === DEMO handlers for Mining ===

// דמו: מעביר את כל ה-BALANCE ל־Vault ושומר היסטוריה
function claimBalanceToVaultDemo() {
  try { play?.(S_CLICK); } catch {}
  const st  = loadMiningState();
  const amt = Number((st?.balance || 0).toFixed(2));
  if (!amt) { setGiftToastWithTTL("No tokens to claim"); return; }

  st.vault        = Number(((st.vault || 0) + amt).toFixed(2));
  st.claimedTotal = Number(((st.claimedTotal || 0) + amt).toFixed(2));
  st.history      = Array.isArray(st.history) ? st.history : [];
  st.history.unshift({ ts: Date.now(), amt, type: "to_vault" });
  st.balance = 0;

  saveMiningState(st);
  setMining(st);
  setGiftToastWithTTL(`Moved ${amt.toFixed(3)} MLEO to Vault`);
}

// כפתור CLAIM — דמו: תמיד Vault
async function onClaimMined() {
  // מצב דמו בלבד
  claimBalanceToVaultDemo();
  return;

  /* ================== ENABLE AFTER LAUNCH (Mainnet/Testnet) ==================
  // אם תרצה לפתוח קליים לארנק אחרי ההשקה, כבה את ה-early return מעל
  // והפעל את הבלוק להלן (התאם לוגיקה/ABI/כתובת)
  try { play?.(S_CLICK); } catch {}
  const st  = loadMiningState();
  const amt = Number((st?.balance || 0).toFixed(2));
  if (!amt) { setGiftToastWithTTL("No tokens to claim"); return; }

  const now = Date.now();
  if (!walletClaimEnabled(now)) {
    setGiftToastWithTTL("Wallet claim locked until 1 month after TGE");
    return;
  }
  const room = remainingWalletClaimRoom();
  if (room <= 0) { setGiftToastWithTTL("Wallet claim limit reached for now"); return; }
  if (!isConnected) { openConnectModal?.(); return; }

  setClaiming(true);
  try {
    const sendAmt = Number(Math.min(amt, room).toFixed(2));
    await writeContract({
      address: "0xYourTokenAddressHere",
      abi: ERC20_ABI,
      functionName: "claim", // עדכן לפי החוזה
      args: [sendAmt],
    });

    st.balance         = Number(((st.balance || 0) - sendAmt).toFixed(2));
    st.claimedToWallet = Number(((st.claimedToWallet || 0) + sendAmt).toFixed(2));
    st.claimedTotal    = Number(((st.claimedTotal || 0)    + sendAmt).toFixed(2));
    st.history = Array.isArray(st.history) ? st.history : [];
    st.history.unshift({ ts: Date.now(), amt: sendAmt, type: "to_wallet" });

    saveMiningState(st);
    setMining(st);
    setGiftToastWithTTL(`🪙 CLAIMED ${sendAmt.toFixed(2)} MLEO to wallet`);
  } catch (err) {
    console.error(err);
    setGiftToastWithTTL("Claim failed");
  } finally {
    setClaiming(false);
  }
  ============================================================================
  */
}



  // אם הטוקן עדיין לא חי → רק Vault (לשלב דמו)
  if (!TOKEN_LIVE) {
    st.vault        = Number(((st.vault || 0) + amt).toFixed(2));
    st.claimedTotal = Number(((st.claimedTotal || 0) + amt).toFixed(2));
    st.history      = Array.isArray(st.history) ? st.history : [];
    st.history.unshift({ ts: Date.now(), amt, type: "to_vault" });
    st.balance = 0;
    saveMiningState(st);
    setMining(st);
    setGiftToastWithTTL(`Moved ${amt.toFixed(3)} MLEO to Vault`);
    return;
  }

  // אם חי → ניסיון שליחה לארנק
  const now = Date.now();
  if (!walletClaimEnabled(now)) {
    setGiftToastWithTTL("Wallet claim locked until 1 month after TGE");
    return;
  }
  const room = remainingWalletClaimRoom();
  if (room <= 0) {
    setGiftToastWithTTL("Wallet claim limit reached for now");
    return;
  }
  if (!isConnected) { openConnectModal?.(); return; }

  setClaiming(true);
  try {
    const sendAmt = Number(Math.min(amt, room).toFixed(2));
    // ✨ קריאה אמיתית לחוזה (דוגמה ל־BNB Testnet):
    await writeContract({
      address: "0xYourTokenAddressHere",
      abi: ERC20_ABI,
      functionName: "claim", // או הפונקציה שלך
      args: [sendAmt],
    });

    st.balance         = Number(((st.balance || 0) - sendAmt).toFixed(2));
    st.claimedToWallet = Number(((st.claimedToWallet || 0) + sendAmt).toFixed(2));
    st.claimedTotal    = Number(((st.claimedTotal || 0)    + sendAmt).toFixed(2));
    st.history = Array.isArray(st.history) ? st.history : [];
    st.history.unshift({ ts: Date.now(), amt: sendAmt, type: "to_wallet" });
    saveMiningState(st);
    setMining(st);
    setGiftToastWithTTL(`🪙 CLAIMED ${sendAmt.toFixed(2)} MLEO to wallet`);
  } catch (err) {
    console.error(err);
    setGiftToastWithTTL("Claim failed");
  } finally {
    setClaiming(false);
  }
}



// Debug live values for the panel (controlled inputs)
const [debugVals, setDebugVals] = useState({
  minerScale: stateRef.current?.minerScale ?? 1.60,
  minerWidth: stateRef.current?.minerWidth ?? 0.8,
  spawnIconZoom:
    (typeof window !== "undefined" && (window.SPAWN_ICON_ZOOM ?? Number(localStorage.getItem("SPAWN_ICON_ZOOM")))) || 1.5,
  spawnIconShiftY:
    (typeof window !== "undefined" && (window.SPAWN_ICON_SHIFT_Y ?? Number(localStorage.getItem("SPAWN_ICON_SHIFT_Y")))) || 0,
});

// כשפותחים את הפאנל – למשוך ערכים עדכניים מה־stateRef ומה־window
useEffect(() => {
  if (!debugUI) return;
  const s = stateRef.current || {};
  const zoom = (typeof window !== "undefined" && (window.SPAWN_ICON_ZOOM ?? Number(localStorage.getItem("SPAWN_ICON_ZOOM")))) || 2.2;
  const shift = (typeof window !== "undefined" && (window.SPAWN_ICON_SHIFT_Y ?? Number(localStorage.getItem("SPAWN_ICON_SHIFT_Y")))) || 0;
  setDebugVals({
    minerScale: s.minerScale ?? 1.6,
    minerWidth: s.minerWidth ?? 0.8,
    spawnIconZoom: Number(zoom) || 2.2,
    spawnIconShiftY: Number(shift) || 0,
  });
}, [debugUI]);

  

  // פופאפ מרכזי (למתנות + שבירת סלע) — נסגר אוטומטית
  const [centerPopup, setCenterPopup] = useState(null);

  

  const uiPulseAccumRef = useRef(0);
const rockSfxCooldownRef = useRef(0);
  const [, forceUiPulse] = useState(0);
// שמירת דגלים חיים (לנדסקייפ/פאוז) למאזינים
  useEffect(() => {
    flagsRef.current = {
      isMobileLandscape,
      paused: (gamePaused || showIntro || showCollect),
    };
  }, [isMobileLandscape, gamePaused, showIntro, showCollect]);

  // סאונד
  const play = (src) => {
    if (ui.muted || !src) return;
    try { const a = new Audio(src); a.volume = 0.35; a.play().catch(()=>{}); } catch {}
  };

  // סגירת פופאפ אוטומטית
  useEffect(() => {
    if (!centerPopup) return;
    const id = setTimeout(() => setCenterPopup(null), 1800);
    return () => clearTimeout(id);
  }, [centerPopup]);

  // ── סטאבים/עזר ──
// ── מיגרציית שמירה קיימת (מעדכן מידות + זום אייקון ה-ADD) ──
function theStateFix_maybeMigrateLocalStorage(){
  try {
    const K = LS_KEY; // "mleoMiners_v5_83_reset3"
    const raw = localStorage.getItem(K);

    // עדכון/קיבוע זום האייקון גם בלי שמירה קיימת
    const zLS = localStorage.getItem("SPAWN_ICON_ZOOM");
    if (zLS === null || Number(zLS) !== 1.55) {
      localStorage.setItem("SPAWN_ICON_ZOOM", "1.55");
      if (typeof window !== "undefined") window.SPAWN_ICON_ZOOM = 1.55; // רינדור מיידי
    }

    if (!raw) return; // אין שמירה – freshState כבר נותן 1.6/0.8

    const s = JSON.parse(raw);
    let changed = false;

    if (typeof s.minerScale !== "number" || s.minerScale !== 1.6) {
      s.minerScale = 1.6; changed = true;
    }
    if (typeof s.minerWidth !== "number" || s.minerWidth !== 0.8) {
      s.minerWidth = 0.8; changed = true;
    }

    if (changed) localStorage.setItem(K, JSON.stringify(s));
  } catch {}
}


function grantGift(){
  const s = stateRef.current; if (!s) return;
  const type = rollGiftType(); // updated weights (no dog in regular gifts)

  if (type === "coins20") {
    // 70% → coins worth 20% of the rock
    const base = Math.max(10, expectedGiftCoinReward(s));
    const gain = Math.round(base * 0.20);
    s.gold += gain;
    setUi(u => ({ ...u, gold: s.gold }));
    setCenterPopup({ text: `🎁 +${formatShort(gain)} coins (20%)`, id: Math.random() });

  } else if (type === "coins40") {
    // 8% → coins worth 40% of the rock
    const base = Math.max(10, expectedGiftCoinReward(s));
    const gain = Math.round(base * 0.40);
    s.gold += gain;
    setUi(u => ({ ...u, gold: s.gold }));
    setCenterPopup({ text: `🎁 +${formatShort(gain)} coins (40%)`, id: Math.random() });

  } else if (type === "dps") {
    // 8% → DPS +10%
    s.dpsMult = +((s.dpsMult || 1) * 1.1).toFixed(2);
    setCenterPopup({ text: `🎁 DPS +10% (×${(s.dpsMult||1).toFixed(2)})`, id: Math.random() });

  } else if (type === "gold") {
    // 8% → GOLD +10%
    s.goldMult = +((s.goldMult || 1) * 1.1).toFixed(2);
    setCenterPopup({ text: `🎁 GOLD +10% (×${(s.goldMult||1).toFixed(2)})`, id: Math.random() });

  } else if (type === "diamond") {
    // 6% → +1 Diamond
    s.diamonds = (s.diamonds || 0) + 1;
    setCenterPopup({ text: `🎁 +1 💎 (Diamonds: ${s.diamonds})`, id: Math.random() });
  }

  s.giftReady = false;
  {
    const now = Date.now();
    const stepSec = currentGiftIntervalSec(s, now);
    s.giftNextAt = now + stepSec * 1000; // full interval after claim
  }

  setGiftReadyFlag(false);
  try { play(S_GIFT); } catch {}
  save?.();
}

// === END PART 2 ===



// === START PART 3 ===
// Init state + קנבס + ציור + לולאת משחק (שיפור UX של גרירה)

useEffect(() => {
  theStateFix_maybeMigrateLocalStorage();

  // טען שמירה אם יש
  const loaded = loadSafe();
  const init = loaded ? { ...freshState(), ...loaded } : freshState();

  // אם אין minerScale/Width בשמירה – ברירות מחדל
  if (loaded && loaded.minerScale == null) init.minerScale = 1.60;
  if (loaded && loaded.minerWidth  == null) init.minerWidth  = 0.8;

  // עוגן עלות ראשוני
  if (init.costBase == null) {
    try { init.costBase = Math.max(80, expectedRockCoinReward(init)); }
    catch { init.costBase = 120; }
  }

  stateRef.current = init;
  setUi(u => ({ ...u,
    gold: init.gold, spawnCost: init.spawnCost,
    dpsMult: init.dpsMult, goldMult: init.goldMult,
  }));
// סנכרון מיידי של הדגל הוויזואלי עם מצב האמת מהשמירה
setGiftReadyFlag(!!init.giftReady);


  // אם המתנה כבר מוכנה/טיימר חסר – תקן
 try {
  const now = Date.now();
  
  // אם אין giftNextAt — עגן לנקודת הטיקט הקרובה לפי הפאזה הגלובלית
 if (!init.giftNextAt || Number.isNaN(init.giftNextAt)) {
  init.giftReady  = false;
  const stepSec = currentGiftIntervalSec(init, now);
  init.giftNextAt = now + stepSec * 1000; // התחלה תמיד במרווח מלא
  save();
}


  // אם היינו OFFLINE ועבר הטיקט — מתנה אחת מוכנה; הבאה תיושר ב-grantGift/heartbeat
  if ((init.giftNextAt || 0) <= now) {
    init.giftReady = true;
    setGiftReadyFlag(true);
  }
} catch {}


  // טען קירור מודעה
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (typeof data.adCooldownUntil === "number") {
        setAdCooldownUntil(data.adCooldownUntil);
        if (stateRef.current) stateRef.current.adCooldownUntil = data.adCooldownUntil;
      }
    }
  } catch {}

  // בדיקת OFFLINE כבר ב־mount
  try {
    const s = stateRef.current;
    const now  = Date.now();
    const last = s?.lastSeen || now;
    const elapsedMs = Math.max(0, now - last);
    if (elapsedMs > 1000) {
      const gained = handleOfflineAccrual(s, elapsedMs); // PART 6
      if (gained > 0) setShowCollect(true);
      s.lastSeen = now;
      save();
    }
  } catch {}

  setMounted(true);

  // הגדרות מסך
  const updateFlags = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const portrait = h >= w, desktop = w >= 1024;
    setIsDesktop(desktop);
    setIsMobileLandscape(!portrait && !desktop);
    setGamePaused(p => (!portrait && !desktop) ? true : (showIntro ? true : false));
  };
  updateFlags();
  window.addEventListener("resize", updateFlags);
  window.addEventListener("orientationchange", updateFlags);
  document.addEventListener("fullscreenchange", updateFlags);

  // מנע גלילה כשגוררים על הקנבס
  const preventTouchScroll = (e) => { if (e.target.closest?.("#miners-canvas")) e.preventDefault(); };
  document.addEventListener("touchmove", preventTouchScroll, { passive:false });

  // אם הקנבס עדיין לא בהרכבה – נסה שוב פריים הבא
  const c0 = canvasRef.current;
  if (!c0) {
    const id = requestAnimationFrame(() => canvasRef.current && setupCanvasAndLoop(canvasRef.current));
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", updateFlags);
      window.removeEventListener("orientationchange", updateFlags);
      document.removeEventListener("fullscreenchange", updateFlags);
      document.removeEventListener("touchmove", preventTouchScroll);
    };
  }
  const cleanup = setupCanvasAndLoop(c0);

  // שמירת זמן יציאה / חזרה + צבירת OFFLINE
  const onVisibility = () => {
    const s = stateRef.current; if (!s) return;
    if (document.visibilityState === "hidden") {
      s.lastSeen = Date.now(); safeSave();
    } else {
      const now = Date.now();
      const elapsedMs = Math.max(0, now - (s.lastSeen || now));
      if (elapsedMs > 1000) {
        const gained = handleOfflineAccrual(s, elapsedMs); // PART 6
        if (gained > 0) setShowCollect(true);
        s.lastSeen = now;
      }
      safeSave();
    }
  };
  const onHide = () => { const s = stateRef.current; if (s) { s.lastSeen = Date.now(); safeSave(); } };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onHide);
  window.addEventListener("beforeunload", onHide);

  return () => {
    cleanup && cleanup();
    window.removeEventListener("resize", updateFlags);
    window.removeEventListener("orientationchange", updateFlags);
    document.removeEventListener("fullscreenchange", updateFlags);
    document.removeEventListener("touchmove", preventTouchScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("beforeunload", onHide);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [showIntro]);

// רנדר/סנכרון מתנות — 500ms heartbeat (תיקון: בלי "יישור", רק בדיקה)
useEffect(() => {
  const id = setInterval(() => {
    const s = stateRef.current; 
    if (!s) return;
    const now = Date.now();

    // אם אין טיימר – אתחל מרווח מלא לפי הפאזה הנוכחית
    if (!s.giftNextAt || Number.isNaN(s.giftNextAt)) {
      const stepSec = currentGiftIntervalSec(s, now);
      s.giftReady  = false;
      s.giftNextAt = now + stepSec * 1000;
      save();
      return;
    }

    // אם הגיע הזמן – המתנה מוכנה; לא נוגעים ביעד עד Claim
    if (!s.giftReady && s.giftNextAt <= now) {
      s.giftReady = true;
      setGiftReadyFlag(true);
      save();
    }
  }, 500);

  return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);



// רנדר חלק לשעונים (מתנה/כלב/GAIN) — פולס UI כל 200ms
useEffect(() => {
  const id = setInterval(() => {
    // שומר רענון קל ל-HUD/טבעות
    uiPulseAccumRef.current += 0.2;
    forceUiPulse(v => (v + 1) % 1000000);
   }, 200);
  return () => clearInterval(id);
  // בכוונה בלי giftReadyFlag כתלות — אנחנו קוראים מתוך closure ומתאפסים בכל רינדור ממילא
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);



// ---------- init/load/save ----------
function freshState(){
  const now = Date.now();
  return {
    lanes: Array.from({length:LANES},(_,lane)=>({
      slots: Array(SLOTS_PER_LANE).fill(null),
      rock: newRock(lane,0),
      rockCount: 0,
      beltShift: 0,
    })),
    miners:{}, nextId:1,

    gold:0, spawnCost:50, dpsMult:1, goldMult:1,

    // קנה מידה לכלב
    minerScale: 1.6, // גובה/סקייל כולל
    minerWidth: 0.8, // הרחבת רוחב בלבד

    anim:{ t:0, coins:[], hint:1, fx:[] },
    onceSpawned:false,
    totalPurchased:0, spawnLevel:1,
    lastSeen:now, pendingOfflineGold:0,
    pendingOfflineMleo:0, // ← חדש: כמה MLEO נצבר באופליין להצגה בחלון

    // Gifts/diamonds
    cycleStartAt: now, lastGiftIntervalSec: 20,
    giftNextAt: now + 20000, giftReady:false,
    diamonds:0, nextDiamondPrize: rollDiamondPrize(),

    // Auto-dog
    autoDogLastAt: now,
    autoDogBank: 0,
    autoDogPending: false, // כלב “מוכן” שממתין לסלוט פנוי

    // מודעות
    adCooldownUntil: 0,

    // תיבת יהלום מושהית אם אין מקום
    pendingDiamondDogLevel: null,
  };
}


function loadSafe(){
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function safeSave(){ try { save?.(); } catch {} }
// === END PART 3 ===



// === START PART 4 ===
// ---------- קנבס/ציור ----------
function setupCanvasAndLoop(cnv){
  const ctx = cnv.getContext("2d"); if (!ctx) return () => {};
  const DPR = window.devicePixelRatio || 1;

  const resize = () => {
    const isFS = !!document.fullscreenElement;

    let targetW, targetH;
    if (isFS) {
      targetW = Math.min(window.innerWidth || 360, 1024);
      targetH = Math.max(420, (window.innerHeight || 600) - 1);
      const wrap = cnv.parentElement;
      if (wrap) wrap.style.height = `${window.innerHeight}px`;
    } else {
      const wrap = cnv.parentElement;
      if (wrap) wrap.style.height = "";
      const rect = wrap?.getBoundingClientRect();
      const innerW = Math.max(320, Math.floor(wrap?.clientWidth  ?? rect?.width  ?? 360));
      const innerH = Math.max(420, Math.floor(wrap?.clientHeight ?? rect?.height ?? 600));
      targetW = Math.min(innerW, 1024);
      targetH = innerH;
    }

    cnv.style.width  = `${targetW}px`;
    cnv.style.height = `${targetH}px`;
    cnv.width  = Math.floor(targetW * DPR);
    cnv.height = Math.floor(targetH * DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
    draw();
  };

  const onFSResize = () => {
    resize();
    setTimeout(resize, 60);
  };

  window.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", onFSResize);
  resize();

  // קלט — גרירה ומיקום (UX משופר)
  const onDown = (e) => {
    const { isMobileLandscape: iml, paused } = flagsRef.current || {};
    if (iml || paused) return;
    const p = pos(e);
    const hit = pickMiner(p.x,p.y);
    if (hit) {
      dragRef.current = {
        active:true,
        id: hit.id,
        ox: p.x - hit.x,
        oy: p.y - hit.y,
        x: p.x - (p.x - hit.x),
        y: p.y - (p.y - hit.y),
      };
      return;
    }
    const pill = pickPill(p.x,p.y);
    if (pill) trySpawnAtSlot(pill.lane, pill.slot);
  };
  const onMove = (e) => {
    if (!dragRef.current.active) return;
    const p = pos(e);
    dragRef.current.x = p.x - dragRef.current.ox;
    dragRef.current.y = p.y - dragRef.current.oy;
    draw();
  };
  const onUp = (e) => {
    if (!dragRef.current.active) return;
    const s = stateRef.current; if (!s) return;
    const id = dragRef.current.id;
    const m = s.miners[id]; if (!m) { dragRef.current={active:false}; return; }
    const p = pos(e);
    const drop = pickSlot(p.x,p.y);
    const cur = s.lanes[m.lane];
    cur.slots[m.slot] = null;
    if (drop) {
      const {lane,slot} = drop;
      const target = s.lanes[lane].slots[slot];
      if (!target) {
        m.lane=lane; m.slot=slot; s.lanes[lane].slots[slot]={id};
      } else if (target.id!==id) {
        const other = s.miners[target.id];
        if (other && other.level===m.level) {
          delete s.miners[m.id]; delete s.miners[other.id];
          s.lanes[lane].slots[slot]=null;
          const nid = s.nextId++;
          s.miners[nid] = { id:nid, level:m.level+1, lane, slot, pop:1 };
          s.lanes[lane].slots[slot]={ id:nid };
          try { play?.(S_MERGE); } catch {}
        } else {
          cur.slots[m.slot] = { id:m.id };
        }
      }
      safeSave();
    } else {
      cur.slots[m.slot] = { id:m.id };
    }
    dragRef.current={active:false};
    draw();
  };

  cnv.addEventListener("mousedown", onDown);
  cnv.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
   // מאזיני טאצ' עם פונקציות נפרדות כדי שנוכל להסיר ב-cleanup
  const onTouchStart = (e) => { onDown(e.touches[0]); e.preventDefault(); };
  const onTouchMove  = (e) => { onMove(e.touches[0]); e.preventDefault(); };
  const onTouchEnd   = (e) => { onUp(e.changedTouches[0]); e.preventDefault(); };
  cnv.addEventListener("touchstart", onTouchStart, { passive:false });
  cnv.addEventListener("touchmove",  onTouchMove,  { passive:false });
  cnv.addEventListener("touchend",   onTouchEnd,   { passive:false });

  // לולאה
  let last = performance.now();
  const loop = (t) => {
    const dt = Math.min(0.05, (t-last)/1000);
    last = t;
    tick(dt); draw();
    rafRef.current = requestAnimationFrame(loop);
  };
  rafRef.current = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(rafRef.current);
    window.removeEventListener("resize", resize);
    document.removeEventListener("fullscreenchange", onFSResize);
    cnv.removeEventListener("mousedown", onDown);
    cnv.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
cnv.removeEventListener("touchstart", onTouchStart);
    cnv.removeEventListener("touchmove",  onTouchMove);
    cnv.removeEventListener("touchend",   onTouchEnd);
  };
}

// ----- גיאומטריה -----
const PILL_H = UI_BTN_H_PX; // גובה ADD מיושר לקבוע הגלובלי
function boardRect(){
  const c = canvasRef.current;
  return { x:PADDING, y:PADDING, w:(c?.clientWidth||0)-PADDING*2, h:(c?.clientHeight||0)-PADDING*2 };
}
function laneRect(lane){
  const b = boardRect();
  const h = b.h * 0.18;
  const centers = [0.375,0.525,0.675,0.815];
  const centerY = b.y + b.h * centers[lane];
  const y = Math.max(b.y, Math.min(centerY - h*0.5, b.y + b.h - h));
  return { x:b.x, y, w:b.w, h };
}
function rockWidth(L){
  return Math.min(L.w * 0.30, Math.max(80, L.h * 1.10));
}
function slotRect(lane,slot){
  const L = laneRect(lane);
  const rw = rockWidth(L);
  const cellW = (L.w - rw) / SLOTS_PER_LANE;
  return { x:L.x + slot*cellW, y:L.y, w:cellW - 4, h:L.h };
}
function rockRect(lane){
  const L = laneRect(lane);
  const rw = rockWidth(L);
  const y = L.y + L.h * 0.06;
  const h = L.h * 0.88;
  return { x:L.x + L.w - rw - 4, y, w:rw, h };
}
function pos(e){
  const r = canvasRef.current?.getBoundingClientRect();
  return { x: e.clientX - (r?.left||0), y: e.clientY - (r?.top||0) };
}
function pointInRect(x,y,r){ return x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h; }
function pillRect(lane,slot){
  const r = slotRect(lane,slot);
  const pw = r.w * 0.36;
  const ph = Math.min(PILL_H, r.h*0.22);
  const px = r.x + (r.w - pw)/2;
  const py = r.y + r.h*0.5 - ph/2;
  return { x:px, y:py, w:pw, h:ph };
}
function pickPill(x,y){
  const s = stateRef.current; if (!s) return null;
  for (let l=0; l<LANES; l++){
    for (let k=0; k<SLOTS_PER_LANE; k++){
      if (s.lanes[l].slots[k]) continue;
      const pr = pillRect(l,k);
      if (pointInRect(x,y,pr)) return { lane:l, slot:k };
    }
  }
  return null;
}
function pickSlot(x,y){
  for (let l=0; l<LANES; l++){
    for (let k=0; k<SLOTS_PER_LANE; k++){
      const r = slotRect(l,k);
      if (pointInRect(x,y,r)) return { lane:l, slot:k };
    }
  }
  return null;
}
function pickMiner(x,y){
  const s = stateRef.current; if (!s) return null;
  for (let l=0; l<LANES; l++){
    for (let k=0; k<SLOTS_PER_LANE; k++){
      const cell = s.lanes[l].slots[k]; if(!cell) continue;
      const r = slotRect(l,k);
      const cx = r.x + r.w*0.52;
      const cy = r.y + r.h*0.56;
      const rad = Math.min(r.w,r.h)*0.33;
      const dx=x-cx, dy=y-cy;
      if (dx*dx+dy*dy < rad*rad) return { id:cell.id, x:cx, y:cy };
    }
  }
  return null;
}
// === END PART 4 ===


// === START PART 5 ===
// ----- ציור -----
function drawBg(ctx,b){
  const img = getImg(IMG_BG);
  if (img.complete && img.naturalWidth>0) {
    const iw=img.naturalWidth, ih=img.naturalHeight;
    const ir=iw/ih, br=b.w/b.h;
    let dw,dh; if (br>ir){ dw=b.w; dh=b.w/ir; } else { dh=b.h; dw=b.h*ir; }
    const dx=b.x+(b.w-dw)/2, dy=b.y+(b.h-dh)/2;
    ctx.drawImage(img,dx,dy,dw,dh);
  } else {
    const g=ctx.createLinearGradient(0,b.y,0,b.y+b.h);
    g.addColorStop(0,"#0b1220"); g.addColorStop(1,"#0c1526");
    ctx.fillStyle=g; ctx.fillRect(b.x,b.y,b.w,b.h);
  }
}

function drawRock(ctx,rect,rock){
  ctx.shadowColor = "transparent";
  ctx.shadowBlur  = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const pct   = Math.max(0, rock.hp/rock.maxHp);
  const scale = 0.35 + 0.65*pct;

  const img   = getImg(IMG_ROCK);
  const pad   = 6;
  const fullW = rect.w - pad*2;
  const fullH = rect.h - pad*2;

  const rw = fullW*scale, rh = fullH*scale;
  const cx = rect.x + rect.w/2, cy = rect.y + rect.h/2;
  const dx = cx - rw/2,           dy = cy - rh/2;

  if (img.complete && img.naturalWidth>0) ctx.drawImage(img,dx,dy,rw,rh);
  else { ctx.fillStyle="#6b7280"; ctx.fillRect(dx,dy,rw,rh); }

  const by   = rect.y + 4;
  const barW = fullW * 0.75;
  const bx   = rect.x + pad + (fullW - barW) / 2;
  const barH = 10;

  ctx.fillStyle   = "#0ea5e9";
  ctx.fillRect(bx,by,barW*pct,barH);
  ctx.strokeStyle = "#082f49";
  ctx.lineWidth   = 1;
  ctx.strokeRect(bx,by,barW,barH);

  ctx.fillStyle    = "#e5e7eb";
  ctx.font         = "bold 11px system-ui";
  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(`Rock ${rock.idx+1}`, bx + barW/2, by - 2);
}

function drawMiner(ctx,lane,slot,m){
  const r  = slotRect(lane,slot);
  const cx = r.x + r.w*0.52;
  const cy = r.y + r.h*0.56;

  const scaleH = (stateRef.current?.minerScale || 1);
  const base   = Math.min(r.w, r.h) * 0.84 * scaleH;
  const wH     = base;
  const wW     = base * (stateRef.current?.minerWidth || 1.15);

  ctx.shadowColor = "transparent";
  ctx.shadowBlur  = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const img = getImg(IMG_MINER);
  if (img.complete && img.naturalWidth>0) {
    const frame = Math.floor(((stateRef.current?.anim?.t)||0)*8)%4;
    const sw = img.width/4, sh = img.height;
    ctx.drawImage(img, frame*sw, 0, sw, sh, cx - wW/2, cy - wH/2, wW, wH);
  } else {
    ctx.fillStyle="#22c55e";
    ctx.beginPath(); ctx.ellipse(cx, cy, (wW*0.35), (wH*0.35), 0, 0, Math.PI*2); ctx.fill();
  }

  const fontPx = Math.max(12, Math.floor(base*0.22));
  ctx.fillStyle    = "#ffffff";
  ctx.font         = `bold ${fontPx}px system-ui`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(m.level), cx, cy - base*0.20);
}

function drawPill(ctx,x,y,w,h,label,enabled=true){
  ctx.shadowColor = "transparent";
  ctx.shadowBlur  = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const g=ctx.createLinearGradient(x,y,x,y+h);
  if (enabled){ g.addColorStop(0,"#fef08a"); g.addColorStop(1,"#facc15"); }
  else{ g.addColorStop(0,"#475569"); g.addColorStop(1,"#334155"); }
  ctx.fillStyle=g; ctx.strokeStyle=enabled?"#a16207":"#475569"; ctx.lineWidth=1.5;
  roundRect(ctx,x,y,w,h,h/2); ctx.fill(); ctx.stroke();
  ctx.fillStyle=enabled?"#111827":"#cbd5e1";
  ctx.font=`bold ${Math.max(12, Math.floor(h*0.45))}px system-ui`; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText(label, x+w/2, y+h/2);
}
function roundRect(ctx,x,y,w,h,r){
  const rr=Math.min(r,h/2,w/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}

function draw(){
  const c = canvasRef.current; if (!c) return;
  const ctx = c.getContext("2d"); if (!ctx) return;
  const s = stateRef.current;   if (!s) return;
  const b = boardRect();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur  = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  drawBg(ctx,b);

  // ADD → סלעים → כלבים
  for (let l=0; l<LANES; l++){
    for (let k=0; k<SLOTS_PER_LANE; k++){
      const cell = s.lanes[l].slots[k];
      if (!cell) {
        const pr = pillRect(l,k);
        const canAfford = (s.gold ?? 0) >= (s.spawnCost ?? 0) && countMiners(s) < MAX_MINERS;
        drawPill(ctx, pr.x, pr.y, pr.w, pr.h, "ADD", canAfford);
      }
    }
    drawRock(ctx, rockRect(l), s.lanes[l].rock);
    for (let k=0; k<SLOTS_PER_LANE; k++){
      const cell = s.lanes[l].slots[k]; if (!cell) continue;
      const m = s.miners[cell.id];      if (!m) continue;
      if (dragRef.current.active && dragRef.current.id === m.id) continue;
      drawMiner(ctx,l,k,m);
    }
  }

  // GHOST גרירה — ללא צל/הילה
  if (dragRef.current.active) {
    const id = dragRef.current.id;
    const m  = s.miners[id];
    if (m) {
      const gx = (dragRef.current.x ?? 0) + (dragRef.current.ox ?? 0);
      const gy = (dragRef.current.y ?? 0) + (dragRef.current.oy ?? 0);
      const r0 = slotRect(m.lane, m.slot);

      const baseW = Math.min(r0.w, r0.h) * 0.84;
      const scaleH = (stateRef.current?.minerScale || 1);
      const wH = baseW * scaleH;
      const wW = wH * (stateRef.current?.minerWidth || 1.15);

      const img=getImg(IMG_MINER);
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.shadowColor = "transparent";
      ctx.shadowBlur  = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      if (img.complete && img.naturalWidth>0) {
        const frame=Math.floor(((stateRef.current?.anim?.t)||0)*8)%4;
        const sw=img.width/4, sh=img.height;
        ctx.drawImage(img, frame*sw,0,sw,sh, gx-wW/2, gy-wH/2, wW, wH);
      } else {
        ctx.fillStyle="#22c55e";
        ctx.beginPath(); ctx.ellipse(gx,gy,(wW*0.35),(wH*0.35),0,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
  }
}

// ----- לוגיקת tick בסיסית -----
function tick(dt){
  const s = stateRef.current; if (!s) return;
  s.anim.t += dt;
  s.paused = !!(flagsRef.current && flagsRef.current.paused);
  const now = Date.now();
  if (s.paused){ s.lastSeen = now; return; }

  // שבירת סלעים + מטבעות + MLEO (הצגת שני הערכים)
  for (let l=0; l<LANES; l++){
    let dps = 0;
    for (let k=0; k<SLOTS_PER_LANE; k++){
      const cell = s.lanes[l].slots[k]; if (!cell) continue;
      const m = s.miners[cell.id]; if (!m) continue;
      dps += minerDps(m.level, s.dpsMult||1);
    }
    const rock = s.lanes[l].rock;
    rock.hp -= dps * dt;
    if (rock.hp <= 0) {
      const nowT = Date.now();
      if (nowT - (rockSfxCooldownRef.current || 0) > 200) {
        rockSfxCooldownRef.current = nowT;
        try { play?.(S_ROCK); } catch {}
      }
      const coinsGain = Math.floor(rock.maxHp * GOLD_FACTOR * (s.goldMult || 1));
      const mleoGainPreview = previewMleoFromCoins(coinsGain);

      s.gold += coinsGain; setUi(u => ({ ...u, gold: s.gold }));
      addPlayerScorePoints(s, coinsGain);

const mleoTxt = Number(mleoGainPreview || 0).toFixed(2); // הצגת עשרוניות
setCenterPopup({ text: `⛏️ +${formatShort(coinsGain)} coins • +${mleoTxt} MLEO`, id: Math.random() });


      s.lanes[l].rockCount += 1;
      s.lanes[l].rock = newRock(l, s.lanes[l].rockCount);
      safeSave();
    }
  }

  // טיימר מתנות
  if (!s.giftReady) {
    if ((s.giftNextAt || 0) <= Date.now()) {
      s.giftReady = true;
      setGiftReadyFlag(true);
    }
  }

  // כלב יהלום מושהה
  if (s.pendingDiamondDogLevel && countMiners(s) < MAX_MINERS) {
    const placed = spawnMiner(s, s.pendingDiamondDogLevel);
    if (placed) {
      const placedLvl = s.pendingDiamondDogLevel;
      s.pendingDiamondDogLevel = null;
      s.giftReady  = false;
      s.giftNextAt = Date.now() + currentGiftIntervalSec(s) * 1000;
      setGiftToastWithTTL(`💎 Dog (LV ${placedLvl}) placed`);
      save?.();
    }
  }

  // אוטו־דוג
  accrueBankDogsUpToNow(s);
  tryDistributeBankDog(s);

  finalizeDailyRewardOncePerTick();
  s.lastSeen = now;
}
// === END PART 5 ===




// === START PART 6 ===
// Helpers + save/load + purchases + reset + misc used by JSX

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function countMiners(s) { return s?.miners ? Object.keys(s.miners).length : 0; }
function minerDps(level, mul = 1) { return BASE_DPS * Math.pow(LEVEL_DPS_MUL, level - 1) * mul; }

function laneDpsSum(s, laneIdx) {
  if (!s) return 0;
  let dps = 0;
  for (let k = 0; k < SLOTS_PER_LANE; k++) {
    const cell = s.lanes?.[laneIdx]?.slots?.[k];
    if (!cell) continue;
    const m = s.miners[cell.id];
    if (!m) continue;
    dps += minerDps(m.level, s.dpsMult || 1);
  }
  return dps;
}

function newRock(lane, idx) {
  const hp = Math.floor(ROCK_BASE_HP * Math.pow(ROCK_HP_MUL, idx));
  return { lane, idx, maxHp: hp, hp };
}

function makeFreshState() { // (לשמירת תאימות אם קוראים לזה במקום freshState)
  return freshState();
}

// ── Save/Load ──
function save() {
  const s = stateRef.current; if (!s) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      lanes: s.lanes, miners: s.miners, nextId: s.nextId,
      gold: s.gold, spawnCost: s.spawnCost, dpsMult: s.dpsMult, goldMult: s.goldMult,
      onceSpawned: s.onceSpawned,

      // קני מידה של הכלב
      minerScale: s.minerScale || 1.6,
      minerWidth: s.minerWidth || 0.8,

      lastSeen: s.lastSeen,
      pendingOfflineGold: s.pendingOfflineGold || 0,
      pendingOfflineMleo: s.pendingOfflineMleo || 0, // ← חדש
      totalPurchased: s.totalPurchased, spawnLevel: s.spawnLevel,

      cycleStartAt: s.cycleStartAt,
      lastGiftIntervalSec: s.lastGiftIntervalSec,
      giftNextAt: s.giftNextAt, giftReady: s.giftReady,

      diamonds: s.diamonds || 0,
      nextDiamondPrize: s.nextDiamondPrize,

      autoDogLastAt: s.autoDogLastAt,
      autoDogBank: s.autoDogBank,
      autoDogPending: !!s.autoDogPending,

      costBase: s.costBase,
      adCooldownUntil: s.adCooldownUntil || 0,

      pendingDiamondDogLevel: s.pendingDiamondDogLevel || null,
    }));
  } catch {}
}



function load() { try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }

function _baseCost(s) { if (!s) return 160; return Math.max(80, s.costBase || 120); }
function _dpsCost(s)  { const base=_baseCost(s); const steps=Math.max(0, Math.round(((s?.dpsMult||1)-1)*10)); return Math.ceil(base*2.0*Math.pow(1.18,steps)); }
function _goldCost(s) { const base=_baseCost(s); const steps=Math.max(0, Math.round(((s?.goldMult||1)-1)*10)); return Math.ceil(base*2.2*Math.pow(1.18,steps)); }

function expectedRockCoinReward(s) {
  if (!s) return 0;
  let bestLane = 0, bestDps = 0;
  for (let l = 0; l < LANES; l++) {
    const dps = laneDpsSum(s, l);
    if (dps > bestDps) { bestDps = dps; bestLane = l; }
  }
  if (bestDps <= 0) {
    let sum = 0;
    for (let l = 0; l < LANES; l++) {
      const rk = s.lanes[l].rock;
      sum += Math.floor(rk.maxHp * GOLD_FACTOR * (s.goldMult || 1));
    }
    return Math.floor(sum / LANES);
  }
  const rock = s.lanes[bestLane].rock;
  return Math.floor(rock.maxHp * GOLD_FACTOR * (s.goldMult || 1));
}

function expectedGiftCoinReward(s) {
  if (!s) return 0;
  const mult = (s.goldMult || 1);
  const vals = [];
  for (let l = 0; l < LANES; l++) {
    const rk = s.lanes[l].rock;
    vals.push(Math.floor(rk.maxHp * GOLD_FACTOR * mult));
  }
  if (!vals.length) return 0;
  const max = Math.max(...vals);
  const sum = vals.reduce((a,b)=>a+b,0);
  const others = sum - max;
  return Math.floor(max + others * 0.5);
}

function setGiftToastWithTTL(text, ttl = 3000) {
  const id = Math.random().toString(36).slice(2);
  setGiftToast?.({ text, id });
  setTimeout(() => { setGiftToast?.(cur => (cur && cur.id === id ? null : cur)); }, ttl);
}

// === Spawn helpers ===
function spawnMiner(s, level = 1) {
  if (!s) return false;
  if (countMiners(s) >= MAX_MINERS) return false;
  for (let l = 0; l < LANES; l++) {
    for (let slot = 0; slot < SLOTS_PER_LANE; slot++) {
      if (!s.lanes[l].slots[slot]) {
        const id = s.nextId++;
        const m  = { id, level, lane: l, slot, pop: 1 };
        s.miners[id] = m;
        s.lanes[l].slots[slot] = { id };
        return true;
      }
    }
  }
  return false;
}
function spawnMinerAt(s, lane, slot, level = 1) {
  if (!s) return false;
  if (s.lanes[lane].slots[slot]) return false;
  const id = s.nextId++;
  const m  = { id, level, lane, slot, pop: 1 };
  s.miners[id] = m;
  s.lanes[lane].slots[slot] = { id };
  return true;
}

function afterPurchaseBump(s) {
  s.totalPurchased = (s.totalPurchased || 0) + 1;
  s.spawnLevel = 1 + Math.floor((s.totalPurchased) / 30);
}
function trySpawnAtSlot(lane, slot) {
  const s = stateRef.current; if (!s) return;
  if (countMiners(s) >= MAX_MINERS) { try{play?.(S_CLICK);}catch{}; alert("Maximum 16 miners on the board."); return; }
  if (s.spawnCost == null || s.gold < s.spawnCost) { try{play?.(S_CLICK);}catch{}; return; }
  const ok = spawnMinerAt(s, lane, slot, s.spawnLevel);
  if (!ok) return;
  s.gold -= s.spawnCost;
  s.spawnCost = Math.ceil(s.spawnCost * 1.12);
  afterPurchaseBump(s);
  s.pressedPill = { lane, slot, t: 0.15 };
  s.anim && (s.anim.hint = 0);
  setUi(u => ({ ...u, gold: s.gold, spawnCost: s.spawnCost }));
  try{play?.(S_CLICK);}catch{};
  save();
}
function addMiner() {
  const s = stateRef.current; if (!s) return;
  if (countMiners(s) >= MAX_MINERS) { try{play?.(S_CLICK);}catch{}; alert("Maximum 16 miners on the board."); return; }
  if (s.spawnCost == null || s.gold < s.spawnCost) return;
  const ok = spawnMiner(s, s.spawnLevel);
  if (!ok) return;
  s.gold -= s.spawnCost;
  s.spawnCost = Math.ceil(s.spawnCost * 1.12);
  afterPurchaseBump(s);
  s.anim && (s.anim.hint = 0);
  setUi(u => ({ ...u, gold: s.gold, spawnCost: s.spawnCost }));
  try{play?.(S_CLICK);}catch{};
  save();
}
function upgradeDps() {
  const s = stateRef.current; if (!s) return;
  const cost = _dpsCost(s); if (s.gold < cost) return;
  s.gold -= cost; s.dpsMult = +((s.dpsMult || 1) * 1.1).toFixed(3);
  setUi(u => ({ ...u, gold: s.gold })); save();
}
function upgradeGold() {
  const s = stateRef.current; if (!s) return;
  const cost = _goldCost(s); if (s.gold < cost) return;
  s.gold -= cost; s.goldMult = +((s.goldMult || 1) * 1.1).toFixed(2);
  setUi(u => ({ ...u, gold: s.gold })); save();
}

function onOfflineCollect() {
  const s = stateRef.current; if (!s) return;
  const addCoins = s.pendingOfflineGold || 0;
  const addMleo  = Number(s.pendingOfflineMleo || 0);

  if (addCoins > 0) {
    s.gold += addCoins;
    s.pendingOfflineGold = 0;
    setUi(u => ({ ...u, gold: s.gold }));
  }
  // ה-MLEO כבר נזקף בזמן האופליין; כאן רק מאפסים את מונה ההצגה
  s.pendingOfflineMleo = 0;

  save();

  if (addCoins > 0 || addMleo > 0) {
    setCenterPopup({
      text: `⛏️ +${formatShort(addCoins)} coins • +${addMleo.toFixed(2)} MLEO`,
      id: Math.random()
    });
  }
  setShowCollect(false);
}


// ===== לוגיקת אוטו־דוג והמתנות =====

// בחירת דרגת כלב (אוטומטי/מתנת כלב):
// אם יש על הלוח לפחות כלב אחד בדרגה spawnLevel-2 → נחזיר spawnLevel-2, אחרת spawnLevel.
function chooseAutoDogLevel(s) {
  const sl = Math.max(1, s.spawnLevel || 1);
  const target2 = Math.max(1, sl - 2);
  const existsLv2 = Object.values(s.miners || {}).some(m => m.level === target2);
  return existsLv2 ? target2 : sl;
}
function chooseGiftDogLevelForRegularGift(s) {
  return chooseAutoDogLevel(s);
}

// צבירת “כלב אוטומטי” ONLINE (ללא בנק אמיתי)
function accrueBankDogsUpToNow(s) {
  if (!s) return;
  const intervalMs = DOG_INTERVAL_SEC * 1000;
  const now  = Date.now();
  const last = s.autoDogLastAt || now;

  // אם יש כלב ממתין – ננסה להציבו כשיש מקום; אחרת נשאיר את הטיימר “מוכן” (הרינג נשאר מלא)
  if (s.autoDogPending) {
    if (hasFreeSlot(s)) {
      const lvl = chooseAutoDogLevel(s);
      const ok  = spawnMiner(s, lvl);
      if (ok) {
        s.autoDogPending = false;
        s.autoDogLastAt  = now; // אתחול טיימר
        setCenterPopup?.({ text: `🐶 Auto Dog (LV ${lvl})`, id: Math.random() });
        save?.();
      }
    }
    return;
  }

  // אין pending: האם הגיע הזמן לכלב חדש?
  if (now - last >= intervalMs) {
    if (hasFreeSlot(s)) {
      const lvl = chooseAutoDogLevel(s);
      const ok  = spawnMiner(s, lvl);
      if (ok) {
        s.autoDogLastAt = now; // אתחול טיימר מהתחלה
        setCenterPopup?.({ text: `🐶 Auto Dog (LV ${lvl})`, id: Math.random() });
        save?.();
      }
    } else {
      // אין מקום: מסמנים כלב ממתין אחד; לא מאתחלים lastAt כדי שהרינג יישאר מלא
      s.autoDogPending = true;
    }
  }
}

// מפַזר “בנק” — כאן לא נדרש; משאירים קונטרול עדין על pending בלבד
function tryDistributeBankDog(s) {
  if (!s) return;
  if (!s.autoDogPending) return;
  if (!hasFreeSlot(s)) return;

  const lvl = chooseAutoDogLevel(s);
  const ok  = spawnMiner(s, lvl);
  if (ok) {
    s.autoDogPending = false;
    s.autoDogLastAt  = Date.now(); // אתחול טיימר
    setCenterPopup?.({ text: `🐶 Auto Dog (LV ${lvl})`, id: Math.random() });
    save?.();
  }
}

// OFFLINE: להציב עד 6 כלבים בפועל; נעצר כשאין מקום ומסמן pending 1
function handleOfflineAccrual(s, elapsedMs) {
  if (!s) return 0;

  // ---- Auto-dog OFFLINE (כמו שתיקנו קודם) ----
  const intervalMs = DOG_INTERVAL_SEC * 1000;
  const OFF_CAP = 6;
  let ticks = Math.floor(elapsedMs / intervalMs);
  if (ticks > OFF_CAP) ticks = OFF_CAP;

  let placed = 0;
  for (let i = 0; i < ticks; i++) {
    if (!hasFreeSlot(s)) {
      s.autoDogPending = true;
      if ((Date.now() - (s.autoDogLastAt || 0)) < intervalMs) {
        s.autoDogLastAt = Date.now() - intervalMs;
      }
      break;
    }
    const lvl = chooseAutoDogLevel(s);
    const ok  = spawnMiner(s, lvl);
    if (!ok) {
      s.autoDogPending = true;
      if ((Date.now() - (s.autoDogLastAt || 0)) < intervalMs) {
        s.autoDogLastAt = Date.now() - intervalMs;
      }
      break;
    }
    placed += 1;
  }

  if (s.autoDogPending) {
    // להשאיר הטיימר “מוכן”
  } else if (placed > 0) {
    s.autoDogLastAt = Date.now();
  } else {
    const rem = elapsedMs % intervalMs;
    s.autoDogLastAt = Date.now() - rem;
  }

  // ---- סימולציית שבירת סלעים (כמו שהיה) ----
  const CAP_MS = 12 * 60 * 60 * 1000;
  const simMs = Math.min(elapsedMs, CAP_MS);
  let totalCoins = 0;

  for (let lane = 0; lane < LANES; lane++) {
    let dps = laneDpsSum(s, lane) * OFFLINE_DPS_FACTOR;
    if (dps <= 0) continue;

    let idx = s.lanes[lane].rock.idx;
    let hp  = s.lanes[lane].rock.hp;
    let maxHp = s.lanes[lane].rock.maxHp;
    let timeLeft = simMs / 1000;

    while (timeLeft > 0 && dps > 0) {
      const timeToBreak = hp / dps;
      if (timeToBreak > timeLeft) {
        hp -= dps * timeLeft;
        timeLeft = 0;
      } else {
        totalCoins += Math.floor(maxHp * GOLD_FACTOR * (s.goldMult || 1));
        timeLeft -= timeToBreak;
        idx += 1;
        const rk = newRock(lane, idx);
        hp = rk.hp; maxHp = rk.maxHp;
      }
    }

    s.lanes[lane].rock = { lane, idx, maxHp, hp: Math.max(1, Math.floor(hp)) };
    s.lanes[lane].rockCount = idx;
  }

  if (totalCoins > 0) {
    s.pendingOfflineGold = (s.pendingOfflineGold || 0) + totalCoins;
    try {
      // מודדים MLEO לפני ואחרי, כדי לדעת כמה באמת זוכה באופליין
      const before = loadMiningState();
      const balBefore = Number(before?.balance || 0);

      addPlayerScorePoints(s, totalCoins);
      finalizeDailyRewardOncePerTick();

      const after = loadMiningState();
      const balAfter = Number(after?.balance || 0);
      const delta = Math.max(0, +(balAfter - balBefore).toFixed(2));

      s.pendingOfflineMleo = +((s.pendingOfflineMleo || 0) + delta).toFixed(2);
    } catch {}
  }

  return totalCoins;
}

// יש סלוט פנוי להצבה?
function hasFreeSlot(s) {
  return countMiners(s) < MAX_MINERS;
}


// Regular gifts only: no dog.
// 70%: coins20 (20% of rock)
// 8%:  dps (+10%)
// 8%:  gold (+10%)
// 6%:  diamond (+1)
// 8%:  coins40 (40% of rock)
function rollGiftType() {
  const r = Math.random() * 100;
  if (r < 70) return "coins20";    // 70%
  if (r < 78) return "dps";        // 8%
  if (r < 86) return "gold";       // 8%
  if (r < 92) return "diamond";    // 6%
  return "coins40";                // 8%
}


async function enterFullscreenAndLockMobile() { try {
  const w = window.innerWidth, desktop = w >= 1024;
  if (desktop) return;
  const el = wrapRef.current;
  if (el?.requestFullscreen) await el.requestFullscreen();
  if (screen.orientation?.lock) { try { await screen.orientation.lock("portrait-primary"); } catch {} }
} catch {} }
async function exitFullscreenIfAny() { try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {} }

async function resetGame() {
  try { play?.(S_CLICK); } catch {}

  // מוחק את שתי השמירות
  try {
    localStorage.removeItem(LS_KEY);         // שמירת המשחק
    localStorage.removeItem(MINING_LS_KEY);  // שמירת הכרייה (Balance/Vault/History)
  } catch {}

  // מאפס סטייט הכרייה במסך
  setMining({
    balance: 0, minedToday: 0, lastDay: getTodayKey(),
    scoreToday: 0, vault: 0, claimedTotal: 0, history: []
  });

  // בונה משחק חדש מאפס
  const fresh = makeFreshState();
  fresh.costBase = Math.max(80, expectedRockCoinReward(fresh));
  stateRef.current = fresh;

  setUi(u => ({
    ...u,
    gold: fresh.gold, spawnCost: fresh.spawnCost,
    dpsMult: fresh.dpsMult, goldMult: fresh.goldMult,
  }));

  setAdCooldownUntil(0);
  setGiftReadyFlag(false);
  setShowCollect(false);
  setShowAdModal(false);
  setShowDiamondInfo(false);
  setShowResetConfirm(false);

  setShowIntro(true);
  setGamePaused(true);
  await exitFullscreenIfAny();

  save(); // שומר את ה־fresh החדש
}

// === END PART 6 ===



// === START PART 7 ===
// ===== Diamonds chest (3×💎 to claim when you choose) =====
function grantDiamondPrize(s, key) {
  const base = Math.max(20, expectedGiftCoinReward(s));
  if (key === "coins_x10")   { const g = base * 10;   s.gold += Math.round(g); setGiftToastWithTTL(`💎 +${formatShort(g)} coins`); }
  else if (key === "coins_x100") { const g = base * 100; s.gold += Math.round(g); setGiftToastWithTTL(`💎 +${formatShort(g)} coins`); }
  else if (key === "coins_x1000"){ const g = base * 1000; s.gold += Math.round(g); setGiftToastWithTTL(`💎 +${formatShort(g)} coins`); }
  else if (key.startsWith("dog+")) {
    const delta = parseInt(key.split("+")[1] || "3", 10);
    const lvl = Math.max(1, (stateRef.current?.spawnLevel || 1) + delta);
    if (countMiners(s) < MAX_MINERS) {
      const placed = spawnMiner(s, lvl);
      if (placed) {
        setGiftToastWithTTL(`💎 Dog (LV ${lvl})`);
        // אתחול טיימר מתנות רק כשבאמת הונח
        s.giftReady  = false;
        s.giftNextAt = Date.now() + currentGiftIntervalSec(s) * 1000;
      }
    } else {
      // אין מקום כרגע ⇒ נניח אוטומטית כשיתפנה
      s.pendingDiamondDogLevel = lvl;
      setGiftToastWithTTL(`💎 Dog (LV ${lvl}) pending — free a slot`);
    }
  }
  setUi(u => ({ ...u, gold: s.gold }));
}
function openDiamondChestIfReady() {
  const s = stateRef.current; if (!s) return;
  if ((s.diamonds || 0) < 3) return;
  const prize = s.nextDiamondPrize || rollDiamondPrize();
  s.diamonds -= 3;
  grantDiamondPrize(s, prize);
  s.nextDiamondPrize = rollDiamondPrize();
  save();
}

// HUD computed values + Gift heartbeat + EARN cooldown

// לטובת טסטים מקומיים אפשר להגדיר window.DOG_INTERVAL_SEC; אחרת ברירת מחדל 600s
const DOG_INTERVAL_SEC = (typeof window !== "undefined" && window.DOG_INTERVAL_SEC) || 600;
const DOG_BANK_CAP     = (typeof window !== "undefined" && window.DOG_BANK_CAP)     || 6;

const _currentGiftIntervalSec = typeof currentGiftIntervalSec==="function"?currentGiftIntervalSec:(s)=>Math.max(5,Math.floor(s?.lastGiftIntervalSec||20));
const _getPhaseInfo = typeof getPhaseInfo==="function"?getPhaseInfo:(s,now=Date.now())=>{ const sec=_currentGiftIntervalSec(s,now); return { index:0,into:0,remain:sec,intervalSec:sec }; };


// progress rings — SINGLE definitions (בלי כפילויות)
const giftProgress = (() => { 
  const s = stateRef.current; if (!s) return 0; 
  if (s.giftReady) return 1; 
  const now = Date.now(); 
  const total = _currentGiftIntervalSec(s, now) * 1000; 
  const remain = Math.max(0, (s.giftNextAt || now) - now); 
  return Math.max(0, Math.min(1, 1 - remain / total)); 
})();

const dogProgress = (() => { 
  const s = stateRef.current; if (!s) return 0; 
  if ((s.autoDogBank || 0) >= DOG_BANK_CAP) return 1; 
  const now = Date.now(); 
  const total = DOG_INTERVAL_SEC * 1000; 
  const last = s.autoDogLastAt || now; 
  const elapsed = Math.max(0, now - last); 
  return Math.max(0, Math.min(1, elapsed / total)); 
})();

// READY flag for diamond chest glow/OPEN
const diamondsReady = (stateRef.current?.diamonds || 0) >= 3;


// טבעת — שכבת conic עם מסכה שמחוררת את המרכז (בלי רקע שחור)
function ringBg(progress){
  const p   = Math.max(0, Math.min(1, Number(progress) || 0));
  const deg = Math.round(360 * p);
  return {
    background: `conic-gradient(#facc15 ${deg}deg, transparent 0)`,
    WebkitMask: "radial-gradient(transparent 12px, #000 13px)",
    mask:       "radial-gradient(transparent 12px, #000 13px)",
    borderRadius: "9999px",
    transition: "background 0.2s linear",
  };
}


// ADD cooldown + onAdd
const sNow=stateRef.current;
const nowMs=Date.now();
const cooldownUntil=sNow?.adCooldownUntil||0;
const addRemainMs=mounted?Math.max(0,cooldownUntil-nowMs):Number.POSITIVE_INFINITY;
const addProgress=mounted?1-Math.min(1,addRemainMs/(10*60*1000)):0;
const addRemainLabel=(()=>{ 
  if(!mounted) return "…"; 
  if(addRemainMs<=0) return "READY"; 
  const m=Math.floor(addRemainMs/60000); 
  const s=Math.floor((addRemainMs%60000)/1000); 
  return `${m}:${String(s).padStart(2,"0")}`;
})();
const addDisabled = addRemainMs > 0;

function onAdd(){ 
  try{play?.(S_CLICK);}catch{} 
  const s=stateRef.current;if(!s) return; 
  const now=Date.now(); 
  if(now<(s.adCooldownUntil||0)){ 
    const remain=Math.ceil(((s.adCooldownUntil||0)-now)/1000); 
    const m=Math.floor(remain/60),sec=String(remain%60).padStart(2,"0"); 
    if(typeof setGiftToast==="function"){ 
      const id=Math.random().toString(36).slice(2); 
      setGiftToast({text:`Ad bonus in ${m}:${sec}`,id}); 
      setTimeout(()=>{setGiftToast(cur=>(cur&&cur.id===id?null:cur));},2000);
    } 
    return; 
  } 
  setAdVideoEnded(false); 
  setShowAdModal(true); 
}
// Coins modal (details + claim-to-mining)
const [showCoinsModal, setShowCoinsModal] = useState(false);

function claimCoinsToMining() {
  try { play?.(S_CLICK); } catch {}

  const s = stateRef.current; 
  if (!s) return;

  const coins = Number(s.gold || 0);
  if (!coins) { setGiftToastWithTTL("No coins to claim"); return; }

  // כמה MLEO יתווספו (מכבד חיתוך רך ותקרת היום)
  const eff = previewMleoFromCoins(coins);
  if (!eff) { setGiftToastWithTTL("Daily cap reached or nothing to add"); return; }

  // עדכון סטטוס הכרייה
  const mst = loadMiningState();
  const today = getTodayKey();
  if (mst.lastDay !== today) { mst.minedToday = 0; mst.scoreToday = 0; mst.lastDay = today; }

  const room = Math.max(0, DAILY_CAP - (mst.minedToday || 0));
  const add  = Math.min(eff, room);

  mst.minedToday += add;
  mst.balance    += add;

  saveMiningState(mst);
  setMining(mst);

  setGiftToastWithTTL(`Claimed ${add.toFixed(2)} MLEO from coins`);
}


// ===== HUD Info modal state & content =====
const [hudModal, setHudModal] = useState(null); // 'coins'|'dps'|'gold'|'spawn'|'gifts'|'giftRing'|'dogRing'
function getHudModalTitle(k){
  switch(k){
    case 'coins': return 'Coins';
    case 'dps': return 'DPS Multiplier';
    case 'gold': return 'Gold Multiplier';
    case 'spawn': return 'Dog Spawn Level';
case 'lvCounter': return 'Spawn LV Counter';
    case 'gifts': return 'Gift Phases';
    case 'giftRing': return 'Gift Timer';
    case 'dogRing': return 'Auto-Dog';
    default: return 'Info';
  }
}
function getHudModalText(k){
  switch(k){
    case 'coins':
      return 'Your total coins. Breaking rocks adds coins; bonuses: 🎁 regular gift (10%), video ad (50%), and diamonds grant large multipliers.';
    case 'dps':
      return '🪓 DPS xN increases the rate rocks lose HP by 10% per upgrade.';
    case 'gold':
      return '🟡 GOLD xN increases the coins gained from each rock by 10% per upgrade.';
case 'spawn':
  return `🐶 LV shows the dog level that appears on purchase/bonus. 
Increases automatically after 30 purchases.

Purchases left to the next level: ${toNextLv}.`;

    case 'gifts':
      return '⏳ Interval between gifts. Each time the timer ends you get a gift: coins/dog/boosts/diamond.';
    case 'giftRing':
      return 'The ring around 🎁 shows progress to the next gift, based on the displayed timings.';
    case 'dogRing':
      return 'The ring around 🐶 shows progress toward an auto-dog. When the bank is full (up to 6), it will deploy when a slot is free.';
    default:
      return '';
  }
}


// prices & יכולת קנייה לשורת הפעולות (Part 9 משתמש בזה)
const spawnCostNow=sNow?.spawnCost??ui.spawnCost;
const dpsCostNow=(typeof _dpsCost==="function")?_dpsCost(sNow):160;
const goldCostNow=(typeof _goldCost==="function")?_goldCost(sNow):160;
const canBuyMiner=!!sNow&&sNow.gold>=spawnCostNow&&Object.keys(sNow.miners||{}).length<(typeof MAX_MINERS==="number"?MAX_MINERS:16);
const canBuyDps=!!sNow&&sNow.gold>=dpsCostNow;
const canBuyGold=!!sNow&&sNow.gold>=goldCostNow;
const boughtCount = sNow?.totalPurchased || 0;
const toNextLv    = 30 - (boughtCount % 30); // 30 → 1..30
const BTN_H = `h-[${UI_BTN_H_PX}px]`; // גובה מתוך הקבוע

 // רינגים של Coin/🎁/🐶 (במקום w-8 h-8)
 const RING_SZ = `w-[${UI_BTN_H_PX}px] h-[${UI_BTN_H_PX}px]`;
const BTN_BASE = "appearance-none inline-flex items-center justify-center gap-1 px-3 !py-0 rounded-xl font-extrabold text-[14px] leading-none whitespace-nowrap transition ring-2";
const BTN_DIS  = "opacity-60 cursor-not-allowed";


// === END PART 7 ===




// === START PART 8 ===
  // ——— iOS detection ———
  const [isIOS, setIsIOS] = useState(false);

  // מרחק HUD מהחלק העליון: iOS = רק ה-safe-area, Android = הרבה יותר
  const HUD_TOP_IOS_PX = 0;     // לא לרדת בכלל (מעבר ל-safe-area)
  const HUD_TOP_ANDROID_PX = 5; // באנדרואיד לרדת הרבה (כוונן לפי הצורך)

  // ——— Track fullscreen state (משמש רק לעיצוב) ———
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    try {
      const ua = navigator.userAgent || "";
      const isiOS =
        /iP(hone|ad|od)/.test(ua) ||
        ((/Macintosh/.test(ua) || /Mac OS X/.test(ua)) && "ontouchend" in document);
      setIsIOS(isiOS);
    } catch {}

    const onFS = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFS);
    onFS(); // init
    return () => document.removeEventListener("fullscreenchange", onFS);
  }, []);

  // ===== Render =====
const hudTop = `calc(env(safe-area-inset-top, 0px) + ${(isIOS ? HUD_TOP_IOS_PX : HUD_TOP_ANDROID_PX)}px)`;
return (

    <Layout>
      <div
        ref={wrapRef}
       className="
          relative flex flex-col items-center justify-start
          bg-gray-900 text-white
          w-full min-h-[var(--app-100vh,100svh)]
          overflow-hidden select-none
          pt-[calc(env(safe-area-inset-top,0px)+8px)]
          pb-[calc(env(safe-area-inset-bottom,0px)+16px)]
        "

        // במסך מלא: מבטלים padding כדי שהקאנבס יישב הכי גבוה וימלא את כל הגובה
        style={{
          paddingTop: isFullscreen ? 0 : undefined,
          paddingBottom: isFullscreen ? 0 : undefined,
        }}
      >
        {/* Landscape overlay on mobile */}
        {isMobileLandscape && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black text-white text-center p-6">
            <div>
              <h2 className="text-2xl font-extrabold mb-3">Please rotate your device to portrait.</h2>
              <p className="opacity-80">Landscape is not supported.</p>
            </div>
          </div>
        )}

        {/* Intro Overlay */}
        {showIntro && (
          <div className="absolute inset-0 flex flex-col items-center justify-start pt-10 bg-black/80 z-[50] text-center p-6">
            <img src="/images/leo-intro.png" alt="Leo" width={160} height={160} className="mb-4 rounded-full" />
            <h1 className="text-3xl sm:text-4xl font-extrabold text-yellow-400 mb-2">⛏️ MLEO Miners</h1>

           <p className="text-sm sm:text-base text-gray-200 mb-4">Merge miners, break rocks, earn gold.</p>

            {firstTimeNeedsTerms && (
              <div className="mb-4 w-full max-w-md">
                <div className="px-3 py-2 rounded-lg bg-yellow-300/20 text-yellow-200 border border-yellow-300/40 text-xs sm:text-sm">
                  You must read and accept the <b>Terms &amp; Conditions</b> before playing for the first time.
                </div>
              </div>
            )}
 

<div className="flex gap-3 flex-wrap justify-center">
  <button
    onClick={async () => {
      try { play?.(S_CLICK); } catch {}
if (firstTimeNeedsTerms) { setShowTerms(true); return; }
      const s = stateRef.current;
      if (s && !s.onceSpawned) { spawnMiner(s, 1); s.onceSpawned = true; save(); }

      setShowIntro(false);
      setGamePaused(false);
      try { await enterFullscreenAndLockMobile(); } catch {}

      setTimeout(() => {
        if (isConnected) {
          openAccountModal?.();
        } else {
          openConnectModal?.();
        }
      }, 0);
    }}
    className="px-5 py-3 font-bold rounded-lg text-base shadow bg-indigo-400 hover:bg-indigo-300 text-black"
  >
    CONNECT WALLET
  </button>

  <button
    onClick={async () => {
      try { play?.(S_CLICK); } catch {}
if (firstTimeNeedsTerms) { setShowTerms(true); return; }
      const s = stateRef.current;
      if (s && !s.onceSpawned) { spawnMiner(s, 1); s.onceSpawned = true; save(); }
      setShowIntro(false);
      setGamePaused(false);
      try { await enterFullscreenAndLockMobile(); } catch {}
    }}
    className="px-5 py-3 font-bold rounded-lg text-base shadow bg-yellow-400 hover:bg-yellow-300 text-black"
  >
    PLAY
  </button>

  <button
    onClick={() => setShowHowTo(true)}
    className="px-5 py-3 font-bold rounded-lg text-base shadow bg-emerald-400 hover:bg-emerald-300 text-black"
  >
    HOW TO PLAY
  </button>

  <button
    onClick={() => setShowMiningInfo(true)}
    className="px-5 py-3 font-bold rounded-lg text-base shadow bg-cyan-400 hover:bg-cyan-300 text-black"
  >
    MINING
  </button>

<button
    onClick={() => setShowTerms(true)}
    className="px-5 py-3 font-bold rounded-lg text-base shadow bg-teal-400 hover:bg-teal-300 text-black"
  >
    TERMS
  </button>
</div>

          </div>
        )}
{/* === END PART 8 === */}


{/* === START PART 9 === */}
               {/* ADD Ad Modal */}
        {showAdModal && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-white text-slate-900 max-w-md w-full rounded-2xl p-5">
              <h2 className="text-xl font-extrabold mb-3">Watch to Earn</h2>

              <video
                src="/ads/ad1.mp4"
                className="w-full rounded-lg bg-black"
                controls
                autoPlay
                onEnded={() => setAdVideoEnded(true)}
              />

              <div className="flex justify-between items-center mt-4">
                <button
                  onClick={() => { setShowAdModal(false); setAdVideoEnded(false); }}
                  className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900"
                >
                  Close
                </button>

                <button
                  onClick={() => {
                    const s = stateRef.current; if (!s) return;
                    const base = Math.max(20, expectedGiftCoinReward(s));
                    const gain = Math.round(base * 0.50); // 50%
                    s.gold += gain; setUi(u => ({ ...u, gold: s.gold }));

                    const until = Date.now() + 10*60*1000; // 10m cooldown
                    s.adCooldownUntil = until;
                    setAdCooldownUntil(until);
                    try {
                      const raw = localStorage.getItem(LS_KEY);
                      const data = raw ? JSON.parse(raw) : {};
                      data.adCooldownUntil = until;
                      localStorage.setItem(LS_KEY, JSON.stringify(data));
                    } catch {}

setCenterPopup({ text: `🎬 +${formatShort(gain)} coins`, id: Math.random() });
                    save();
                    setShowAdModal(false);
                    setAdVideoEnded(false);
                  }}
                  disabled={!adVideoEnded}
                  className={`px-4 py-2 rounded-lg font-bold ${
                    adVideoEnded ? "bg-yellow-400 hover:bg-yellow-300 text-black" : "bg-slate-300 text-slate-500 cursor-not-allowed"
                  }`}
                  title={adVideoEnded ? "Collect your reward" : "Watch until the end to unlock"}
                >
                  COLLECT
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== Canvas wrapper ===== */}
        <div
          id="miners-canvas-wrap"
          className="relative w-full border border-slate-700 rounded-2xl overflow-hidden mt-1"
          style={{
            maxWidth: isDesktop ? "1024px" : "680px",
            height: isDesktop ? undefined : "var(--app-100vh,100svh)",
 maxHeight: "var(--app-100vh,100svh)",

            aspectRatio: isDesktop ? "4 / 3" : undefined,
          }}
        >
          <canvas id="miners-canvas" ref={canvasRef} className="w-full h-full block touch-none select-none" />

{/* ==== TOP HUD ==== */}
<div
  className="absolute left-1/2 -translate-x-1/2 z-[30] w-[calc(100%-16px)] max-w-[980px]"
  style={{ top: hudTop }}
>
  <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-center mb-2">
    MLEO — MINERS
  </h1>

  {/* Wallet status (non-interactive) */}
  <div className="absolute top-2 left-2 z-[40]">
    <div
      className={`${isConnected ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/70"} px-2 py-0.5 rounded-md text-[11px] font-semibold`}
    >
      {isConnected ? "● Connected" : "○ Not connected"}
    </div>
  </div>

{/* keep glow keyframes for diamonds + global UI pulses */}
<style jsx global>{`
  @keyframes glowPulse {
    0% { opacity: .55; transform: scale(.98); }
    50% { opacity: 1; transform: scale(1); }
    100% { opacity: .55; transform: scale(.98); }
  }
  @keyframes glowRing {
    0% { opacity: .6; }
    50% { opacity: 1; }
    100% { opacity: .6; }
  }
  /* === added for CLAIM glow === */
  @keyframes btnPulse {
    0%   { box-shadow:0 0 0 0 rgba(250,204,21,.45); }
    70%  { box-shadow:0 0 0 10px rgba(250,204,21,0); }
    100% { box-shadow:0 0 0 0 rgba(250,204,21,0); }
  }
  /* === added for digits nudge === */
  @keyframes nudge {
    0%,100% { transform: translateY(0); }
    50%     { transform: translateY(-1px); }
  }
`}</style>


  <div className="flex gap-2 flex-wrap justify-center items-center text-sm">
    {/* Coins + ad ring */}
    <button
      onClick={()=>setHudModal('coins')}
      className="px-2 py-1 rounded-lg flex items-center gap-2 hover:bg-white/10"
      aria-label="Coins info"
    >
      <div className="relative w-8 h-8 rounded-full grid place-items-center" title={addRemainMs > 0 ? `Next ad in ${addRemainLabel}` : "Ad bonus ready"}>
        <div className="absolute inset-0 rounded-full" style={ringBg(addProgress)} />
        <img src={IMG_COIN} alt="coin" className="w-7 h-7" />
      </div>
      <b>{formatShort(stateRef.current?.gold ?? 0)}</b>
    </button>

    {/* DPS */}
    <button onClick={()=>setHudModal('dps')} className="px-2 py-1 rounded-lg hover:bg-white/10">
      🪓 x<b>{(stateRef.current?.dpsMult || 1).toFixed(2)}</b>
    </button>

    {/* GOLD */}
    <button onClick={()=>setHudModal('gold')} className="px-2 py-1 rounded-lg hover:bg-white/10">
      🟡 x<b>{(stateRef.current?.goldMult || 1).toFixed(2)}</b>
    </button>

  {/* Spawn LV (with inline counter) */}
<button
  onClick={()=>setHudModal('spawn')}
  className="px-2 py-1 rounded-lg hover:bg-white/10"
  title={`Next Spawn Level in ${toNextLv} purchases`}
>
  <span className="inline-flex items-baseline gap-1 leading-none">
    <span>🐶 LV</span>
    <b className="leading-none">{stateRef.current?.spawnLevel || 1}</b>
    <span className="text-[11px] leading-none opacity-80 relative -top-[1px]">
      ({toNextLv})
    </span>
  </span>
</button>




    {/* Diamonds */}
    <button
      onClick={() => setShowDiamondInfo(true)}
      className="relative px-2 py-1 rounded-lg flex items-center gap-1 active:scale-95 transition hover:bg-white/10"
      aria-label="Diamond rewards info"
      title="Tap to open Diamond chest"
    >
      {diamondsReady && (
        <>
          <span
            className="pointer-events-none absolute -inset-2 rounded-xl"
            style={{
              animation: "glowPulse 3.2s infinite",
              background: "radial-gradient(circle, rgba(250,204,21,0.35) 0%, rgba(250,204,21,0.18) 35%, transparent 60%)"
            }}
          />
          <span
            className="pointer-events-none absolute -inset-[6px] rounded-2xl"
            style={{
              animation: "glowRing 3.2s infinite",
              border: "2px solid rgba(250,204,21,0.55)"
            }}
          />
        </>
      )}
      <span>💎</span>
      <b>{stateRef.current?.diamonds ?? 0}</b>
      <span className="opacity-80">/3</span>
    </button>

    {/* Phase label */}
    <button onClick={()=>setHudModal('gifts')} className="px-2 py-1 rounded-lg hover:bg-white/10">
      {`⏳ ${(_getPhaseInfo(stateRef.current, Date.now()).intervalSec)}s gifts`}
    </button>

    <div className="flex items-center gap-3 ml-2">
      {/* 🎁 ring */}
      <button
        onClick={()=>setHudModal('giftRing')}
        className="relative w-8 h-8 rounded-full grid place-items-center hover:opacity-90 active:scale-95 transition"
        title={`⏳ ${(_getPhaseInfo(stateRef.current, Date.now()).intervalSec)}s gifts`}
        aria-label="Gift timer info"
      >
        <div className="absolute inset-0 rounded-full" style={ringBg(giftProgress)} />
        <div className="text-[22px] font-extrabold leading-none">🎁</div>
      </button>

      {/* 🐶 ring */}
      <button
        onClick={()=>setHudModal('dogRing')}
        className="relative w-8 h-8 rounded-full grid place-items-center hover:opacity-90 active:scale-95 transition"
        title={`Auto-dog every ${Math.round(DOG_INTERVAL_SEC/60)}m (bank up to ${DOG_BANK_CAP})`}
        aria-label="Auto-dog info"
      >
        <div className="absolute inset-0 rounded-full" style={ringBg(dogProgress)} />
        <div className="text-[22px] font-extrabold leading-none">🐶</div>
      </button>
    </div>
  </div>

  {/* Actions row */}
  <div className="flex gap-2 mt-2 flex-wrap justify-center text-sm">
  {/* ADD (spawn) */}
  <button
    onClick={addMiner}
    disabled={!canBuyMiner}
    className={`${BTN_BASE} ${BTN_H} ${
      canBuyMiner
        ? "bg-emerald-500 hover:bg-emerald-400 ring-emerald-300 text-slate-900"
        : `bg-emerald-500 ring-emerald-300 text-slate-900 ${BTN_DIS}`
    }`}
  >
    <span className="mr-1 align-middle font-extrabold">+</span>
    <span
      className="relative mr-1 inline-grid place-items-center align-middle"
      style={{ width: UI_SPAWN_ICON_BOX, height: UI_SPAWN_ICON_BOX }}
    >
      <img
        src={IMG_SPAWN_ICON}
        alt="dog"
        className="pointer-events-none object-cover block"
        style={{
          width: "100%",
               height: "100%",
               // קריאה חיה מ-window (אם שונה דרך הדיבוג), עם נפילה לברירת המחדל מהקבועים:
               transform: `scale(${(typeof window!=="undefined" && window.SPAWN_ICON_ZOOM) || UI_SPAWN_ICON_ZOOM}) translateY(${(typeof window!=="undefined" && window.SPAWN_ICON_SHIFT_Y) || UI_SPAWN_ICON_SHIFT_Y}px)`,
               transformOrigin: "center",
        }}
      />
    </span>
    <b className="tracking-tight align-middle">
      (LV {stateRef.current?.spawnLevel || 1}) — {formatShort(spawnCostNow)}
    </b>
  </button>

  {/* DPS */}
  <button
    onClick={upgradeDps}
    disabled={!canBuyDps}
    className={`${BTN_BASE} ${BTN_H} ${
      canBuyDps
        ? "bg-sky-500 hover:bg-sky-400 ring-sky-300 text-slate-900"
        : `bg-sky-500 ring-sky-300 text-slate-900 ${BTN_DIS}`
    }`}
    title={`Cost ${formatShort(dpsCostNow)}`}
  >
    <span className="align-middle">🪓</span>
    <span className="align-middle">+10% (Cost {formatShort(dpsCostNow)})</span>
  </button>

  {/* GOLD */}
  <button
    onClick={upgradeGold}
    disabled={!canBuyGold}
    className={`${BTN_BASE} ${BTN_H} ${
      canBuyGold
        ? "bg-amber-400 hover:bg-amber-300 ring-amber-300 text-slate-900"
        : `bg-amber-400 ring-amber-300 text-slate-900 ${BTN_DIS}`
    }`}
    title={`Cost ${formatShort(goldCostNow)}`}
  >
    <span className="align-middle">🟡</span>
    <span className="align-middle">+10% (Cost {formatShort(goldCostNow)})</span>
  </button>

  {/* GAIN */}
  <button
    onClick={onAdd}
    disabled={addDisabled}
    className={`${BTN_BASE} ${BTN_H} min-h-[28px] ${
      addDisabled
        ? `bg-indigo-400 ring-indigo-300 text-slate-900 ${BTN_DIS}`
        : "bg-indigo-400 hover:bg-indigo-300 ring-indigo-300 text-slate-900"
    }`}
    title={addRemainMs > 0 ? `Ad bonus in ${addRemainLabel}` : "Watch ad to earn"}
  >
    <span className="align-middle">GAIN</span>
    {addRemainMs > 0 && <span className="opacity-80 align-middle">({addRemainLabel})</span>}
  </button>

  {/* RESET */}
  <button
    onClick={() => setShowResetConfirm(true)}
    className={`${BTN_BASE} ${BTN_H} bg-rose-500 hover:bg-rose-400 ring-rose-300 text-white`}
    title="Reset all progress"
  >
    RESET
  </button>
</div>


{/* Mining status + CLAIM (Icon becomes a button) */}
<div className="w-full flex justify-center mt-1">
  <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
    {/* ← האייקון הוא כפתור */}
  <button
  onClick={() => setShowMleoModal(true)}
  className={`relative w-6 h-6 rounded-full grid place-items-center transition
    ${(mining?.balance || 0) > 0 ? "hover:opacity-90 active:scale-95 cursor-pointer" : "opacity-90"}`}
  aria-label="Open MLEO details"
  title="Open MLEO details"
>
 {(mining?.balance || 0) > 0 && (
<span
  aria-hidden
  className="absolute -inset-px rounded-full"
  style={{
    animation: "glowPulse 1.2s infinite",
    border: "2px solid rgba(250,204,21,.8)",
    boxShadow: "0 0 10px rgba(250,204,21,.55), 0 0 20px rgba(250,204,21,.35)"
  }}
/>


)}

  <img src={IMG_TOKEN} alt="MLEO" className="w-6 h-6 rounded-full pointer-events-none" />
</button>


  {/* BALANCE — שלמים + ניעור כשיש מה לטעון */}
<span
  className={`text-yellow-300 font-extrabold tabular-nums ${
    (mining?.balance || 0) > 0 ? "inline-block" : ""
  }`}
  style={(mining?.balance || 0) > 0 ? { animation: "nudge 1.8s ease-in-out infinite" } : undefined}
>
  {Math.floor(Number(mining?.balance || 0)).toLocaleString()} MLEO
</span>

 <button
  onClick={onClaimMined}
  disabled={claiming || (mining?.balance || 0) <= 0}
  className={`relative px-2.5 py-1 rounded-md font-extrabold transition active:scale-95
    ${(mining?.balance || 0) > 0 && !claiming
      ? "bg-yellow-400 hover:bg-yellow-300 text-black cursor-pointer"
      : "bg-slate-500 text-white/70 cursor-not-allowed"
    }`}
  title={(mining?.balance || 0) > 0 ? "Claim" : "No tokens to claim"}
>
  {(mining?.balance || 0) > 0 && !claiming && (
    <span
      aria-hidden
      className="absolute -inset-1 rounded-lg"
      style={{ animation: "btnPulse 1.8s ease-in-out infinite" }}
    />
  )}
  CLAIM
</button>


    {/* VAULT — תצוגה שלמה בלבד */}
    <button
      onClick={() => setShowMiningInfo(true)}
      className="ml-2 text-gray-300 hover:text-white underline-offset-2 hover:underline"
      title="Open Mining"
    >
      Vault: <b className="text-cyan-300 tabular-nums">
        {Math.floor(Number(mining?.vault || 0)).toLocaleString()}
      </b> C
    </button>
  </div>
</div>

</div>

{/* === END PART 9 === */}



{/* === START PART 10 === */}
        {/* Toast ממורכז ומעל ה-HUD */}
{giftToast && (
  <div className="fixed inset-0 z-[10002] flex items-center justify-center pointer-events-none">
    <div className="pointer-events-auto px-6 py-4 rounded-2xl font-extrabold text-black shadow-2xl bg-gradient-to-br from-yellow-300 to-amber-400 border border-yellow-200 text-center animate-[popfade_1.8s_ease-out_forwards]">
      {giftToast.text}
    </div>
    <style jsx global>{`
      @keyframes popfade {
        0% { opacity: 0; transform: translateY(6px) scale(0.96); }
        15% { opacity: 1; transform: translateY(0) scale(1); }
        75% { opacity: 1; }
        100% { opacity: 0; transform: translateY(-6px) scale(0.98); }
      }
    `}</style>
  </div>
)}


          {/* פופאפ מרכזי – בלי OK, נעלם אוטומטית */}
          {centerPopup && (
            <div className="absolute inset-0 z-[10001] flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto px-6 py-4 rounded-2xl font-extrabold text-black shadow-2xl bg-gradient-to-br from-yellow-300 to-amber-400 border border-yellow-200 text-center animate-[popfade_1.8s_ease-out_forwards]">
                <div className="text-lg">{centerPopup.text}</div>
              </div>
              <style jsx global>{`
                @keyframes popfade {
                  0% { opacity: 0; transform: translateY(6px) scale(0.96); }
                  15% { opacity: 1; transform: translateY(0) scale(1); }
                  75% { opacity: 1; }
                  100% { opacity: 0; transform: translateY(-6px) scale(0.98); }
                }
              `}</style>
            </div>
          )}

          {/* Center Gift Button */}
          {!showIntro && !gamePaused && !showCollect && (stateRef.current?.giftReady) && (
            <div className="absolute inset-0 z-[8] flex items-center justify-center pointer-events-none">
              <button
                onClick={grantGift}
                className="pointer-events-auto px-5 py-3 rounded-2xl font-extrabold text-black shadow-2xl bg-gradient-to-br from-yellow-300 to-amber-400 border border-yellow-200 hover:from-yellow-200 hover:to-amber-300 active:scale-95 relative"
              >
                🎁 Claim Gift
                <span className="absolute -inset-2 rounded-3xl blur-3xl bg-yellow-400/30 -z-10" />
              </button>
            </div>
          )}
        </div>

        {/* Offline COLLECT overlay */}
        {showCollect && (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/85 px-6 text-center">
            <div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/20 shadow-2xl max-w-sm w-full">
              <div className="flex items-center justify-center gap-2 mb-3">
                <img src={IMG_COIN} alt="coin" className="w-6 h-6" />
                <h3 className="text-xl font-extrabold text-white">While you were away…</h3>
              </div>
           <p className="text-gray-200 mb-4">
  Earned{" "}
  <b className="text-yellow-300">
    {formatShort(stateRef.current?.pendingOfflineGold || 0)}
  </b>{" "}
  coins and{" "}
  <b className="text-yellow-300">
    {Number(stateRef.current?.pendingOfflineMleo || 0).toFixed(2)}
  </b>{" "}
  MLEO in the background.
</p>

              <button
                onClick={onOfflineCollect}
                className="mx-auto px-6 py-3 rounded-xl bg-yellow-400 text-black font-extrabold text-lg shadow active:scale-95"
              >
                COLLECT
              </button>
            </div>
          </div>
        )}

        {/* Reset confirm */}
        {showResetConfirm && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-white text-slate-900 max-w-md w-full rounded-2xl p-6 shadow-2xl">
              <h2 className="text-2xl font-extrabold mb-2">Reset Progress?</h2>
              <p className="text-sm text-slate-700 mb-4">
                This will permanently delete your save and send you back to the start.
              </p>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={resetGame}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold"
                >
                  Yes, reset
                </button>
              </div>
            </div>
          </div>
        )}


{showHowTo && (
  <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
    <div className="bg-white text-slate-900 max-w-md w-full rounded-2xl p-6 shadow-2xl overflow-auto max-h-[85vh]">
     <h2 className="text-2xl font-extrabold mb-3">How to Play</h2>

<div className="space-y-4 text-sm text-slate-700">
  <section>
    <h3 className="font-bold text-slate-900 mb-1">Goal</h3>
    <p>
      Merge dogs (miners), break rocks, and earn <b>Coins</b>. Coins are an in-game
      resource used for upgrades and buying more miners. Some activity in the
      game can also accrue <b>MLEO</b> (see “Mining &amp; Tokens” below).
    </p>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">Board &amp; Merging</h3>
    <ol className="list-decimal ml-5 space-y-1">
      <li>Tap <b>ADD</b> on an empty slot to place a dog. Cost rises over time.</li>
      <li>Drag two dogs of the same level together to merge into a higher level.</li>
      <li>Each dog adds damage per second (DPS) to its lane. When a rock breaks you receive Coins.</li>
    </ol>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">Upgrades &amp; Bonuses</h3>
    <ul className="list-disc ml-5 space-y-1">
      <li><b>DPS</b> upgrades make rocks break faster.</li>
      <li><b>GOLD</b> upgrades increase the Coins you receive from broken rocks.</li>
      <li>Gifts, auto-dogs and other bonuses may appear from time to time. Exact timings, drop types and balance values are dynamic and may change without notice.</li>
      <li>Diamonds can be collected and spent for special rewards. Availability and rewards are not guaranteed.</li>
    </ul>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">Mining &amp; Tokens (MLEO)</h3>
    <ul className="list-disc ml-5 space-y-1">
      <li><b>How MLEO is accrued:</b> Only breaking rocks can generate MLEO. A portion of the Coins you earn from rock breaks may convert into MLEO at a variable rate that is subject to in-game balancing, daily limits and anti-abuse protections.</li>
      <li><b>Daily limits &amp; tapering:</b> To keep things fair, daily accrual may taper as you approach your personal limit for the day. Limits and calculations are internal and can change.</li>
      <li><b>Offline progress:</b> Limited offline progress is simulated at a reduced efficiency compared to active play. Exact values are internal and may change.</li>
      <li><b>CLAIM:</b> Your accrued MLEO appears as a balance. Claiming moves it into your in-game <b>Vault</b>. If/when on-chain claims become available, additional unlock windows and restrictions may apply.</li>
      <li><b>No value promise:</b> MLEO in this game is a <u>utility token for entertainment</u>. It has no intrinsic or guaranteed monetary value. Nothing here is an offer, solicitation, or promise of future value.</li>
    </ul>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">Good to Know</h3>
    <ul className="list-disc ml-5 space-y-1">
      <li>Game balance, drop rates, limits and schedules are dynamic and may be changed, paused or reset at any time for stability, fairness or maintenance.</li>
      <li>Progress may be adjusted to address bugs, exploits or abuse.</li>
      <li>This is a casual game for fun. It is not financial advice and not an investment product.</li>
    </ul>
  </section>
</div>


      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={() => setShowHowTo(false)}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}


{showTerms && (
  <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
    <div className="bg-white text-slate-900 max-w-md w-full rounded-2xl p-6 shadow-2xl overflow-auto max-h-[85vh]">
     <div className="flex items-center justify-between mb-2">
  <h2 className="text-2xl font-extrabold">Terms &amp; Conditions</h2>
  <button onClick={() => setShowTerms(false)} className="px-3 py-1 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-extrabold">Close</button>
</div>

<div className="text-sm text-slate-700 space-y-4 text-left">
  <section>
    <h3 className="font-bold text-slate-900 mb-1">1) Acceptance of Terms</h3>
    <p>
      By accessing or using the game, you agree to these Terms &amp; Conditions (“Terms”).
      If you do not agree, do not use the game. We may modify these Terms at any time by
      posting an updated version in-app or on our site. Continued use constitutes acceptance.
    </p>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">2) Entertainment-Only; No Monetary Value</h3>
    <p>
      This is a casual game for entertainment. In-game items, Coins and the token referred to as
      “MLEO” are utility features within the game experience. They <b>do not represent money,
      securities, or any form of financial instrument</b>. We make <b>no promises of price,
      liquidity, profit or future value</b> of any token or reward at any time.
    </p>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">3) No Financial Advice</h3>
    <p>
      Nothing in the game or related materials constitutes investment, legal, accounting or tax advice.
      Do your own research and consult professionals if needed. You are solely responsible for your decisions.
    </p>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">4) Gameplay, Balancing &amp; Progress</h3>
    <ul className="list-disc ml-5 space-y-1">
      <li>Game parameters (including rewards, limits, rates, spawn logic, drop tables, schedules and offline behavior) are internal, not publicly disclosed, and may change, be paused or reset at any time without notice.</li>
      <li>We may adjust or roll back progress, balances and rewards to address bugs, exploits, irregular activity, or to preserve game integrity.</li>
      <li>Access to features and events is not guaranteed and may be limited by time, geography, device, account status or other criteria.</li>
    </ul>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">5) Mining, Vault &amp; Claims</h3>
    <ul className="list-disc ml-5 space-y-1">
      <li>Only certain in-game actions (e.g., breaking rocks) may accrue MLEO according to internal, variable calculations and daily limits.</li>
      <li>“CLAIM” moves accrued MLEO into your in-game <b>Vault</b>. If an on-chain claim becomes available in the future, it may be subject to eligibility checks, unlock windows, rate limits, and other restrictions. Availability is not guaranteed.</li>
      <li>We may change, delay or discontinue vaulting and/or on-chain claiming at any time.</li>
    </ul>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">6) Wallets &amp; Third-Party Services</h3>
    <ul className="list-disc ml-5 space-y-1">
      <li>Connecting a wallet is optional and uses third-party services outside our control. You are solely responsible for the security of your devices, keys and wallets.</li>
      <li>Blockchain transactions are irreversible and may incur network fees. We are not responsible for losses due to user error, phishing, gas volatility, chain forks, reorgs, downtime or smart-contract risks.</li>
    </ul>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">7) Fair Play &amp; Prohibited Conduct</h3>
    <ul className="list-disc ml-5 space-y-1">
      <li>No bots, automation, multi-account abuse, exploits, reverse engineering or interference with game services.</li>
      <li>We may suspend, reset or terminate access and remove balances we believe are obtained through prohibited behavior.</li>
    </ul>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">8) Availability, Data &amp; Updates</h3>
    <ul className="list-disc ml-5 space-y-1">
      <li>The game may be unavailable, interrupted or updated at any time. We do not guarantee uninterrupted service.</li>
      <li>We may modify or discontinue features, wipe test data, or migrate saves for technical or balance reasons.</li>
    </ul>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">9) Airdrops, Promotions &amp; Rewards</h3>
    <p>
      Any airdrops, events, rewards or promotions are discretionary, subject to change,
      and may have eligibility requirements. Participation does not guarantee receipt or value.
    </p>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">10) Taxes</h3>
    <p>
      You are solely responsible for determining and paying any taxes associated with your use of the game,
      including any rewards you may receive.
    </p>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">11) Limitation of Liability</h3>
    <p>
      To the maximum extent permitted by law, we are not liable for any indirect, incidental,
      special, consequential or exemplary damages, or for any loss of data, tokens, profits or opportunities,
      arising from or related to your use of the game, even if advised of the possibility of such damages.
    </p>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">12) Indemnity</h3>
    <p>
      You agree to indemnify and hold us harmless from any claim, demand, loss or expense (including reasonable
      attorneys’ fees) arising out of or related to your use of the game or violation of these Terms.
    </p>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">13) Governing Law &amp; Disputes</h3>
    <p>
      These Terms are governed by the laws of <b>[insert jurisdiction]</b>, without regard to conflict-of-law rules.
      Any dispute shall be resolved exclusively in the courts of <b>[insert venue]</b>. You consent to such jurisdiction and venue.
    </p>
    <p className="text-xs text-slate-500 mt-1">
      (If you prefer arbitration, replace this clause with your arbitration language.)
    </p>
  </section>

  <section>
    <h3 className="font-bold text-slate-900 mb-1">14) Contact</h3>
    <p>
      Questions about these Terms? Contact us at <b>[insert contact email]</b>.
    </p>
  </section>
</div>

<div className="flex justify-end gap-2 mt-4">
  <button
    onClick={() => {
      acceptTerms();
      setFirstTimeNeedsTerms(false);
      setShowTerms(false);
    }}
    className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-500 font-bold"
  >
    I Agree
  </button>
</div>

    </div>
  </div>
)}

{showMiningInfo && (() => {
  const vault   = Number(mining?.vault || 0);
  const vault3  = vault.toFixed(2);
  const bal     = Number(mining?.balance || 0);
  const bal3    = bal.toFixed(2);
  const now     = Date.now();
  const pct     = currentClaimPct(now);
  const pct100  = Math.round(pct * 100);
  const canWallet = TOKEN_LIVE && walletClaimEnabled(now);
  const room    = remainingWalletClaimRoom();
  const hasRoom = room > 0;

  const statusLine = !TOKEN_LIVE
    ? "Token not live yet — wallet claim will open after token launch."
    : (canWallet
        ? (pct100 >= 100
            ? "No wallet claim limits (6+ months after launch)."
            : `Wallet claim window: up to ${pct100}% of your total accrued.`)
        : "Wallet claim locked until 1 month after token launch.");

  const roomLine = TOKEN_LIVE
    ? (hasRoom ? `Current allowed to wallet (room): ${room.toFixed(2)} MLEO.` : "Temporary wallet claim limit reached.")
    : "";

  // היסטוריה + טוגל "הצג הכל"
  const fullHist = Array.isArray(mining?.history) ? mining.history : [];
  const hist = showFullHistory ? fullHist : fullHist.slice(0, 12);

  return (
    <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white text-slate-900 max-w-md w-full rounded-2xl p-6 shadow-2xl overflow-auto max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-extrabold">Mining &amp; Tokens</h2>
          <button
            onClick={() => setShowMiningInfo(false)}
            className="px-3 py-1 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-extrabold"
          >
            Close
          </button>
        </div>

        {/* ===== Vault & Balance ===== */}
        <section className="rounded-lg p-3 bg-slate-50 border border-slate-200 mb-4">
          <h3 className="font-bold text-slate-900 mb-2">Vault &amp; Balance</h3>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-white border border-slate-200 p-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Unclaimed</div>
              <div className="text-lg font-extrabold">{bal3} MLEO</div>
              <div className="text-[11px] text-slate-500">Ready to move to Vault / Wallet</div>
            </div>
            <div className="rounded-md bg-white border border-slate-200 p-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">In Vault</div>
              <div className="text-lg font-extrabold">{vault3} MLEO</div>
              <div className="text-[11px] text-slate-500">Stored off the board</div>
            </div>
          </div>

          {/* פעולות מהירות */}
        <div className="flex flex-wrap gap-2 mt-3">
  {/* CLAIM → אוסף Unclaimed ומכניס ל־Vault (דמו) */}
  <button
    onClick={onClaimMined}
    disabled={claiming || (Number(mining?.balance || 0) <= 0)}
    className={`px-4 py-2 rounded-lg font-extrabold ${
      (Number(mining?.balance || 0) > 0) && !claiming
        ? "bg-yellow-400 hover:bg-yellow-300 text-black"
        : "bg-slate-300 text-slate-500 cursor-not-allowed"
    }`}
    title={(Number(mining?.balance || 0) > 0) ? "Move unclaimed to Vault (Demo)" : "No tokens to claim"}
  >
    {claiming ? "Claiming..." : "CLAIM"}
  </button>

  {/* CLAIM COIN → שולח Vault אל הארנק (דמו: פותח חיבור/טוסט בלבד) */}
  <button
    onClick={() => {
      try { play?.(S_CLICK); } catch {}
      const vaultAmt = Number(mining?.vault || 0);
      if (!isConnected) {
        openConnectModal?.();
        setGiftToastWithTTL("🔗 Connect wallet to withdraw Vault (Demo)");
        return;
      }
      if (vaultAmt > 0) {
        setGiftToastWithTTL(`🪙 Sent ${vaultAmt.toFixed(2)} MLEO from Vault to Wallet (Demo)`);
      } else {
        setGiftToastWithTTL("Vault is empty");
      }
    }}
    className="px-4 py-2 rounded-lg font-bold bg-indigo-600 hover:bg-indigo-500 text-white"
    title="Send Vault contents to Wallet (Demo only)"
  >
    CLAIM COIN → MLEO
  </button>
</div>




          {/* CTA להתחברות כשמותר קליים לארנק אבל לא מחוברים */}
          {TOKEN_LIVE && canWallet && !isConnected && (
            <div className="mt-3 p-2 rounded-md bg-amber-100 text-amber-900 text-sm border border-amber-200">
              <div className="flex items-center justify-between gap-2">
                <span>You can claim to your wallet. Connect to continue.</span>
                <button
                  onClick={() => (isConnected ? openAccountModal?.() : openConnectModal?.())}
                  className="px-3 py-1 rounded-md bg-amber-400 hover:bg-amber-300 text-black font-extrabold"
                >
                  CONNECT
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ===== Token Timeline / TGE ===== */}
        <section className="rounded-lg p-3 bg-slate-50 border border-slate-200 mb-4">
          <h3 className="font-bold text-slate-900 mb-2">Token Timeline</h3>

          <div className="text-xs text-slate-600 mb-1">TGE Countdown</div>
          <div className="mb-2">
            <TgeCountdown />
            <div className="text-[11px] text-slate-500">
              Wallet claim will be enabled after TGE with staged unlocks.
            </div>
          </div>

          <div className="mb-1">
            <div className="text-xs text-slate-600 mb-1">Wallet unlock progress</div>
            <WalletReleaseBar />
            <div className="text-[12px] text-slate-700">
              Current unlock: <b>{pct100}%</b> of your total accrued{TOKEN_LIVE ? "" : " (token not live yet)"}.
            </div>
          </div>

          <div className="text-[12px] mt-2 text-slate-700">{statusLine}</div>
          {roomLine && <div className="text-[12px] text-slate-600">{roomLine}</div>}
        </section>

        {/* ===== Info notes ===== */}
        <section className="rounded-lg p-3 bg-slate-50 border border-slate-200 mb-4">
          <h3 className="font-bold text-slate-900 mb-2">Notes</h3>
          <ul className="list-disc ml-5 space-y-1 text-sm text-slate-700">
            <li>Only breaking rocks can accrue MLEO. Conversions are subject to daily limits and soft cut.</li>
            <li>“CLAIM”:
              {!TOKEN_LIVE
                ? " moves Unclaimed to your in-game Vault for now. On-chain claim may be enabled after TGE."
                : " moves Unclaimed to your wallet (subject to unlock window)."}
            </li>
            <li>Schedules, limits and parameters are dynamic and may change.</li>
          </ul>
        </section>

        {/* ===== Recent activity + טוגל ===== */}
        <section className="rounded-lg p-3 bg-slate-50 border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-900">Recent Activity</h3>
            {fullHist.length > 12 && (
              <button
                onClick={() => setShowFullHistory(v => !v)}
                className="text-xs px-2 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-800 font-extrabold"
              >
                {showFullHistory ? `Show recent (12)` : `Show all (${fullHist.length})`}
              </button>
            )}
          </div>

          {hist.length === 0 ? (
            <div className="text-sm text-slate-600">No mining activity yet.</div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {hist.map((h, i) => {
                const dt = new Date(h.ts || Date.now());
                const amt = Number(h.amt || 0).toFixed(2);
                const kind =
                  h.type === "to_wallet" ? "To Wallet" :
                  h.type === "to_vault"  ? "To Vault"  :
                  h.type || "entry";
                return (
                  <li key={i} className="py-2 text-sm flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-semibold">{kind}</span>
                      <span className="text-[11px] text-slate-500">
                        {dt.toLocaleString?.() || dt.toISOString()}
                      </span>
                    </div>
                    <div className="font-extrabold tabular-nums">{amt} MLEO</div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={() => setShowMiningInfo(false)}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 font-extrabold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
})()}


        {/* Diamond Rewards Modal */}
        {showDiamondInfo && (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 px-4">
            <div className="bg-white/10 backdrop-blur rounded-2xl p-5 border border-white/20 shadow-2xl max-w-sm w-[92%] sm:w-[420px] text-left overflow-auto max-h-[85vh]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">💎</span>
                  <h3 className="text-lg font-extrabold text-white">Diamond Chest</h3>
                </div>
                <button
                  onClick={() => setShowDiamondInfo(false)}
                  className="px-2 py-1 bg-yellow-400 text-black font-bold rounded-lg text-xs"
                >
                  Close
                </button>
              </div>

              <p className="text-gray-200 mb-2 text-sm">
                Diamonds: <b className="text-yellow-300">{stateRef.current?.diamonds ?? 0}</b>
              </p>

 <div className="rounded-lg p-3 bg-white/5 border border-white/10 mb-3 text-sm">
  <div className="text-gray-100 mb-1 font-semibold">Next reward:</div>
  <div className="text-gray-100 mb-2">
    {DIAMOND_PRIZES.find(p => p.key === (stateRef.current?.nextDiamondPrize))?.label || "Mystery reward"}
  </div>
  <div className="text-gray-200/90 font-semibold mb-1">Probabilities</div>
  <ul className="text-gray-200 list-disc list-inside space-y-0.5">
    <li>Tier 1 (55%): either <i>Coins ×10</i> or <i>Dog +3</i> (50/50)</li>
    <li>Tier 2 (30%): either <i>Coins ×100</i> or <i>Dog +5</i> (50/50)</li>
    <li>Tier 3 (15%): either <i>Coins ×1000</i> or <i>Dog +7</i> (50/50)</li>
  </ul>
</div>


              <ul className="space-y-1 mb-4 text-sm">
                {DIAMOND_PRIZES.map(p => {
                  const isNext = (stateRef.current?.nextDiamondPrize === p.key);
                  return (
                    <li
                      key={p.key}
                      className={`flex items-center justify-between rounded-lg px-2 py-1
                        ${isNext ? "bg-yellow-400/15 border border-yellow-400/60" : "bg-white/5 border border-white/10"}`}
                    >
                      <span className="text-gray-100">{p.label}</span>
                      {isNext && <span className="text-[10px] font-extrabold text-yellow-300">NEXT</span>}
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center justify-between">
                <p className="text-gray-300 text-xs">Open when you have 3💎.</p>
                <button
                  onClick={() => { openDiamondChestIfReady(); }}
                  disabled={(stateRef.current?.diamonds || 0) < 3}
                  className={`px-3 py-1.5 rounded-lg font-extrabold text-xs ${
                    (stateRef.current?.diamonds || 0) >= 3
                      ? "bg-yellow-400 hover:bg-yellow-300 text-black"
                      : "bg-slate-400 text-slate-800 opacity-60 cursor-not-allowed"
                  }`}
                >
                  OPEN (3💎)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HUD Info Modal (כל פריטי ה-HUD חוץ מהיהלום) */}
        {hudModal && (
          <div className="fixed inset-0 z-[10000] bg-black/70 flex items-center justify-center p-4">
            <div className="bg-white text-slate-900 max-w-md w-full rounded-2xl p-5 shadow-2xl">
              <h2 className="text-xl font-extrabold mb-2">{getHudModalTitle(hudModal)}</h2>
              <p className="text-sm text-slate-700 mb-4">{getHudModalText(hudModal)}</p>
              <div className="flex justify-end">
                <button
                  onClick={()=>setHudModal(null)}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

{/* MLEO Modal – exact (3dp) + CLAIM + How it works + TGE info */}
{showMleoModal && (
  <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
    <div className="bg-white text-slate-900 max-w-md w-full rounded-2xl p-6 shadow-2xl overflow-auto max-h-[85vh]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-extrabold">MLEO</h2>
        <button
          onClick={()=>setShowMleoModal(false)}
          className="px-3 py-1 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-extrabold"
        >
          Close
        </button>
      </div>

      {/* Balances */}
      <div className="rounded-lg p-3 bg-slate-50 border border-slate-200 mb-4">
        <div className="text-sm">
          Balance: <b>{Number(mining?.balance || 0).toFixed(3)} MLEO</b>
        </div>
        <div className="text-sm">
          Vault: <b>{Number(mining?.vault || 0).toFixed(3)} MLEO</b>
        </div>
        <div className="text-xs text-slate-600">
          Total claimed (all time): {Number(mining?.claimedTotal || 0).toFixed(3)} MLEO
        </div>
      </div>

      {/* Claim to Vault / Wallet */}
      <div className="rounded-lg p-3 bg-amber-50 border border-amber-200 mb-4">
        <div className="text-sm text-amber-900 space-y-2">
          {!TOKEN_LIVE ? (
            <>
              <div className="font-semibold">TGE Countdown</div>
              <TgeCountdown />
              <div className="text-xs opacity-80">
                Wallet claim will be enabled after TGE with staged unlocks.
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold">Wallet Claim Unlock</div>
              <WalletReleaseBar />
              <div className="text-xs">
                Unlocked window: <b>{Math.round(currentClaimPct(Date.now()) * 100)}%</b> (10% → 30% → 50% → 70% → 90% → 100%)
              </div>
            </>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={onClaimMined}
            disabled={claiming || (mining?.balance || 0) <= 0}
            className={`px-3 py-1.5 rounded-md font-extrabold ${
              (mining?.balance || 0) > 0 && !claiming
                ? "bg-yellow-400 hover:bg-yellow-300 text-black"
                : "bg-slate-300 text-slate-600 cursor-not-allowed"
            }`}
            title={(mining?.balance || 0) > 0 ? "Claim" : "No tokens to claim"}
          >
            CLAIM
          </button>
        </div>
      </div>

      {/* How it works – inline inside the MLEO modal */}
      <div className="mt-1 p-3 rounded-lg bg-slate-100 border border-slate-200">
        <h3 className="font-semibold mb-2">How it works</h3>
        <ul className="list-disc list-inside text-sm space-y-1 text-slate-700">
          <li><b>Daily cap</b> with softcut to keep things fair.</li>
          <li><b>Only rock coins convert</b> to MLEO, based on softcut and remaining daily room.</li>
          <li><b>Regular gifts</b>: 70% coins (20%), 8% DPS +10%, 8% GOLD +10%, 6% +1 diamond, 8% coins (40%).</li>
          <li><b>Diamonds</b>: 3 diamonds → chest (next prize & probabilities shown in the Diamond panel).</li>
          <li><b>Wallet claim</b>: Gradual unlock after TGE with countdown & progress.</li>
        </ul>
      </div>
    </div>
  </div>
)}


  {!showIntro && (
  <button
    onClick={async () => { setShowIntro(true); setGamePaused(true); try { await exitFullscreenIfAny(); } catch {} }}
    className="fixed right-3 px-4 py-2 bg-yellow-400 text-black font-bold rounded-lg text-sm z-[999]"
    style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
  >
    Exit
  </button>
)}

{/* ===== Debug Panel (toggle: Shift+D, ?debug=1, LS flag; auto in localhost) ===== */}
{debugUI && (
  <div
    className="fixed bottom-3 left-3 z-[10050] bg-black/70 text-white p-3 rounded-xl border border-white/20 w-[280px] backdrop-blur"
    style={{ fontSize: 12, lineHeight: 1.1 }}
  >
    <div className="flex items-center justify-between mb-2">
      <b>Debug: Miner &amp; UI</b>
      <button
        onClick={() => { setDebugUI(false); setDebugFlag(false); }}
        className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
        title="Hide debug panel (Shift+D toggles too)"
      >
        Hide
      </button>
    </div>

    {/* minerScale (height) */}
    <label className="block mb-2">
      <div className="mb-1">minerScale (height)</div>
      <div className="flex items-center gap-2">
        <input
          type="range" min="0.6" max="2.0" step="0.01"
          value={Number(debugVals.minerScale)}
          onChange={(e) => {
            const v = Math.max(0.6, Math.min(2, parseFloat(e.target.value) || 1.10));
            setDebugVals(x => ({ ...x, minerScale: v }));
            if (stateRef.current) { stateRef.current.minerScale = v; save?.(); }
          }}
          className="w-full"
        />
        <input
          type="number" step="0.01"
          value={Number(debugVals.minerScale)}
          onChange={(e) => {
            const v = Math.max(0.6, Math.min(2, parseFloat(e.target.value) || 1.10));
            setDebugVals(x => ({ ...x, minerScale: v }));
            if (stateRef.current) { stateRef.current.minerScale = v; save?.(); }
          }}
          className="w-16 px-1 py-0.5 rounded bg-white/10 border border-white/20"
        />
      </div>
    </label>

    {/* minerWidth */}
    <label className="block mb-2">
      <div className="mb-1">minerWidth (stretch)</div>
      <div className="flex items-center gap-2">
        <input
          type="range" min="0.8" max="2.0" step="0.01"
          value={Number(debugVals.minerWidth)}
          onChange={(e) => {
            const v = Math.max(0.8, Math.min(2, parseFloat(e.target.value) || 1.12));
            setDebugVals(x => ({ ...x, minerWidth: v }));
            if (stateRef.current) { stateRef.current.minerWidth = v; save?.(); }
          }}
          className="w-full"
        />
        <input
          type="number" step="0.01"
          value={Number(debugVals.minerWidth)}
          onChange={(e) => {
            const v = Math.max(0.8, Math.min(2, parseFloat(e.target.value) || 1.12));
            setDebugVals(x => ({ ...x, minerWidth: v }));
            if (stateRef.current) { stateRef.current.minerWidth = v; save?.(); }
          }}
          className="w-16 px-1 py-0.5 rounded bg-white/10 border border-white/20"
        />
      </div>
    </label>

    {/* Spawn icon zoom */}
    <label className="block mb-2">
      <div className="mb-1">Spawn Icon Zoom</div>
      <div className="flex items-center gap-2">
        <input
          type="range" min="0.5" max="3.0" step="0.05"
          value={Number(debugVals.spawnIconZoom)}
          onChange={(e) => {
            const v = Math.max(0.5, Math.min(3, parseFloat(e.target.value) || 2.2));
            setDebugVals(x => ({ ...x, spawnIconZoom: v }));
            try {
              window.SPAWN_ICON_ZOOM = v;
              localStorage.setItem("SPAWN_ICON_ZOOM", String(v));
            } catch {}
          }}
          className="w-full"
        />
        <input
          type="number" step="0.05"
          value={Number(debugVals.spawnIconZoom)}
          onChange={(e) => {
            const v = Math.max(0.5, Math.min(3, parseFloat(e.target.value) || 2.2));
            setDebugVals(x => ({ ...x, spawnIconZoom: v }));
            try {
              window.SPAWN_ICON_ZOOM = v;
              localStorage.setItem("SPAWN_ICON_ZOOM", String(v));
            } catch {}
          }}
          className="w-16 px-1 py-0.5 rounded bg-white/10 border border-white/20"
        />
      </div>
    </label>

    {/* Spawn icon Y-shift */}
    <label className="block mb-2">
      <div className="mb-1">Spawn Icon Shift Y (px)</div>
      <div className="flex items-center gap-2">
        <input
          type="range" min="-40" max="40" step="1"
          value={Number(debugVals.spawnIconShiftY)}
          onChange={(e) => {
            const v = Math.max(-40, Math.min(40, parseInt(e.target.value, 10) || 0));
            setDebugVals(x => ({ ...x, spawnIconShiftY: v }));
            try {
              window.SPAWN_ICON_SHIFT_Y = v;
              localStorage.setItem("SPAWN_ICON_SHIFT_Y", String(v));
            } catch {}
          }}
          className="w-full"
        />
        <input
          type="number" step="1"
          value={Number(debugVals.spawnIconShiftY)}
          onChange={(e) => {
            const v = Math.max(-40, Math.min(40, parseInt(e.target.value, 10) || 0));
            setDebugVals(x => ({ ...x, spawnIconShiftY: v }));
            try {
              window.SPAWN_ICON_SHIFT_Y = v;
              localStorage.setItem("SPAWN_ICON_SHIFT_Y", String(v));
            } catch {}
          }}
          className="w-16 px-1 py-0.5 rounded bg-white/10 border border-white/20"
        />
      </div>
    </label>

    {/* Quick stats */}
    <div className="text-xs space-y-1 mt-2">
      <div>minerScale: <b>{(stateRef.current?.minerScale ?? 1.10).toFixed(2)}</b></div>
      <div>minerWidth: <b>{(stateRef.current?.minerWidth ?? 1.12).toFixed(2)}</b></div>
      <div>spawnLevel: <b>{stateRef.current?.spawnLevel ?? 1}</b></div>
      <div>diamonds: <b>{stateRef.current?.diamonds ?? 0}</b></div>
    </div>

    <div className="flex gap-2 mt-3">
      <button
        onClick={() => {
          const reset = { minerScale: 1.10, minerWidth: 1.12 };
          setDebugVals(v => ({ ...v, ...reset, spawnIconZoom: 2.2, spawnIconShiftY: 0 }));
          if (stateRef.current) {
            stateRef.current.minerScale = 1.10;
            stateRef.current.minerWidth = 1.12;
            save?.();
          }
          try {
            window.SPAWN_ICON_ZOOM = 2.2;
            window.SPAWN_ICON_SHIFT_Y = 0;
            localStorage.setItem("SPAWN_ICON_ZOOM", "2.2");
            localStorage.setItem("SPAWN_ICON_SHIFT_Y", "0");
          } catch {}
        }}
        className="px-2 py-1 rounded bg-white/15 hover:bg-white/25"
      >
        Reset defaults
      </button>
      <button
        onClick={() => { setDebugUI(false); setDebugFlag(false); }}
        className="px-2 py-1 rounded bg-white/15 hover:bg-white/25"
      >
        Close
      </button>
    </div>
  </div>
)}

</div>
</Layout>
);
} 
// === END PART 10 ===