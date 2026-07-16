"use client";

import { useFormStatus } from "react-dom";
import type { ComponentPropsWithoutRef } from "react";

/**
 * Submit button that disables and shows pending text while its form's
 * server action is in flight — prevents double-submits (e.g. uploading
 * the same file twice) and gives visible feedback with no extra client JS
 * beyond this one hook.
 */
export function SubmitButton({
  children,
  pendingText,
  ...props
}: ComponentPropsWithoutRef<"button"> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type="submit" disabled={pending || props.disabled}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
