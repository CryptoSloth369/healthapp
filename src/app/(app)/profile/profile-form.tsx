"use client";

import { useActionState } from "react";
import { saveProfile, type ProfileFormState } from "./actions";
import { ACTIVITY_LEVELS } from "@/lib/tdee";
import { toDay } from "@/lib/dates";
import type { Profile } from "@/lib/types";
import { button, card, input, label } from "@/components/ui";

export function ProfileForm({ profile, currentWeight }: { profile: Profile; currentWeight: number | null }) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(saveProfile, {});
  const h = profile.height_in == null ? null : Number(profile.height_in);

  return (
    <form
      action={(fd) => {
        fd.set("today", toDay(new Date())); // the phone's local date
        return action(fd);
      }}
      className={`${card} space-y-4`}
    >
      <Field label="Name (optional)">
        <input className={input} name="display_name" defaultValue={profile.display_name ?? ""} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Sex (for BMR)">
          <select className={input} name="sex" defaultValue={profile.sex ?? ""} required>
            <option value="" disabled>Choose…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </Field>
        <Field label="Birth date">
          <input className={input} type="date" name="birth_date" defaultValue={profile.birth_date ?? ""} required />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Height ft">
          <input className={input} name="height_ft" inputMode="numeric" defaultValue={h == null ? "" : Math.floor(h / 12)} required />
        </Field>
        <Field label="in">
          <input className={input} name="height_in" inputMode="decimal" defaultValue={h == null ? "" : +(h % 12).toFixed(1)} />
        </Field>
        <Field label="Weight lb">
          <input className={input} name="weight_lb" inputMode="decimal" defaultValue={currentWeight ?? ""} required={currentWeight == null} />
        </Field>
      </div>

      <Field label="Activity level (outside of logged exercise)">
        <select className={input} name="activity_level" defaultValue={profile.activity_level}>
          {Object.entries(ACTIVITY_LEVELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </Field>

      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="text-sm font-semibold">Goal</legend>
        <p className="text-xs text-muted">
          Leave goal weight empty to maintain. Without a date, a moderate pace is used.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Goal weight lb">
            <input className={input} name="goal_weight_lb" inputMode="decimal" defaultValue={profile.goal_weight_lb ?? ""} />
          </Field>
          <Field label="By date">
            <input className={input} type="date" name="goal_date" defaultValue={profile.goal_date ?? ""} />
          </Field>
        </div>
        <Field label="Manual calorie override (optional)">
          <input className={input} name="kcal_target_override" inputMode="numeric" defaultValue={profile.kcal_target_override ?? ""} />
        </Field>
      </fieldset>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.saved && !pending && <p className="text-sm text-accent">Saved.</p>}
      <button className={`${button} w-full`} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={label}>{text}</span>
      {children}
    </label>
  );
}
