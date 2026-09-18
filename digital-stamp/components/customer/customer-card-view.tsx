"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import {
  CircleAlert,
  Coffee,
  Gift,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { CustomerQRPanel } from "@/components/customer/customer-qr-panel";
import { ApiError } from "@/lib/api";
import {
  getCurrentCustomer,
  getCustomerCard,
  logoutCustomer,
} from "@/services/customer-service";
import type { Customer, StampCard } from "@/types/domain";

type CardData = {
  customer: Customer;
  card: StampCard;
};

async function fetchCardData(): Promise<CardData> {
  const [customerResult, cardResult] = await Promise.all([
    getCurrentCustomer(),
    getCustomerCard(),
  ]);

  return {
    customer: customerResult.customer,
    card: cardResult.card,
  };
}

function RewardCelebration({ onClose, requiredStamps }: { onClose: () => void; requiredStamps: number }) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);

    if (!prefersReducedMotion) {
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

      return () => {
        window.removeEventListener("keydown", handleEscape);
        window.clearTimeout(secondBurst);
      };
    }

    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, prefersReducedMotion]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      <motion.section
        aria-labelledby="reward-title"
        aria-modal="true"
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-sm rounded-[2rem] bg-white p-7 text-center shadow-[0_32px_90px_-24px_oklch(0.2_0.06_240/0.55)] ring-1 ring-black/10 sm:p-8"
        exit={{ opacity: 0, scale: 0.98, y: 4 }}
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
        role="dialog"
        transition={{ type: "spring", duration: 0.3, bounce: 0 }}
      >
        <button
          aria-label="បិទ"
          className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-xl text-zinc-500 outline-none transition-[background-color,color,transform] duration-150 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-4 focus-visible:ring-sky-600/15 active:scale-[0.96]"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="size-5" />
        </button>

        <motion.div
          animate={{ filter: "blur(0px)", opacity: 1, rotate: 0, scale: 1 }}
          className="mx-auto flex size-20 items-center justify-center rounded-3xl bg-amber-300 text-amber-950 shadow-[0_18px_38px_-16px_oklch(0.75_0.17_75/0.9)]"
          initial={prefersReducedMotion ? false : { filter: "blur(4px)", opacity: 0, rotate: -8, scale: 0.25 }}
          transition={{ type: "spring", duration: 0.3, bounce: 0, delay: 0.1 }}
        >
          <Gift aria-hidden="true" className="size-10" strokeWidth={2} />
        </motion.div>

        <p className="mt-6 text-sm font-semibold tracking-wide text-amber-700 uppercase">អបអរសាទរ!</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950" id="reward-title">
          រង្វាន់របស់អ្នករួចរាល់ហើយ
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          អ្នកបានប្រមូលគ្រប់ {requiredStamps} ត្រា។ សូមបង្ហាញអេក្រង់នេះដល់បុគ្គលិក ដើម្បីប្តូរយករង្វាន់។
        </p>

        <Button
          className="mt-7 h-12 w-full rounded-xl bg-sky-700 font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-sky-800 active:scale-[0.96] active:translate-y-0"
          onClick={onClose}
          type="button"
        >
          <Sparkles aria-hidden="true" />
          ទទួលបានរង្វាន់
        </Button>
      </motion.section>
    </motion.div>
  );
}

