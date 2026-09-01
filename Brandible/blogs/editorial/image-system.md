# Brandible blog image system

*Phase 3. Visual source of truth for `npm run blog:image`. Last updated: August 31, 2026.*

This file is for featured images on Brandible blog drafts. It does not change the Brandible logo or site identity. It does not publish posts.

Generated covers are original AI-generated imagery created under the provider's API terms, with generation provenance recorded. Do not describe them internally as guaranteed royalty-safe.

---

## What a Brandible blog image is

A still, physical scene that expresses the article's thesis. Not a title card. Not a stock photo of a handshake. Not a screenshot of Google.

The page already renders the title, the logo, and the brand chrome. The image does the visual job only.

Live listing cards and the homepage featured slot crop to **16:10** with `object-fit: cover`. Open Graph inherits `featured_image` unless a post sets `og_image`. Phase 3 v1 does not write `og_image`.

---

## Locked visual language

One system for every post. Do not invent a new art style per article.

**Palette (use these, not adjacent hues):**

- Navy field: `#0A1633`, `#060D1F`, `#0F2149`
- Orange accent: `#F97316` (accent, not the whole frame)
- Electric: `#2563EB` (sparingly)
- Cloud / cool light: `#F5F7FA`
- Yellow `#FACC15` only as a small practical light (lamp, sign, indicator), never as a headline color

**Style:** quiet, tactile, slightly 3D still-life or environment. Matte materials. Soft directional light. Closer to Brandible's existing abstract-object covers than to glossy stock photography. Not cartoon, not cyberpunk, not vaporwave, not "AI glass people."

**Subject:** one concrete scene that maps to the thesis. Local and physical: a storefront at dusk, a phone on a job-site dash, a van, a Maps pin as an object, a workshop bench, a search-results page as a physical object with some slots lit and some dark.

**Composition:** single focal subject, centered. Generous negative space. Shallow-to-medium depth. No collage. No split-screen "versus" infographic unless the objects themselves create the contrast.

**Center-safe zone:** Gemini generates **16:9**. Delivery is a **16:10** center crop. Keep the subject in the middle ~70% of the frame, horizontally and vertically. Do not put the only important object on a far edge. Leave breathing room on all sides so a 16:10 crop and a later social crop do not cut the subject.

**Typography:** none. No headlines, captions, watermarks, fake logos, fake URLs, or readable UI copy.

**Logo:** none. Do not draw the Brandible mark, wordmark, or letter B.

**People:** no generated customer faces. No "team around a laptop." Hands or a distant silhouette are allowed only if they are incidental and unrecognizable.

**UI / brands:** no fake Google, Meta, or Ads consoles. No readable search-result text. No screenshots. A physical metaphor is allowed (lit vs unlit slots on an object that suggests a results page).

---

## Visual benchmark

The first Brandible blog visual benchmark is the approved Artlist cover for Topic 05 (`google-ads-vs-seo-local-businesses`). It defines the visual language. It does not define the subject.

Future images must not copy that scene: not the two paths, not the curve-versus-steps metaphor, not that specific layout. Each article still needs its own sculptural metaphor, derived from that article's thesis.

What to keep from the benchmark:

- Cinematic 3D editorial composition, not a flat icon, collage, or title card
- Dark navy environment as the field
- Controlled orange illumination as accent light, not a flood of orange
- Electric blue used as structure, not decoration everywhere
- One clear sculptural metaphor tied to the article thesis
- Flowing depth and movement rather than a rigid, icon-like arrangement
- Premium, tactile materials
- Slightly futuristic, not cyberpunk
- Enough negative space and a center-safe subject so 16:10 and responsive crops still hold the idea

What never belongs:

- Text
- Logos
- Fake UI
- Charts
- Generated people
- Generic office, laptop, or handshake imagery

---

## Article to image

Do not prompt from the title alone.

Derive a short visual brief from:

1. The article's actual thesis (opening argument, not the headline)
2. Title (context only)
3. Category
4. The rules in this file

