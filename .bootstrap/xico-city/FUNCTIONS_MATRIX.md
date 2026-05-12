# xico-city (DJMEXXICO) — Functions & Features Matrix
**Date**: 2026-05-11
**Repo**: Latimer-Woods-Tech/xico-city
**Status**: Migrated from `CANONICAL_DJMEXXICO_FeatureRegistry_v3.xlsx` (150 features across 29 slices). All registry rows currently `PLANNED` → mapped to 🔍. Endpoints/tables preserved from registry (internal `|` rendered as `&#124;`).
**Owner Convention**: human owner = @adrper79-dot, bot owner = @factory-cross-repo[bot]
**Weight scale**: 1 (infra/utility) · 2 (internal admin) · 3 (standard feature) · 4 (customer-visible UX) · 5 (payment/auth/data-loss path)

## Status legend (strict, single meaning per emoji)
- ✅ — automated test exists AND latest CI run on main is green AND no unresolved Sentry issues touching this row's endpoint
- ⚠️ — passes tests but has open Sentry issues OR known issues in production
- ❌ — automated test missing, OR CI failing, OR confirmed broken in production
- 🔍 — not yet verified (default for new rows; auto-set when Last Verified > 30 days)

## 1. S-01 — Slicer to Asset
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-S01-001 | User Registration | POST /auth/register | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-001] Auth :: Email + password registration. Lucia Auth session creation. Profile auto-created on register. — tables: users, sessions, profiles |
| XC-S01-002 | User Login / Logout | POST /auth/login, POST /auth/logout, GET /auth/me | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-002] Auth :: Session creation and destruction. Secure cookie. Lucia session lifecycle management. — tables: users, sessions |
| XC-S01-003 | Presigned Upload | POST /uploads/presign, POST /uploads/confirm | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-003] Storage :: Client requests presigned R2 URL. Uploads directly to R2. Confirms completion via API. — tables: uploads |
| XC-S01-004 | Audio Ingest & Analysis | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-004] Worker :: On upload confirm: BPM detection, key detection, Camelot position, duration, sample rate, bit depth. — tables: assets, asset_tags |
| XC-S01-005 | Source Asset Creation | POST /uploads/confirm (extended) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-005] Database :: Confirmed upload becomes a source asset record. media_file record created with file_role=source. — tables: assets, media_files |
| XC-S01-006 | Slicer Job Creation | POST /jobs | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-006] API :: User creates slicer job with params: sensitivity, min/max slice ms, target LUFS, output format. — tables: jobs |
| XC-S01-007 | Job Queue Delivery | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | [F-007] Queue :: Cloudflare Queues delivers job message to Hetzner worker. Handles retries and dead letter. — tables: jobs |
| XC-S01-008 | Phase 1 — Onset Detection | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-008] Worker :: Worker downloads source file from R2. Runs librosa onset detection. Stores cut points. — tables: jobs, job_cut_points |
| XC-S01-009 | Cut Point Review UI | GET /jobs/:id/cut-points, POST /jobs/:id/cut-points | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-009] Frontend :: WaveSurfer.js waveform display with draggable cut point markers. Nudge, add, delete controls. — tables: job_cut_points |
| XC-S01-010 | Cut Point Confirmation | POST /jobs/:id/confirm | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-010] API :: User confirms cuts. API saves adjusted positions. Pushes Phase 2 message to queue. — tables: jobs, job_cut_points |
| XC-S01-011 | Phase 2 — Slice Render | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-011] Worker :: Worker reads confirmed cut points. Executes slices via pydub. Normalizes each slice. — tables: jobs, job_cut_points, media_files, transformations |
| XC-S01-012 | Preview Generation — Audio | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-012] Worker :: Generates waveform PNG, 30s preview MP3, and waveform MP4 video for source and each slice. — tables: media_files |
| XC-S01-013 | Sample Pack Asset Creation | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-013] Database :: Worker creates sample_pack asset. Attaches all slice media_files. Records lineage. — tables: assets, media_files, asset_lineage, transformations |
| XC-S01-014 | Private Library View | GET /assets | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-014] Frontend :: User sees all their assets. Filterable by type, processing_state, project_state. Sort options. — tables: assets, media_files |
| XC-S01-015 | Asset Detail Page | GET /assets/:id, GET /assets/:id/files | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-015] Frontend :: Single asset view. Waveform player. Metadata. Media files list. Processing state indicator. — tables: assets, media_files, asset_tags |
| XC-S01-016 | Slice Download | GET /assets/:id/files (presigned download URL) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-016] Frontend :: User downloads individual slices or full pack ZIP from their library. — tables: media_files |
| XC-S01-017 | DMCA Agent Registration | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-059] Auth :: Register DMCA agent with US Copyright Office. Required for Safe Harbor protection. — tables: — |
| XC-S01-018 | Moderation Fields on Assets | POST /assets/:id/flag, PATCH /assets/:id/moderation (admin) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | [F-060] API :: is_flagged, flagged_reason, moderation_state on assets. DMCA takedown handling infrastructure. — tables: assets |
| XC-S01-019 | Subscription Tiers | Stripe subscription webhook updates user.subscription_tier | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-061] Database :: Free / Creator / Pro tier enforcement. Feature gates based on user subscription state. — tables: users |
| XC-S01-020 | Processing Credits System | GET /credits, POST /credits/purchase | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-062] Payments :: Credit balance per user. Deducted per job type. Reloaded by subscription or one-time purchase. — tables: users (credits_balance), orders |

