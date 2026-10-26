import { z } from "zod";
import { MIN_PASSWORD } from "./auth";

export const NewUser = z.object({
  name: z.string().trim().min(1, "Name fehlt."),
  email: z.string().trim().toLowerCase().email("Die E-Mail-Adresse ist ungültig."),
  password: z.string().min(MIN_PASSWORD, `Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`),
  password2: z.string(),
}).refine((d) => d.password === d.password2, { message: "Die Passwörter stimmen nicht überein." });

