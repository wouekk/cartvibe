# Shop logos

Purpose: how the server downloads and serves shop logos from Logo.dev, and why it fetches so little. The short rules are
in `../CLAUDE.md` → 7.

**Shop logos** (`internal/shoplogos`, `services/shop_logos.go`): with the household's Logo.dev secret key
(`SystemSettings.ShopLogoKey`, encrypted like the AI keys, `json:"-"`; `ShopLogoSecretKey` treats anything that is
not an encrypted `sk_` key as none) the server downloads logos through `api.logo.dev/v2/brands/logo` (Logo.dev
allows self-hosting only from its API, never from the image CDN) into `data/shop-logos/<slug>.png`, one call every
0.7 s (100 a minute allowed), PNG only, ≤1 MB, written through a temp file and a rename. **Credits are the limit:**
each lookup costs about 2 of the free plan's 500 monthly credits (~250 logos a month), so only the brands of the
embedded `brands.json` that appear on receipts (`WantedShopLogos`: shop name, else receipt name, matched like the
desktop's monogram by `shoplogos.BrandsFor`) are fetched, a stored logo is never asked about again, and a 404 is
retried after 180 days (`index.json`); a 202 is retried next run. A refused key, used-up credits (402) or rate
limiting stops the run; the reason is in the status (`GET /shopLogo/status`, counted over the wanted brands). Runs:
after a key is saved, at API start, every 12 h on the clean-up queue (`system_clean_up:shop_logos`, never retried
by the queue) and on `POST /shopLogo/sync` (the Download logos button); one at a time (`TryLock`), and a run with
nothing missing makes no call. Saving `""` removes the key and stops the downloads but keeps the folder, and
`shopLogosEnabled` stays on while any logo is stored, so switching keys never loses logos. `DELETE /shopLogo` (the Delete logos
button) removes the folder and index but keeps the key, and is a 409 while a download runs. `GET /shopLogo` lists every stored logo,
`GET /shopLogo/{slug}` serves one (only known slugs become file names), both to any signed-in user.
