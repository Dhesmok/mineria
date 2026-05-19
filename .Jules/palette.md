## 2024-05-19 - Added ARIA labels to icon-only buttons
**Learning:** Found that the app uses icon-only buttons for critical UI elements like the sidebar toggles, and range inputs for map layer opacities. Both lack accessible labels for screen readers.
**Action:** Added `aria-label` and `title` to the sidebar toggle buttons for both screen reader support and tooltip hover for sighted users. Added `aria-label` to the range inputs. Ensure any future icon buttons get similar treatment.
