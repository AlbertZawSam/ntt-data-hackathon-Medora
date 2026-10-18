---
applyTo: "frontend/app/**,frontend/src/components/**,frontend/src/ui/**,frontend/src/i18n/**"
---
# Screens, strings and UI

- Every user-facing string comes from `frontend/src/i18n/en.json` and `frontend/src/i18n/th.json`. In components use the `useT()` hook from `frontend/src/state/AppProvider.tsx` so text updates as soon as the language changes. Add both languages in the same change.
- Stored text that people in either language read (hospital names, activity log, agent trace, reasons) is saved as `{ en, th }` and shown with `pick()`.
- Live screens show a freshness label on hospital status ("may be outdated" after 30 minutes), a plain empty state when a list is empty (with Call 1669 where care is involved), and a loading state while the first subscription result arrives.
- The patient app (Medora) and the hospital app (Medora for Hospitals) are separate route groups: never show hospital operations screens or data in the patient app.
- Screens use `frontend/src/services/` and app state; never import AWS SDKs or call AppSync directly from a screen.
- Brand: green #0B6E57, saffron #F2A33A, ink #0E2A23, Bai Jamjuree font; support light and dark mode.
- Accessibility: touch targets at least 44 points, labels on icon buttons, support for larger system text.
