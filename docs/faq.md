# CartVibe FAQ

Short answers for running a [CartVibe](https://cartvibe.app/) household. Setup, updating and the Synology guide are in the [README](../README.md).

- [How do I rename a household?](#how-do-i-rename-a-household)
- [How do I change a password?](#how-do-i-change-a-password)
- [I lost my phone. How do I sign it out?](#i-lost-my-phone-how-do-i-sign-it-out)
- [How do I sign in with Authentik, Authelia or Keycloak?](#how-do-i-sign-in-with-authentik-authelia-or-keycloak)
- [How do I add AI API keys?](#how-do-i-add-ai-api-keys)
- [How do I add a Logo.dev API key?](#how-do-i-add-a-logodev-api-key)
- [How do I use CartVibe as an app on my phone?](#how-do-i-use-cartvibe-as-an-app-on-my-phone)
- [How do I check that my backup really restores?](#how-do-i-check-that-my-backup-really-restores)
- [How do I go back to an earlier copy of the database?](#how-do-i-go-back-to-an-earlier-copy-of-the-database)
- [How do I keep my own copy of the household?](#how-do-i-keep-my-own-copy-of-the-household)
- [How do I move CartVibe to another server?](#how-do-i-move-cartvibe-to-another-server)

## How do I rename a household?

1. Sign in as an admin, or as someone allowed to update that household.
2. Open **Management** in the sidebar and choose the **Households** tab.
3. Press **Edit** on the household's row (the pencil on a computer, the ⋮ menu on a phone).
4. Change the name (and, if you like, its icon and colour) and press **Save**.

Receipts, shopping lists and members stay with the household; only its name changes.

## How do I change a password?

Passwords are set by an admin; there is no "forgot password" email and no change-password box in User Settings.

1. Sign in as an admin.
2. Open **Management** in the sidebar and choose the **Users** tab.
3. Press the key icon (**Set password**) on the person's row. This works for your own row too.
4. Type a new password, or use the generate button, and save. Send the new password to the person and ask them to sign in with it.

On a fresh install the admin signs in with `admin` / `admin`: change that password straight away. If nobody who can set
passwords remembers theirs, the stored passwords are one-way hashes and cannot be read back; ask another admin, or restore a backup.

## I lost my phone. How do I sign it out?

1. Sign in on any other device.
2. Open **Settings → User Settings** and press **Sign out everywhere**, then confirm.

That ends your session on every phone and computer, the one you are holding included, and disconnects any AI
assistant you connected. If CartVibe happened to be open on the lost phone, it keeps working for at most 20 minutes
and then asks for the password. Sign in again where you still want to use it, and have an admin set you a new
password (above) if someone could know the old one. Nobody else in the household is signed out.

## How do I sign in with Authentik, Authelia or Keycloak?

If you already run an identity provider at home, people can sign in to CartVibe with the account they have there
instead of a CartVibe password. Any provider that speaks OpenID Connect works; the three below are the ones
self-hosters ask about most. Signing in with a username and password keeps working beside it.

CartVibe needs a fixed address first, because the provider sends people back to it, and most providers insist on
an `https://` one (see [the phone app answer](#1-put-cartvibe-behind-https)).

### 1. Tell CartVibe its own address

Sign in as an admin, open **System Settings → Auth & Security**, type the address people use to reach CartVibe into
**Server Public URL** (for example `https://receipts.example.com`, with nothing after the host) and save.

### 2. Get the redirect address

Open **System Settings → Sign-in providers** and press **Add provider**. Type a **Display Name** (what the button on
the login page will say, for example `Authentik`); the **Name in the address** fills itself in. The box below shows
the **Redirect address**, such as `https://receipts.example.com/api/oidc/authentik/callback`. Copy it and leave the
dialog open.

### 3. Create a client at the provider

Every provider calls this something else, but it always asks for the redirect address from step 2 and gives you a
client ID and a client secret. Ask for the scopes `openid profile email`.

* **Authentik:** under **Applications → Providers** create an **OAuth2/OpenID Provider**: client type
  *Confidential*, and the redirect address as a *strict* redirect URI. Then create an **Application** that uses
  this provider. The issuer is shown on the provider's page as *OpenID Configuration Issuer*, and looks like
  `https://auth.example.com/application/o/cartvibe/` (the final slash is part of it).
* **Authelia:** add a client under `identity_providers.oidc.clients` in its configuration: a `client_id`, a
  `client_secret` (Authelia stores it hashed; its documentation has the command that makes the hash), the redirect
  address under `redirect_uris`, and `scopes` with `openid`, `profile` and `email`. Restart Authelia. The issuer is
  Authelia's own address, for example `https://auth.example.com`.
* **Keycloak:** in your realm, under **Clients**, create a client of the type *OpenID Connect* with *Client
  authentication* switched on and the *Standard flow* ticked, and put the redirect address under *Valid redirect
  URIs*. The secret is on the client's **Credentials** tab. The issuer is `https://keycloak.example.com/realms/` followed
  by the realm's name.

### 4. Finish in CartVibe

Back in the dialog, fill in the **Issuer URL** exactly as the provider shows it (with or without a final slash, as
it is there), the **Client ID** and the **Client Secret**, and save. With **Show on the login page** ticked, the
login page now has a **Sign in with …** button.

### 5. Decide who gets in

* **People who already have a CartVibe account** connect the provider themselves: **Settings → User Settings →
  Sign-in methods → Connect**. From then on the button on the login page opens their account. This is the safe way,
  because they are signed in when they do it.
* **People without an account** are refused unless you tick **Create an account at the first sign-in** on the
  provider. Then whoever your provider lets in gets an account with the role User and joins the household. Such an
  account has no password: it can only sign in through the provider, until an admin sets a password for it.
* Leave **Match an existing account by username** off unless you run the provider yourself and decide who gets
  which username there. It gives a first-time visitor the CartVibe account with the same username.

If the button brings you back to the login page with a message, the provider could not be reached or refused the
request: check the Issuer URL and that the redirect address at the provider is exactly the one from step 2. The
server's log (**System Settings → Logs**) has the details. Deleting a provider, or unticking **Show on the login
page**, stops everyone signing in with it; people who have a password are not affected.

## How do I add AI API keys?

The AI reads your receipts, so it needs a key from a provider (or a model you run yourself). You create the key on the
provider's website, then paste it into CartVibe. Each link goes straight to the provider's keys page; it asks you to sign in first.

| Provider | Create the key here | Paste it in CartVibe |
| :--- | :--- | :--- |
| **Claude** (Anthropic) | [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) | **AI** page, provider **Claude** |
| **Gemini** (Google) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | **AI** page, provider **Gemini** |
| **ChatGPT** (OpenAI) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | **AI** page, provider **ChatGPT** |

A model you run yourself needs no key from these sites: choose **Local LM** (LM Studio and other OpenAI-compatible servers, address ending in `/v1`) or **Ollama** (the
server's address alone, such as `http://192.168.1.20:11434`) on the same **AI** page. With Ollama, also fill in **Context size**: left empty, Ollama keeps only a few
thousand tokens and reads a long receipt in part; `8192` fits most receipts.

The **AI** page shows what each model used, this month and last: the number of reads and the tokens sent and written, as the provider counted them. Multiply by the
prices below to see what your receipts cost.

### Step by step

* **Claude:** Open the link and sign in (or create a Claude Console account). Click **Create key**, give it a name such as `cartvibe`, and pick an
  expiration. Choose a long one or **Never**, because an expired key quietly stops the receipt reading. Copy the key straight away: it is shown only once.
  A Claude chat subscription does not include the API; API use is billed separately in the Console.
* **Gemini:** Open the link and sign in with a Google account. Click **Create API key** and choose a Google Cloud project when it asks.
  Copy the key. You can view it again later on the same page. Read Google's data-use terms for the free tier before you send family receipts through it.
* **ChatGPT (OpenAI):** Open the link, sign in, and click **Create new secret key**. Name it, pick a project, and leave the permissions on **All**. Copy the key now: it is
  shown only once. A ChatGPT subscription does not include the API; add credit under **Billing** in the OpenAI dashboard first.

Then sign in to CartVibe as an admin, open the **AI** page, choose the provider, paste the key, pick a model (see below), and press **Test connection**.
CartVibe stores the key encrypted with your `ENCRYPTION_KEY`, so it never goes in `docker-compose.yml` or `.env`.

### Which model to pick (the cheapest that works)

Reading a receipt is a small job: one photo in, a short list of lines out, a few thousand tokens in total. The small models are enough, and a receipt typically costs well under a cent.
The cheapest picks below accept photos.

| Provider | Cheapest good pick (enter this model) | Price per million tokens, input / output | A step up if lines are misread |
| :--- | :--- | :--- | :--- |
| **Gemini** | `gemini-3.5-flash-lite` (stable, has a free tier) | $0.30 / $2.50 | `gemini-3.8-flash`: $0.75 / $3.75 until 31 Dec 2026, then $1.50 / $7.50 |
| **Claude** | `claude-haiku-5-5` | $0.10 / $0.50 | `claude-sonnet-5-5`: $2 / $10 |
| **ChatGPT** | `gpt-6-luna` | $0.10 / $0.50 | `gpt-5.4-mini`: $0.75 / $4.50 |

* **You choose the model.** CartVibe does not pre-select one: the Model box stays empty until you pick, because models are billed by the token at very different prices
  (Claude Opus costs about 40 times as much as Haiku). For Gemini, pick a current model from the table: Google lists the older 2.5 models as available only to accounts
  that already used them, so a new key may be refused on them.
* **Names change.** `gemini-3.5-flash` no longer exists; Google's current small models are the **Flash-Lite** ones. Prices and names were checked on 2 November 2026,
  so compare them with the provider's own list before you settle: [Gemini](https://ai.google.dev/gemini-api/docs/pricing) ·
  [Claude](https://platform.claude.com/docs/en/about-claude/pricing) · [OpenAI](https://developers.openai.com/api/docs/pricing).
* **Test before you trust it.** Scan three or four real receipts with the cheap model and check the lines. If it misreads them, move one step up; do not jump to the biggest model.
* **Keep keys private and capped.** A key is a password that spends your money. Do not post it or commit it, set a monthly spending limit in the provider's console if it
  offers one, and delete the key on the same page if it ever leaks.

## How do I add a Logo.dev API key?

Logo.dev supplies the shop logos shown next to receipts. It is optional: without a key CartVibe shows a letter for each shop.

1. Sign up at Logo.dev, open [logo.dev/dashboard/api-keys](https://www.logo.dev/dashboard/api-keys) and copy the **secret key**.
   It starts with `sk_`; the publishable `pk_` key will not work. There is a free plan, and CartVibe then shows
   "Logos provided by Logo.dev" on the login page.
2. In CartVibe, sign in as an admin and open **System Settings**, then the **Shop Logos** tab.
3. Paste the key and press **Save key**, then **Download logos**.

The server downloads and stores the logos itself; browsers never contact Logo.dev. The key is stored encrypted with your
`ENCRYPTION_KEY`, like the AI keys. **Delete logos** on the same tab removes them again.

## How do I use CartVibe as an app on my phone?

CartVibe installs from the browser as a web app: its own icon on the home screen, full screen with no address bar, and
(on Android) a place in the share sheet for recipe links. There is nothing to download from a store. This is separate from
the planned CartVibe for iPhone app.

**It needs HTTPS.** Browsers only offer to install a web app that is served over `https://` (or from `localhost`), and the
offline shell, update check and notifications also need it. On a plain `http://192.168...` address Android's Chrome usually
offers only a shortcut to a browser tab, and no browser can run the offline shell or notifications. So give CartVibe an HTTPS
address first.

### 1. Put CartVibe behind HTTPS

You need a name for your server (a domain, or a free DDNS name from your NAS maker) and a certificate for it.

* **Synology NAS:** in DSM open **Control Panel → Security → Certificate**, press **Add** and choose a Let's Encrypt
  certificate for your name (port 80 must be reachable from the internet, for the check and the renewals). Then open
  **Control Panel → Login Portal → Advanced → Reverse Proxy** and **Create** a rule: source **HTTPS**, your host name, port
  **443**; destination **HTTP**, **localhost**, port **8091** (the port in your `docker-compose.yml`). Open `https://<your name>`
  to check it. If DSM keeps showing its default certificate, assign the new one under the certificate **Settings** button.
* **A rented server (VPS):** the `docker-compose.vps.yml` stack already runs Caddy, which gets the certificate for you
  ([docs/vps-deploy.md](vps-deploy.md)).

Then, signed in over the HTTPS address as an admin, open **System Settings → Auth & Security → Cookies** and turn on
**Use secure cookies (HTTPS only)**. Only do this while you are on the HTTPS address: with it on, the login cookies are
dropped over plain HTTP, so nobody reaching CartVibe that way can sign in until it is switched off again.

### 2. Install it

* **Android (Chrome):** open your `https://` address and sign in. Open Chrome's **⋮** menu and choose **Install app**
  (on some versions it is **Add to Home screen**, then **Install**), and confirm. CartVibe appears on the home screen and
  in the app drawer, and opens full screen. To send it a recipe, share a recipe link from any app and pick **CartVibe**.
  Samsung Internet can install it too.
* **iPhone and iPad (Safari):** open your `https://` address and sign in. Tap the **Share** button, choose **Add to Home
  Screen**, and tap **Add**. The icon opens CartVibe full screen. On iOS 16.4 and later the Share menu of Chrome, Edge and
  Firefox has the same entry.
* **Computer (Chrome or Edge):** an install icon appears at the end of the address bar; click it. Safari on macOS has
  **File → Add to Dock**.

### Good to know

* **Getting around on a phone.** The bar at the bottom has Dashboard, Lists, Scan, Receipts and More; everything else,
  the settings included, is behind More. In the shop, open a list's ⋮ menu and choose **Shop mode**: the list alone,
  bigger rows, and a screen that stays on.
* **Everything too small or too large?** **Settings → Theme → Interface size** makes the whole app larger on that
  device (125%, 150% or 200%); the browser's own zoom works on top of it.
* **Updates:** after you deploy a new image, the app notices the next time you open it and loads the new version on the
  following page change. Close and reopen it if a screen still looks old.
* **Remove it:** press and hold the icon, then choose to uninstall (Android) or **Remove App** (iPhone).
* **What works without a connection.** A shopping list you have opened on the phone before opens again in a dead zone,
  and you can add items and cross them off there: the list says *Offline* and how many changes are waiting, and sends them
  when the phone reaches your server again. A receipt photographed with Quick Scan is kept on the phone and uploaded
  later. Editing or deleting items, new lists, receipts, the Dashboard and reports come from your server, so they need
  your network (or your HTTPS address from outside the house).
* **Opening the app in a dead zone needs HTTPS too.** On a plain `http://` address an app that is already open keeps
  working as described, but the phone cannot start it without a connection, because browsers keep the app's own files
  only for an HTTPS address.

## How do I check that my backup really restores?

A backup you have never restored is a hope, not a backup. Try it once after you set it up, then every few months and before
a release that changes the database. The check below works on a copy, so the live CartVibe keeps running and nothing in it
changes. It is written for a Synology with Hyper Backup; with another backup tool, only step 1 differs.

What a backup has to hold:

* the `sqlite` folder: `app.db` with its `app.db-wal` and `app.db-shm` files, which belong together, and the `backups`
  folder inside it. A backup that ran while CartVibe was writing can catch those three files out of step; the copies in
  `backups` (made before every update and once a day) are always whole, so the backup can run while CartVibe is in use;
* the `data` folder: the receipt images and PDFs;
* your `SECRET_KEY` and `ENCRYPTION_KEY` (in Dockhand's variables or your `.env`): without the original `ENCRYPTION_KEY`
  the saved AI and Logo.dev keys cannot be read again. Keep a copy somewhere outside the NAS, such as a password manager.

### 1. Copy the latest backup to a test folder

In **Hyper Backup**, select the backup task and open **Backup Explorer**. Pick the newest version, open the `docker` folder,
select `cartvibe` and choose **Copy to**. Copy it into a new, empty folder, for example `/docker/cartvibe-restore-test`. Never copy
it over `/docker/cartvibe`.

### 2. Check the database

Over SSH, run this (change `volume2` to your volume). It starts a throwaway Alpine container that opens the copy read-only:

```bash
sudo docker run --rm -v /volume2/docker/cartvibe-restore-test/cartvibe/sqlite:/db:ro alpine sh -c "apk add -q sqlite && sqlite3 -readonly /db/app.db 'PRAGMA integrity_check; SELECT count(*) FROM receipts; SELECT count(*) FROM file_data; SELECT max(date) FROM receipts;'"
```

It should print `ok`, then the number of receipts, the number of receipt images, and the date of your newest receipt. In
CartVibe, the **Receipts** page on **All time** shows the same receipt count; the newest date tells you how old the backup is.
If the copy has no `app.db-wal` file and the backup ran while CartVibe was in use, the newest changes may be missing.
(A backup made while the container was stopped needs no such file: CartVibe folds it into `app.db` when it stops.) If the
check does not print `ok`, run it again on the newest file in the `backups` folder (put `/db/backups/<file name>` in place of
`/db/app.db`): that copy is the one to restore from.

### 3. Check the images

```bash
sudo find /volume2/docker/cartvibe-restore-test/cartvibe/data -type f | wc -l
```

```bash
sudo find /volume2/docker/cartvibe/data -type f | wc -l
```

The two numbers should be close (the live one is higher by what was added since the backup). Open two or three files from
the test folder in File Station to see that they are real images.

### 4. Clean up

Delete `/docker/cartvibe-restore-test`. Write down the date you checked and the counts, so the next check has something to
compare with.

**Restoring for real** (a broken disk or a bad update): stop the stack, move the broken `sqlite` and `data` folders aside
(rename them, do not delete them yet), copy both folders from the backup into `/docker/cartvibe`, keep `SECRET_KEY` and
`ENCRYPTION_KEY` as they were, then start the stack and hard-refresh the browser. Everyone may need to sign in again. A
rented server with `docker-compose.vps.yml` restores differently: see [docs/vps-deploy.md](vps-deploy.md#restore-drill-do-it-once-after-setup-then-every-few-months).

If the restored `app.db` will not open, use the newest file from the restored `sqlite/backups` folder in its place, as
described in the next answer.

**The Export & import tab is not this backup.** System Settings → Export & import downloads the household's receipts,
lists, categories and photos as spreadsheet files: handy as your own copy, and a way to move to another server. It
leaves out sign-ins, keys and history, so keep backing up the `sqlite` and `data` folders as above. See
[How do I keep my own copy of the household?](#how-do-i-keep-my-own-copy-of-the-household) and
[How do I move CartVibe to another server?](#how-do-i-move-cartvibe-to-another-server)

## How do I go back to an earlier copy of the database?

CartVibe keeps its own copies of the database in the `backups` folder inside `sqlite`:

* `app-upgrade-<date>-<time>.db`: made when a new version of CartVibe starts on your data, before it changes anything.
  The five newest are kept.
* `app-daily-<date>-<time>.db`: made once a day while CartVibe runs. The seven newest are kept.

The date and time in the name are in UTC. Each file is the whole database as it was at that moment. The receipt photos
are not in it: they are in the `data` folder, and going back to an earlier database does not remove any of them.

To go back, for example after an update that went wrong:

1. Stop the stack (in Dockhand, or `docker compose stop`).
2. In the `sqlite` folder, move `app.db`, `app.db-wal` and `app.db-shm` into a new folder, for example `sqlite/aside`.
   Do not delete them yet.
3. Copy the file you want from `sqlite/backups` into `sqlite` and name the copy `app.db`.
4. If the new version was the problem, go back to the previous image as well: replace `:latest` in the stack with the
   `:sha-<commit>` tag you ran before. The About page shows the tag you are running, so note it before an update.
5. Start the stack and hard-refresh the browser. Everything added after the copy was made is gone from the database;
   receipts photographed since then are still in `data`, but CartVibe no longer lists them.

These copies are on the same disk as the database, so they protect against a bad update or a mistake, not against a
broken disk. Keep the backup to another place as well.

## How do I keep my own copy of the household?

An admin opens **System Settings → Export & import**. The card shows what the file will hold (receipts, products, lists,
categories, tags, people) and how large the photos and PDFs are. Leave **Include photos and PDFs** on for a complete copy,
or switch it off for a small file with the data only, then press **Download**. The file is named
`cartvibe-backup-<date>.zip`.

Inside are one CSV file per kind of thing (`receipts.csv`, `receipt_products.csv`, `shopping_lists.csv` …), which open in
Excel, Numbers or LibreOffice, the photos under `files/`, and `manifest.json`, which lists every file with its size and a
checksum. Amounts are written with a dot (`43.21`) and dates as `2026-11-03`, whatever the language of the app.

Keep the file somewhere private: it holds everyone's receipts, whoever paid them. Passwords, AI keys and the Logo.dev key
are never in it.

## How do I move CartVibe to another server?

There are two ways. **Copying the `sqlite` and `data` folders** (as under restoring above) moves everything, sign-ins and
keys included, but the new server must run the same CartVibe version with the same `ENCRYPTION_KEY`. **Export and
import** moves the household's data between any two versions, without sign-ins or keys:

1. On the old server: **System Settings → Export & import**, leave **Include photos and PDFs** on, **Download**.
2. Set up the new server and sign in with its first admin account. Add nothing yet: an import only goes into an empty
   household (no receipts, no shopping lists).
3. On the new server: **System Settings → Export & import → Choose file…** and pick the ZIP. A large file uploads best
   over Wi-Fi from a computer. If the new server sits behind a reverse proxy (Synology's included), make sure it accepts
   uploads that large.
4. Check the preview: the counts, the people, what will change (the currency and time zone come from the file). Under
   **Which person in the file are you?**, pick yourself, so your receipts and goal become your account's. Press
   **Import**. It runs in the background; you can leave the page.
5. Afterwards: people kept as a name show on their receipts but cannot sign in. Under **Management → Users**, use
   **Convert to normal user** to give each a password. Set up the AI and the Logo.dev key again. Reload the page.

If the import stops, nothing was changed: fix what the message says and try again.
