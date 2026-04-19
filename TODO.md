# TODO

Running list of deferred work and open questions. Add items here when they
come up in conversation but aren't the current focus. Delete or check off
once handled.

Format: `- [ ] <area>: <item> — <short why/context>`. Keep the why, drop
the item when done — git log is the history.

## Events / Automation

- [ ] `task.requested`: add optional `silent?: boolean` to the payload so
      headless callers (webhook scripts, monitoring) can opt out of the
      default `connectorCenter.notify`. Currently every task reply is
      pushed to the last-interacted connector, which is wrong for pure
      background jobs.
- [ ] `task-router`: support `sessionId` in the payload so different
      external callers get isolated conversation histories instead of
      sharing `task/default`.

## Security

- [ ] Broader API security audit. Only `/api/events/ingest` has auth
      today; the rest of `/api/*` (config mutation, cron CRUD, heartbeat
      trigger, chat, trading push, etc.) is unauthenticated and relies
      entirely on localhost binding. Needs a proper auth story (shared
      admin token? session cookies? per-route scopes?) before any of it
      is exposed beyond a single-user local machine.
- [ ] Webhook tokens: add admin UI for listing / adding / rotating
      tokens inside the Webhook tab instead of requiring hand-editing
      `data/config/webhook.json`. Config surface exists; just missing
      the form.
- [ ] Token scoping: a webhook token can currently fire any external
      event type. When more external types exist, let tokens declare
      which event types they're allowed to inject.

## Bugs

- [ ] Chat page: can't scroll up past a certain point — suspect a state
      lock (e.g. a `loading` / `hasMore` guard that never releases, or
      the auto-scroll-to-bottom effect fighting the user scroll).
      Start: `ui/src/pages/ChatPage.tsx` around the scroll handler
      (`onScroll` + `scrollToBottom` `useEffect`).
- [ ] Snapshot / FX: after currency conversion, snapshot values
      occasionally come out as wildly wrong numbers (reported, cause
      unknown). Likely a direction mistake (multiply vs divide) or
      precision loss going through `number` instead of `Decimal`.
      Start: `src/domain/trading/snapshot/service.ts` (only file in
      snapshot/ that touches fx) + `src/domain/trading/fx-service.ts`.
- [ ] Trading / Git Push UI: values shown on the Push approval panel
      have visible precision issues (display clearly wrong). Likely a
      `toFixed` / `Number(...)` step on the frontend rendering an
      Operation's quantity or price. Start:
      `ui/src/components/PushApprovalPanel.tsx` and any number-
      formatting helpers it pulls in.

## (seed more areas as they come up)
