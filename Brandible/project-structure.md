# Project Structure

High-level map of core files and their roles.

## Root
- `Brandible/index.html`: Homepage with hero, services snapshot, testimonials, CTA.
- `Brandible/assets/`: Shared static assets.

## Assets
- `assets/css/style.css`: Custom CSS tokens/utilities (focus rings, modal anims, helpers).
- `assets/js/script.js`: Mobile nav, contact form (Netlify), modal controls, FAQ accordion/search, typing animation.
- `assets/js/lazy-all.js`: Lazy-load defaults for images/iframes/videos and data-bg backgrounds.
- `assets/images/` and `assets/Brandible.png`: Logos and images.

## Pages
- `about/index.html`: Company story, mission/values, process, CTA.
- `services/index.html`: Services grid, pricing packages, modal notes, CTA. Uses typing animation in hero.
- `portfolio/index.html`: Work grid with filters, case study modal, CTA.
- `faqs/index.html`: Category filters, search, accordion, CTA.
- `contact/index.html`: Calendly placeholder, Netlify contact form, success modal, contact cards.

## Notes
- Tailwind loaded via CDN on all pages.
- All pages use descriptive titles, meta descriptions, and OG/Twitter tags.
- Asset paths are relative on subpages for Netlify deployment.