## 2. S-02 — Stem Separation
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-S02-001 | Stem Separation — Demucs | POST /jobs (job_type=stem_separate) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-017] Worker :: User submits stem separation job. Demucs separates drums, bass, melody, vocals, other. — tables: jobs, media_files, assets, asset_lineage, transformations |
| XC-S02-002 | Stem Pack Asset Creation | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-018] Database :: Worker creates stem_pack asset. Each stem is a media_file. Lineage from source asset. — tables: assets, media_files, asset_lineage |
| XC-S02-003 | Stem Pack UI | GET /assets/:id, GET /assets/:id/files | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-019] Frontend :: UI shows stem pack with per-stem waveform player and individual download per stem. — tables: assets, media_files |
| XC-S02-004 | Asset Promotion | POST /assets/:id/promote-file | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-020] Frontend :: User promotes a slice or stem media_file to a standalone asset with its own asset record. — tables: assets, media_files, asset_lineage |
| XC-S02-005 | Version History UI | GET /assets/:id/versions | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-067] Frontend :: Per-asset version history showing all processing runs. Compare versions. Restore old output. — tables: transformations, media_files |

## 3. S-03 — Vocal Workspace
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-S03-001 | Vocal Processor — Pitch Detection | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-021] Worker :: Detects center pitch, pitch variance, and range per vocal take. Reports flat/sharp tendency. — tables: assets, asset_tags |
| XC-S03-002 | Vocal Processor — Breath & Silence Trim | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-022] Worker :: Detects breath sounds and trims leading/trailing silence from vocal takes. — tables: media_files |
| XC-S03-003 | Vocal Take Comparison | GET /assets (filtered by parent project) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-023] Frontend :: Side-by-side waveform display of multiple takes of same section. Audition individually. — tables: assets, media_files |
| XC-S03-004 | Acapella Packager | POST /jobs (job_type=package) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-024] Worker :: Packages clean vocal + ad-libs + wet version + dry version into a vocal_pack asset. — tables: assets, media_files, asset_lineage |
| XC-S03-005 | Vocal Pack UI | GET /assets/:id | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-025] Frontend :: Displays vocal_pack with per-stem player: clean, ad-libs, wet, dry. Individual downloads. — tables: assets, media_files |
| XC-S03-006 | Private Sharing — Listen Page | GET /s/:token | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-064] Frontend :: Public-accessible listen/view page for unlisted assets. Waveform player. No download default. — tables: share_links, assets, media_files |

## 4. S-04 — Asset to Marketplace
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-S04-001 | Listing Creation | POST /listings | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-026] API :: Creator lists an asset. Selects license type, sets price. Rights declaration required. — tables: listings |
| XC-S04-002 | Rights Declaration Gate | POST /listings (with declaration) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-027] Frontend :: Modal confirmation before listing activation. Timestamped. Affirms ownership of rights. — tables: listings |
| XC-S04-003 | Public Asset Page | GET /assets/:id (public), GET /listings/:id | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-028] Frontend :: Public-facing asset page. Waveform player. Metadata. Tags. Creator info. License options. Share. — tables: assets, media_files, asset_tags, listings, profiles |
| XC-S04-004 | Stripe Checkout | POST /orders | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-029] Payments :: Creates Stripe Checkout Session for asset purchase. Returns checkout URL to client. — tables: orders |
| XC-S04-005 | Stripe Webhook Handler | POST /webhooks/stripe | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-030] Payments :: Receives and validates Stripe webhook. Moves order to paid. Creates license record. — tables: orders, licenses, listings |
| XC-S04-006 | License Grant & Download | GET /licenses/:id/download | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-031] API :: After order paid: license record created. Buyer gets presigned download URL. — tables: licenses, media_files |
| XC-S04-007 | Creator Storefront | GET /profiles/:username | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-032] Frontend :: Public profile page showing creator's public assets, listings, stats, culture tags. — tables: profiles, assets, listings |

