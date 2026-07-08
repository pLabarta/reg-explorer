# Carolinas Regional Explorer

_Last updated: 2026-06-23_

An open data platform for the 14-county Charlotte metropolitan region. It brings together interactive maps, a resident wellbeing survey, and data stories to help researchers, practitioners, and communities understand and act on regional trends across North and South Carolina.

---

## For maintainers and writers

No technical setup needed. Content is edited in plain text files and published by pushing to `main` on GitHub — Netlify builds the site automatically.

### Docs

- [docs/README.md](docs/README.md) — orientation and project structure
- [docs/editing.md](docs/editing.md) — updating page content, writing stories, managing events
- [docs/deploying.md](docs/deploying.md) — previewing, publishing, and fixing failed builds

---

## For developers

### Stack

- **[Zola](https://www.getzola.org/)** — static site generator
- **Netlify** — hosting and continuous deployment
- **Sass** — styles compiled by Zola

### Getting started

```bash
# Install Zola — https://www.getzola.org/documentation/getting-started/installation/

# Enable the repo's git hooks (blocks oversized story folders at commit time)
git config core.hooksPath .githooks

# Preview locally
zola serve
# open http://127.0.0.1:1111
```

### Docs

- [docs/development.md](docs/development.md) — adding sections, editing templates, changing styles
- [docs/quarto.md](docs/quarto.md) — authoring a Quarto data story (live charts, maps, tables)
- [docs/deploying.md](docs/deploying.md) — previewing, publishing, and fixing failed builds
- [docs/glossary.md](docs/glossary.md) — shared terms used across the docs
