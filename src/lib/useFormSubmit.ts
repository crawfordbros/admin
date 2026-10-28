import { useState, type FormEvent } from "react";
import { ApiError, errorMessage } from "./api";

/** Shared submit handling: field errors (422) go next to their fields, anything else above the buttons. */
export function useFormSubmit<T>(send: (values: FormData) => Promise<T>, after: (res: T, values: FormData, form: HTMLFormElement) => void | Promise<void>) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      await after(await send(values), values, form);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return { onSubmit, errors, setErrors, formError, setFormError, saving };
}
