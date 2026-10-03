"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Modal } from "./modal";
import { Button } from "./button";

export interface ConfirmRequest {
  title: string;
  message: ReactNode;
  /** Defaults to `title`, which is already an action phrase — "Delete deal" beats "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` for anything destructive or irreversible — a removal, a revocation, a forced reset. */
  tone?: "primary" | "danger";
}

type Confirm = (request: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * An in-app replacement for `window.confirm`.
 *
 * The native dialog cannot be styled, prefixes the question with "<host> says", and blocks the whole
 * browser tab while it is open. This keeps the focus trap, ESC-to-close and focus return that
 * `Modal` already provides, and reads as part of the product rather than as a browser interruption.
 *
 * Mounted once in the app shell so a call site needs no JSX of its own — see `useConfirm`.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolve = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolve.current?.(confirmed);
    resolve.current = null;
    setRequest(null);
  }, []);

  useEffect(() => () => resolve.current?.(false), []);

  const confirm = useCallback<Confirm>(
    (next) =>
      new Promise<boolean>((res) => {
        resolve.current?.(false);
        resolve.current = res;
        setRequest(next);
      }),
    [],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={request !== null}
        onClose={() => settle(false)}
        title={request?.title ?? ""}
        className="w-[min(28rem,calc(100vw-2rem))]"
      >
        <p className="text-sm text-charcoal">{request?.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => settle(false)}>
            {request?.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={request?.tone === "danger" ? "danger" : "primary"}
            onClick={() => settle(true)}
          >
            {request?.confirmLabel ?? request?.title ?? "Confirm"}
          </Button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

/**
 * Ask the user to confirm, keeping the shape a call site had with `window.confirm`:
 *
 * ```ts
 * const confirm = useConfirm();
 * if (!(await confirm({ title: "Remove Ada?", message: "…", tone: "danger" }))) return;
 * ```
 *
 * Throws when no `ConfirmProvider` is mounted above, rather than silently falling back to the
 * native dialog — a missing provider should be a loud wiring bug, not a UI that quietly regresses.
 */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (confirm === null) {
    throw new Error("useConfirm must be used inside a <ConfirmProvider>");
  }
  return confirm;
}
