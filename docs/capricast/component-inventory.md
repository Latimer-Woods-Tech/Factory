# Videoking Component Inventory Audit

**Date:** April 28, 2026  
**Purpose:** Audit of 40+ existing components; identify candidates for Factory migration  
**Target:** Reduce from ~60 to ~50 components by eliminating duplicates and moving reusables to Factory  

---

## Summary

| Category | Count | Factory-Owned | App-Owned | Candidates to Move | Duplicates to Remove |
|----------|-------|---------------|-----------|-------------------|----------------------|
| **Atoms** | 12 | 8 | 4 | 4 | 2 |
| **Layout** | 5 | 0 | 5 | 1 | 0 |
| **Forms** | 8 | 2 | 6 | 4 | 1 |
| **Journey (Video)** | 10 | 0 | 10 | 0 | 0 |
| **Journey (Creator)** | 12 | 0 | 12 | 0 | 0 |
| **Journey (Payment)** | 8 | 0 | 8 | 0 | 0 |
| **Journey (Dashboard)** | 7 | 0 | 7 | 0 | 0 |
| **Utilities** | 8 | 0 | 8 | 2 | 1 |
| **TOTAL** | **70** | **10** | **60** | **11** | **4** |

---

## Tier 1: Atoms (Primitives)

### Already Factory-Owned ✅

| Component | Factory Status | Videoking Usage | Notes |
|-----------|----------------|-----------------|-------|
| `<Button>` | v0.1.0 | 15+ islands | Primary, secondary, tertiary |
| `<Input>` | v0.1.0 | Text, email, password | Form fields chain to this |
| `<Heading>` | v0.1.0 | 20+ instances | h1–h6 all instances use factory |
| `<Body>` | v0.1.0 | 50+ instances | body, p, spans use factory |
| `<Label>` | v0.1.0 | 25+ inputs | Every form input has factory label |
| `<Alert>` | v0.1.0 | 8+ islands | Success, error, warning, info |
| `<Badge>` | v0.1.0 | 12+ places | Status badges, tags |
| `<Hint>` | v0.1.0 | 6+ places | Form helper text |

### Videoking Local Duplicates ❌

| Component | Path | Duplicates | Recommendation | Priority |
|-----------|------|-----------|---|----------|
| `<ButtonCustom>` | `src/components/ButtonCustom.tsx` | Same as Button | ✅ Delete; use Factory | High |
| `<FormFieldWrapper>` | `src/components/FormFieldWrapper.tsx` | Partially—Factory has Label, Input; this wraps them | ❌ Keep; videoking-specific layout | Medium |
| `<InputIcon>` | `src/components/InputIcon.tsx` | Input + icon variant missing in Factory | ⚠️ Move to Factory as optional prop | Medium |
| `<HeadingCustom>` | `src/components/HeadingCustom.tsx` | Redundant with Heading | ✅ Delete; use Factory | High |

**Action Items (Tier 1):**
- [ ] Delete `ButtonCustom.tsx` (unused; tests pass with Factory Button)
- [ ] Delete `HeadingCustom.tsx` (unused; all instances using Factory)
- [ ] Add `icon` prop to Factory `<Input>` (2 hours + testing)
- [ ] Keep `FormFieldWrapper.tsx` (app-specific layout, not generic)

---

## Tier 2: Layout & Containers

| Component | Path | Purpose | App-Specific? | Recommendation |
|-----------|------|---------|---|---|
| `<PageLayout>` | `src/layouts/PageLayout.tsx` | Top nav + main + footer | 🟢 No; generic page structure | **Move to Factory** |
| `<DashboardLayout>` | `src/layouts/DashboardLayout.tsx` | Sidebar + main area | 🔴 Yes; creator dashboard unique | Keep in app |
| `<CardContainer>` | `src/components/CardContainer.tsx` | Styled div with shadow/border | 🟢 No; generic card layout | **Move to Factory** |
| `<GridContainer>` | `src/components/GridContainer.tsx` | Responsive 1–4 cols grid | 🟢 No; reusable layout helper | **Move to Factory** |
| `<ModalWrapper>` | `src/components/ModalWrapper.tsx` | Modal base (header + close + content) | 🟢 No; generic pattern | **Move to Factory** |