The brief must name:

- subject
- composition
- mood
- what must not appear
- color notes
- center-safe reminder

---

## Technical delivery

| Step | Rule |
| --- | --- |
| Generate | 2K, 16:9 (`aspectRatio: 16:9`, `imageSize: 2K`) |
| Crop | Center crop to 16:10. Never stretch to change aspect ratio. |
| Resize | Exactly 1920×1200 |
| Encode | WebP, quality about 80 |
| Target size | Roughly 150–250 KB |
| Max size | Fail if still over 400 KB after reasonable compression attempts |
| Filename | `{filename-slug}.webp` (the URL slug, not the date prefix) |
| Disk | `Brandible/assets/blog-images/{slug}.webp` |
| Public | `/assets/blog-images/{slug}.webp` |
| CMS | Set `featured_image` and `featured_image_alt` only |
| `og_image` | Leave unset in v1 |
| Collision | Do not overwrite an existing file unless `--force` |
| Protected | Never overwrite live covers (`welcomeblogcover`, `webblogcover`, `blog-covers`, `socialmedia1`, `brandiblesmaller`) |

Default image model: `gemini-3.1-flash-image`, overridable with `BLOG_IMAGE_MODEL`. Do not hardcode the model in call sites.

Gemini 3 Pro Image (`gemini-3-pro-image` or the current provider id) is a later quality override if visual testing shows a real improvement. It is not the default.

Approximate API output costs (verify at invoice time):

- Gemini 3.1 Flash Image 1K: about $0.067 / image
- Gemini 3.1 Flash Image 2K: about $0.101 / image
- Gemini 3 Pro Image 1K/2K: about $0.134 / image

Regenerating an image stays cheaper than regenerating an article. Keep `blog:image` independent of `blog:draft`.

---

## Providers

**Gemini** is the automated path. It needs `GEMINI_API_KEY` and is unchanged:

```
npm run blog:image -- --post <path>
```

**Artlist** is human-directed. Generate in Artlist MCP, the Artlist Toolkit, or an interactive assistant. Then ingest the saved file. `blog:image` does not call Artlist MCP, store OAuth tokens, or generate through Artlist.

```
npm run blog:image -- --post <path> --input <image-path>
npm run blog:image -- --post <path> --input <image-path> --model "..." --style-kit "..."
npm run blog:image -- --post <path> --input <image-path> --alt "A navy workshop bench with an orange-lit phone at dusk."
```

`--input` skips Gemini image generation. It decodes the supplied file, runs the same Sharp crop / 1920×1200 / WebP pipeline, and patches only `featured_image` and `featured_image_alt`. `--force`, protected covers, and atomic writes still apply. `--notes` is Gemini-only and cannot be combined with `--input`.

When prompting Artlist, follow this file (thesis, center-safe 16:9, no type, no logo, no fake UI). `--input` cannot enforce that.

Imported Artlist files are recorded as external provenance under the user's Artlist subscription terms. Do not invent `model` or Style Kit names. Pass `--model` and `--style-kit` only when they are known.

`--input` uses Gemini vision for alt text only if `GEMINI_API_KEY` is set. Otherwise `--alt` is required. Do not derive alt from the article title.

---

## Alt text

Describe the final visible scene in 8–18 words. Human, specific, no keyword stuffing, no "image of," no "featured image for {title}."

---

## Human review

`blog:image` never publishes. It does not flip `draft: true`. A person reviews the markdown and the image together.

To regenerate only the image:

```
npm run blog:image -- --post <path> --force
npm run blog:image -- --post <path> --force --notes "less clutter, no extra objects"
npm run blog:image -- --post <path> --force --input <image-path>
```

`--notes` prefers image-to-image from the existing file when one exists. It is not valid with `--input`.

---

## Failure

If generation, ingest, decode, crop, resize, WebP, or size validation fails, leave the existing image and markdown untouched. A failed image step must not invalidate a good article draft.