export function CustomerCardView() {
  const router = useRouter();
  const [data, setData] = useState<CardData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showRewardCelebration, setShowRewardCelebration] = useState(false);

  useEffect(() => {
    let isActive = true;

    fetchCardData()
      .then((cardData) => {
        if (isActive) {
          setData(cardData);
        }
      })
      .catch((requestError: unknown) => {
        if (!isActive) {
          return;
        }

        if (requestError instanceof ApiError && requestError.status === 401) {
          router.replace("/login");
          return;
        }

        setError(
          requestError instanceof ApiError
            ? "មិនអាចបង្ហាញកាតត្រារបស់អ្នកបានទេ។ សូមព្យាយាមម្តងទៀត។"
            : "មិនអាចភ្ជាប់ទៅសេវាកម្មបានទេ។",
        );
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [router]);

  async function handleRetry() {
    setIsLoading(true);
    setError("");

    try {
      setData(await fetchCardData());
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        router.replace("/login");
        return;
      }

      setError(
        requestError instanceof ApiError
          ? "មិនអាចបង្ហាញកាតត្រារបស់អ្នកបានទេ។ សូមព្យាយាមម្តងទៀត។"
          : "មិនអាចភ្ជាប់ទៅសេវាកម្មបានទេ។",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    setError("");

    try {
      await logoutCustomer();
      router.replace("/login");
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? "មិនអាចចាកចេញពីគណនីបានទេ។ សូមព្យាយាមម្តងទៀត។"
          : "មិនអាចភ្ជាប់ទៅសេវាកម្មបានទេ។ សូមព្យាយាមម្តងទៀត។",
      );
      setIsLoggingOut(false);
    }
  }

  function handleStampReceived(card: StampCard) {
    setData((current) => current ? { ...current, card } : current);
    if (card.stamp_count >= Math.max(card.required_stamps, 1)) {
      setShowRewardCelebration(true);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center" role="status">
        <div className="flex flex-col items-center gap-3 text-sky-800">
          <LoaderCircle aria-hidden="true" className="size-8 animate-spin" />
          <p className="text-sm font-medium">កំពុងបង្ហាញកាតត្រារបស់អ្នក…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-md items-center px-5 text-center">
        <div className="w-full rounded-3xl bg-white p-8 shadow-[0_24px_70px_-24px_oklch(0.32_0.08_235/0.3)] ring-1 ring-sky-950/8">
          <CircleAlert aria-hidden="true" className="mx-auto size-10 text-red-600" />
          <h1 className="mt-4 text-2xl font-semibold text-zinc-950">
            មិនអាចបង្ហាញកាតបានទេ
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            {error || "មិនអាចបង្ហាញកាតត្រារបស់អ្នកបានទេ។"}
          </p>
          <Button
            className="mt-6 h-11 w-full rounded-xl bg-sky-700 text-white transition-[background-color,transform] duration-150 hover:bg-sky-800 active:scale-[0.96] active:translate-y-0"
            onClick={() => void handleRetry()}
            type="button"
          >
            <RefreshCw aria-hidden="true" />
            ព្យាយាមម្តងទៀត
          </Button>
        </div>
      </div>
    );
  }

  const { customer, card } = data;
  const requiredStamps = Math.max(card.required_stamps, 1);
  const collectedStamps = Math.min(Math.max(card.stamp_count, 0), requiredStamps);
  const progress = Math.round((collectedStamps / requiredStamps) * 100);
  const stampsRemaining = Math.max(requiredStamps - card.stamp_count, 0);
  const rewardReady = card.stamp_count >= requiredStamps;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f3f8fc] text-zinc-950">
      <div
        aria-hidden="true"
        className="absolute -top-52 -right-40 size-[34rem] rounded-full bg-sky-200/50 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-52 -left-40 size-[34rem] rounded-full bg-amber-100/75 blur-3xl"
      />

      <div className="relative mx-auto min-h-screen w-full max-w-5xl px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between">
          <Link
            className="group flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-sky-600/15"
            href="/"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-sky-700 text-white shadow-sm transition-transform duration-150 group-hover:-rotate-3">
              <Gift aria-hidden="true" className="size-5" strokeWidth={2} />
            </span>
            <span className="text-sm font-semibold tracking-tight sm:text-base">
              កាតត្រាឌីជីថល
            </span>
          </Link>

          <Button
            className="rounded-xl text-zinc-600 transition-[background-color,color,transform] duration-150 hover:bg-white hover:text-zinc-950 active:scale-[0.96] active:translate-y-0"
            disabled={isLoggingOut}
            onClick={() => void handleLogout()}
            size="lg"
            type="button"
            variant="ghost"
          >
            {isLoggingOut ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <LogOut aria-hidden="true" />
            )}
            <span className="hidden sm:inline">ចាកចេញ</span>
          </Button>
        </header>

        <section className="mx-auto max-w-2xl py-12 sm:py-16">
          <div className="mb-7">
            <p className="text-sm font-semibold tracking-wide text-sky-700 uppercase">
              កាតអតិថិជន
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              សួស្តី {customer.name}
            </h1>
            <p className="mt-2 text-zinc-600">ដំណើរឆ្ពោះទៅរករង្វាន់របស់អ្នកបានធ្វើបច្ចុប្បន្នភាព។</p>
          </div>

          <div className="overflow-hidden rounded-[2rem] bg-sky-800 text-white shadow-[0_30px_80px_-28px_oklch(0.32_0.1_235/0.75),0_3px_10px_oklch(0_0_0/0.12)] ring-1 ring-white/10">
            <div className="relative p-6 sm:p-9">
              <div
                aria-hidden="true"
                className="absolute -top-24 -right-20 size-64 rounded-full bg-sky-400/20 blur-3xl"
              />

              <div className="relative flex items-start justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 text-sky-100">
                    <Coffee aria-hidden="true" className="size-5" strokeWidth={1.8} />
                    <span className="text-sm font-semibold tracking-wide uppercase">
                      រង្វាន់កាហ្វេ
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight">
                    {customer.name}
                  </p>
                  <p className="mt-1 text-sm text-sky-100/75">{customer.phone}</p>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-3 text-right ring-1 ring-white/15 backdrop-blur-sm">
                  <p className="text-3xl font-semibold tabular-nums">
                    {card.stamp_count}
                  </p>
                  <p className="text-xs font-medium text-sky-100/75">ត្រា</p>
                </div>
              </div>

              <div className="relative mt-9 grid grid-cols-5 gap-3 sm:gap-4">
                {Array.from({ length: requiredStamps }, (_, index) => {
                  const isCollected = index < collectedStamps;

                  return (
                    <div
                      aria-label={`ត្រាទី ${index + 1}: ${isCollected ? "បានប្រមូល" : "មិនទាន់មាន"}`}
                      className={`relative flex aspect-square items-center justify-center rounded-full ring-1 transition-[background-color,color,box-shadow,transform] duration-150 ${
                        isCollected
                          ? "bg-amber-300 text-sky-950 shadow-[inset_0_1px_0_oklch(1_0_0/0.5),0_8px_20px_-12px_oklch(0.8_0.15_80/0.9)] ring-amber-100/70"
                          : "bg-white/8 text-white/35 ring-white/18"
                      }`}
                      key={index}
                    >
                      <Coffee
                        aria-hidden="true"
                        className="size-7 sm:size-9"
                        strokeWidth={isCollected ? 2 : 1.5}
                      />
                      <span
                        aria-hidden="true"
                        className={`absolute right-[13%] bottom-[10%] flex size-5 items-center justify-center rounded-full text-[0.65rem] font-semibold tabular-nums sm:size-6 sm:text-xs ${
                          isCollected
                            ? "bg-sky-950/12 text-sky-950/70"
                            : "bg-white/8 text-white/45"
                        }`}
                      >
                        {index + 1}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="relative mt-8">
                <div className="flex items-center justify-between text-xs font-medium text-sky-100/80">
                  <span>បានបំពេញ {progress}%</span>
                  <span>{requiredStamps} ត្រា ដើម្បីទទួលរង្វាន់</span>
                </div>
                <div
                  aria-label={`បានបំពេញ ${progress}% ឆ្ពោះទៅរករង្វាន់បន្ទាប់`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={progress}
                  className="mt-2 h-2 overflow-hidden rounded-full bg-black/20 ring-1 ring-white/10"
                  role="progressbar"
                >
                  <div
                    className="h-full rounded-full bg-amber-300 transition-[width] duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-white/10 bg-black/10 px-6 py-5 sm:px-9">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-200 ring-1 ring-white/10">
                <Sparkles aria-hidden="true" className="size-5" />
              </span>
              <div>
                <p className="font-semibold">
                  {rewardReady
                    ? "រង្វាន់របស់អ្នករួចរាល់ហើយ"
                    : `នៅសល់ ${stampsRemaining} ត្រាទៀត ដើម្បីទទួលរង្វាន់`}
                </p>
                <p className="mt-0.5 text-sm text-sky-100/70">
                  {rewardReady
                    ? "សូមប្រាប់បុគ្គលិកដើម្បីប្តូរយករង្វាន់នៅពេលអ្នកមកលើកក្រោយ។"
                    : "បង្ហាញកាតនេះពេលមកហាង ដើម្បីបន្តប្រមូលត្រា។"}
                </p>
              </div>
            </div>
          </div>

          <CustomerQRPanel
            customerName={customer.name}
            onStampReceived={handleStampReceived}
            stampCount={card.stamp_count}
          />

          {error && (
            <div
              aria-live="polite"
              className="mt-5 flex gap-2.5 rounded-xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700 ring-1 ring-inset ring-red-600/10"
              role="alert"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}
        </section>
      </div>
      <AnimatePresence initial={false}>
        {showRewardCelebration && (
          <RewardCelebration
            onClose={() => setShowRewardCelebration(false)}
            requiredStamps={requiredStamps}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