## 5. S-05 — Visual Workspace
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-S05-001 | Image Processing | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-033] Worker :: Resize, optimize, format convert, thumbnail generation for uploaded images. — tables: assets, media_files |
| XC-S05-002 | Video Processing | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-034] Worker :: Transcode uploaded video. Generate thumbnail. Create 15s preview clip. — tables: assets, media_files |
| XC-S05-003 | VJ Format Export | POST /jobs (job_type=vj_export) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-035] Worker :: Exports visual loops in VJ-ready formats: HAP, HAP Q, ProRes. Frame rate standardization. — tables: media_files |
| XC-S05-004 | AI Cover Art Generation | POST /ai/cover-art | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-036] AI/ML :: User describes vibe in text. Replicate API generates cover art options. Best becomes asset. — tables: assets, media_files |
| XC-S05-005 | Visual Asset Library | GET /assets (filtered by visual types) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-037] Frontend :: Visual-specific library view. Grid layout. Thumbnail preview. Filter by visual asset types. — tables: assets, media_files |
| XC-S05-006 | Asset Collections | POST /collections, POST /collections/:id/assets | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-063] Frontend :: User creates named collections. Adds/removes assets. Reorder. Share collection as unlisted. — tables: asset_collections, collection_assets |
| XC-S05-007 | Visual Loop Validation | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-066] Worker :: Detects loop points in video files. Validates seamless loop. Reports loop quality score. — tables: assets, asset_tags |

## 6. S-06 — Discovery & Search
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-S06-001 | Full-Text Asset Search | GET /search?q= | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-038] Search :: Search across asset titles, descriptions, tags. Postgres FTS with tsvector. — tables: assets, asset_tags |
| XC-S06-002 | Camelot Wheel Filter | GET /search?camelot=8A | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-039] Search :: Filter audio assets by Camelot position. Shows harmonically compatible assets. — tables: asset_tags |
| XC-S06-003 | Multi-Dimensional Browse | GET /browse (with filter params) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-040] Search :: Browse by genre, mood, instrument, era, culture tag, energy level, tempo range. — tables: assets, asset_tags |
| XC-S06-004 | Sonic Similarity — pgvector | GET /assets/:id/similar, POST /search/sonic | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-041] AI/ML :: Essentia generates audio embedding per asset. pgvector stores and queries similarity. — tables: asset_embeddings |
| XC-S06-005 | Cultural Tag Browse Surface | GET /culture/:tag | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-042] Frontend :: Culture tags have their own browse surface. Tags link to a feed of matching assets. — tables: assets, asset_tags |
| XC-S06-006 | Sync Brief Marketplace | GET /sync-briefs (public browse) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-069] Frontend :: Supervisors browse and post briefs. Creators browse active briefs and submit their work. — tables: sync_briefs |

## 7. S-07 — Contributor System
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-S07-001 | Project Contributor Records | POST /projects/:id/contributors, GET /projects/:id/contributors | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-043] Database :: Add contributors to projects. Assign roles. Set master, publishing, sync split percentages. — tables: project_contributors |
| XC-S07-002 | Off-Platform Contributor Invites | POST /invites | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-044] API :: Invite a contributor by email. platform_invites record created. Account links on join. — tables: platform_invites, project_contributors |
| XC-S07-003 | Split Sheet Generation | GET /projects/:id/split-sheet (PDF) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-045] Frontend :: Generate PDF split sheet from project contributors and their confirmed splits. — tables: project_contributors |
| XC-S07-004 | Contributor Attribution Display | GET /assets/:id (includes contributors) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-046] Frontend :: Asset and profile pages show contributor credits and roles. Links to their profiles if on platform. — tables: project_contributors, profiles |
| XC-S07-005 | DJ/VJ Collaboration Profile | GET /profiles/:username/collaborations | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-065] Frontend :: DJ and VJ profiles show connected performance history and linked asset catalogs. — tables: project_contributors, profiles, assets |

## 8. S-08 — Sync & Distribution
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-S08-001 | Sync Brief System | POST /sync-briefs, GET /sync-briefs, GET /sync-briefs/matches | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-047] API :: Music supervisors post briefs. System matches to catalog via tags and sonic similarity. — tables: sync_briefs, assets, asset_tags, asset_embeddings |
| XC-S08-002 | Sync Package Generation | POST /jobs (job_type=sync_package) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-048] Worker :: Packages master WAV + stems + metadata + one-sheet + cue sheet into sync_package asset. — tables: assets, media_files |
| XC-S08-003 | Release Package Builder | POST /jobs (job_type=release_package) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-049] Worker :: Packages master WAV + MP3 + cover art + metadata + split sheet + social promo kit. — tables: assets, media_files, release_packages |
| XC-S08-004 | Release Package UI | GET /release-packages/:id, GET /release-packages/:id/download | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-050] Frontend :: UI to configure and download release packages. Select components. Choose distributor format. — tables: release_packages |
| XC-S08-005 | Cue Sheet Generation | GET /projects/:id/cue-sheet (PDF) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-068] Worker :: Generates standardized cue sheet for PRO registration from project metadata. — tables: project_contributors, assets |

## 9. S-09 — Promotion & Campaigns
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-S09-001 | Social Format Export | POST /jobs (job_type=social_export) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-051] Worker :: Generates waveform video in all three aspect ratios: 1:1, 9:16, 16:9 from any audio asset. — tables: media_files |
| XC-S09-002 | Share Link System | POST /share-links, DELETE /share-links/:token, GET /s/:token (public listen page) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-052] API :: Generate, manage, and revoke shareable links for private assets. Expiry control. — tables: share_links |
| XC-S09-003 | Campaign Management | POST /campaigns, GET /campaigns, POST /campaigns/:id/drops | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-053] Frontend :: Create campaigns with title, release date, linked assets, and status tracking. — tables: campaigns, drops |
| XC-S09-004 | Drop Scheduling | POST /drops, PATCH /drops/:id | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-054] Frontend :: Schedule a public drop for a future date and time. Assets publish automatically at drop time. — tables: drops, assets |

