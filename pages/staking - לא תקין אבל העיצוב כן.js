/***************************************************
 * PART 1 — FILE HEADER & ENV (English-only UI)
 ***************************************************/
// pages/staking.js — MLEO Dynamic Locker (Dark + Optional BG)
// Tailwind + Wagmi + RainbowKit. Pages Router.
// Background via NEXT_PUBLIC_STAKING_BG_URL; if unset → pure black.

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  formatUnits,
  parseUnits,
  zeroAddress,
  encodeFunctionData,
  maxUint256
} from "viem";

/***************************************************
 * PART 2 — ENV CONSTANTS
 ***************************************************/
const STAKING_ADDRESS = process.env.NEXT_PUBLIC_STAKING_ADDRESS;
const TOKEN_ADDRESS   = process.env.NEXT_PUBLIC_MLEO_TOKEN_ADDRESS;
const ENV_DECIMALS    = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const CHAIN_ID        = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const BG_URL          = process.env.NEXT_PUBLIC_STAKING_BG_URL || "";

/***************************************************
 * PART 3 — ABIs
 ***************************************************/
const ERC20_ABI = [
  { type:"function", stateMutability:"view", name:"decimals", inputs:[], outputs:[{type:"uint8"}] },
  { type:"function", stateMutability:"view", name:"symbol",   inputs:[], outputs:[{type:"string"}] },
  { type:"function", stateMutability:"view", name:"balanceOf", inputs:[{name:"a",type:"address"}], outputs:[{type:"uint256"}] },
  { type:"function", stateMutability:"view", name:"allowance", inputs:[{name:"o",type:"address"},{name:"s",type:"address"}], outputs:[{type:"uint256"}] },
  { type:"function", stateMutability:"nonpayable", name:"approve", inputs:[{name:"s",type:"address"},{name:"a",type:"uint256"}], outputs:[{type:"bool"}] },
];

const LOCKER_ABI = [
  { type:"function", stateMutability:"view", name:"depositsOpen",    inputs:[], outputs:[{type:"bool"}] },
  { type:"function", stateMutability:"view", name:"started",         inputs:[], outputs:[{type:"bool"}] },
  { type:"function", stateMutability:"view", name:"periodFinish",    inputs:[], outputs:[{type:"uint256"}] },
  { type:"function", stateMutability:"view", name:"rewardRate",      inputs:[], outputs:[{type:"uint256"}] },
  { type:"function", stateMutability:"view", name:"totalDeposited",  inputs:[], outputs:[{type:"uint256"}] },
  { type:"function", stateMutability:"view", name:"totalWeight",     inputs:[], outputs:[{type:"uint256"}] },
  { type:"function", stateMutability:"view", name:"claimable",       inputs:[{name:"u",type:"address"}], outputs:[{type:"uint256"}] },
  { type:"function", stateMutability:"view", name:"user",            inputs:[{name:"u",type:"address"}], outputs:[
      {name:"deposited",       type:"uint256"},
      {name:"weight",          type:"uint256"},
      {name:"paid",            type:"uint256"},
      {name:"lastClaim",       type:"uint256"},
      {name:"exitRequestedAt", type:"uint256"},
    ] },
  // base actions
  { type:"function", stateMutability:"nonpayable", name:"deposit",     inputs:[{name:"amount",type:"uint256"}], outputs:[] },
  { type:"function", stateMutability:"nonpayable", name:"requestExit", inputs:[], outputs:[] },
  { type:"function", stateMutability:"nonpayable", name:"claim",       inputs:[], outputs:[] },
  // optional overloads
  { type:"function", stateMutability:"nonpayable", name:"cancelExit",  inputs:[], outputs:[] },
  { type:"function", stateMutability:"nonpayable", name:"deposit",     inputs:[{name:"amount",type:"uint256"},{name:"lockDays",type:"uint32"}], outputs:[] },
  { type:"function", stateMutability:"view", name:"aprBps",           inputs:[], outputs:[{type:"uint256"}] },
];

/***************************************************
 * PART 4 — HELPER FNS
 ***************************************************/
function fmt(n, d) {
  try { return Number(formatUnits(n || 0n, d)).toLocaleString(undefined, { maximumFractionDigits: 6 }); } catch { return "0"; }
}
function fmtPct(x) {
  try { return `${(Number(x)||0).toLocaleString(undefined,{maximumFractionDigits:2})}%`; } catch { return "0%"; }
}
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const ms = (x)=> Number(x || 0n) * 1000;
const now = ()=> Math.floor(Date.now()/1000);
function secondsToDhms(secs) {
  secs = Math.max(0, Number(secs || 0));
  const d = Math.floor(secs / 86400); secs -= d * 86400;
  const h = Math.floor(secs / 3600);  secs -= h * 3600;
  const m = Math.floor(secs / 60);    secs -= m * 60;
  const s = Math.floor(secs);
  return `${d}d ${h}h ${m}m ${s}s`;
}