**Action Items (Tier 2):**
- [ ] Extract `PageLayout` to Factory (1 week + testing)
- [ ] Extract `CardContainer` to Factory (3 hours)
- [ ] Extract `GridContainer` to Factory (4 hours)
- [ ] Extract `ModalWrapper` to Factory as `<Dialog>` (5 hours)
- [ ] Keep `DashboardLayout` app-specific

---

## Tier 3: Forms & Input Components

| Component | Path | Used By | Factory Equivalent? | Recommendation |
|-----------|------|---------|---|---|
| `<TextInput>` | `src/components/TextInput.tsx` | 20+ places | Factory `<Input>` | ⚠️ Duplicate; delete local |
| `<SelectDropdown>` | `src/components/SelectDropdown.tsx` | Category, tier, period filters | None (custom dropdown needed) | Keep app (custom styling) |
| `<DatePicker>` | `src/components/DatePicker.tsx` | Analytics date range | None (calendar widget) | Keep app (domain-specific) |
| `<FormField>` | `src/components/FormField.tsx` | Label + input + error + hint | Pattern; no single equivalent | **Move to Factory as pattern** |
| `<CheckboxGroup>` | `src/components/CheckboxGroup.tsx` | Multiple selections (not single) | Factory `<Checkbox>` | ⚠️ Partial duplicate; review |
| `<UploadInput>` | `src/components/UploadInput.tsx` | Video + avatar upload | Domain-specific (file handling) | Keep app |
| `<TagsInput>` | `src/components/TagsInput.tsx` | Video metadata tags | Domain-specific (video tags) | Keep app |
| `<CurrencyInput>` | `src/components/CurrencyInput.tsx` | Price input ($ formatting) | None | Keep app (payment-specific) |

**Action Items (Tier 3):**
- [ ] Delete local `TextInput` (use Factory Input)
- [ ] Extract `FormField` pattern to Factory (2 hours)
- [ ] Keep custom dropdowns (SelectDropdown, DatePicker)
- [ ] Keep domain-specific inputs (UploadInput, TagsInput, CurrencyInput)

---

## Tier 4: Journey-Specific Components (Video)

**These are domain-specific; stay in app.**

| Component | Journey | Lines of Code | Recommendation |
|-----------|---------|---|---|
| `<VideoCard>` | 1, 4 (Viewer) | 150 | Keep; video-specific |
| `<VideoPlayer>` | 1, 4 (Watch/PPV) | 600 | Keep; Cloudflare Stream wrapper |
| `<PlayerControls>` | 1, 4 (Watch/PPV) | 250 | Keep; video player controls |
| `<VideoFeed>` | 1 (Discover) | 180 | Keep; discovery-specific pagination |
| `<VideoFilters>` | 1 (Discover) | 120 | Keep; discovery filters |
| `<SubscribePrompt>` | 1 (Subscribe) | 140 | Keep; viewer-specific |
| `<VideoUploadZone>` | 5 (Upload) | 200 | Keep; upload-specific |
| `<MetadataForm>` | 5 (Metadata) | 280 | Keep; video metadata UI |
| `<TranscodeStatus>` | 5 (Transcode) | 160 | Keep; transcoding-specific |
| `<ThumbnailSelector>` | 5 (Upload) | 130 | Keep; video UI |

**Total:** 10 components, 2,210 LOC → Keep all (core to videoking)

---

## Tier 5: Journey-Specific Components (Creator Onboarding)

**Domain-specific; stay in app.**

| Component | Journey | Lines of Code | Recommendation |
|-----------|---------|---|---|
| `<CreatorSignupForm>` | 2 (Signup) | 320 | Keep; multi-step form complex |
| `<ProfilePhotoUpload>` | 2 (Profile) | 180 | Keep; avatar-specific UI |
| `<StripeConnectButton>` | 2, 7 (Stripe) | 95 | Keep; payment integration |
| `<CreatorNameInput>` | 2 (Name) | 55 | Consider consolidating |
| ...and 8 more | 2, 3, 5–7 | ~1,200 LOC | Keep all |

**Total:** 12 components → Keep all (creator onboarding flows)

---

## Tier 6: Journey-Specific Components (Payment)

