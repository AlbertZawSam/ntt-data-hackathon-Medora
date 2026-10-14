---
applyTo: "app/**,src/components/**,src/ui/**,src/i18n/**"
---
# Screens, strings and UI

- Every user-facing string comes from `src/i18n/en.json` and `src/i18n/th.json` through `t()`. Add both languages in the same change.
- Stored text that people in either language read (activity log, agent trace, reasons) is saved as `{ en, th }`.
- Screens use `src/services/` and app state; never import AWS SDKs or call AppSync directly from a screen.
- Brand: green #0B6E57, saffron #F2A33A, ink #0E2A23, Bai Jamjuree font; support light and dark mode.
- Accessibility: touch targets at least 44 points, labels on icon buttons, support for larger system text.
