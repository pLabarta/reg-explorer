# Deploying

_Last updated: 2026-06-23_

> **Who this is for:** anyone publishing changes to the live site — writers and developers
> alike. Publishing needs only Git and GitHub; previewing locally additionally needs Zola.

This is the single source for how changes reach the live site. Other guides link here instead
of repeating the steps.

---

## How it works

The site's content lives as plain-text files in this Git repository on GitHub. **Netlify** is
connected to the repo and watches the `main` branch — the live branch. When you push a change
to `main`, Netlify rebuilds the site with **Zola** and publishes it automatically, usually
within ~2 minutes. There is no CMS or admin panel; editing the site means editing files.

A **branch** is a named, parallel copy of the project where you can work safely; `main` is the
one that's live. **Pushing** uploads your committed changes (saved snapshots) from your
computer to GitHub.

![Deploy pipeline](img/deploy-pipeline.jpeg)

---

## Preview locally

[Install Zola](https://www.getzola.org/documentation/getting-started/installation/), then:

```bash
zola serve
# open http://127.0.0.1:1111
```

It rebuilds as you edit. (Quarto data stories need an extra render step — see
[Data stories](#data-stories-quarto) below.)

---

## Publishing a change

```bash
git add .                                   # stage your changed files
git commit -m "describe what you changed"   # save a snapshot
git push                                    # upload to GitHub → triggers a Netlify build
```

Make sure you're on `main` first:

```bash
git branch          # current branch — should show * main
git checkout main   # switch to main if you're not on it
git pull            # get the latest from GitHub before editing
```

---

## Working on larger changes safely

To review several edits before they go live, work on a branch and open a pull request:

```bash
git checkout -b my-change        # create and switch to a new branch
# ... make your edits ...
git add .
git commit -m "describe changes"
git push -u origin my-change     # push the branch to GitHub
```

Open a **pull request** on GitHub so you or a teammate can review it. Netlify builds a
**preview URL** for the branch automatically, so you can see the result before it's live. Merge
the pull request and the live site updates.

---

## If the build fails

Netlify emails a notification. To diagnose:

1. Open the Netlify dashboard → **Deploys**.
2. Click the failed deploy to read the build log.
3. The error names the file and line causing the problem.
4. Fix it locally, commit, and push again — running `zola build` locally reproduces the same error.

---

## Data stories (Quarto)

Quarto data stories are **not** built by Netlify. They're rendered separately — locally or in
CI — with `scripts/build-stories.sh`, which is what produces the HTML Zola serves. See
[Building stories](development.md#data-stories-quarto) for the render step and
[Authoring a Quarto data story](quarto.md) for how to write one.
