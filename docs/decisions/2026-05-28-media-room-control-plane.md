---
date: 2026-05-28
decider: @adrper79-dot
status: decided
---

# Media Room Control Plane

## Decision

Factory will treat Media Room as a Node-only production control plane under
`tools/media-room`, with rendering still owned by Video Studio and
`.github/workflows/render-video.yml`.

## Context

Prime Self needed replacement landing and tutorial videos with better pacing,
visual aids, and complete narration. The earlier video path could render videos,
but it did not enforce whether a brief was educationally complete, visually
planned, timed to fit the narration, or scoped correctly for future personal
reading delivery.

## Why

Media Room gives operators and CI a pre-render gate before expensive production
renders are dispatched. Keeping it under `tools/` makes the Node runtime boundary
explicit: it can read local content briefs and produce readiness reports without
being confused for Cloudflare Worker code.

## Consequences

- Media readiness becomes a contract checked before production dispatch.
- Video Studio remains focused on Remotion templates and render props.
- Workflow changes must preserve safe JSON handoff from briefs into shell steps.
- Long-form or personal readings must prove scoped/private delivery, transcript
  availability, and navigable chapters before they become customer-facing media.

## Revisit When

- Media Room grows from validation into orchestration that needs a deployed API.
- The shared renderer needs videos beyond the current 30-minute technical ceiling.
- Personal reading delivery requires signed URLs, access control, or customer
  notification flows beyond the existing schedule/video queue.

## Links

- Factory PR: https://github.com/Latimer-Woods-Tech/Factory/pull/1162
- Production control plane: ../MEDIA_ROOM_PRODUCTION_CONTROL_PLANE.md
