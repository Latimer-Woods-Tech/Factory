# Videoking Design System Migration Plan

**Timeline:** 3 sprints (10 weeks, May–July 2026)  
**Goal:** Move from ~70 components → ~50 components; eliminate duplicates; adopt Factory tokens  
**Team:** 2 engineers (1 FTE lead, 0.5 FTE support)  
**Effort:** 45 hours total  

---

## Phase Overview

| Phase | Sprint | Duration | Focus | Outcome | Team |
|-------|--------|----------|-------|---------|------|
| **Phase 1** | W1–W2 | Audit & Delete | Remove duplicate components | -6 components | Lead 12h, Support 4h |
| **Phase 2** | W3–W4 | Extract to Factory | Build generics; move to factory Package | +8 Factory components | Lead 14h, Support 10h |
| **Phase 3** | W5–W8 | Adopt & Consolidate | App imports Factory; tests pass | -15 components (net) | Lead 8h, Support 10h |
| **Phase 4** | W9–W10 | Document & Train | Update guides; team training | Handbook complete | Lead 4h, Support 4h |

**Total Effort:** 67 hours (distributed over 10 weeks)

---

## Sprint W1–W2: Audit & Delete (Phase 1)

### Goals
1. Run component audit (done ✓)
2. Delete 4 confirmed duplicates
3. Consolidate tests
4. Establish baseline metrics

### Detailed Tasks

#### Task 1.1: Delete Duplicate Components (2 hours)
**Components to remove:**
- `ButtonCustom.tsx` (unused; tests pass with Factory)
- `HeadingCustom.tsx` (unused; tests pass with Factory)
- `TextInput.tsx` (duplicate of Factory `Input`)
- `CheckboxSingle.tsx` (partial duplicate of Factory `Checkbox`)

**Process:**
```bash
# For each component
1. Search codebase for references
   grep -r "ButtonCustom" apps/admin-studio/src/
   
2. If no references, delete
   rm src/components/ButtonCustom.tsx
   rm src/components/__tests__/ButtonCustom.test.tsx
   
3. If test references exist, consolidate tests into Factory
   # E.g., ButtonCustom tests → Factory Button tests
   
4. Update index.ts exports
   // Remove export of ButtonCustom
   
5. Commit
   git commit -m "refactor(components): remove ButtonCustom duplicate"
```

**Components per team member:**
- Lead: ButtonCustom, HeadingCustom (2 hours)
- Support: TextInput, CheckboxSingle (1 hour)

#### Task 1.2: Update Component Tests (1.5 hours)

For each component deleted, ensure Factory has equivalent coverage:
```bash
# ButtonCustom → Button
# Expected: Factory tests for Button (already ✓)
# If missing: Add Factory tests for Button variants

npm run test -- Button.test.ts
# Should have 90%+ coverage
```

**Checklist:**
- [ ] Factory Button tests: 90%+ coverage ✓
- [ ] Factory Input tests: 90%+ coverage ✓
- [ ] Factory Heading tests: 90%+ coverage ✓
- [ ] All imports updated (no dead references)

#### Task 1.3: Establish Baseline Metrics (1 hour)

Document current state:
```bash
# Component count
find apps/admin-studio/src/components -name "*.tsx" | wc -l
# Expected: ~60 components

# Lines of code per category
find apps/admin-studio/src/components -name "*.tsx" | xargs wc -l | tail -1
# Expected: ~5,000 LOC in components

# Test coverage
npm run test -- --coverage
# Expected: 75% lines, 68% branches
```

Record in:
- `docs/videoking/component-inventory.md` (already done ✓)
- `docs/dashboards/component-metrics.md` (new) — **Create this**

**Template for metrics file:**
```markdown
# Component Metrics — May 2026

## Weekly Snapshot

| Metric | W1 Baseline | W2 | W3 | ... | W10 Target |
|--------|-------------|-----|-----|-----|-----------|
| **Component Count** | 70 | 64 | 60 | ... | 50 |
| **Factory Adopted** | 10 | 10 | 15 | ... | 25 |
| **Lines of Code** | 5200 | 5100 | 4800 | ... | 3800 |
| **Test Coverage %** | 75% | 76% | 78% | ... | 85% |
| **A11y Compliance** | 68% | 70% | 75% | ... | 90% |

## Phase 1 Exit Criteria
- [x] Duplicates removed (4 components)
- [x] Tests consolidated
- [x] Baseline metrics recorded
- [ ] Team notified (Slack #design-system)
```

