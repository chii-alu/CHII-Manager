"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/app/manage/actions";
import { Dialog } from "@/components/ui/Dialog";
import { btnPri, input, label } from "@/components/ui/styles";
import { SessionForm } from "./SessionForm";
import { usePortal } from "./usePortal";

export type CopyOption = { id: string; label: string };

export function NewSessionDialog({
  standardLabel = "Standard template",
  interventionId,
  interventionName,
  selective,
  copyOptions,
}: {
  interventionId: string;
  interventionName: string;
  standardLabel?: string;
  pillar: string;
  selective: boolean;
  copyOptions: CopyOption[];
}) {
  const router = useRouter();
  const portal = usePortal();
  const [open, setOpen] = useState(false);
  const [copyFrom, setCopyFrom] = useState<string>(copyOptions[0]?.id ?? "");
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button type="button" className={btnPri} onClick={() => setOpen(true)}>
        New session
      </button>
      <Dialog
        open={open}
        onClose={close}
        title="New session"
        description={
          <>
            Creating a session generates its{" "}
            {selective ? "application, check-in and feedback forms plus a selection rubric" : "registration, check-in and feedback forms"}{" "}
            for {interventionName}.
          </>
        }
        wide
      >
        <SessionForm
          selective={selective}
          submitLabel="Create session and forms"
          onCancel={close}
          extraFields={
            <label className={label}>
              Start forms from
              <select className={input} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                <option value="">{standardLabel}</option>
                {copyOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    Copy from: {o.label}
                  </option>
                ))}
              </select>
            </label>
          }
          onSubmit={async (session) => {
            const result = await createSession({
              interventionId,
              session,
              copyFromSessionId: copyFrom || null,
            });
            if (result.ok) {
              setOpen(false);
              router.push(`/manage/${portal}/sessions/${result.data.sessionId}/forms`);
            }
            return result.ok ? { ok: true, data: undefined } : result;
          }}
        />
      </Dialog>
    </>
  );
}
