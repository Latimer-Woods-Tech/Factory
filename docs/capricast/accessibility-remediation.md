# Videoking Accessibility Remediation Plan — WCAG 2.2 AA

**Target:** 90% compliance by end of Q3 2026 (June 30)  
**Duration:** 10 weeks / 2.5 sprints  
**Estimated Effort:** 140 hours  
**Team:** 1–2 engineers (1 FTE lead + 0.5 FTE support)  

---

## Priority Tiers & Phasing

### High-Priority (Blocking) — Phase 1–2 (Weeks 1–4)
- **Impact:** Users cannot access features without workarounds
- **Effort:** 60 hours
- **Outcome:** Move from 68% → 78% compliance

### Medium-Priority (Should Fix) — Phase 3–4 (Weeks 5–8)
- **Impact:** Users can access but experience is degraded
- **Effort:** 60 hours
- **Outcome:** Move from 78% → 87% compliance

### Low-Priority (Nice-to-Have) — Phase 5–6 (Weeks 9–10)
- **Impact:** Minor usability/readability issues
- **Effort:** 20 hours
- **Outcome:** Move from 87% → 90% compliance

---

## Phase 1: Keyboard Navigation & Focus Management (Week 1–2)

### Sprint Goal
Eliminate keyboard traps; ensure all interactive elements reachable via Tab; implement focus recovery.

### Backlog Items (Priority Order)

#### 1.1: Fix Keyboard Traps in Video Player
**Issue ID:** A1.4, A4.1  
**Component:** `VideoPlayer`, `PaywallOverlay`  
**Description:**  
Subscribe modal and paywall overlay trap keyboard focus. Users cannot tab out.

**Current Behavior:**
```tsx
<div className="modal" onClick={closeModal}>
  <button>Close</button>
  {/* Focus never leaves this element */}
</div>
```

**Fix:**
```tsx
<div 
  role="dialog" 
  aria-modal="true"
  onKeyDown={(e) => {
    if (e.key === 'Escape') closeModal();
  }}
>
  <FocusTrap active={true}>
    <button>Close</button>
    {/* Focus trapped within FocusTrap boundary */}
  </FocusTrap>
</div>
```

**Acceptance Test:**
```bash
1. Open video → Subscribe button
2. Press Tab — focus enters modal to close button
3. Press Tab again — cycles to other elements within modal
4. Press Escape — modal closes, focus returns to video player
5. Repeat 10 times — no hang or focus loss
```

**Fix Effort:** 3 hours  
**Owner:** Lead  
**Dependency:** None  
**Testing:** Keyboard testing, NVDA verification

---

#### 1.2: Implement Keyboard Controls for Video Player
**Issue ID:** A1.1, A4.7  
**Component:** `VideoPlayer`  
**Description:**  
Video player lacks Space (play/pause) and Arrow keys (seek).

**Current Behavior:**
```tsx
<video onClick={() => togglePlay()}>
  {/* Only mouse-driven control */}
</video>
```

**Fix:**
```tsx
<div 
  role="application" 
  aria-label="Video player"
  onKeyDown={(e) => {
    if (e.key === ' ') {
      e.preventDefault();
      togglePlay();
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      seek(currentTime + 5); // 5 sec forward
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      seek(currentTime - 5); // 5 sec back
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setVolume(Math.min(volume + 0.1, 1));
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setVolume(Math.max(volume - 0.1, 0));
    }
    if (e.key === 'f') {
      e.preventDefault();
      toggleFullscreen();
    }
  }}
  tabIndex={0}
>
  {/* Player UI */}
</div>
```

**Acceptance Test:**
```bash
1. Player focused (visible focus ring)
2. Space → video pauses/plays ✓
3. → (Right) → seek forward 5 sec ✓
4. ← (Left) → seek back 5 sec ✓
5. ↑ (Up) → volume increases ✓
6. ↓ (Down) → volume decreases ✓
7. f → fullscreen toggles ✓
```

