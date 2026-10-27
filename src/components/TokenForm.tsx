"use client";

import { useActionState } from "react";
import { createToken, type TokenResult } from "@/app/actions/api";
import { CopyValue } from "./CopyValue";

export function TokenForm({ scopes }: { scopes: Record<string, string> }) {
  const [state, action, pending] = useActionState<TokenResult, FormData>(createToken, {});
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-medium">Neuer API-Schlüssel</h2>
      <div><label className="label">Name</label><input className="input" name="name" placeholder="z. B. Claude Code" required /></div>
      <fieldset className="space-y-1.5">
        {Object.entries(scopes).map(([s, label]) => (
          <label key={s} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="scope" value={s} defaultChecked={s !== "book"} disabled={s === "read"} className="mt-1" />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <button className="btn-primary" disabled={pending}>Anlegen</button>
      {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      {state.token && (
        <div className="rounded-md border border-accent p-3 text-sm">
          <p className="mb-1 font-medium">Schlüssel jetzt kopieren, er wird nur einmal angezeigt:</p>
          <code className="break-all">{state.token}</code> <CopyValue value={state.token} />
        </div>
      )}
    </form>
  );
}