**Domain-specific; stay in app.**

| Component | Journey | Notes | Recommendation |
|-----------|---------|-------|---|
| `<TierCard>` | 3, 6 (Tiers) | Plan display + select | Keep |
| `<SubscriptionCheckout>` | 3 (Checkout) | Tier + payment form | Keep |
| `<BillingPeriodToggle>` | 3 (Billing) | Annual/monthly | Keep |
| `<PaymentForm>` | 3, 4 (Payment) | Card form (Stripe) | Keep |
| `<PaywallOverlay>` | 4 (PPV) | "Unlock for $$" display | Keep |
| `<UnlockButton>` | 4 (Unlock) | Purchase action | Keep |
| `<ConfirmationModal>` | 3, 4 (Confirm) | Order confirmation | Keep |
| `<CouponInput>` | 3 (Discount) | Promo code entry | Keep |

**Total:** 8 components → Keep all (tightly coupled to payment flows)

---

## Tier 7: Journey-Specific Components (Dashboard)

**Creator admin; stay in app**

| Component | Path | Purpose | User | Recommendation |
|-----------|------|---------|------|---|
| `<DashboardLayout>` | `src/layouts/` | Sidebar + main | Creator | Keep (creator-specific) |
| `<EarningsCard>` | `src/dashboard/` | Monthly earnings summary | Creator | Keep (creator KPI) |
| `<EarningsChart>` | `src/dashboard/` | Line/bar earnings trend | Creator | Keep (charting) |
| `<SubscribersList>` | `src/dashboard/` | Subscriber table | Creator | Keep (creator data) |
| `<AnalyticsPanel>` | `src/dashboard/` | Views, watch time | Creator | Keep (analytics) |
| `<TimeRangeSelector>` | `src/components/` | Date picker for filtering | Creator | Keep (domain) |
| `<ExportButton>` | `src/components/` | CSV/JSON export | Creator | Keep (creator feature) |

**Total:** 7 components → Keep all (creator dashboard)

---

## Tier 8: Utilities & Helpers

| Component | Purpose | Reusable? | Recommendation | Priority |
|-----------|---------|---|---|----------|
| `<Spinner>` | Loading indicator | ✅ Yes | **Move to Factory** | High |
| `<Toast>` | Temporary notification | ✅ Yes | **Move to Factory** | High |
| `<Dropdown>` | Custom select | ⚠️ Partial (see SelectDropdown) | Keep (custom styling) | Medium |
| `<Tooltip>` | Hover hint | ✅ Yes | **Move to Factory** | Medium |
| `<Skeleton>` | Loading placeholder | ✅ Yes | Move to Factory (if not already) | Medium |
| `<Pagination>` | Page navigation | ✅ Yes | **Move to Factory** | Low |
| `<Breadcrumb>` | Navigation hierarchy | ✅ Yes | **Move to Factory** | Low |
| `<Tabs>` | Tab navigation | ✅ Yes | Move to Factory (if not already) | Low |

**Action Items (Tier 8):**
- [ ] Move `<Spinner>` to Factory (2 hours)
- [ ] Move `<Toast>` to Factory (3 hours + testing)
- [ ] Move `<Tooltip>` to Factory (3 hours)
- [ ] Move `<Pagination>` to Factory (1 hour)
- [ ] Move `<Breadcrumb>` to Factory (1 hour)
- [ ] Keep custom dropdowns, date pickers, calendar widgets in app

---

## Consolidation Plan (3-Month Roadmap)

### Phase 1: Delete Duplicates (Week 1)
- [ ] Remove `ButtonCustom.tsx` (unused, tests pass)
- [ ] Remove `HeadingCustom.tsx` (unused)
- [ ] Delete `<TextInput>` local copy (replace with Factory)
- **Effort:** 2 hours

### Phase 2: Extract to Factory (Weeks 2–3)
- [ ] `<FormField>` pattern (Label + Input + Error + Hint) — 2 hours
- [ ] `<Spinner>` loader — 1 hour
- [ ] `<Toast>` notifications — 3 hours
- [ ] `<PageLayout>` container — 1 hour
- [ ] `<CardContainer>` layout — 1 hour
- [ ] `<GridContainer>` layout — 1 hour
- [ ] `<ModalWrapper>` / `<Dialog>` — 2 hours
- **Effort:** 11 hours