#### Task 1.4: Team Communication (0.5 hours)

**Slack message:**
```
🎉 Phase 1: Component Cleanup Complete

We removed 4 duplicate components:
- ❌ ButtonCustom (use @latimer-woods-tech/design-system Button)
- ❌ HeadingCustom (use Factory Heading)
- ❌ TextInput (use Factory Input)
- ❌ CheckboxSingle (use Factory Checkbox)

✅ All tests updated. No breaking changes.

📊 New baseline: 70 → 64 components

Next: Extract generics to Factory (W3–W4)
```

**Assigned:** Support (0.5h)

### Phase 1 Summary
- **Components removed:** 4
- **New component count:** 66 (70 → 66)
- **Effort:** 5 hours (Lead 2.5h + Support 2.5h)
- **Status:** On track ✓

---

## Sprint W3–W4: Extract to Factory (Phase 2)

### Goals
1. Generalize 8 components
2. Publish to @latimer-woods-tech/design-system v0.1.1+
3. Ensure accessibility compliance (WCAG 2.2 AA)
4. Add comprehensive tests (90%+ coverage)

### Components to Extract

#### 2.1: FormField Pattern (2 hours)

**What:** Wrapper combining Label + Input + Error + Hint  
**Location:** `src/components/FormField.tsx`→ `packages/design-system/src/patterns/FormField.tsx`

**Before (App-specific):**
```tsx
// apps/admin-studio/src/components/FormField.tsx
export function FormField({
  label,
  input,
  error,
  hint,
  required,
}) {
  return (
    <div className="form-field">
      <label>{label} {required && '*'}</label>
      <input {...input} />
      {error && <div className="error">{error}</div>}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
```

**After (Factory):**
```tsx
// packages/design-system/src/patterns/FormField.tsx
import { Label, Input, Hint } from '../components';

export interface FormFieldProps {
  label: string;
  input: React.InputHTMLAttributes<HTMLInputElement>;
  error?: string;
  hint?: string;
  required?: boolean;
}

/**
 * Accessible form field pattern.
 * Combines Label + Input + Error + Hint with proper ARIA.
 */
export function FormField({
  label,
  input,
  error,
  hint,
  required,
}: FormFieldProps) {
  const fieldId = input.id || `field-${Math.random()}`;
  const errorId = error ? `${fieldId}-error` : undefined;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  return (
    <div className="form-field">
      <Label htmlFor={fieldId} required={required}>
        {label}
      </Label>
      <Input
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
        {...input}
      />
      {error && (
        <div id={errorId} role="alert" className="error">
          {error}
        </div>
      )}
      {hint && (
        <div id={hintId} className="hint">
          {hint}
        </div>
      )}
    </div>
  );
}
```

**Tasks:**
1. [ ] Create `packages/design-system/src/patterns/FormField.tsx` — Lead (1.5h)
2. [ ] Add tests (90% coverage) — Lead (0.5h)
3. [ ] Export from `packages/design-system/src/index.ts`
4. [ ] Update app to import from Factory (done in Phase 3)

---

#### 2.2: Spinner Component (1.5 hours)

**What:** Loading spinner with accessible label  
**Extract from:** `src/components/Spinner.tsx`

**Implementation:**
```tsx
// packages/design-system/src/components/Spinner.tsx
export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;  // aria-label for screen readers
  color?: string;  // CSS color override
}

export function Spinner({
  size = 'md',
  label = 'Loading...',
  color = colors.primary,
}: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`spinner spinner-${size}`}
      style={{ '--spinner-color': color } as React.CSSProperties}
    >
      <svg className="spinner-icon" viewBox="0 0 50 50">
        <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
    </div>
  );
}
```

**Tasks:**
1. [ ] Create component — Lead (0.5h)
2. [ ] Add tests — Support (0.5h)
3. [ ] Add CSS animations — Lead (0.5h)

---

#### 2.3: Toast Notifications (2 hours)

