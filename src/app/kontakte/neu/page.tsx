import { ContactForm } from "@/components/ContactForm";
import { createContact } from "@/app/actions/contacts";

export default function NewContact() {
  return (
    <div className="space-y-4">
      <h1 className="h1">Neuer Kontakt</h1>
      <ContactForm action={createContact} />
    </div>
  );
}
