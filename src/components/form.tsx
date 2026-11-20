"use client";
import { createContext, useActionState, useContext, useEffect, useRef, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/forms";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const PendingContext = createContext(false);

/**
 * Formular für Server-Actions mit Fehler-/Erfolgsmeldung.
 * Absenden per onSubmit + startTransition statt action-Prop: so setzt React 19 das Formular
 * nicht automatisch zurück und Eingaben bleiben bei Validierungsfehlern erhalten.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  confirm,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <PendingContext.Provider value={pending}>
      <form
        ref={ref}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          // Der auslösende Button kann eigene Bestätigung und name/value (z. B. _op=delete) mitbringen
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const question = submitter?.dataset.confirm ?? confirm;
          if (question && !window.confirm(question)) return;
          const fd = new FormData(e.currentTarget, submitter);
          startTransition(() => formAction(fd));
        }}
      >
        {children}
        <FormMessage state={state} />
      </form>
    </PendingContext.Provider>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) return <p className="mt-2 rounded bg-red-50 px-2 py-1 text-sm text-red-700">{state.error}</p>;
  if (state.ok && !state.data) return <p className="mt-2 text-sm text-green-700">{state.ok}</p>;
  return null;
}

export function Submit({
  children = "Speichern",
  className = "btn",
  name,
  value,
  confirm,
}: {
  children?: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
  confirm?: string;
}) {
  const ctxPending = useContext(PendingContext);
  const { pending: formPending } = useFormStatus();
  const pending = ctxPending || formPending;
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value} data-confirm={confirm}>
      {pending ? "…" : children}
    </button>
  );
}
