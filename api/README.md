# CartVibe API

Go backend of CartVibe: receipts, shopping lists and spending insights for one household. It is a fork of
[Receipt Wrangler](https://github.com/Receipt-Wrangler/receipt-wrangler) by Noah Hall (see `../NOTICE.md`).

- Go 1.26, Chi, GORM (SQLite on the NAS), its own job queue and timers in SQLite (no Redis or Valkey)
- OCR, AI-assisted extraction, households and permissions, shopping lists with live sync, reports

Developer guide: [`CLAUDE.md`](CLAUDE.md). Project overview and deployment: [`../README.md`](../README.md).

## License

AGPL-3.0, see [`../LICENSE`](../LICENSE).
