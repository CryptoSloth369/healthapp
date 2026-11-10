"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeBarcode } from "@/lib/food-db";
import { input } from "./ui";

/**
 * Full-screen barcode scanner. Uses the camera (ZXing, works on iPhone Safari
 * and the home-screen app); falls back to a photo or typing the number.
 */
export function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const done = useRef(false);

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled) return; // closed (or remounted) while loading the decoder
        const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]]]);
        const reader = new BrowserMultiFormatReader(hints);
        const video = videoRef.current!;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        const c = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } },
          video,
          (result) => {
            const code = result ? normalizeBarcode(result.getText()) : null;
            if (code && !done.current) {
              done.current = true;
              navigator.vibrate?.(50);
              onCode(code);
            }
          },
        );
        if (cancelled) c.stop();
        else controls = c;
      } catch (e) {
        const name = (e as Error).name;
        setError(
          name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in Settings → Safari (or the app) → Camera, or use a photo / type the number."
            : "The camera isn't available. Use a photo or type the number below.",
        );
      }
    })();
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onCode]);

  async function fromPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      const code = normalizeBarcode(result.getText());
      if (code) onCode(code);
      else setError("No product barcode found in that photo.");
    } catch {
      setError("No barcode found in that photo. Try a closer, sharper shot.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label="Scan barcode">
      <div className="flex items-center justify-between px-4 pb-2" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <p className="font-semibold">Scan a barcode</p>
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm">
          Close
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-32 w-4/5 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
        {error && <p className="absolute inset-x-4 top-4 rounded-lg bg-black/80 p-3 text-sm">{error}</p>}
      </div>
      <div className="space-y-2 bg-black p-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <p className="text-center text-xs text-white/70">Line the barcode up inside the box.</p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={fromPhoto} />
        <div className="flex gap-2">
          <input
            className={`${input} border-white/20 bg-white/10 text-white`}
            inputMode="numeric"
            placeholder="Or type the number"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label="Barcode number"
          />
          <button
            type="button"
            className="shrink-0 rounded-xl bg-white px-3 text-sm font-semibold text-black disabled:opacity-40"
            disabled={!normalizeBarcode(typed)}
            onClick={() => onCode(normalizeBarcode(typed)!)}
          >
            Look up
          </button>
        </div>
        <button type="button" className="w-full rounded-xl border border-white/30 py-2 text-sm" onClick={() => fileRef.current?.click()}>
          Use a photo instead
        </button>
      </div>
    </div>
  );
}