## 10. S-10 — Intelligence Layer
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-S10-001 | Activity Events Instrumentation | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-055] Database :: Every significant action emits an activity_event record. The intelligence and feed layer. — tables: activity_events |
| XC-S10-002 | Creator Analytics Dashboard | GET /analytics/me | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-056] Frontend :: Creator sees: asset views, plays, downloads, sales, top assets, revenue trend. — tables: activity_events, orders |
| XC-S10-003 | Cultural Graph Traversal | GET /graph/:asset_id, GET /profiles/:username/network | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-057] Search :: Discovery queries that traverse lineage: who worked with this producer, what followed this pack. — tables: asset_lineage, project_contributors |
| XC-S10-004 | Sync Brief Auto-Matching | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-058] AI/ML :: When a new brief is posted, system automatically matches it to catalog and notifies creators. — tables: sync_briefs, asset_embeddings, asset_tags |
| XC-S10-005 | Cultural Events System | POST /events, GET /events | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-070] Frontend :: Platform events: drop releases, remix battles, producer challenges, showcase weeks. — tables: events, drops |

## 11. DJ — Live Performance Layer
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-DJ-001 | Set List Builder | GET /setlists, POST /setlists, PATCH /setlists/:id | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-071] Frontend :: Camelot-aware set list construction from private library and marketplace catalog. BPM, key, energy, harmonic compatibility indicators between adjacent tracks. — tables: assets, asset_tags |
| XC-DJ-002 | DJ Software Export | GET /setlists/:id/export?format=rekordbox&#124;serato | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-072] Worker :: Generates Rekordbox XML playlist and Serato crate file from set list. BPM and key embedded in ID3 tags on downloaded WAV files. — tables: assets, media_files |
| XC-DJ-003 | Pre-Show Asset Package | POST /setlists/:id/download-package | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-073] Worker :: Downloads all set list assets as organized ZIP. Files named per DJ software convention. BPM and key in filename and ID3 tags. — tables: media_files |
| XC-DJ-004 | Live Set Tracker | POST /setlists/:id/track-session (WebSocket or polling) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-074] Frontend :: Mobile-optimized companion interface. Tap to advance set list live. Timestamps each track play. Records actual play order and duration played. — tables: set_recordings, asset_tags |
| XC-DJ-005 | Set Recording Post-Processing | POST /jobs (job_type=set_recording) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-076] Worker :: DJ uploads recorded mix. Worker generates waveform, preview clip, auto-populates tracklist from live session tracker data. Creates set_recording asset. — tables: assets, media_files, asset_lineage |
| XC-DJ-006 | Performance History | GET /profiles/:username/performances | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-077] Frontend :: Set recordings aggregated on DJ profile. Linked to VJ collaborator profiles. Promoter-visible performance portfolio. — tables: assets, project_contributors, profiles |

## 12. PR — Producer Tools
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-PR-001 | Reference Library Analysis | POST /uploads/confirm (asset_type=reference) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-078] Worker :: Upload reference tracks privately. Worker extracts BPM, key, LUFS, frequency profile, Camelot position. Builds study collection with metadata. — tables: assets, asset_tags |
| XC-PR-002 | Project Templates | POST /templates, GET /templates, POST /jobs (with template_id) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-079] Frontend :: Save tempo, key, mood, drum kit preference, tag presets as named templates. New jobs inherit template settings. Eliminates repetitive metadata entry. — tables: project_templates (new table) |
| XC-PR-003 | Beat Delivery Package | POST /jobs (job_type=beat_delivery, triggered by order webhook) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-080] Worker :: Automated post-sale delivery package. Tagged WAV + MP3 + trackout stems + license PDF + MIDI (if uploaded). One job. One ZIP. Auto-triggered on purchase. — tables: orders, licenses, media_files |
| XC-PR-004 | Lease Management Dashboard | GET /dashboard/leases | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-081] Frontend :: Active leases per beat: use counts, expiry alerts, exclusive threshold warnings. Revenue per beat. Which leases are approaching their limit. — tables: listings, orders, licenses |

## 13. VO — Vocalist Tools
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-VO-001 | Session Brief Generator | GET /assets/:id/session-brief (PDF or HTML) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-082] Worker :: Beat asset → one-page session brief. BPM, key, Camelot, waveform thumbnail, mood tags, producer notes, compatible scale palette. PDF and web view. — tables: assets, asset_tags |
| XC-VO-002 | Vocal Range Profile | GET /profiles/me/vocal-profile | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-083] Worker :: Tracks vocal range across all uploaded takes over time. Builds comfortable range, full range, and break points. Beat key compatibility indicator. — tables: assets, asset_tags, profiles |
| XC-VO-003 | Session Playback Mode | GET /assets/:id (session mode param) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-084] Frontend :: Specialized player for recording-to-beat sessions. Loop points, count-in bars (1-4), variable speed without pitch shift, no interruptions. — tables: assets, media_files |
| XC-VO-004 | Demo Submission Tracker | POST /submissions, GET /submissions, PATCH /submissions/:id | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-085] Frontend :: Log submissions with timestamp, recipient context, asset version, and status. Track whether submission was previewed. Response status field. — tables: submissions (new table) |

