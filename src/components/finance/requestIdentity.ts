import { useRef } from "react";

/** Retries keep their identity; editing the operation can never reuse an old response. */
export function createRequestIdentity() {
  let last: { signature: string; id: string } | undefined;
  return {
    forPayload(payload: Record<string, unknown>) {
      const signature = JSON.stringify(payload);
      if (!last || last.signature !== signature)
        last = { signature, id: crypto.randomUUID() };
      return last.id;
    },
    clear() {
      last = undefined;
    },
  };
}

export function useRequestIdentity() {
  const identity = useRef<ReturnType<typeof createRequestIdentity> | null>(null);
  if (!identity.current) identity.current = createRequestIdentity();
  return identity.current;
}
