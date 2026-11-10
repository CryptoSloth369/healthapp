"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { removeSubscription, saveReminderPrefs, saveSubscription, sendTestPush } from "./reminder-actions";
import type { ReminderPrefs } from "@/lib/reminders";
import { button, buttonGhost, card, input } from "@/components/ui";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function bytesToB64url(b: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Support = "checking" | "ok" | "needs-install" | "unsupported";

function detectSupport(): Support {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return ios && !standalone ? "needs-install" : "unsupported";
  return "ok";
}
const noopSubscribe = () => () => {};

export function RemindersCard({ prefs, devices }: { prefs: ReminderPrefs | null; devices: number }) {
  // Browser capabilities don't change while the page is open; "checking" during server render.
  const support = useSyncExternalStore<Support>(noopSubscribe, detectSupport, () => "checking");
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [times, setTimes] = useState({
    weigh_in_at: prefs ? (prefs.weigh_in_at?.slice(0, 5) ?? "") : "07:30",
    food_at: prefs ? (prefs.food_at?.slice(0, 5) ?? "") : "20:00",
    mood_at: prefs ? (prefs.mood_at?.slice(0, 5) ?? "") : "21:00",
  });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (support !== "ok") return;
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      setPermission(Notification.permission);
      setSub((await reg?.pushManager.getSubscription()) ?? null);
    });
  }, [support]);

  function enable() {
    setMsg(null);
    start(async () => {
      try {
        const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
        await navigator.serviceWorker.ready;
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== "granted") return setMsg({ text: "Notifications are blocked. Allow them in iPhone Settings → Notifications → Health.", error: true });
        const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(VAPID_PUBLIC) });
        const r = await saveSubscription(JSON.parse(JSON.stringify(s)), navigator.userAgent);
        if (r.error) return setMsg({ text: r.error, error: true });
        setSub(s);
        const p = await save();
        setMsg(p.error ? { text: p.error, error: true } : { text: "Notifications are on for this device." });
      } catch (e) {
        setMsg({ text: `Couldn't turn on notifications: ${(e as Error).message}`, error: true });
      }
    });
  }

  function save() {
    return saveReminderPrefs({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      weigh_in_at: times.weigh_in_at || null,
      food_at: times.food_at || null,
      mood_at: times.mood_at || null,
    });
  }

  if (!VAPID_PUBLIC) return <PushKeySetup />;

  return (
    <section className={`${card} space-y-3`}>
      <div>
        <h2 className="font-semibold">Reminders</h2>
        <p className="text-xs text-muted">Each one only fires if you haven&apos;t logged that thing yet today. Clear a time to turn it off.</p>
      </div>

      {(
        [
          ["weigh_in_at", "Weigh-in", "if no weight logged"],
          ["food_at", "Log dinner", "if no dinner logged"],
          ["mood_at", "Mood check-in", "if no check-in today"],
        ] as const
      ).map(([key, name, hint]) => (
        <label key={key} className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm">{name}</span>
            <span className="block text-xs text-muted">{hint}</span>
          </span>
          <input
            type="time"
            className={`${input} w-32 py-1.5`}
            value={times[key]}
            onChange={(e) => setTimes((t) => ({ ...t, [key]: e.target.value }))}
          />
        </label>
      ))}

      {support === "needs-install" && (
        <p className="rounded-lg bg-background px-3 py-2 text-sm">
          On iPhone, notifications only work from the installed app: in Safari tap <strong>Share → Add to Home Screen</strong>, then open Health from the home screen and come back here.
        </p>
      )}
      {support === "unsupported" && <p className="text-sm text-muted">This browser doesn&apos;t support notifications.</p>}

      {support === "ok" &&
        (sub && permission === "granted" ? (
          <div className="space-y-2">
            <button
              type="button"
              className={`${button} w-full`}
              disabled={pending}
              onClick={() => start(async () => { const r = await save(); setMsg(r.error ? { text: r.error, error: true } : { text: "Reminder times saved." }); })}
            >
              Save times
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className={`${buttonGhost} flex-1 text-sm`}
                disabled={pending}
                onClick={() => start(async () => { const r = await sendTestPush(); setMsg(r.error ? { text: r.error, error: true } : { text: `Test sent to ${r.sent} device${r.sent === 1 ? "" : "s"}.` }); })}
              >
                Send a test
              </button>
              <button
                type="button"
                className={`${buttonGhost} flex-1 text-sm`}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const endpoint = sub.endpoint;
                    await sub.unsubscribe();
                    await removeSubscription(endpoint);
                    setSub(null);
                    setMsg({ text: "Notifications turned off on this device." });
                  })
                }
              >
                Turn off here
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={`${button} w-full`} disabled={pending} onClick={enable}>
            {pending ? "Turning on…" : "Turn on notifications"}
          </button>
        ))}

      {devices > 0 && <p className="text-xs text-muted">{devices} device{devices === 1 ? "" : "s"} set up.</p>}
      {msg && <p className={`text-sm ${msg.error ? "text-danger" : "text-accent"}`}>{msg.text}</p>}
    </section>
  );
}

/** One-time setup helper: generates push keys and a cron secret in the browser. */
function PushKeySetup() {
  const [keys, setKeys] = useState<{ pub: string; priv: string; secret: string } | null>(null);
  async function generate() {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair;
    const pub = bytesToB64url(await crypto.subtle.exportKey("raw", pair.publicKey));
    const priv = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d!;
    const secret = bytesToB64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
    setKeys({ pub, priv, secret });
  }
  return (
    <section className={`${card} space-y-3`}>
      <h2 className="font-semibold">Reminders: one-time setup</h2>
      <p className="text-sm text-muted">
        Push notifications need three values in Vercel. Generate them here (they never leave this screen), add them in Vercel → Settings → Environment Variables, then redeploy.
      </p>
      {!keys ? (
        <button type="button" className={`${button} w-full`} onClick={generate}>
          Generate keys
        </button>
      ) : (
        <div className="space-y-2">
          <KeyRow name="NEXT_PUBLIC_VAPID_PUBLIC_KEY" kind="Config" value={keys.pub} />
          <KeyRow name="VAPID_PRIVATE_KEY" kind="Secret" value={keys.priv} />
          <KeyRow name="CRON_SECRET" kind="Secret" value={keys.secret} />
          <p className="text-xs text-muted">Copy all three before leaving this page; they aren&apos;t stored anywhere.</p>
        </div>
      )}
    </section>
  );
}

function KeyRow({ name, kind, value }: { name: string; kind: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg bg-background p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs">{name}</span>
        <span className="text-[11px] text-muted">{kind}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-xs text-muted">{value}</code>
        <button
          type="button"
          className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs"
          onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true))}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