**What:** Temporary notification component with auto-dismiss  
**Extract from:** `src/components/Toast.tsx`

**Implementation:**
```tsx
// packages/design-system/src/components/Toast.tsx
import { useEffect, useState } from 'react';

export interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;  // ms; 0 = persistent
  onClose?: () => void;
}

export function Toast({
  message,
  type,
  duration = 5000,
  onClose,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (duration === 0) return; // Never auto-dismiss
    
    const timer = setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!isVisible) return null;

  const bgColor = {
    success: colors.success,
    error: colors.danger,
    warning: colors.warning,
    info: colors.info,
  }[type];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`toast toast-${type}`}
      style={{ backgroundColor: bgColor }}
    >
      {message}
      <button onClick={() => setIsVisible(false)} aria-label="Close notification">
        ×
      </button>
    </div>
  );
}
```

**Tasks:**
1. [ ] Create component — Lead (1h)
2. [ ] Add tests (auto-dismiss, keyboard close) — Support (0.5h)
3. [ ] Test accessibility — Support (0.5h)

---

#### 2.4–2.8: Other Components (3 hours total)

Extract these simpler components in parallel:

| Component | Effort | Owner |
|-----------|--------|-------|
| `<Tooltip>` | 1h | Support |
| `<Pagination>` | 1h | Lead |
| `<Breadcrumb>` | 0.5h | Support |
| `<Skeleton>` | 0.5h | Support |
| `<PageLayout>` | 1h | Lead |

### Phase 2 Tasks

1. **Week 3:**
   - [ ] Create all 8 new Factory components — Lead (6h), Support (4h)
   - [ ] Add JSDoc + storybook stories — Lead (2h)
   - [ ] Write tests (90% coverage each) — Support (4h)

2. **Week 4:**
   - [ ] Run accessibility audit (Axe) — Support (2h)
   - [ ] Fix any WCAG 2.2 AA issues — Lead (3h)
   - [ ] Bump Factory version to v0.2.0 — Lead (1h)
   - [ ] Publish to GitHub Packages — Lead (0.5h)
   - [ ] Update CHANGELOG — Support (0.5h)

### Phase 2 Summary
- **Components created:** 8
- **Tests added:** 90%+ coverage each
- **Accessibility:** WCAG 2.2 AA verified
- **Effort:** 24 hours (Lead 14h + Support 10h)
- **Deliverable:** @latimer-woods-tech/design-system v0.2.0

---

## Sprint W5–W8: Adopt & Consolidate (Phase 3)

### Goals
1. Update videoking to import 8 new components from Factory
2. Run full test suite (no regressions)
3. Consolidate duplicates in app
4. Reduce component count by 15 (70 → 55 target)

### Detailed Migration Steps

#### Step 3.1: Update Imports (4 hours)

**Target files:**
- `src/components/index.ts` (export map)
- All component usage sites

**Before:**
```tsx
import { FormField } from '../components/FormField';
import { Spinner } from '../components/Spinner';
import { Toast } from '../components/Toast';
```

**After:**
```tsx
// Import Factory versions
import { FormField, Spinner, Toast } from '@latimer-woods-tech/design-system';

// Keep app-specific
import { VideoPlayer } from '../components/video/VideoPlayer';
import { EarningsChart } from '../dashboard/EarningsChart';
```

**Process:**
```bash
# Find all imports of components being migrated
grep -r "from '../components/FormField'" apps/admin-studio/src/

# Update each file
# Update src/components/index.ts to export from Factory

# Verify no local duplicates remain
# (should be 0 FormField.tsx files in app/components)
```

**Assigned:** Support (3h) + Lead (1h review)

#### Step 3.2: Delete Local Component Files (1 hour)

```bash
# After imports updated, delete local files
rm src/components/FormField.tsx
rm src/components/Spinner.tsx
rm src/components/Toast.tsx
rm src/components/Tooltip.tsx
rm src/components/Pagination.tsx
rm src/components/Breadcrumb.tsx
rm src/components/Skeleton.tsx
rm src/layouts/PageLayout.tsx

# Verify deletion
ls src/components/ | grep -E "FormField|Spinner|Toast"
# Expected: no output (all deleted)
```

**Assigned:** Lead (check) + Support (0.5h execute)