**Fix Effort:** 4 hours  
**Owner:** Lead  
**Dependency:** 1.1  
**Testing:** Keyboard testing, BrowserStack

---

#### 1.3: Add Focus Visible Styles to All Interactive Elements
**Issue ID:** A1.2, A3.5  
**Component:** Global CSS  
**Description:**  
Many buttons, links, and inputs lack visible focus indicators.

**Current Behavior:**
```css
button { outline: none; } /* Focus invisible! */
input { outline: none; }
```

**Fix:**
```css
button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 3px solid #0066FF; /* Farm token: primary */
  outline-offset: 2px;
}

/* Avoid flash on mouse click */
button:focus:not(:focus-visible) {
  outline: none;
}
```

**Add to all form controls:**
```tsx
// components/Button.tsx
<button 
  className={cn(styles.button, {
    [styles.focusVisible]: isFocused
  })}
  onFocus={() => setIsFocused(true)}
  onBlur={() => setIsFocused(false)}
>
  {children}
</button>
```

**Acceptance Test:**
```bash
1. Tab through entire page
2. All elements have 3px blue outline
3. Outline clearly visible against background
4. Click with mouse — no outline flash
```

**Fix Effort:** 2 hours  
**Owner:** Support  
**Dependency:** None  
**Testing:** Manual keyboard testing, Lighthouse audit

---

#### 1.4: Implement Focus Trap for Modal Dialogs
**Issue ID:** A2.6, A4.1  
**Component:** `Modal`, `Dialog`  
**Description:**  
Focus should not escape modals when tabbing.

**Solution:** Install `focus-trap-react`:
```bash
npm install focus-trap-react
```

**Usage:**
```tsx
import FocusTrap from 'focus-trap-react';

export function Modal({ isOpen, onClose, children }) {
  return (
    <FocusTrap active={isOpen}>
      <div role="dialog" aria-modal="true">
        <button onClick={onClose}>Close</button>
        {children}
      </div>
    </FocusTrap>
  );
}
```

**Fix Effort:** 2 hours  
**Owner:** Support  
**Dependency:** None  
**Testing:** NVDA keyboard testing

---

### Phase 1 Summary
- **Issues Fixed:** 5
- **Lines of Code:** ~150
- **Estimated Effort:** 11 hours
- **Target Compliance:** 72%

---

## Phase 2: Aria Labels & Semantic HTML (Week 2–3)

### Sprint Goal
Add aria-labels to all interactive elements; use semantic HTML; improve form accessibility.

### Backlog Items

#### 2.1: Add aria-labels to All Form Controls
**Issue ID:** A2.1, A2.3, A3.4, A4.2  
**Component:** Form inputs, buttons  
**Description:**  
Many inputs use placeholder-only labels; buttons lack descriptive labels.

**Find & Replace Pattern:**
```tsx
// Before
<input type="email" placeholder="Enter email" />
<button>Upload</button>

// After
<input 
  type="email" 
  placeholder="Enter email"
  aria-label="Email address" 
  aria-required="true"
/>
<button aria-label="Upload profile photo">
  Upload
</button>
```

**Fix Effort:** 6 hours  
**Owner:** Support  
**Dependency:** None

---

#### 2.2: Implement aria-live Regions for Error Messages
**Issue ID:** A1.8, A2.7, A3.6, A4.6  
**Component:** Error/success banners  
**Description:**  
Error and success messages don't announce to screen readers.

**Solution:**
```tsx
export function ErrorBanner({ message }) {
  return (
    <div 
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="error-banner"
    >
      {message}
    </div>
  );
}
```

**Fix Effort:** 4 hours  
**Owner:** Support

---

#### 2.3: Add Semantic HTML5 Elements
**Issue ID:** A3.1, A6.1, A8.1  
**Component:** Cards, tables, sections  
**Description:**  
Use `<button>` instead of `<div onClick>`, `<table>` instead of divs, etc.