## 14. SW — Songwriter Tools
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-SW-001 | Songwriter Workspace | POST /collections (type=songwriter_workspace) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-086] Frontend :: Attach lyrics (text/PDF), voice memos (audio), chord charts (image/PDF), references to one project. All formats. One place. Linked to beat asset. — tables: asset_collections, collection_assets, assets |
| XC-SW-002 | Co-Write Matchmaking | GET /discover/songwriters?strength=hooks | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-087] Frontend :: Tag profile strengths: hooks, lyrics, melodies, concepts, toplining. Discovery surface for finding collaborators with complementary skills. — tables: profiles, asset_tags |
| XC-SW-003 | PRO Registration Prep | GET /projects/:id/pro-registration (PDF + JSON) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-088] Worker :: Generates registration-ready data from project: title, writers, splits, ISWC field, publisher info. PDF and structured JSON export. — tables: project_contributors, assets |
| XC-SW-004 | Song Pitch Document | GET /assets/:id/pitch-doc (PDF) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-089] Worker :: One-sheet PDF: lyric excerpt, waveform thumbnail, audio preview link, mood tags, credits, split summary. Ready to send to manager or publisher. — tables: assets, project_contributors, asset_tags |

## 15. EN — Engineer Tools
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-EN-001 | Engineer Client Intake | POST /projects/:id/brief, GET /projects/:id/brief | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-090] Frontend :: Structured project brief for mixing/mastering clients. Reference tracks, target platform, format requirements, revision policy, deadline. Attached to project. — tables: project_briefs (new table) |
| XC-EN-002 | Revision Tracker | POST /projects/:id/revisions, GET /projects/:id/revisions | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-091] Frontend :: Per-revision log on a project. What was requested, what was delivered, which file version. Eliminates the "which version is final" problem. — tables: project_revisions (new table) |
| XC-EN-003 | Engineer Deliverable Packaging | POST /jobs (job_type=engineer_delivery) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-092] Worker :: Engineer uploads outputs → selects delivery type → platform packages with proper naming conventions and notifies client via email. — tables: media_files, orders |
| XC-EN-004 | Engineer Credit Portfolio | GET /profiles/:username (includes engineering credits) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-093] Frontend :: All mixing and mastering credits visible on engineer profile. Linked from asset pages. Discoverable by genre through lineage graph. — tables: project_contributors, profiles, assets |

## 16. SU — Supervisor Tools
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-SU-001 | Supervisor Research Library | POST /collections (type=research_library) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-094] Frontend :: Private pinned asset collection for upcoming placements. Add private notes per asset. Build context without public commitment. — tables: asset_collections, collection_assets |
| XC-SU-002 | Clearance Pre-Screen View | GET /assets/:id?view=clearance | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-095] Frontend :: Supervisor-facing asset detail. Shows split sheet, exclusive license status, contributor credits, prior licensing history. One consolidated view. — tables: assets, project_contributors, licenses, listings |
| XC-SU-003 | Shortlist Builder & Director Share | POST /shortlists, GET /shortlists/:id (shared view) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-096] Frontend :: Supervisor builds candidate list for a brief. Shares as unlisted page with director. Director leaves timestamped notes per track. — tables: shortlists (new table), share_links |
| XC-SU-004 | Placement Portfolio | PATCH /licenses/:id (add placement disclosure) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-097] Frontend :: Closed sync deals recorded on supervisor profile and creator asset page. Creator consents to disclose. Builds verifiable placement history for both parties. — tables: licenses, profiles, assets |

## 17. AR — A&R / Label Tools
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-AR-001 | Graph Discovery Tool | GET /discover/graph?seed_artist=:username&depth=2 | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-098] Frontend :: Find emerging creators through lineage graph before stream counts confirm them. Who is the connector behind the artists you already know? — tables: asset_lineage, project_contributors, profiles |
| XC-AR-002 | Roster Management | POST /collections (type=roster) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-099] Frontend :: Private collection of signed or working artists. Per-artist: project state, release pipeline, collaboration network. A&R dashboard view. — tables: asset_collections, collection_assets, profiles |
| XC-AR-003 | Label Analytics | GET /analytics/roster | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-100] Frontend :: Cross-roster performance comparison. Collaboration productivity, cultural graph growth, catalog velocity per artist on roster. — tables: activity_events, assets, project_contributors |

