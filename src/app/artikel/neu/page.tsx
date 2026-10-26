import { db } from "@/lib/db";
import { PartForm } from "@/components/PartForm";
import { savePart } from "@/app/actions/parts";

export const dynamic = "force-dynamic";

export default async function NewPart() {
  const units = await db.unit.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="space-y-4">
      <h1 className="h1">Neuer Artikel</h1>
      <PartForm action={savePart.bind(null, null)} units={units} />
    </div>
  );
}
