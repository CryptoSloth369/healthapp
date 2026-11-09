import Link from "next/link";
import { notFound } from "next/navigation";
import { getEntry } from "@/lib/food";
import { formatDay } from "@/lib/dates";
import { perServing } from "@/lib/nutrition";
import { card } from "@/components/ui";
import { DeleteEntryButton } from "./delete-button";
import { EntryForm } from "../../entry-form";
import { deleteFoodEntry } from "../../actions";

export default async function EditFoodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = await getEntry(Number(id));
  if (!entry) notFound();
  const per = perServing(entry, entry.servings);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Edit food</h1>
          <p className="text-sm text-muted">{formatDay(entry.eaten_on)}</p>
        </div>
        <Link href={`/food?day=${entry.eaten_on}`} className="text-sm text-muted">
          Cancel
        </Link>
      </header>
      <section className={card}>
        <EntryForm
          id={entry.id}
          day={entry.eaten_on}
          meal={entry.meal}
          submitLabel="Save changes"
          draft={{
            name: entry.name,
            serving: entry.serving,
            servings: entry.servings,
            ...per,
            note: entry.note,
            savedFoodId: entry.saved_food_id,
          }}
        />
      </section>
      <DeleteEntryButton action={deleteFoodEntry.bind(null, entry.id, entry.eaten_on)} />
    </div>
  );
}