#### Step 3.3: Run Tests (2 hours)

```bash
# Run full suite
npm test

# Expected passing:
# - All existing video/form/dashboard tests (no changes)
# - Tests now use Factory imports (should still pass)
# - No regressions

# Check coverage
npm test -- --coverage

# Expected: 75%+ (already at baseline)
```

**Handle failures:**
- If import fails: Check node_modules/@latimer-woods-tech/design-system exists
- If test fails: Verify Factory component API matches app usage
- If coverage drops: Add tests for new Factory integrations

**Assigned:** Lead (test analysis) + Support (execute)

#### Step 3.4: Update Documentation (1 hour)

```markdown
# apps/admin-studio/MIGRATION.md

## Component Migration (May–July 2026)

### Adopted Factory Components
- ✅ FormField pattern (removed local copy)
- ✅ Spinner (removed local copy)
- ✅ Toast notifications (removed local copy)
- ✅ Tooltip (removed local copy)
- ✅ Pagination (removed local copy)
- ✅ Breadcrumb (removed local copy)
- ✅ Skeleton (removed local copy)
- ✅ PageLayout (removed local copy)

### Local Components (Videoking-Specific)
- VideoPlayer
- VideoCard
- MetadataForm
- PaymentForm
- EarningsChart
- DashboardLayout
- ...and 26 others

### Breaking Changes
None. All Factory components drop-in replacements for local versions.

### Migration Guide
See: https://Factory-docs/design-system-component-guide.md
```

**Assigned:** Support (0.5h) + Lead (0.5h review)

#### Step 3.5: Update Component Audit (1 hour)

Re-evaluate component inventory:

```markdown
# Component Inventory (Updated Week 5)

| Category | Before | After | Change |
|----------|--------|-------|--------|
| Atoms | 12 | 8 | -4 (Factory) |
| Layout | 5 | 1 | -4 (deleted) |
| Forms | 8 | 4 | -4 (Factory) |
| Journey (Video) | 10 | 10 | — |
| Journey (Creator) | 12 | 12 | — |
| Journey (Payment) | 8 | 8 | — |
| Journey (Dashboard) | 7 | 7 | — |
| Utilities | 8 | 0 | -8 (Factory) |
| **TOTAL** | **70** | **50** | **-20** ✓ |
```

**Metrics:**
- Component count: 70 → 50 (28% reduction)
- Lines of code: 5,200 → ~3,800 (27% reduction)
- Duplication: eliminated ✓
- Test coverage: maintained 75%+

**Assigned:** Support (1h)

### Phase 3 Summary
- **Components migrated:** 8
- **Duplicates removed:** 8
- **New component count:** 52 (target: 50)
- **Effort:** 9 hours (Lead 4h + Support 5h)
- **Test status:** All passing, no regressions ✓

---

## Sprint W9–W10: Documentation & Training (Phase 4)

### Goals
1. Document migration process
2. Train team on new component library
3. Lock design system scope for Q2
4. Plan Q3 roadmap (admin-studio migration)

### Detailed Tasks

#### Task 4.1: Update Component Guides (1 hour)

- [ ] Update [design-system-component-guide.md](../../docs/design-system-component-guide.md)
  - Add new 8 components to "Tier 2: Patterns"
  - Update usage examples
  - Link to Factory storybook

- [ ] Create migration guide (`docs/COMPONENT_MIGRATION_GUIDE.md`)
  - Before/after code examples
  - How to import from Factory
  -Common issues + fixes

**Assigned:** Support (1h)

#### Task 4.2: Team Training Session (1.5 hours)

**Format:** 1-hour workshop + 30-min Q&A

**Agenda:**
1. **Why design systems matter** (10 min)
   - Reduce duplication
   - Consistency across apps
   - Faster development

2. **Component hierarchy** (10 min)
   - Tier 1 (Primitives) → always use
   - Tier 2 (Patterns) → use when applicable
   - Tier 3 (Utilities) → optional
   - Tier 4 (App-specific) → build locally

3. **Decision tree** (10 min)
   - When to use Factory
   - When to build locally
   - How to propose new components

4. **Live demo** (10 min)
   - Show FormField pattern
   - Show how to compose components
   - Show anti-patterns (mistakes to avoid)

