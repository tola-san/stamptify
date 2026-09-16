"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import {
  ArrowLeft, BadgeCheck, Camera, Check, CircleAlert, Gift, Keyboard,
  LoaderCircle, RefreshCw, ScanLine, Sparkles, UserRound,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { Html5Qrcode } from "html5-qrcode";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { confirmStamp, getCurrentStaff, previewStampToken } from "@/services/staff-service";
import type { StampConfirmation, StampScanPreview } from "@/types/staff";

function readToken(value: string) {
  const trimmed = value.trim();
  try {
    const json = JSON.parse(trimmed) as { token?: unknown };
    if (typeof json.token === "string") return json.token.trim();
  } catch {
    // A normal QR token is not JSON.
  }
  try {
    const url = new URL(trimmed);
    return url.searchParams.get("token")?.trim() || trimmed;
  } catch {
    return trimmed;
  }
}

function stampProgress(card: StampScanPreview["card"]) {
  return Math.min(100, Math.round((card.stamp_count / card.required_stamps) * 100));
}

export function StaffQRScanner() {
  const router = useRouter();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [cameraState, setCameraState] = useState<"starting" | "active" | "stopped" | "error">("starting");
  const [preview, setPreview] = useState<StampScanPreview | null>(null);
  const [confirmation, setConfirmation] = useState<StampConfirmation | null>(null);
  const [manualToken, setManualToken] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const rewardReady = confirmation?.reward_available === true;

  useEffect(() => {
    let active = true;
    getCurrentStaff()
      .then(() => active && setIsAuthenticated(true))
      .catch((requestError: unknown) => {
        if (requestError instanceof ApiError && requestError.status === 401) {
          router.replace("/staff/login");
        } else if (active) {
          setError("មិនអាចភ្ជាប់ទៅសេវាកម្មបានទេ។");
          setCameraState("error");
        }
      });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!isAuthenticated || preview || confirmation) return;
    let cancelled = false;
    handledRef.current = false;

    async function startCamera() {
      try {
        const { Html5Qrcode: Scanner } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Scanner("staff-qr-reader", false);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
          async (decodedText) => {
            if (handledRef.current) return;
            handledRef.current = true;
            setCameraState("stopped");
            await scanner.stop().catch(() => undefined);
            try {
              setPreview(await previewStampToken(readToken(decodedText)));
            } catch (requestError) {
              setError(requestError instanceof ApiError && requestError.code === "QR_TOKEN_EXPIRED"
                ? "កូដ QR បានផុតកំណត់។ សូមឱ្យអតិថិជនបង្កើតកូដថ្មី។"
                : "កូដ QR នេះមិនត្រឹមត្រូវទេ។ សូមស្កេនម្តងទៀត។");
              setCameraState("error");
            }
          },
          () => undefined,
        );
        if (!cancelled) setCameraState("active");
      } catch {
        if (!cancelled) {
          setCameraState("error");
          setError("មិនអាចបើកកាមេរ៉ាបានទេ។ សូមអនុញ្ញាត Camera permission ឬប្រើ token។");
        }
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner?.isScanning) void scanner.stop().then(() => scanner.clear()).catch(() => undefined);
    };
  }, [cameraKey, confirmation, isAuthenticated, preview]);

  useEffect(() => {
    if (!rewardReady || prefersReducedMotion) return;

    const options = {
      colors: ["#f59e0b", "#0ea5e9", "#10b981", "#6366f1"],
      disableForReducedMotion: true,
      origin: { y: 0.62 },
      spread: 75,
      startVelocity: 36,
    };

    void confetti({ ...options, particleCount: 70 });
    const secondBurst = window.setTimeout(() => {
      void confetti({ ...options, particleCount: 35, scalar: 0.8 });
    }, 180);

    return () => window.clearTimeout(secondBurst);
  }, [prefersReducedMotion, rewardReady]);

  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualToken.trim()) return;
    setError("");
    try {
      if (scannerRef.current?.isScanning) await scannerRef.current.stop();
      setCameraState("stopped");
      setPreview(await previewStampToken(readToken(manualToken)));
    } catch {
      setError("Token នេះមិនត្រឹមត្រូវ ឬបានផុតកំណត់។");
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setIsConfirming(true);
    setError("");
    try {
      setConfirmation(await confirmStamp(preview.scan_id));
      setPreview(null);
    } catch (requestError) {
      setError(requestError instanceof ApiError && requestError.code === "QR_TOKEN_ALREADY_USED"
        ? "កូដ QR នេះត្រូវបានប្រើរួចហើយ។"
        : "មិនអាចបន្ថែមត្រាបានទេ។ សូមព្យាយាមម្តងទៀត។");
    } finally {
      setIsConfirming(false);
    }
  }

  function scanAgain() {
    setPreview(null);
    setConfirmation(null);
    setManualToken("");
    setError("");
    setCameraState("starting");
    setCameraKey((key) => key + 1);
  }

  function retryCamera() {
    setError("");
    setCameraState("starting");
    setCameraKey((key) => key + 1);
  }

  const result = confirmation ?? preview;
  const card = result?.card;
  const customer = result?.customer;

  return (
    <main className="min-h-screen bg-[#f4f7f9] px-4 py-5 text-slate-950 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-lg">
        <header className="mb-5 flex items-center justify-between">
          <Link aria-label="ត្រឡប់ទៅផ្ទាំងគ្រប់គ្រង" className="flex size-11 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-900/7 outline-none transition-[background-color,color,transform] duration-150 hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-4 focus-visible:ring-emerald-600/15 active:scale-[0.96]" href="/staff/dashboard"><ArrowLeft className="size-5" /></Link>
          <div className="text-center"><p className="font-semibold">ស្កេន QR</p><p className="text-xs text-slate-500">បន្ថែមត្រាអតិថិជន</p></div>
          <span className="flex size-11 items-center justify-center rounded-xl bg-sky-700 text-white shadow-sm"><Gift className="size-5" /></span>
        </header>

        <section className="overflow-hidden rounded-xl bg-white shadow-[0_24px_70px_-34px_oklch(0.25_0.06_165/0.35)] ring-1 ring-slate-900/6">
          {error && <div aria-live="polite" className="mx-5 mt-5 flex gap-2.5 rounded-xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700 ring-1 ring-inset ring-red-700/10" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</div>}
          {!result && <>
            <div className="px-6 pt-6 text-center"><h1 className="text-xl font-semibold tracking-tight">ដាក់ QR ក្នុងស៊ុម</h1><p className="mt-1.5 text-sm leading-6 text-slate-500">កាមេរ៉ានឹងអានកូដដោយស្វ័យប្រវត្តិ</p></div>
            <div className="relative m-5 aspect-square overflow-hidden rounded-2xl bg-slate-950 ring-1 ring-black/10">
              <div className="h-full w-full [&_video]:h-full! [&_video]:w-full! [&_video]:object-cover!" id="staff-qr-reader" />
              {cameraState !== "active" && <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-white"><span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">{cameraState === "starting" ? <LoaderCircle className="size-6 animate-spin" /> : <Camera className="size-6" />}</span><p className="mt-3 text-sm text-white/75">{cameraState === "starting" ? "កំពុងបើកកាមេរ៉ា…" : "កាមេរ៉ាមិនទាន់បើក"}</p>{cameraState === "error" && <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition-[background-color,transform] duration-150 hover:bg-slate-100 active:scale-[0.96]" onClick={retryCamera}><RefreshCw className="size-4" />ព្យាយាមម្តងទៀត</button>}</div>}
              {cameraState === "active" && <div aria-hidden="true" className="pointer-events-none absolute inset-0"><span className="absolute top-7 left-7 size-12 rounded-tl-2xl border-t-3 border-l-3 border-emerald-400" /><span className="absolute top-7 right-7 size-12 rounded-tr-2xl border-t-3 border-r-3 border-sky-400" /><span className="absolute bottom-7 left-7 size-12 rounded-bl-2xl border-b-3 border-l-3 border-emerald-400" /><span className="absolute right-7 bottom-7 size-12 rounded-br-2xl border-r-3 border-b-3 border-emerald-400" /></div>}
            </div>
            <div className="px-5 pb-5"><button className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-slate-600 transition-[background-color,color,transform] duration-150 hover:bg-slate-100 hover:text-slate-950 active:scale-[0.96]" onClick={() => setShowManual((shown) => !shown)}><Keyboard className="size-[18px]" />បញ្ចូល token ដោយដៃ</button>{showManual && <form className="mt-3 flex gap-2" onSubmit={submitManual}><input aria-label="QR token" autoComplete="off" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/12" onChange={(event) => setManualToken(event.target.value)} placeholder="QR token…" value={manualToken} /><Button className="h-11 rounded-xl bg-emerald-700 px-4 text-white hover:bg-emerald-800" type="submit">ពិនិត្យ</Button></form>}</div>
          </>}

          {customer && card && <div className="p-6 sm:p-7">
            <div aria-live="polite" className="text-center">
              <motion.div
                animate={rewardReady ? { filter: "blur(0px)", opacity: 1, rotate: 0, scale: 1 } : undefined}
                className={`relative mx-auto flex size-14 items-center justify-center rounded-2xl ${rewardReady ? "bg-amber-300 text-amber-950 shadow-[0_12px_32px_-12px_oklch(0.75_0.17_75/0.9)]" : confirmation ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}
                initial={rewardReady && !prefersReducedMotion ? { filter: "blur(4px)", opacity: 0, rotate: -8, scale: 0.25 } : false}
                transition={{ type: "spring", duration: 0.3, bounce: 0 }}
              >
                {confirmation ? rewardReady ? <Gift className="size-7" strokeWidth={2} /> : <BadgeCheck className="size-7" /> : <UserRound className="size-6" />}
              </motion.div>
              <h1 className="mt-4 text-xl font-semibold">{rewardReady ? "រង្វាន់របស់អ្នករួចរាល់!" : confirmation ? "បានបន្ថែមត្រាជោគជ័យ" : "ពិនិត្យព័ត៌មានអតិថិជន"}</h1>
              <p className="mt-1 text-sm text-slate-500">{customer.name} · {customer.phone}</p>
            </div>
            {rewardReady && <motion.div animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-2xl bg-amber-50 px-5 py-4 text-center ring-1 ring-inset ring-amber-600/15" initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }} role="status" transition={{ delay: 0.1, duration: 0.35, ease: "easeOut" }}><p className="flex items-center justify-center gap-2 font-semibold text-amber-950"><Sparkles aria-hidden="true" className="size-5 text-amber-600" />អបអរសាទរ!</p><p className="mt-1 text-sm leading-6 text-amber-900/75">អតិថិជនបានប្រមូលគ្រប់ {card.required_stamps} ត្រា ហើយអាចប្តូរយករង្វាន់បាន។</p></motion.div>}
            <div className="mt-6 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-900/5"><div className="flex items-end justify-between"><div><p className="text-sm text-slate-500">ត្រាបច្ចុប្បន្ន</p><p className="mt-1 text-3xl font-semibold tabular-nums">{card.stamp_count}<span className="text-base text-slate-400"> / {card.required_stamps}</span></p></div><span className="text-sm font-semibold text-sky-700">{stampProgress(card)}%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{ width: `${stampProgress(card)}%` }} /></div><p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Sparkles className="size-4 text-amber-500" />{rewardReady ? "អាចប្តូរយករង្វាន់បានឥឡូវនេះ" : `នៅសល់ ${Math.max(0, card.required_stamps - card.stamp_count)} ត្រាទៀត`}</p></div>
            {confirmation ? <button className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-slate-800 active:scale-[0.96]" onClick={scanAgain}><ScanLine className="size-5" />ស្កេនអតិថិជនបន្ទាប់</button> : <div className="mt-5 grid grid-cols-2 gap-3"><button className="h-12 rounded-xl border border-slate-200 font-semibold text-slate-700 transition-[background-color,transform] duration-150 hover:bg-slate-50 active:scale-[0.96]" onClick={scanAgain}>បោះបង់</button><Button className="h-12 rounded-xl bg-emerald-700 font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-emerald-800 active:scale-[0.96]" disabled={isConfirming} onClick={() => void handleConfirm()}>{isConfirming ? <LoaderCircle className="animate-spin" /> : <Check />}បន្ថែម 1 ត្រា</Button></div>}
          </div>}
        </section>

        {error && <div aria-live="polite" className="mt-4 flex gap-2.5 rounded-2xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 ring-1 ring-inset ring-red-700/10" role="alert"><CircleAlert className="mt-1 size-4 shrink-0" />{error}</div>}
        <p className="mt-5 text-center text-xs leading-5 text-slate-400">កាមេរ៉ាដំណើរការតែលើ HTTPS ឬ localhost និងត្រូវការការអនុញ្ញាតពីអ្នក។</p>
      </div>
    </main>
  );
}