/***************************************************
 * PART 5 — COMPONENT
 ***************************************************/
export default function StakingPage() {
  /***** 5.1 — Account, Network & Client *****/
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const pc = usePublicClient();

  /***** 5.2 — Local State *****/
  const [amount, setAmount] = useState("");
  const [lockDays, setLockDays] = useState(365);
  const [symbol, setSymbol] = useState("MLEO");
  const [decimals, setDecimals] = useState(ENV_DECIMALS);   // <- will be replaced by on-chain value
  const [err, setErr] = useState("");
  const [txHash, setTxHash] = useState();
  const [supportsLockDays, setSupportsLockDays] = useState(false);

  /***** 5.3 — Tx helpers *****/
  const { writeContractAsync } = useWriteContract();
  const { isSuccess: txSuccess } = useWaitForTransactionReceipt({ hash: txHash, confirmations: 1 });

  /***** 5.4 — Detect optional deposit(amount,uint32) (advisory only) *****/
  useEffect(() => {
    try {
      const fn = LOCKER_ABI.find(x => x.name === "deposit" && x.inputs?.length === 2);
      if (!fn) return setSupportsLockDays(false);
      encodeFunctionData({ abi: [fn], functionName: "deposit", args: [1n, 30] });
      setSupportsLockDays(true);
    } catch { setSupportsLockDays(false); }
  }, []);

  /***** 5.5 — Reads (with polling) *****/
  const symRead = useReadContract({
    address: TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "symbol",
    query: { refetchInterval: 8000 }
  });
  useEffect(() => { if (symRead.data) setSymbol(symRead.data); }, [symRead.data]);

  const decRead = useReadContract({
    address: TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "decimals",
  });
  useEffect(() => { if (typeof decRead.data === "number") setDecimals(decRead.data); }, [decRead.data]);

  const balRead = useReadContract({
    address: TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf",
    args: [address || zeroAddress],
    query: { enabled: !!address, refetchInterval: 8000 }
  });

  const allowanceRead = useReadContract({
    address: TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "allowance",
    args: [address || zeroAddress, STAKING_ADDRESS],
    query: { enabled: !!address, refetchInterval: 8000 }
  });

  const depositsOpen = useReadContract({
    address: STAKING_ADDRESS, abi: LOCKER_ABI, functionName: "depositsOpen",
    query: { refetchInterval: 15000 }
  });
  const started = useReadContract({
    address: STAKING_ADDRESS, abi: LOCKER_ABI, functionName: "started",
    query: { refetchInterval: 15000 }
  });
  const finish = useReadContract({
    address: STAKING_ADDRESS, abi: LOCKER_ABI, functionName: "periodFinish",
    query: { refetchInterval: 15000 }
  });
  const rate = useReadContract({
    address: STAKING_ADDRESS, abi: LOCKER_ABI, functionName: "rewardRate",
    query: { refetchInterval: 15000 }
  });
  const totalDep = useReadContract({
    address: STAKING_ADDRESS, abi: LOCKER_ABI, functionName: "totalDeposited",
    query: { refetchInterval: 15000 }
  });
  const totalW = useReadContract({
    address: STAKING_ADDRESS, abi: LOCKER_ABI, functionName: "totalWeight",
    query: { refetchInterval: 15000 }
  });
  const claimable = useReadContract({
    address: STAKING_ADDRESS, abi: LOCKER_ABI, functionName: "claimable",
    args: [address || zeroAddress],
    query: { enabled: !!address, refetchInterval: 15000 }
  });
  const user = useReadContract({
    address: STAKING_ADDRESS, abi: LOCKER_ABI, functionName: "user",
    args: [address || zeroAddress],
    query: { enabled: !!address, refetchInterval: 15000 }
  });
  const aprBps = useReadContract({
    address: STAKING_ADDRESS, abi: LOCKER_ABI, functionName: "aprBps",
    query: { refetchInterval: 15000 }
  });

  // Derived from reads
  const bal        = balRead.data || 0n;
  const allowance  = allowanceRead.data || 0n;
  const deposited       = user.data?.[0] || 0n;
  const weight          = user.data?.[1] || 0n;
  const lastClaim       = user.data?.[3] || 0n;
  const exitRequestedAt = user.data?.[4] || 0n;

  // Helper: refetch all
  function refreshAll() {
    balRead.refetch?.();
    allowanceRead.refetch?.();
    depositsOpen.refetch?.();
    started.refetch?.();
    finish.refetch?.();
    rate.refetch?.();
    totalDep.refetch?.();
    totalW.refetch?.();
    claimable.refetch?.();
    user.refetch?.();
    aprBps.refetch?.();
  }

/***************************************************
 * PART 6 — DERIVED VALUES
 ***************************************************/
  const required = useMemo(() => {
    try { return amount.trim() ? parseUnits(amount.trim(), decimals) : 0n; } catch { return 0n; }
  }, [amount, decimals]);

  const needApprove = useMemo(() => (allowance < required), [allowance, required]);

  const cooldownSecs = useMemo(() => {
    if (!exitRequestedAt) return 0;
    const THIRTY_DAYS = 30 * 24 * 3600;
    const end = Number(exitRequestedAt) + THIRTY_DAYS;
    return Math.max(0, end - now());
  }, [exitRequestedAt]);

  const estAprPct = useMemo(() => {
    const aprFromContract = aprBps.data ? Number(aprBps.data) / 100 : null;
    if (aprFromContract != null) return aprFromContract;
    const r = Number(rate.data || 0n);
    const t = Number(totalDep.data || 0n) / 10 ** decimals;
    if (!r || !t) return 0;
    const yearly = r * SECONDS_PER_YEAR / 10 ** decimals;
    return (yearly / t) * 100;
  }, [aprBps.data, rate.data, totalDep.data, decimals]);

  const finishMs = finish.data ? ms(finish.data) : 0;

/***************************************************
 * PART 7 — ACTIONS (Approve/Deposit/Claim/Exit)
 ***************************************************/
  async function ensureNetwork() {
    if (chainId !== CHAIN_ID) await switchChain({ chainId: CHAIN_ID });
  }

  const { writeContractAsync: write } = useWriteContract();

  async function onApprove(max = false) {
    try {
      setErr(""); await ensureNetwork();
      const amt = max ? maxUint256 : (required || bal);
      const tx = await write({
        address: TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [STAKING_ADDRESS, amt]
      });
      setTxHash(tx);
    } catch (e) {
      setErr(e?.shortMessage || e?.message || "Approval failed");
    }
  }

  /** simulate → write. Try (amount,lockDays) then fallback to (amount). */
  async function onDeposit() {
    try {
      setErr(""); await ensureNetwork();
      if (!amount.trim()) throw new Error("Enter an amount to deposit");
      if (!pc) throw new Error("Public client unavailable");

      let req;
      try {
        const sim = await pc.simulateContract({
          address: STAKING_ADDRESS,
          abi: LOCKER_ABI,
          functionName: "deposit",
          args: [required, Number(lockDays)],
          account: address,
        });
        req = sim.request;
      } catch (e1) {
        const sim2 = await pc.simulateContract({
          address: STAKING_ADDRESS,
          abi: LOCKER_ABI,
          functionName: "deposit",
          args: [required],
          account: address,
        });
        req = sim2.request;
      }

      const tx = await write(req);
      setTxHash(tx);
      setAmount("");
    } catch (e) {
      setErr(e?.shortMessage || e?.details || e?.message || "Deposit failed");
    }
  }

  async function onClaim() {
    try {
      setErr(""); await ensureNetwork();
      const tx = await write({ address: STAKING_ADDRESS, abi: LOCKER_ABI, functionName: "claim", args: [] });
      setTxHash(tx);
    } catch (e) { setErr(e?.shortMessage || e?.message || "Claim failed"); }
  }

  async function onRequestExit() {
    try {
      setErr(""); await ensureNetwork();
      const tx = await write({ address: STAKING_ADDRESS, abi: LOCKER_ABI, functionName: "requestExit", args: [] });
      setTxHash(tx);
    } catch (e) { setErr(e?.shortMessage || e?.message || "Exit request failed"); }
  }

  async function onCancelExit() {
    try {
      setErr(""); await ensureNetwork();
      const tx = await write({ address: STAKING_ADDRESS, abi: LOCKER_ABI, functionName: "cancelExit", args: [] });
      setTxHash(tx);
    } catch (e) { setErr(e?.shortMessage || e?.message || "Cancel failed"); }
  }

/***************************************************
 * PART 8 — EFFECTS (Auto refresh on tx success)
 ***************************************************/
  useEffect(() => {
    if (txSuccess) refreshAll();
  }, [txSuccess]);

/***************************************************
 * PART 9 — UI
 ***************************************************/
  const bgStyle = BG_URL
    ? { backgroundImage: `url("${BG_URL}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : { backgroundColor: "#000" };

  return (
    <>
      <Head>
        <title>MLEO — Staking / Locker</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div className="min-h-screen text-white relative" style={bgStyle}>
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative max-w-6xl mx-auto p-4 sm:p-6 lg:p-10">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Stake MLEO</h1>
              <p className="text-white/70 text-sm">Yearly linear pool • Live APR • Per-deposit lock</p>
            </div>
            <ConnectButton />
          </div>

          {/* Stats */}
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <Stat label="Deposits open" value={String(depositsOpen.data ? "Yes" : "No")} />
            <Stat label="Started" value={String(started.data ? "Yes" : "—")} />
            <Stat label="Period finish" value={finishMs ? new Date(finishMs).toLocaleString() : "—"} />
            <Stat label={`Total deposited (${symbol})`} value={fmt(totalDep.data, decimals)} />
            <Stat label="Total weight" value={fmt(totalW.data, decimals)} />
            <Stat label="APR (est)" value={fmtPct(estAprPct)} />
          </div>

          {/* Deposit / Status */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Deposit */}
            <div className="rounded-2xl bg-white/5 border border-white/10 shadow-xl p-5">
              <h2 className="text-xl font-semibold mb-4">Deposit</h2>
              <div className="text-sm text-white/80 mb-1">Your balance: {fmt(bal, decimals)} {symbol}</div>
              <div className="text-xs text-white/50 mb-3">
                Allowance: {fmt(allowance, decimals)} {symbol} • Required: {fmt(required, decimals)} {symbol}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <input
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="Amount to deposit"
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30"
                  />
                  <button
                    onClick={() => setAmount(String(Number(formatUnits(bal||0n, decimals))))}
                    className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-xs"
                  >
                    MAX
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={1095}
                    value={lockDays}
                    onChange={e => setLockDays(Math.min(1095, Math.max(1, Number(e.target.value))))}
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30"
                  />
                  <span className="text-sm text-white/70">Lock days</span>
                </div>
              </div>

              <div className="text-xs text-white/60 mt-2">
                {supportsLockDays
                  ? "Choose 1–1095 lock days (if supported by the contract)."
                  : "This locker ignores custom lock days and uses its default rules."}
              </div>

              <div className="flex gap-2 mt-4 flex-wrap">
                {needApprove ? (
                  <>
                    <button onClick={() => onApprove(false)} disabled={!isConnected}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 disabled:opacity-50">
                      Approve
                    </button>
                    <button onClick={() => onApprove(true)} disabled={!isConnected}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 disabled:opacity-50">
                      Approve MAX
                    </button>
                  </>
                ) : (
                  <button onClick={onDeposit} disabled={!isConnected || !amount.trim()}
                    className="px-4 py-2 rounded-xl bg-emerald-500/80 hover:bg-emerald-500 disabled:opacity-50">
                    Deposit
                  </button>
                )}
              </div>

              {!!err && <div className="mt-3 text-red-400 text-sm break-all">{err}</div>}
            </div>

            {/* My status */}
            <div className="rounded-2xl bg-white/5 border border-white/10 shadow-xl p-5">
              <h2 className="text-xl font-semibold mb-4">My status</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Deposited" value={`${fmt(deposited, decimals)} ${symbol}`} />
                <Info label="Weight" value={fmt(weight, decimals)} />
                <Info label="Claimable" value={`${fmt(claimable.data, decimals)} ${symbol}`} />
                <Info label="Exit requested" value={exitRequestedAt ? new Date(ms(exitRequestedAt)).toLocaleString() : "—"} />
                <Info label="Cooldown left" value={exitRequestedAt ? secondsToDhms(cooldownSecs) : "—"} />
                <Info label="Last claim" value={lastClaim ? new Date(ms(lastClaim)).toLocaleString() : "—"} />
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={onClaim} disabled={!isConnected}
                  className="px-4 py-2 rounded-xl bg-blue-500/80 hover:bg-blue-500 disabled:opacity-50">Claim</button>
                <button onClick={onRequestExit} disabled={!isConnected}
                  className="px-4 py-2 rounded-xl bg-amber-500/80 hover:bg-amber-500 disabled:opacity-50">Request exit</button>
                <button onClick={onCancelExit} disabled={!isConnected}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 disabled:opacity-50">Cancel exit</button>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mt-8 text-xs text-white/70 space-y-1">
            <p>• Token decimals are auto-detected from chain; ENV fallback = {ENV_DECIMALS}.</p>
            <p>• “Approve MAX” sets unlimited allowance to avoid repeated approvals.</p>
          </div>

          {/* Footer */}
          <div className="mt-10 text-center text-white/40 text-xs">
            <span>Contract:</span> <code className="mx-1">{STAKING_ADDRESS}</code> • <span>Token:</span> <code className="mx-1">{TOKEN_ADDRESS}</code>
          </div>
        </div>
      </div>
    </>
  );
}

/***************************************************
 * PART 10 — SMALL UI COMPONENTS
 ***************************************************/
function Stat({ label, value }) {
  return (
    <div className="rounded-2xl p-4 bg-white/5 border border-white/10 shadow-sm">
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-lg font-semibold">{value ?? "—"}</div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl p-3 bg-black/30 border border-white/10">
      <div className="text-xs text-white/60 mb-1">{label}</div>
      <div className="text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}
