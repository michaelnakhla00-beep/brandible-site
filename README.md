# Brandible Marketing Group Website
Official website for Brandible Marketing Group — designed and developed by Michael Nakhla.

## Local Editing
- Open the `Brandible/` folder in your editor or a local server.
- The site uses Tailwind via CDN; no build step required.
- Custom CSS: `Brandible/assets/css/style.css`.
- Scripts:
  - `Brandible/assets/js/script.js` (menu, forms, FAQs, animations)
  - `Brandible/assets/js/lazy-all.js` (lazy-loading defaults)

To preview locally with a static server:

```bash
python3 -m http.server 8080
# or
npx serve Brandible
```
Then open `http://localhost:8080/Brandible/`.

## Netlify Deployment
1. Create a new site on Netlify, connect this repo, and set the publish directory to `Brandible`.
2. Build command: none (static site).
3. Forms on `contact/` are configured for Netlify Forms and AJAX.
4. Assets use relative paths for frictionless deploys.

## Editing Guidelines
- Keep page metadata (title, description, OG tags) per page.
- Use descriptive titles like `About — Brandible! Marketing Group`.
- Prefer relative asset paths: `../assets/...` on subpages.
