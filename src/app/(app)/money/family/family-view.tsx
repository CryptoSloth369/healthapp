import { formatDay } from "@/lib/dates";
import type { Family } from "@/lib/family-data";
import { card } from "@/components/ui";
import { InviteCreator, LeaveFamily, RemoveMember, RenameFamily, RevokeInvite } from "./family-controls";

/** Family page, rendered from loaded data (also used for previews). */
export function FamilyView({ family, welcome, joined }: { family: Family; welcome?: string; joined?: string }) {
  const others = family.members.length > 1;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Family</h1>
      {(welcome || joined) && (
        <p className="rounded-xl border border-accent/50 px-3 py-2 text-sm">
          {welcome ? "Welcome! " : ""}You&apos;re in <span className="font-semibold">{family.name}</span>. Shared accounts from everyone
          show up under Money.
        </p>
      )}

      <section className={`${card} space-y-3`}>
        <h2 className="font-semibold">Name</h2>
        <RenameFamily name={family.name} />
      </section>

      <section className={`${card} space-y-2`}>
        <h2 className="font-semibold">People</h2>
        <ul className="divide-y divide-border">
          {family.members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between py-2">
              <span>
                {m.display_name ?? "Unnamed"}
                {m.is_me && <span className="text-muted"> (you)</span>}
                <span className="block text-xs text-muted">
                  {m.role === "owner" ? "Owner" : "Member"} · joined {formatDay(m.joined_at.slice(0, 10), { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </span>
              {family.iAmOwner && !m.is_me && <RemoveMember id={m.user_id} name={m.display_name ?? "this person"} />}
            </li>
          ))}
        </ul>
        {others && (
          <div className="flex justify-end border-t border-border pt-2">
            <LeaveFamily />
          </div>
        )}
      </section>

      <section className={`${card} space-y-3`}>
        <div>
          <h2 className="font-semibold">Invite someone</h2>
          <p className="text-sm text-muted">
            They sign up with their own email and password and join this family. Each of you chooses which accounts to share;
            health data always stays private.
          </p>
        </div>
        <InviteCreator />
        {family.invites.length > 0 && (
          <ul className="divide-y divide-border border-t border-border text-sm">
            {family.invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2">
                <span className="text-muted">
                  Link from {formatDay(i.created_at.slice(0, 10), { month: "short", day: "numeric" })} · expires{" "}
                  {formatDay(i.expires_at.slice(0, 10), { month: "short", day: "numeric" })}
                  {i.reserved_at && " · sign-up in progress"}
                </span>
                <RevokeInvite id={i.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
