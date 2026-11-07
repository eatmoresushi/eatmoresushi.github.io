# My personal webpage
- Hosted on [luyuan.me](luyuan.me)

## Apps
The Pages workflow (`.github/workflows/pages.yml`) skips `apps/` and copies each app in on its own:
- `apps/kiln-opening/` is built with Vite and served at [/kiln-opening/](https://luyuan.me/kiln-opening/).
- `apps/ark-nova-placement/` is a single static page served at [/ark-nova-placement/](https://luyuan.me/ark-nova-placement/). The old `/ANPlacement.html` address redirects there.

## Resume
- `resume.md` is the source for the web resume at [/resume.html](https://luyuan.me/resume.html), which renders it in the browser.
- `resume.pdf` is the downloadable copy linked from that page. It is the web resume's print layout, so after editing `resume.md` regenerate it from a local server (`python3 -m http.server 8137`):

  ```bash
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --no-pdf-header-footer \
    --user-data-dir="$(mktemp -d)" --virtual-time-budget=15000 \
    --print-to-pdf=resume.pdf "http://localhost:8137/resume.html"
  ```