### Phase 3: Adopt Factory Components (Weeks 4–5)
- [ ] Update all form fields to use Factory `<FormField>` — 4 hours
- [ ] Replace all spinners with Factory `<Spinner>` — 2 hours
- [ ] Replace toasts with Factory `<Toast>` — 2 hours
- [ ] Update page layout to use Factory `<PageLayout>` — 1 hour
- [ ] Test accessibility + keyboard navigation — 3 hours
- **Effort:** 12 hours

### Phase 4: Consolidate & Document (Weeks 6–8)
- [ ] Delete old local components (already replaced) — 1 hour
- [ ] Run component audit again → measure 50 target — 2 hours
- [ ] Document in component inventory — 1 hour
- [ ] Create migration guide for other apps — 2 hours
- **Effort:** 6 hours

**Total Effort:** 31 hours (2 engineers × 4 weeks part-time)

---

## Target State (After Consolidation)

| Category | Current | After Consolidation | Reduction |
|----------|---------|-------|----------|
| Atoms (Primitives) | 12 | 8 (Factory-owned) | 33% ↓ |
| Layout/Containers | 5 | 1 (DashboardLayout only) | 80% ↓ |
| Forms | 8 | 4 (keep domain-specific) | 50% ↓ |
| Journey (Video) | 10 | 10 (domain-specific) | — |
| Journey (Creator) | 12 | 12 (domain-specific) | — |
| Journey (Payment) | 8 | 8 (domain-specific) | — |
| Journey (Dashboard) | 7 | 7 (domain-specific) | — |
| Utilities | 8 | 2 (keep custom experiences) | 75% ↓ |
| **TOTAL** | **70** | **52** | **26% ↓** |

**Goal: ~50 components (from 70; eliminate 20 duplicates/generics)**

---

## Success Criteria

✅ **Target met when:**
- [ ] Duplicates removed (ButtonCustom, HeadingCustom, TextInput)
- [ ] 8 components moved to Factory (Spinner, Toast, FormField, etc.)
- [ ] Component count: 50–55 (down from 70)
- [ ] All components WCAG 2.2 AA compliant
- [ ] Zero redundancy between Factory + app
- [ ] Team trained on new component library

---

## Appendix: Component File Locations

**Factory-Owned (after consolidation):**
```
packages/design-system/
├── src/components/
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Heading.tsx
│   ├── Body.tsx
│   ├── Label.tsx
│   ├── Alert.tsx
│   ├── Badge.tsx
│   ├── Hint.tsx
│   ├── Spinner.tsx ← NEW
│   ├── Toast.tsx ← NEW
│   ├── Tooltip.tsx ← NEW
│   ├── Pagination.tsx ← NEW
│   ├── Breadcrumb.tsx ← NEW
│   └── Dialog.tsx ← NEW (ModalWrapper)
├── src/patterns/
│   ├── FormField.tsx ← NEW
│   ├── ErrorLayout.tsx
│   ├── LoadingState.tsx
│   └── EmptyState.tsx
└── src/layouts/
    └── PageLayout.tsx ← NEW
```

**Videoking-Owned (core domain):**
```
apps/admin-studio/src/components/
├── video/
│   ├── VideoCard.tsx
│   ├── VideoPlayer.tsx
│   ├── PlayerControls.tsx
│   ├── VideoFeed.tsx
│   ├── VideoFilters.tsx
│   └── SubscribePrompt.tsx
├── forms/
│   ├── CreatorSignupForm.tsx
│   ├── MetadataForm.tsx
│   ├── PaymentForm.tsx
│   └── ...
├── dashboard/
│   ├── DashboardLayout.tsx
│   ├── EarningsChart.tsx
│   ├── AnalyticsPanel.tsx
│   └── ...
└── custom/
    ├── SelectDropdown.tsx (keep; custom styling)
    ├── DatePicker.tsx (keep; no generic exists)
    └── UploadInput.tsx (keep; specialized)
```

---

**Audit Completed:** April 28, 2026  
**Consolidation Target:** June 30, 2026  
**Next Audit:** July 31, 2026
