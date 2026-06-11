# RFC-006 Duplicate Issue Triage

*Generated: 2026-06-11T00:00:00.000Z*

## Search summary

The following searches were performed on 2026-06-11 against open issues in
`Latimer-Woods-Tech/Factory`:

| Search | Result |
|---|---|
| `label:duplicate` | 0 issues |
| `[Duplicate]` in title | 0 issues |
| `duplicate` in title | 0 issues |
| `Duplicate of` in body | 3 issues (none are duplicates — see below) |

The 3 issues returned by the `Duplicate of` body search contain that phrase
as regular prose (cross-references to related work), not as duplicate-closure
markers. None of those issues are duplicates.

## Known duplicates to close

| Issue | Title | Survivor | Action |
|---|---|---|---|
| — | — | — | No clear duplicates found at baseline |

## Ambiguous cases (need human review)

| Issue | Title | Possible duplicate of | Notes |
|---|---|---|---|
| #599 | SYNERGY — Adopt Factory schedule-worker for VideoKing video pipeline | — | Standalone synergy tracker; no obvious duplicate. Referenced in other issues but not a duplicate itself. |
| #647 | docs(cross-repo): link every CLAUDE.md to factory canonical docs | — | No duplicate found. One of a kind. |
| #1412 | Factory Platform Completion Gate | — | Master tracking issue. No duplicate. |

Note: the three issues above appeared in the `Duplicate of` body search because
their bodies mention the phrase in cross-reference context, not as duplicate markers.
They are **not** duplicates and should remain open.

## RFC-006 baseline context

The 2026-06-10 audit (RFC-006 §2) identified 13 exact roadmap duplicate pairs
and 9 duplicate Sentry issues. Those were open issues at the time of the audit.
By 2026-06-11 (this triage), no open issues carry the `duplicate` label or the
`[Duplicate]` title marker — suggesting earlier cleanup ran or duplicates were
closed without label application.

**If new duplicates are identified after this date**, close them with:

```
Closing as duplicate of #<survivor> per RFC-006 Phase 0 duplicate cleanup.
Survivor: #<survivor>.
```

And add a row to the "Known duplicates to close" table above before closing.

## Exit criterion status

RFC-006 Phase 0 exit criterion: "Duplicate cleanup has a survivor record for
every closed duplicate."

Status: **Satisfied at baseline** — zero open issues have the duplicate label.
Historical closures (pre-2026-06-11) predated this triage record. Any future
duplicate closure must reference this document or a successor.
