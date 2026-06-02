# Development

---

## Project structure

```
content/          page content and stories (Markdown + TOML front matter)
templates/        Zola/Tera HTML templates
  partials/       reusable layout blocks included by page templates
sass/             styles (compiled automatically by Zola)
  main.scss       main stylesheet and all component styles
  _nav.scss       navigation and header styles
static/           static assets served as-is (images, fonts)
config.toml         site config and shared content (footer, events, newsletter)
```

---

## Adding a new page/section

### 1. Create the content folder

```
content/resources/_index.md
```

```toml
+++
title       = "Resources"
description = "One-line description."
template    = "resources.html"

[extra]
hero_eyebrow = "Label above the hero title"
+++
```

### 2. Create the template

`templates/resources.html` — minimal starting point:

```django
{% extends "base.html" %}

{% block title %}{{ section.title }} &mdash; {{ config.title }}{% endblock %}
{% block description %}{{ section.description }}{% endblock %}

{% block content %}
{% include "partials/hero_textonly.html" %}

<div class="container">
  <div class="page-content">
    {{ section.content | safe }}
  </div>
</div>
{% endblock %}
```

Reuse existing partials as needed — see below.

### 3. Add the nav link

In `templates/base.html`, add a new `<li>` inside `.nav-menu` following the existing pattern:

```html
<li>
  <a href="/resources/"
    {% if current_path == "/resources/" %}class="is-active"{% endif %}>
    Resources
  </a>
</li>
```

Also add the link to the footer sitemap in the same file.

### 4. (Optional) Add to the home page cards

In `content/_index.md`, add an entry to the `sections` array:

```toml
{ title = "Resources", slug = "resources", description = "...", button = "Explore" }
```

---

## Available partials

| Partial | What it renders |
|---|---|
| `partials/hero_textonly.html` | Text-only hero (title + subtitle, reads from `section.extra`) |
| `partials/hero_withimage.html` | Hero with image on the right |
| `partials/about/section_gray_twocol.html` | Gray two-column section (pass `eyebrow`, `title_left`, `body_left`, `title_right`, `body_right`) |
| `partials/about/section_white.html` | White section, title left / text right (pass `eyebrow`, `title`, `body`) |
| `partials/events.html` | CONNECT + events section (reads from `section.extra.connect` and `config.extra.events`) |
| `partials/newsletter.html` | Newsletter strip (reads from `config.extra.newsletter`) |

Pass variables to partials using `{% set %}` before the `{% include %}`:

```django
{% set eyebrow     = "Label" %}
{% set title_left  = "Left title" %}
{% set body_left   = "Left body." %}
{% set title_right = "Right title" %}
{% set body_right  = "Right body." %}
{% include "partials/about/section_gray_twocol.html" %}
```

---

## Styles

All component styles live in `sass/main.scss`. Navigation styles are in `sass/_nav.scss`. Zola compiles Sass automatically on build and during `zola serve`.

Token variables (colours, spacing, fonts) are defined at the top of `main.scss`:

```scss
$accent:  #004d35;
$black:   #000000;
$text:    #1a202c;
$bg:      #ffffff;
$bg-alt:  #f5f7fa;
$border:  #e2e8f0;
```

---

## Deploying

Push to `main`. Netlify builds automatically. For larger changes, open a pull request — Netlify will generate a preview URL for the branch.

If the build fails, check the Netlify deploy log. Running `zola build` locally will reproduce the same error.
