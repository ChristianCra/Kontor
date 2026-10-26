"use client";

import { useState } from "react";
import type { Contact, ContactAddress } from "@prisma/client";

type Props = {
  action: (formData: FormData) => Promise<void>;
  contact?: Contact & { addresses: ContactAddress[] };
};

export function ContactForm({ action, contact }: Props) {
  const [kind, setKind] = useState(contact && !contact.name ? "PERSON" : "ORG");
  const a = contact?.addresses.find((x) => x.kind === "BILLING");
  return (
    <form action={action} className="card max-w-3xl space-y-5">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex gap-2">
        {[["ORG", "Organisation"], ["PERSON", "Person"]].map(([k, l]) => (
          <button type="button" key={k} onClick={() => setKind(k)} className={kind === k ? "btn-primary" : "btn"}>{l}</button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {kind === "ORG" ? (
          <div className="sm:col-span-2"><label className="label">Firmenname *</label><input className="input" name="name" required defaultValue={contact?.name ?? ""} /></div>
        ) : (
          <>
            <div><label className="label">Vorname</label><input className="input" name="firstName" defaultValue={contact?.firstName ?? ""} /></div>
            <div><label className="label">Nachname *</label><input className="input" name="lastName" required defaultValue={contact?.lastName ?? ""} /></div>
          </>
        )}
        {kind === "ORG" ? <><input type="hidden" name="firstName" value="" /><input type="hidden" name="lastName" value="" /></> : <input type="hidden" name="name" value="" />}
        <div>
          <label className="label">Kategorie</label>
          <select className="input" name="category" defaultValue={contact?.category ?? "CUSTOMER"}>
            <option value="CUSTOMER">Kunde</option><option value="SUPPLIER">Lieferant</option><option value="PARTNER">Partner</option>
          </select>
        </div>
        <div><label className="label">E-Mail</label><input className="input" type="email" name="email" defaultValue={contact?.email} /></div>
        <div><label className="label">Telefon</label><input className="input" name="phone" defaultValue={contact?.phone} /></div>
        <div><label className="label">Zahlungsziel (Tage)</label><input className="input" type="number" min={0} name="defaultTimeToPay" defaultValue={contact?.defaultTimeToPay ?? ""} /></div>
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-4">
        <legend className="mb-2 text-sm font-medium">Rechnungsadresse</legend>
        <div className="sm:col-span-4"><label className="label">Straße und Hausnummer</label><input className="input" name="street" defaultValue={a?.street} /></div>
        <div><label className="label">PLZ</label><input className="input" name="zip" defaultValue={a?.zip} /></div>
        <div className="sm:col-span-2"><label className="label">Ort</label><input className="input" name="city" defaultValue={a?.city} /></div>
        <div><label className="label">Land (ISO)</label><input className="input" name="country" defaultValue={a?.country ?? "DE"} maxLength={2} /></div>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Steuer und Bank</legend>
        <div><label className="label">USt-IdNr.</label><input className="input" name="vatId" defaultValue={contact?.vatId} /></div>
        <div><label className="label">Steuernummer</label><input className="input" name="taxNumber" defaultValue={contact?.taxNumber} /></div>
        <div><label className="label">IBAN</label><input className="input" name="iban" defaultValue={contact?.iban} /></div>
        <div><label className="label">Leitweg-ID (Behörden)</label><input className="input" name="buyerReference" defaultValue={contact?.buyerReference} /></div>
        <div className="sm:col-span-2">
          <label className="label">Besteuerung</label>
          <select className="input" name="taxType" defaultValue={contact?.taxType ?? "default"}>
            <option value="default">Umsatzsteuerpflichtig (Inland)</option>
            <option value="eu">EU-Ausland (innergemeinschaftlich)</option>
            <option value="noteu">Drittland</option>
            <option value="ss">Kleinunternehmer</option>
          </select>
        </div>
      </fieldset>
      <div><label className="label">Notiz</label><textarea className="input" rows={3} name="note" defaultValue={contact?.note} /></div>
      <button className="btn-primary">Speichern</button>
    </form>
  );
}
