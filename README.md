# gen1recomp mods — browse site

A **self-updating, Modrinth-like** website to browse, search, and download
community mods for [gen1recomp](https://github.com/bryanthaboi/gen1recomp)
(native LÖVE2D recreation of Pokémon Red).

Styled with [css-pokemon-gameboy](https://github.com/luttje/css-pokemon-gameboy)
to match the engine's DMG aesthetic.

## How it works

The upstream index repo,
[bryanthaboi/gen1recomp-mod-index](https://github.com/bryanthaboi/gen1recomp-mod-index),
publishes a machine-readable feed at
`https://bryanthaboi.github.io/gen1recomp-mod-index/data/index.json`, rebuilt
nightly by its own GitHub Actions (it re-reads every mod's GitHub Releases, so
version bumps land without anyone opening a PR).

This site is **static** — plain HTML/CSS/JS, no framework, no build. It fetches
that feed **at runtime in the browser** (the feed serves
`Access-Control-Allow-Origin: *`), so it is self-updating with zero
infrastructure of our own: whatever the feed says, the site shows. Thumbnails,
descriptions, and download links resolve against the upstream Pages base.

## Features

- Card grid of every listed mod, with thumbnail (or a DMG-tiled placeholder).
- Live search across title, author, summary, tags, and categories.
- Category chips (OR-filtered) and flag filters (has-thumbnail, experimental).
- Sort by name, author, or recently updated.
- Detail modal: full metadata, rendered `description.md`, and direct download
  (`latest.zip.url`, falling back to `downloadURL`, then the source repo).
- Shareable URLs — filters and the open mod live in the location hash.

## Local preview

```sh
python3 -m http.server -d site 8080
# open http://localhost:8080
```

Module-free, so any static server (or even `file://` for most of it) works.

## Deploy

`.github/workflows/pages.yml` uploads `site/` to GitHub Pages on push. Because
the data is fetched live, there is no build step and nothing to rebuild when
mods change — the site follows the upstream feed on its own.

Enable Pages for this repo (Settings → Pages → Source: GitHub Actions) and push.

## Layout

```
site/
  index.html                     the page
  assets/
    app.js                       fetch feed, render, search/filter/sort, modal
    style.css                    layout on top of the Game Boy theme
    css-pokemon-gameboy.css      the DMG theme (vendored, Unlicense)
.github/workflows/pages.yml      deploy site/ to Pages
```

## Credit

Game Boy styling: [css-pokemon-gameboy](https://github.com/luttje/css-pokemon-gameboy)
(Unlicense). Mod metadata is contributed by mod authors to the index repo.
Listing is not vetting — read a mod's source before you enable it.
