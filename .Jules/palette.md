## 2024-05-19 - Added ARIA labels to icon-only buttons
**Learning:** Found that the app uses icon-only buttons for critical UI elements like the sidebar toggles, and range inputs for map layer opacities. Both lack accessible labels for screen readers.
**Action:** Added `aria-label` and `title` to the sidebar toggle buttons for both screen reader support and tooltip hover for sighted users. Added `aria-label` to the range inputs. Ensure any future icon buttons get similar treatment.
## 2024-05-19 - Improved visual feedback for GPS and Compass toggles
**Learning:** Found that long-running tasks like geolocation lacked visual loading feedback, leaving the user unsure if their click registered. Active toggle states (like compass on/off) were also not visually distinct.
**Action:** Added `isLocating` and `hasLocated` states to the GPS button to show a spinning icon/pulse effect while locating, and an active style when successful. Applied similar active styling to the Compass toggle.
## 2024-05-19 - Modernized GPS location icon
**Learning:** Default leaflet or custom opaque icons for live location can feel outdated. A modern transparent look with a blue dot, pulsing aura, and a semi-transparent directional cone significantly improves map UX by imitating standard mobile map apps.
**Action:** Replaced CSS styling for the `gps-compass` classes. Changed the ring to transparent, updated the dot to blue (`#007aff`), replaced the red needle with a CSS border-triangle cone (`rgba(0, 122, 255, 0.3)`), and refined the pulse animation.
## 2024-05-19 - Fixing stale closures in map tracking
**Learning:** Found that using React state inside continuous event listeners (like `watchPosition`) can lead to severe UX bugs, such as locking the user camera, because the closure captures outdated state. Also, destroying DOM elements (like map markers) repeatedly breaks continuous animations (like a compass needle).
**Action:** Used `useRef` for tracking state inside continuous callbacks (`hasCenteredRef`, `locationWatchIdRef`). Used Leaflet`s `.setLatLng()` to update positions seamlessly without destroying the markerDOM.
## 2024-06-28 - Consistent ARIA labels across layered inputs
**Learning:** Found an inconsistency in accessibility attributes for range sliders controlling map layers; 3 out of 4 layers had `aria-label` but the "Subcontratos" layer was missing it, leading to a confusing screen reader experience for that specific control.
**Action:** Added `aria-label="Opacidad de Subcontratos"` to the missing range input to ensure all map layer opacity controls have consistent accessibility descriptions.
