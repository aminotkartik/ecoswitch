# EcoSwitch — Intelligent Classroom Energy Management

**Power the classroom. Not the emptiness.**

A product-style landing page for **EcoSwitch**, a concept for an intelligent classroom
energy-management system that detects occupancy, understands inactivity and manages power
zone by zone.

Open `index.html` directly in a browser — no build step, no dependencies, no server required.

---

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Semantic HTML5 structure — navigation, hero, 13 content sections, footer |
| `style.css` | Complete design system (CSS variables, tokens, layout, animation, responsive rules) |
| `script.js` | Vanilla JS: navigation, scroll reveal, counters, zone state engine, timers, simulations |
| `pdf.pdf` | Placeholder technical-documentation file linked from every "Technical PDF" button |

Built with **HTML, CSS and vanilla JavaScript only** — no frameworks, no libraries, no tooling.

## The page

1. **Hero** — live monitoring panel with a four-zone classroom schematic, animated beam pulses, occupancy labels, idle timers and floating telemetry chips.
2. **Capability strip** — the six things the system does.
3. **01 The problem** — split layout, animated statistics, a "traditional room" visual.
4. **02 The system** — capability cards and the `SENSE → INTERPRET → TIMER → WARN → CONTROL` process.
5. **03 How the classroom is divided** — large interactive plan: hover, tap or keyboard-focus a zone to inspect occupancy, idle time, beam state and power state.
6. **04 Sensor technology** — balanced comparison of mmWave presence sensing and IR/laser beam-break.
7. **05 The 15-minute logic** — animated countdown ring and timeline (0:00 → 5:00 → 10:00 → 15:00).
8. **06 System architecture** — animated decision chain plus the future expansion layer.
9. **07 Sensor data interpretation** — signal pipeline and a live four-zone readout.
10. **08 Hardware** — component roles: ESP32-S3, S3KM1110 mmWave sensor, IR emitter, photodiode/phototransistor receiver, PIR, buzzer, OLED, relay module.
11. **09 Why zoning matters** — traditional vs. EcoSwitch control behaviour, animated side by side.
12. **10 Safety & deployment** — mains safety, life-safety circuits, qualified installation, calibration.
13. **11 Roadmap** — V1 → V4 and planned features.
14. **12/13 Documentation & closing CTAs** — both linked to `pdf.pdf` with `target="_blank"`.

## Simulation notes

All telemetry on the page is **simulated** for demonstration. The numbers shown (zone
occupancy, idle timers, relay counts) come from a small JavaScript state engine, and the
design parameters (6 potential zones, 10-minute warning, 15-minute power control) are stated
as design parameters — never as measured savings.

`prefers-reduced-motion` is respected: animations are stopped and every simulation slows
down while remaining functional.

## Customising

Colors, radii, spacing, typography and effects are defined once as CSS custom properties at
the top of `style.css`:

```css
:root {
  --bg: #06080a;     /* backgrounds        */
  --green: #35e08a;  /* energy accent      */
  --blue: #4aa3ff;   /* technology accent  */
  --amber: #f5a524;  /* warning accent     */
  --text: #eef2f5;
}
```

## Documentation file

`pdf.pdf` is a generated placeholder so the documentation links resolve. Replace it with the
real engineering report using the same file name — no markup changes are needed.

---

Prototype concept · Built with HTML, CSS & JavaScript
