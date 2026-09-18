"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  LoaderCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Timer,
  X,
} from "lucide-react";
import QRCode from "react-qr-code";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  cancelCustomerQR,
  generateCustomerQR,
  getCustomerCard,
} from "@/services/customer-service";
import type { GeneratedCustomerQR } from "@/types/customer";
import type { StampCard } from "@/types/domain";

const QR_LIFETIME_SECONDS = 60;

type CustomerQRPanelProps = {
  customerName: string;
  onStampReceived: (card: StampCard) => void;
  stampCount: number;
};

function secondsUntil(expiresAt: string) {
  return Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000),
  );
}

export function CustomerQRPanel({ customerName, onStampReceived, stampCount }: CustomerQRPanelProps) {
  const router = useRouter();
  const [qr, setQR] = useState<GeneratedCustomerQR | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!qr) {
      return;
    }

    const updateCountdown = () => {
      setSecondsRemaining(secondsUntil(qr.expires_at));
    };

    updateCountdown();
    const timerID = window.setInterval(updateCountdown, 250);

    return () => window.clearInterval(timerID);
  }, [qr]);

  useEffect(() => {
    if (!qr) return;

    let active = true;
    let checking = false;

    const checkForStamp = async () => {
      if (checking || secondsUntil(qr.expires_at) === 0) return;
      checking = true;

      try {
        const result = await getCustomerCard();
        if (!active || result.card.stamp_count <= stampCount) return;

        setQR(null);
        setSecondsRemaining(0);
        onStampReceived(result.card);
      } catch (requestError) {
        if (active && requestError instanceof ApiError && requestError.status === 401) {
          router.replace("/login");
        }
      } finally {
        checking = false;
      }
    };

    void checkForStamp();
    const pollID = window.setInterval(() => void checkForStamp(), 1200);

    return () => {
      active = false;
      window.clearInterval(pollID);
    };
  }, [onStampReceived, qr, router, stampCount]);

  const isExpired = qr !== null && secondsRemaining === 0;
  const progress = useMemo(
    () =>
      Math.min(
        100,
        Math.max(0, (secondsRemaining / QR_LIFETIME_SECONDS) * 100),
      ),
    [secondsRemaining],
  );

  function handleRequestError(requestError: unknown, fallback: string) {
    if (requestError instanceof ApiError && requestError.status === 401) {
      router.replace("/login");
      return;
    }

    setError(fallback);
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError("");

    try {
      const generatedQR = await generateCustomerQR();
      setQR(generatedQR);
      setSecondsRemaining(secondsUntil(generatedQR.expires_at));
    } catch (requestError) {
      handleRequestError(
        requestError,
        "មិនអាចបង្កើត QR បានទេ។ សូមព្យាយាមម្តងទៀត។",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCancel() {
    if (!qr) {
      return;
    }

    setIsCancelling(true);
    setError("");

    try {
      await cancelCustomerQR(qr.id);
      setQR(null);
      setSecondsRemaining(0);
    } catch (requestError) {
      handleRequestError(
        requestError,
        "មិនអាចបិទ QR បានទេ។ សូមព្យាយាមម្តងទៀត។",
      );
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <section className="mt-6 overflow-hidden rounded-[2rem] bg-white shadow-[0_24px_70px_-30px_oklch(0.32_0.08_235/0.28)] ring-1 ring-sky-950/8">
      <div className="flex items-start gap-4 border-b border-zinc-100 px-6 py-5 sm:px-8 sm:py-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-600/10">
          <QrCode aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold tracking-tight text-zinc-950 sm:text-lg">
            QR ផ្ទាល់ខ្លួនរបស់អ្នក
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            បង្កើត QR ហើយបង្ហាញឱ្យបុគ្គលិកស្កេន ដើម្បីបន្ថែមត្រា។
          </p>
        </div>
      </div>

      {!qr ? (
        <div className="px-6 py-7 sm:px-8 sm:py-8">
          <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/55 px-6 py-8 text-center">
            <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-white text-sky-700 shadow-sm ring-1 ring-emerald-sky/10">
              <QrCode aria-hidden="true" className="size-8" strokeWidth={1.7} />
            </span>
            <h3 className="mt-4 font-semibold text-zinc-950">
              ត្រៀមទទួលត្រារបស់អ្នក?
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-600">
              សូមបង្កើត QR នៅពេលបុគ្គលិកត្រៀមស្កេន។ QR មានសុពលភាព 60 វិនាទី។
            </p>
          </div>

          <Button
            className="mt-5 h-12 w-full rounded-xl bg-sky-700 text-white shadow-[0_10px_24px_-12px_oklch(0.5_0.15_160/0.8)] duration-150 hover:bg-sky-800 active:scale-[0.98] active:translate-y-0"
            disabled={isGenerating}
            onClick={() => void handleGenerate()}
            type="button"
          >
            {isGenerating ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <QrCode aria-hidden="true" />
            )}
            {isGenerating ? "កំពុងបង្កើត…" : "បង្កើត QR របស់ខ្ញុំ"}
          </Button>
        </div>
      ) : (
        <div className="px-6 py-7 sm:px-8 sm:py-8">
          <div className="flex items-center justify-between gap-3">
            <div
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${
                isExpired
                  ? "bg-red-50 text-red-700 ring-red-600/15"
                  : "bg-sky-50 text-sky-700 ring-sky-600/15"
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${isExpired ? "bg-red-500" : "animate-pulse bg-sky-500"}`}
              />
              {isExpired ? "បានផុតកំណត់" : "កំពុងដំណើរការ"}
            </div>
            <div
              aria-live="polite"
              className={`flex items-center gap-1.5 text-sm font-semibold tabular-nums ${
                secondsRemaining <= 15 ? "text-amber-700" : "text-zinc-700"
              }`}
            >
              <Timer aria-hidden="true" className="size-4" />
              00:{String(secondsRemaining).padStart(2, "0")}
            </div>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div
              className={`h-full rounded-full transition-[width,background-color] duration-300 ${
                secondsRemaining <= 15 ? "bg-amber-500" : "bg-sky-600"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="relative mx-auto mt-6 max-w-[19rem]">
            <div
              className={`rounded-[1.75rem] bg-white p-5 shadow-[0_16px_45px_-22px_oklch(0.25_0.05_160/0.45)] ring-1 ring-zinc-950/8 transition-opacity ${
                isExpired ? "opacity-20" : "opacity-100"
              }`}
            >
              <QRCode
                aria-label="QR សម្រាប់បុគ្គលិកស្កេន"
                bgColor="#ffffff"
                fgColor="#1f5b8f"
                level="M"
                size={256}
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                value={qr.token}
                viewBox="0 0 256 256"
              />
            </div>

            {isExpired && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-2xl bg-white px-5 py-4 text-center shadow-xl ring-1 ring-red-600/10">
                  <CircleAlert
                    aria-hidden="true"
                    className="mx-auto size-6 text-red-600"
                  />
                  <p className="mt-2 text-sm font-semibold text-zinc-950">
                    QR បានផុតកំណត់
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 text-center">
            <p className="font-semibold text-zinc-950">{customerName}</p>
            <p className="mt-1 text-xs text-zinc-500">
              សូមឱ្យបុគ្គលិកស្កេន QR នេះម្តងប៉ុណ្ណោះ
            </p>
          </div>

          <div className="mt-6 flex gap-3">
            <Button
              className="h-11 flex-1 rounded-xl bg-sky-700 text-white transition-[background-color,transform] duration-150 hover:bg-emerald-800 active:scale-[0.97] active:translate-y-0"
              disabled={isGenerating || isCancelling}
              onClick={() => void handleGenerate()}
              type="button"
            >
              {isGenerating ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <RefreshCw aria-hidden="true" />
              )}
              {isExpired ? "បង្កើតថ្មី" : "ប្តូរ QR ថ្មី"}
            </Button>
            {!isExpired && (
              <Button
                className="h-11 rounded-xl px-4 text-zinc-600 transition-[background-color,color,transform] duration-150 hover:bg-red-50 hover:text-red-700 active:scale-[0.96] active:translate-y-0"
                disabled={isGenerating || isCancelling}
                onClick={() => void handleCancel()}
                type="button"
                variant="outline"
              >
                {isCancelling ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <X aria-hidden="true" />
                )}
                បិទ
              </Button>
            )}
          </div>

          <div className="mt-5 flex gap-2.5 rounded-xl bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-800 ring-1 ring-inset ring-sky-700/10">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            កុំផ្ញើរូបថតអេក្រង់ QR នេះទៅអ្នកផ្សេង។ QR នឹងប្រើមិនបានបន្ទាប់ពីស្កេនម្តង។
          </div>
        </div>
      )}

      {error && (
        <div
          aria-live="polite"
          className="mx-6 mb-6 flex gap-2.5 rounded-xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700 ring-1 ring-inset ring-red-600/10 sm:mx-8"
          role="alert"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}
    </section>
  );
}
