# MORI SPACE V2

A concept portfolio for interiors and furniture. The site has three static pages under `/mori-space-v2/`.

- Homepage
- Services reading view at `/mori-space-v2/services/`
- Warm Minimal / Living Study at `/mori-space-v2/projects/warm-minimal-living-study/`

## Local development

Use Node.js 24 and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm preview
```

Open `http://127.0.0.1:4173/mori-space-v2/` for the production preview. Use `pnpm dev` to work with Vite in development mode. Vite generates the three static HTML pages in `dist/`.

The optional browser regression runner uses a separately provisioned Playwright installation and compatible Chromium browser. After building, run `node tests/browser-regression.mjs`. Set `PLAYWRIGHT_MODULE` when Playwright is installed outside the checkout, and `BROWSER_EXECUTABLE` if using an existing Chromium executable.

## Hero and navigation

The homepage uses the original 12.041667-second film for scroll scrubbing and for the separate Watch Full Film player. On small screens the Hero starts with the poster and defers its video request until scroll demand. Reduced motion and unavailable animation dependencies keep the Hero static. Chapter and return links work without JavaScript. The Contact MORI address is a fictional, inactive placeholder.

## GitHub Pages

The intended URL is <https://jiashiang-dev.github.io/mori-space-v2/>. The workflow builds on `main` and publishes only the freshly generated `dist/` artifact. It requires GitHub Pages to use GitHub Actions as the publishing source and the `github-pages` environment to allow deployment from `main`. A push to `main` can trigger deployment once Pages is configured. The workflow can also be dispatched for `main`.

Initialize the public repository independently with a GitHub no-reply commit identity. Keep dependencies, local caches, QA captures and generated build output out of source control.

Fonts are loaded from Google Fonts. Homepage animation dependencies are loaded from jsDelivr.