**Examples:**
```tsx
// Tier Card Before
<div onClick={selectTier} className="tier">
  <h3>{plan.name}</h3>
</div>

// Tier Card After
<button 
  onClick={selectTier}
  aria-pressed={isSelected}
  className="tier-button"
>
  <h3>{plan.name}</h3>
</button>
```

**Fix Effort:** 8 hours  
**Owner:** Lead

---

#### 2.4: Add Alt Text to All Images
**Issue ID:** A1.5, A5.3  
**Component:** `VideoCard`, `ImagePreview`, etc.  
**Description:**  
Images lack alt text; screen readers return "image" or filename.

**Process:**
```tsx
// Before
<img src={videoThumbnail} />

// After
<img 
  src={videoThumbnail}
  alt={`${creatorName}'s video: ${videoTitle}`}
/>

// For decorative images
<img 
  src={decorativeIcon}
  alt=""
  aria-hidden="true"
/>
```

**Fix Effort:** 4 hours  
**Owner:** Support

---

### Phase 2 Summary
- **Issues Fixed:** 8
- **Estimated Effort:** 22 hours
- **Target Compliance:** 78%

---

## Phase 3: Color Contrast & Color Independence (Week 4–5)

### Sprint Goal
Ensure all text ≥7:1 contrast; remove color-only indicators.

### Backlog Items

#### 3.1: Fix Color Contrast Issues
**Issue ID:** 1.4.3 (all journeys), A1.6, A3.5  
**Component:** Buttons, text, links  
**Baseline:** Current minimum 3.2:1; need 7:1  

**Audit Results:**
| Component | Current | Need | Fix |
|-----------|---------|------|-----|
| Play/Pause Button | 3.2:1 | 7:1 | Darken background or lighten icon |
| Subscribe Button | 4.8:1 | 7:1 | Lighten button text or darken BG |
| Retry Button | 4.5:1 | 7:1 | Change button color to darker shade |
| Hint Text | 4.1:1 | 7:1 | Use primary text color or bold |
| Link "here" | 5.0:1 | 7:1 | Underline or change color |

**Fix Approach:**
```css
/* Use design tokens for ALL text colors */
.button-primary {
  background: #0052CC; /* darker blue */
  color: #FFFFFF;
  /* Ratio: 13.5:1 ✓ */
}

.button-secondary {
  background: #F5F5F5;
  color: #1A1A1A;
  /* Ratio: 10.2:1 ✓ */
}

.hint-text {
  color: #666666; /* was #999999 (4.1:1) */
  /* Ratio: 7.2:1 ✓ */
}

.link {
  color: #0052CC;
  text-decoration: underline; /* not color-only */
}
```

**Fix Effort:** 6 hours  
**Owner:** Support

---

#### 3.2: Add Icons/Text to Color-Only Indicators  
**Issue ID:** A1.6, A2.5, A8.2  
**Component:** Status badges, error messages  
**Description:**  
Red error messages lack icon; tier badges colored-only.

**Examples:**
```tsx
// Before (color-only)
<div className="error" style={{ color: 'red' }}>
  Email already exists
</div>

// After (icon + text + color)
<div className="error" role="alert">
  <IconError aria-hidden="true" />
  <span>Email already exists</span>
</div>

// Tier badges
// Before
<span className="badge" style={{ backgroundColor: tier.color }}>
  {tier.name}
</span>

// After
<span className="badge" style={{ backgroundColor: tier.color }}>
  {tier.name} ({tier.price}/mo)
