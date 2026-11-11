"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { appendDictation, joinSegments } from "@/lib/journal";

// Minimal Web Speech API types (not in every TS lib.dom).
type RecResult = { 0: { transcript: string }; isFinal: boolean };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<RecResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const subscribe = () => () => {};

/**
 * Dictate into a textarea with the browser's speech recognition. Text appears
 * live and is appended after what's already written. Typing stops dictation.
 * Where the browser has no speech recognition, shows the keyboard-mic tip instead.
 */
export function DictationButton({ target, onText }: { target: RefObject<HTMLTextAreaElement | null>; onText?: (value: string) => void }) {
  const supported = useSyncExternalStore(subscribe, () => recognitionCtor() != null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const want = useRef(false);
  const quickEnds = useRef(0);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  // Stop when the person types, and when the form goes away.
  useEffect(() => {
    const el = target.current;
    const stopOnType = () => {
      if (want.current) {
        want.current = false;
        rec.current?.stop();
      }
    };
    el?.addEventListener("input", stopOnType);
    return () => {
      el?.removeEventListener("input", stopOnType);
      want.current = false;
      rec.current?.abort();
    };
  }, [target]);

  function begin() {
    const Ctor = recognitionCtor();
    const el = target.current;
    if (!Ctor || !el) throw new Error("unavailable");
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    const base = el.value;
    const startedAt = Date.now();
    r.onresult = (e) => {
      const segments: string[] = [];
      for (let i = 0; i < e.results.length; i++) segments.push(e.results[i][0].transcript);
      el.value = appendDictation(base, joinSegments(segments));
      el.scrollTop = el.scrollHeight;
      onTextRef.current?.(el.value);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // onend restarts or finishes
      want.current = false;
      setError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Dictation isn't allowed. Check microphone access in Settings, or tap the mic on your keyboard."
          : "Dictation stopped. Tap Dictate to try again, or use the mic on your keyboard.",
      );
    };
    r.onend = () => {
      if (rec.current !== r) return;
      // Safari ends after a pause; keep going until the person taps Stop.
      quickEnds.current = Date.now() - startedAt < 1500 ? quickEnds.current + 1 : 0;
      if (want.current && quickEnds.current < 3) {
        try {
          begin();
          return;
        } catch {
          /* fall through */
        }
      }
      want.current = false;
      rec.current = null;
      setListening(false);
    };
    rec.current = r;
    r.start();
  }

  function toggle() {
    if (listening) {
      want.current = false;
      rec.current?.stop();
      return;
    }
    setError(null);
    want.current = true;
    quickEnds.current = 0;
    try {
      begin();
      setListening(true);
    } catch {
      want.current = false;
      setError("Couldn't start dictation. Tap the mic on your keyboard instead.");
    }
  }

  if (!supported) return <p className="text-xs text-muted">Tip: tap the mic on your keyboard to dictate.</p>;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 font-medium transition-transform active:scale-[0.98] ${
          listening ? "border-danger/70 text-danger" : "border-border text-foreground"
        }`}
      >
        {listening ? (
          <>
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
            </span>
            Listening… tap to stop
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3" />
            </svg>
            Dictate
          </>
        )}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
