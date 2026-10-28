# Notice and credits

**CartVibe is a fork of [Receipt Wrangler](https://github.com/Receipt-Wrangler/receipt-wrangler).**

Receipt Wrangler was created by **Noah Hall ([@Noah231515](https://github.com/Noah231515))** and its
contributors. Almost all of the code in this repository (the Go API, the Angular app, the mobile client, the Docker
setup and the git history) is their work, and it is kept here with its history and authorship intact.

- **Original project:** https://github.com/Receipt-Wrangler/receipt-wrangler
- **Licence:** GNU Affero General Public License v3.0 (see [LICENSE](LICENSE)). This fork stays under the same licence.
  If you run a modified version as a network service, the AGPL requires you to offer your users its source code;
  this repository is that source.
- **What this fork changed:** shopping lists with live sync, a household dashboard, receipt products with health and
  seasonality tags, a simplified family-oriented interface, themes, and the CartVibe identity. See
  [CHANGELOG.md](CHANGELOG.md).
- **How it was made:** the fork's changes were written with an AI coding assistant (Claude Code) under the direction
  of the fork's maintainer ("vibe coded"). They have been tested by the maintainer's household and by automated
  tests, but there is no warranty (see the licence).

The CartVibe name, logo and icon belong to this fork and are not part of the original project. This fork is not
affiliated with or endorsed by the original authors. Please report problems with this fork here, not to them.

## Third-party assets

Shop logos are not part of this repository or the image. An admin can enter the household's own [Logo.dev](https://logo.dev) publishable key under System Settings → Shop Logos; browsers then load the logos straight from Logo.dev, and the login page shows Logo.dev's attribution. The logos belong to their respective owners. Without a key, every receipt shows its shop's first letter. The list of known brands (names and web domains only) is `desktop/src/shared-ui/shop-monogram/shop-brands.ts`. Logo images that earlier versions bundled remain in this repository's git history only.