## 18. VA — Visual Artist Tools
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-VA-001 | Visual Creative Brief | POST /projects/:id/brief (type=visual) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-101] Frontend :: Structured brief from musician to visual artist. Mood references, color direction, text content, deliverable specs, revision count, deadline. — tables: project_briefs |
| XC-VA-002 | Visual Credit Visibility | GET /assets/:id (includes visual credits) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-102] Frontend :: Designer credit linked on every asset they worked on. Clicks through to their profile. Builds commercial portfolio automatically. First platform to do this. — tables: project_contributors, profiles, assets |
| XC-VA-003 | Visual Asset Marketplace | POST /listings (visual asset types) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-103] Frontend :: Cover art, visualizer packs, brand kits, photo sets listed for licensing. Same commerce infrastructure as audio. Designer owns the revenue. — tables: listings, orders, licenses |

## 19. VJ — VJ Tools
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-VJ-001 | VJ Visual Library | GET /assets?type=visual_loop,performance_set | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-104] Frontend :: Properly tagged visual_loop and performance_set catalog. Searchable by mood, tempo sync range, color palette tags, style, VJ software compatibility. — tables: assets, asset_tags |
| XC-VJ-002 | Promoter Pitch Package | GET /profiles/:username/pitch-pack (PDF + share link) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-105] Worker :: Generated from VJ performance assets: video preview reel, tech specs (software, formats, setup requirements), performance history. One shareable page. — tables: assets, profiles, project_contributors |

## 20. EP — Promoter Tools
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-EP-001 | Show Page | GET /shows/:id (public) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-075] Frontend :: Public event page. DJ/VJ info, set list preview, visual catalog link, external stream link if applicable. Generated from drop event. — tables: drops, profiles, assets |
| XC-EP-002 | Local Talent Discovery | GET /discover/talent?location=Atlanta&culture_tag=drill&role=dj | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-106] Search :: Geographic tags on profiles combined with culture tag and energy level filtering. Find a drill DJ in Atlanta. Find a house VJ in Chicago. — tables: profiles, asset_tags |
| XC-EP-003 | Booking Project | POST /projects (type=booking) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-107] Frontend :: Creates platform project for a booking. Set list, visual pack, tech requirements, payment splits, promo assets. All in one project. — tables: asset_collections, project_contributors, project_briefs |
| XC-EP-004 | Post-Event Content Package | POST /jobs (job_type=event_package) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-108] Worker :: Set recording + VJ mix + event photos from booking project. All contributors credited. Assembled into shareable content package. — tables: assets, project_contributors, media_files |
| XC-EP-005 | Promoter Event History | GET /profiles/:username/events | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-109] Frontend :: Public profile shows event history: talent booked, dates, linked content packages. Venue credibility building. Booking track record visible. — tables: profiles, assets, project_contributors |

## 21. CU — Curator Tools
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-CU-001 | Public Curator Collections | POST /collections (type=curated, visibility=public) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-110] Frontend :: Curator builds themed public collection from marketplace catalog. Browsable. Shareable. Cultural discovery surface beyond algorithm. — tables: asset_collections, collection_assets |
| XC-CU-002 | Collection Submission System | POST /collections/:id/submit, GET /collections/:id/submissions (curator), PATCH /submissions/:id | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-111] Frontend :: Creators submit assets to open curator collections. Curator review queue. Approve or decline workflow. Submission limit per creator per collection. — tables: collection_submissions (new table) |
| XC-CU-003 | Curator Influence Metrics | GET /profiles/:username/curator-stats | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-112] Frontend :: Discovery and sales driven by collection features tracked per curator. Quantified cultural influence on curator profile. Not follower count. — tables: activity_events, asset_collections |

## 22. AL — Musician Alignment Toolset
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-AL-001 | Key & Scale Analysis | GET /assets/:id/analysis/key | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-113] Worker :: Detected key → plain language explanation → scale palette with emotional character and genre associations per scale/mode option. — tables: asset_analyses, asset_tags |
| XC-AL-002 | Chord Progression Analysis | GET /assets/:id/analysis/chords | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-114] Worker :: Chord detection via Essentia → progression identification → plain language explanation of emotional function with real song examples from the genre. — tables: asset_analyses |
| XC-AL-003 | Groove & Micro-Timing Analysis | GET /assets/:id/analysis/groove | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-115] Worker :: Transient detection → grid-relative offset calculation per instrument → lay-back score, swing percentage, timing variance. Plain language groove profile. — tables: asset_analyses |
| XC-AL-004 | Harmonic Compatibility Checker | POST /analysis/compatibility (body: {asset_id_a, asset_id_b}) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-116] Worker :: Two assets → key analysis → shared note inventory → conflict point identification → transposition recommendations. Tells you exactly what clashes and why. — tables: asset_analyses |
| XC-AL-005 | Vocal Pitch Analysis | GET /assets/:id/analysis/pitch | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-117] Worker :: Vocal take + linked beat → pitch accuracy per phrase → separation of intentional expression from missed notes. Flat/sharp tendency report per section. — tables: asset_analyses |
| XC-AL-006 | Song Structure Mapper | GET /assets/:id/analysis/structure | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-118] Worker :: Reference track → section identification (intro/verse/chorus/bridge/outro) → energy profile per section → structural map → plain language analysis. — tables: asset_analyses |
| XC-AL-007 | Asset Alignment Score | GET /assets/:id/analysis/alignment | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-119] Worker :: Composite per-asset score: harmonic coherence %, rhythmic consistency %, dynamic range assessment, structural clarity. Coherence not quality judgment. — tables: asset_analyses |
| XC-AL-008 | LLM Guidance Engine | Internal — called by worker after analysis jobs complete | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-120] API :: Structured analysis results → Claude API → plain language guidance in genre-appropriate voice and vocabulary. Connected to creator's own work, not generic theory. — tables: asset_analyses |