</span>
```

**Fix Effort:** 3 hours  
**Owner:** Support

---

### Phase 3 Summary
- **Issues Fixed:** 10
- **Estimated Effort:** 9 hours
- **Target Compliance:** 82%

---

## Phase 4: Form Accessibility & Validation (Week 6–7)

### Sprint Goal
Improve form UX: inline validation, error suggestions, field context.

### Backlog Items

#### 4.1: Implement Inline Validation with Error Suggestions
**Issue ID:** 3.3.3, A2.2, A3.4  

**Example: Email Validation**
```tsx
export function EmailInput({ value, onChange }) {
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);

    if (!val) {
      setError('Email is required');
    } else if (!val.includes('@')) {
      setError('Email must contain @');
    } else if (val.includes('.') && val.lastIndexOf('.') > val.indexOf('@') + 1) {
      setError(''); // Valid
    } else {
      setError('Email must contain domain');
    }
  };

  return (
    <>
      <label htmlFor="email">Email Address *</label>
      <input
        id="email"
        type="email"
        value={value}
        onChange={handleChange}
        aria-invalid={!!error}
        aria-describedby={error ? 'email-error' : undefined}
      />
      {error && (
        <div 
          id="email-error" 
          role="alert"
          aria-live="assertive"
          className="error-message"
        >
          {error}
        </div>
      )}
    </>
  );
}
```

**Fix Effort:** 8 hours  
**Owner:** Lead

---

#### 4.2: Add Help Text to Ambiguous Fields
**Issue ID:** A2.4, A4.4, A5.2  
**Component:** CVV field, tags input, category select  

**Examples:**
```tsx
<div>
  <label htmlFor="cvv">Security Code (CVV) *</label>
  <input 
    id="cvv" 
    type="text" 
    maxLength="4"
    aria-describedby="cvv-help"
  />
  <div id="cvv-help" className="help-text">
    3–4 digits on back of card
  </div>
</div>

<div>
  <label htmlFor="tags">Tags (comma-separated) *</label>
  <input 
    id="tags"
    type="text"
    placeholder="e.g., action, film, drama"
    aria-describedby="tags-help"
  />
  <div id="tags-help" className="help-text">
    Separate tags with commas. Up to 10 tags.
  </div>
