# Blog Posts Directory

This directory contains blog post markdown files created via Netlify CMS.

## File Structure

Posts are automatically saved here by Netlify CMS with the naming pattern:
- `YYYY-MM-DD-slug.md`

Example: `2024-12-04-digital-marketing-tips.md`

## Posts Index

To display posts on the blog listing page, create a `index.json` file in this directory that lists all post filenames:

```json
[
  "2024-12-04-digital-marketing-tips.md",
  "2024-12-10-seo-strategies.md",
  "2024-12-15-web-design-trends.md"
]
```

### Maintaining the Index

**Option 1: Manual (Simple)**
- After creating a post via Netlify CMS, add the filename to `index.json`
- Keep the list in reverse chronological order (newest first)

**Option 2: Automated (Future Enhancement)**
- We can create a build script or Netlify function to auto-generate this file
- For now, manual maintenance is fine

## Post Format

Each markdown file contains:

```markdown
---
title: "Your Post Title"
date: 2024-12-04T10:00:00.000Z
author: "Brandible Team"
category: "Marketing"
excerpt: "Short description for the blog listing"
tags: ["marketing", "tips", "business"]
featured_image: "/assets/blog-images/your-image.jpg"
---

Your post content in Markdown format...
```

## Notes

- If `index.json` doesn't exist or is empty, the blog page will show placeholder posts
- Posts are sorted by date (newest first) automatically
- The slug is generated from the filename (removes date prefix)