## 23. MO — Monetization Infrastructure
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-MO-001 | Stripe Connect — Seller Onboarding | POST /payments/connect/onboard, GET /payments/connect/status | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-121] Payments :: Creators complete Stripe Connect onboarding to receive payouts. Standard or Express account. Required before any listing can go active. KYC handled by Stripe. — tables: users (stripe_connect_account_id, connect_onboarded_at) |
| XC-MO-002 | Creator Earnings Dashboard | GET /dashboard/earnings | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-122] Payments :: Creator sees total earnings, pending payouts, cleared payouts, per-asset revenue, revenue by license type, and monthly trend. Real numbers, not estimates. — tables: orders, licenses, listings |
| XC-MO-003 | Payout Request & Schedule | POST /payments/payouts/request, GET /payments/payouts | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-123] Payments :: Creator requests payout of cleared balance. Automatic weekly payout option. Minimum payout threshold. Payout history with Stripe transfer IDs. — tables: payouts (new table) |
| XC-MO-004 | Revenue Split Transparency | GET /orders/:id (includes fee breakdown) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-124] Frontend :: Every order shows creator exactly what they received and what the platform fee was. Fee policy clearly explained. No hidden math. Historical fee snapshots preserved. — tables: orders |
| XC-MO-005 | Credit System — Purchase & Consumption | GET /credits/balance, POST /credits/purchase, GET /credits/transactions | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-125] Payments :: Credit balance per user. Credits purchased via Stripe one-time payment or included in subscription. Deducted per job type. Balance shown in UI. Low balance warning. — tables: users (credits_balance), credit_transactions (new table) |

## 24. NT — Notification System
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-NT-001 | Notification Infrastructure | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 3 | [F-126] Database :: notifications table. Every significant platform event generates a notification record. Supports in-app and email channels. Read/unread state. Dismissible. — tables: notifications (new table) |
| XC-NT-002 | In-App Notification Center | GET /notifications, PATCH /notifications/:id/read, POST /notifications/read-all, GET /notifications/stream (SSE) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-127] Frontend :: Bell icon with unread count. Dropdown notification feed. Mark read. Dismiss. Link to relevant asset or job. Real-time update via polling or SSE. — tables: notifications |
| XC-NT-003 | Email Notification Dispatch | — (internal — triggered by notification worker) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-128] API :: Transactional emails via Resend or Postmark. Job complete, beat purchased, brief match, invite received, drop going live, payout transferred. — tables: notifications |
| XC-NT-004 | Notification Preferences | GET /settings/notifications, PATCH /settings/notifications | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-129] Frontend :: User controls which events trigger in-app vs email notifications. Per-type toggles. Digest option for low-priority events. Quiet hours setting. — tables: users (notification_prefs JSONB) |
| XC-NT-005 | Critical Alert Enforcement | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-130] API :: Certain notifications cannot be disabled: purchase confirmations, payout transfers, DMCA takedown notices, account suspension warnings. Always delivered both channels. — tables: notifications |

## 25. MB — Mobile / PWA
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-MB-001 | Progressive Web App (PWA) | — (manifest.json, service worker) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-131] Frontend :: Platform installable as PWA on iOS and Android. Service worker for offline asset browsing. Push notification support. Home screen icon. Splash screen. — tables: — |
| XC-MB-002 | Mobile-First Core Surfaces | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-132] Frontend :: Library, asset detail, job status, and notification center designed mobile-first. Touch targets minimum 44px. Swipe gestures for navigation. Bottom nav bar. — tables: — |
| XC-MB-003 | Live Set Tracker — Mobile Optimized | POST /setlists/:id/track-session | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-133] Frontend :: Full-screen tap interface for DJ live set tracking. Large track cards. Single tap to advance. Haptic feedback. Screen stays awake. Works offline with sync. — tables: set_recordings |
| XC-MB-004 | Session Playback — Mobile Optimized | GET /assets/:id (session mode) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-134] Frontend :: Vocalist session player optimized for phone use while recording. Large play/pause. Loop toggle. Speed control. Runs in background audio mode. — tables: assets, media_files |