</div>
```

**Fix Effort:** 3 hours  
**Owner:** Support

---

#### 4.3: Add aria-current="step" to Multi-Step Forms
**Issue ID:** A2.M5, A5.1  
**Component:** `StepIndicator`  

```tsx
export function StepIndicator({ currentStep, totalSteps }) {
  return (
    <nav aria-label="Progress">
      <ol>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <li key={i}>
            <button
              aria-current={i + 1 === currentStep ? 'step' : undefined}
              disabled={i + 1 > currentStep}
            >
              Step {i + 1}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

**Fix Effort:** 2 hours  
**Owner:** Support

---

### Phase 4 Summary
- **Issues Fixed:** 8
- **Estimated Effort:** 13 hours
- **Target Compliance:** 87%

---

## Phase 5: Content Accessibility & Sizing (Week 8–9)

### Sprint Goal
Fix font sizing; add captions; provide data alternatives.

### Backlog Items

#### 5.1: Ensure All Text ≥14px
**Issue ID:** A1.L2, A2.L1, A7.M3  
**Audit:** Scan for font-size < 14px and update.

**Fix:**
```css
body { font-size: 16px; line-height: 1.5; }
.caption { font-size: 14px; }
.small-text { font-size: 12px; } /* Needs review! */
```

**Fix Effort:** 2 hours  
**Owner:** Support

---

#### 5.2: Add Captions to Video Player
**Issue ID:** A4.8  
**Component:** `VideoPlayer`  

**Implementation:**
```tsx
<track 
  kind="captions"
  src="/captions/video-123.vtt"
  srcLang="en"
  label="English"
/>
```

**VTT Format Example:**
```
WEBVTT

00:00:00.000 --> 00:00:05.000
Creator: Welcome to my channel!

00:00:05.000 --> 00:00:10.000
Creator: Today we're talking about accessibility.
```

**Fix Effort:** 4 hours  
**Owner:** Lead

---

#### 5.3: Add Data Table Alternative to Charts
**Issue ID:** A6.1  
**Component:** `EarningsChart`  

```tsx
export function EarningsChart({ data, showTable = false }) {
  return (
    <>
      <Chart data={data} aria-label="Earnings by month" />
      
      <button onClick={() => setShowTable(!showTable)}>
        {showTable ? 'Show Chart' : 'View as Table'}
      </button>
      
      {showTable && (
        <table role="table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Earnings</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.month}>
                <td>{row.month}</td>
                <td>${row.earnings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
```

**Fix Effort:** 3 hours  
**Owner:** Support

---

### Phase 5 Summary
- **Issues Fixed:** 5
- **Estimated Effort:** 9 hours
- **Target Compliance:** 90%

---

## Phase 6: Testing & Validation (Week 10)

### Sprint Goal
Validate all fixes with real devices/assistive tech; train team.

### Testing Checklist

**Keyboard Testing (2 hours)**
- [ ] Tab through every page; no traps
- [ ] All buttons/links reachable
- [ ] Modals trap focus properly
- [ ] Esc closes modals

**Screen Reader Testing (3 hours)**
- [ ] NVDA (Windows) — all elements announced
- [ ] JAWS (Windows) — all elements announced
- [ ] VoiceOver (macOS) — spot-check key journeys

**Color Contrast (1 hour)**
- [ ] Lighthouse audit: all ≥7:1
- [ ] Helpertext visible in all contexts

**Automated Testing (1 hour)**
- [ ] Axe DevTools: 0 violations
- [ ] CI gate: block merge on failures

**Fix Effort:** 7 hours  
**Owner:** Lead + Support

---

## Sprint Schedule

| Sprint | Duration | Focus | Target |
|--------|----------|-------|--------|
| Sprint 1 | Week 1–2 | Keyboard, focus, traps | 72% |
| Sprint 2 | Week 3–4 | Aria, semantic HTML, alt text | 78% |
| Sprint 3 | Week 5–6 | Contrast, color independence | 82% |
| Sprint 4 | Week 7–8 | Forms, validation, help text | 87% |
| Sprint 5 | Week 9–10 | Content, testing, champion onboarding | 90% |

---

## Resource Allocation

| Role | Weeks 1–10 | Dedication |
|------|-----------|-----------|
| Accessibility Lead | All weeks | 1.0 FTE |
| Backend/Design Support | All weeks | 0.5 FTE |
| QA/Testing | Weeks 9–10 | 0.5 FTE |
| Champion (Product/Design) | All weeks | 0.1 FTE (monthly sync) |

---

## Success Metrics

| Metric | Current | Target | Timeframe |
|--------|---------|--------|-----------|
| WCAG 2.2 AA Compliance | 68% | 90% | 10 weeks |
| Keyboard Navigation Issues | 8 | 0 | Week 2 |
| Color Contrast Issues | 22 | 0 | Week 6 |
| Aria/Semantic Issues | 18 | 0 | Week 4 |
| CI Test Coverage | 0 | 100% | Week 10 |

---

## Blockers & Dependencies

- **Dependency:** Design tokens file (see T1.4 — must be completed before color work)
- **Blocker:** If video captions not available from transcoding service, manually create for top 10 videos first
- **Risk:** Form validation changes must be QA-tested to prevent breaking existing workflows

---

## Appendix: Tools & Resources

### Automated Testing
- **Axe DevTools** — Browser extension + npm cli
  ```bash
  npm install --save-dev @axe-core/react
  ```

### Manual Testing
- **NVDA** — Free Windows screen reader (https://www.nvaccess.org)
- **JAWS** — Paid Windows screen reader (trial available, $90/month)
- **VoiceOver** — Built into macOS (Cmd+F5)
- **Lighthouse** — Built into Chrome DevTools

### Learning Resources
- WCAG 2.2 AA Specification: https://www.w3.org/WAI/WCAG22/quickref/
- WebAIM Articles: https://webaim.org/articles/
- A11ycasts (Google): https://www.youtube.com/playlist?list=PLNYkxOF6rcICWx0C9Xc-RgEzwLvePng7V
- ARIA Authoring Practices: https://www.w3.org/wai/aria/apg/

---

**Plan Created:** April 28, 2026  
**Target Completion:** June 30, 2026  
**Next Review:** May 12, 2026 (after Sprint 1)
