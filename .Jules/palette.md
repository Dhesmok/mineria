## 2024-05-19 - Added ARIA labels to icon-only buttons
**Learning:** Found that the app uses icon-only buttons for critical UI elements like the sidebar toggles, and range inputs for map layer opacities. Both lack accessible labels for screen readers.
**Action:** Added `aria-label` and `title` to the sidebar toggle buttons for both screen reader support and tooltip hover for sighted users. Added `aria-label` to the range inputs. Ensure any future icon buttons get similar treatment.
## 2024-05-19 - Improved visual feedback for GPS and Compass toggles
**Learning:** Found that long-running tasks like geolocation lacked visual loading feedback, leaving the user unsure if their click registered. Active toggle states (like compass on/off) were also not visually distinct.
**Action:** Added `isLocating` and `hasLocated` states to the GPS button to show a spinning icon/pulse effect while locating, and an active style when successful. Applied similar active styling to the Compass toggle.