## 26. OB — Onboarding
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-OB-001 | Role-Based Onboarding Flow | POST /onboarding/role, POST /onboarding/complete | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-135] Frontend :: New user selects their primary role(s) on first login. Flow adapts: producer sees slicer first, vocalist sees vocal workspace, supervisor sees sync briefs. Maximum 4 steps. Skippable. Revisitable. — tables: users (onboarding_role, onboarding_completed_at) |
| XC-OB-002 | First Value Moment — Per Role | — | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-136] Frontend :: Each role has a defined first value moment. Producer: upload a loop and see slices in 3 minutes. DJ: build a set list from catalog in 2 minutes. Supervisor: post a brief in 90 seconds. Onboarding guides directly to that moment. — tables: — |
| XC-OB-003 | Interactive Feature Tour | PATCH /onboarding/dismiss-tour | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-137] Frontend :: Context-sensitive tooltips on first use of each major surface. Not a modal walkthrough — inline guidance that appears when the user reaches a feature. Dismissible. Does not repeat after dismissed. — tables: users (dismissed_tours JSONB) |
| XC-OB-004 | Sample Content on First Login | — (seeded on account creation) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-138] Frontend :: New user sees pre-loaded example assets in their private library on first login. A demo beat pack, a demo vocal take, a demo visual. Shows what the platform produces. Clearly marked as examples. Deletable. — tables: assets, media_files |

## 27. CS — Content Safety
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-CS-001 | User Reporting System | POST /reports | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-139] Frontend :: Report button on any public asset, listing, or profile. Report categories: copyright infringement, explicit content, harassment, hate speech, spam. Reports create moderation queue items. — tables: reports (new table) |
| XC-CS-002 | Moderation Queue — Admin | GET /admin/moderation, PATCH /admin/moderation/:id | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | [F-140] Frontend :: Internal admin surface. Pending reports with context: reported content, reporter history, subject history, prior actions. Accept or dismiss. Action: warn, remove, suspend. — tables: reports, assets, users |
| XC-CS-003 | Community Guidelines & Strike System | GET /account/strikes, POST /account/appeal | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | [F-141] Frontend :: Published community guidelines. Three-strike system: warning, temporary suspension, permanent suspension. Strikes visible to user in account settings. Appeal process for each strike. — tables: users (strike_count, strike_history JSONB) |

## 28. DA — Data & Privacy
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-DA-001 | Data Export — Full Account | POST /account/export, GET /account/export/:id/download | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-142] API :: User can request full export of their data: all assets, metadata, tags, lineage, licenses, orders, split records, activity history. ZIP delivered via email link. — tables: assets, media_files, orders, licenses, project_contributors, activity_events |
| XC-DA-002 | Account Deletion Flow | POST /account/delete (initiates 30-day grace period) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-143] API :: User requests account deletion. Platform handles: assets with active licenses preserved with anonymized creator record, contributor credits on others' projects retained as attribution, pending payouts triggered, active leases flagged for buyer notification. — tables: users, assets, licenses, orders, project_contributors |
| XC-DA-003 | Privacy Settings Center | GET /settings/privacy, PATCH /settings/privacy | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-144] Frontend :: User controls: profile visibility, activity visibility, who can submit to their collections, whether their name appears in public contributor credits, data sharing preferences. — tables: users (privacy_prefs JSONB) |
| XC-DA-004 | GDPR & CCPA Compliance Infrastructure | POST /consent, GET /privacy-policy, GET /terms | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-145] Legal :: Cookie consent banner. Privacy policy. Data processing agreements. Right to be forgotten implementation. Right to access implementation (F-142). Data retention policy enforced by scheduled jobs. — tables: consent_logs (new table) |

## 29. DP — Developer API
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| XC-DP-001 | API Key Management | POST /developer/keys, GET /developer/keys, DELETE /developer/keys/:id | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-146] API :: Pro tier users can generate API keys for external integrations. Key scopes: read_assets, write_assets, read_analytics, marketplace. Key rotation, revocation, last-used tracking. — tables: api_keys (new table) |
| XC-DP-002 | Public API — Read Endpoints | GET /v1/assets, GET /v1/assets/:id, GET /v1/profiles/:username, GET /v1/tags | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-147] API :: External developers can read public assets, catalog metadata, creator profiles, and tag taxonomies via authenticated API. Rate limited per key. — tables: assets, profiles, asset_tags |
| XC-DP-003 | Public API — Webhook Registration | POST /developer/webhooks, GET /developer/webhooks, DELETE /developer/webhooks/:id | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-148] API :: Developers register webhook endpoints to receive platform events: asset published, listing created, order paid, job complete. Signed payloads. Retry with exponential backoff. — tables: webhooks (new table) |
| XC-DP-004 | API Documentation & Developer Portal | GET /developer (portal), GET /openapi.json | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-149] API :: Public developer portal. OpenAPI spec for all v1 endpoints. Interactive API explorer. Webhook event catalog. SDK examples (TypeScript, Python). — tables: — |
| XC-DP-005 | Rate Limiting & API Abuse Prevention | — (Cloudflare rate limiting rules) | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | [F-150] API :: Per-key rate limiting enforced at Cloudflare Worker layer. Abuse detection: unusual request patterns, credential stuffing attempts. Automatic key suspension on detected abuse. Alert to key owner. — tables: api_keys |
