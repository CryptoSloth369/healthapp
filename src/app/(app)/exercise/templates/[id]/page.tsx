import Link from "next/link";
import { notFound } from "next/navigation";
import { getExerciseNames, getTemplate } from "@/lib/exercise-data";
import { TemplateForm } from "./template-form";

export default async function TemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const [template, names] = await Promise.all([isNew ? Promise.resolve(null) : getTemplate(Number(id)), getExerciseNames()]);
  if (!isNew && !template) notFound();

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isNew ? "New template" : "Edit template"}</h1>
        <Link href="/exercise/templates" className="text-sm text-muted">
          Cancel
        </Link>
      </header>
      <TemplateForm template={template} exerciseNames={names} />
    </div>
  );
}
