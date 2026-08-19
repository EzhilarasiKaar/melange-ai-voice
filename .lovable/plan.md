# Reactivate cancelled invitations

Yes — cancelling only marks the invitation as `cancelled`; the token and link are untouched, so a cancelled link can be switched back on.

## What you'll get

- A "Reactivate" action on cancelled rows in the Invitations table (circular-arrow icon, same spot as the current cancel icon).
- Clicking it restores the invitation to **Pending** and pushes the expiry out 14 days from now, so the original link starts working again immediately.
- A confirmation toast, plus the table refreshing on success.
- The same original interview link keeps working — no new link is generated, so anything already shared with the leader stays valid.

## Notes

- Only invitations with status `cancelled` show the action. Completed interviews stay locked (reopening them would risk overwriting existing recordings and the AI summary).
- If the invitation had already started before being cancelled, it returns to Pending and the leader restarts from the consent screen; any recordings already captured stay in place.

## Technical details

- `src/lib/interview-editor.functions.ts`: add a `reactivateInvitation` server function (auth-gated like `cancelInvitation`) that updates the row to `status: "pending"`, `expires_at` = now + 14 days, and clears `started_at`, filtered by `.eq("status", "cancelled")` so it can never revive a completed interview.
- `src/routes/_authenticated/invitations.tsx`: wire the new function with `useServerFn`, add a `handleReactivate` handler with confirm + toast + `invalidateQueries(["invitations"])`, and render a `RotateCcw` icon button when `inv.status === "cancelled"`.
- No schema change needed; `src/lib/interview-public.functions.ts` already gates on status/expiry, so a reactivated token flows normally again.
