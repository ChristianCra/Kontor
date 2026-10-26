import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PartForm } from "@/components/PartForm";
import { savePart } from "@/app/actions/parts";

export default async function EditPart({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [part, units] = await Promise.all([
    db.part.findUnique({ where: { id }, include: { unit: true } }),
    db.unit.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!part) notFound();
  return (
    <div className="space-y-4">
      <h1 className="h1">{part.name}</h1>
      <PartForm action={savePart.bind(null, id)} part={part} units={units} />
    </div>
  );
}