5. **Q&A** (20 min)
   - Address concerns
   - Discuss upcoming admin-studio migration

**Recording:** Saved to wiki for future onboarding

**Assigned:** Lead (1h) + Support (0.5h setup)

#### Task 4.3: Create Component Contribution Guide (1 hour)

New file: `docs/COMPONENT_CONTRIBUTION_GUIDE.md`

**Contents:**
- Checklist for adding to Factory
- PR template for component changes
- Quality gates (tests, accessibility, docs)
- Versioning strategy (semver)
- Deprecation process

**Assigned:** Support (1h)

#### Task 4.4: Update Dashboards (0.5 hours)

Update metrics:
- Component count: 70 → 50 ✓
- Factory adoption: 10 → 28 components
- Accessibility: 68% → 75%+ (estimate after A11y fixes)

**Assigned:** Support (0.5h)

### Phase 4 Summary
- **Documentation:** 3 new guides
- **Training:** 1 workshop (recorded)
- **Team alignment:** Complete ✓
- **Effort:** 4 hours (Lead 1.5h + Support 2.5h)

---

## Timeline & Dependencies

### Critical Path

```
W1–W2 (Phase 1): Delete duplicates
  ↓ (dependency: baseline metrics)
W3–W4 (Phase 2): Extract to Factory
  ↓ (dependency: v0.2.0 published)
W5–W8 (Phase 3): Adopt + consolidate
  ↓ (dependency: all imports updated, tests pass)
W9–W10 (Phase 4): Document + train
  ↓ (end state: 50 components, 100% Factory adoption)
```

### Blockers & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|-----------|
| Factory package publish fails | Can't proceed W5 | Low | Dry-run publish W3 |
| Test failures on Factory import | Delays W5 | Medium | Run tests early W4 |
| Import conflicts with app code | Breaking change | Low | Use namespace imports (mcp_*) |
| Team resistance to change | Low adoption | Low | Training + examples critical |

### Rollback Plan

If Phase 3 encounters critical issues:

1. **Revert imports:**
   ```bash
   git revert <commit-hash>
   npm test  # Verify
   ```

2. **Keep local components temporary:**
   ```bash
   # Keep FormField.tsx locally until fixed
   # Mark with // TODO: remove after Factory v0.2.1
   ```

3. **Document issue:**
   - Create GitHub issue: "[BUG] Component name fails in videoking"
   - Link to PRs, test failures
   - Assign to design system working group

4. **Retry in next sprint:**
   - Fix Factory component
   - Re-publish v0.2.1
   - Retry Phase 3 migration

---

## Success Criteria

### Phase 1: ✅ Delete Duplicates
- [ ] 4 components removed (ButtonCustom, etc.)
- [ ] All tests updated
- [ ] Baseline metrics recorded
- [ ] No functionality lost

### Phase 2: ✅ Extract to Factory
- [ ] 8 new components in Factory
- [ ] 90%+ test coverage each
- [ ] WCAG 2.2 AA verified
- [ ] v0.2.0 published

### Phase 3: ✅ Adopt & Consolidate
- [ ] All imports updated
- [ ] 8 local components deleted
- [ ] Tests passing (no regressions)
- [ ] Component count: 50 (down from 70)

### Phase 4: ✅ Document & Train
- [ ] Guides created + published
- [ ] Team training complete
- [ ] Dashboard updated
- [ ] Q3 roadmap planned

**Overall Success:** Design system adoption reduces videoking's component footprint by 28% while enabling faster future development for admin-studio and new apps.

---

## Post-Migration: Admin-Studio & Future Apps

### Next Target: admin-studio App

**Estimated effort:** 3 weeks (after videoking complete)  
**Expected reduction:** 40 → 35 components (13%)  
**Adoption:** 25 components from Factory  

### Q3 Roadmap

1. **June:** admin-studio migration (same process as videoking bonus)
2. **July:** Plan Q4 work:
   - New shared components (Carousel, Accordion, etc.)
   - Theme customization system
   - Figma design kit updates

---

**Plan Created:** April 28, 2026  
**Plan Owner:** Design System Lead  
**Next Review:** May 12, 2026 (end of Phase 1)  
**Questions:** Ask in #design-system Slack
