# CartVibe FAQ

Short answers for running a CartVibe household. Setup, updating and the Synology guide are in the [README](../README.md).

- [How do I rename a household?](#how-do-i-rename-a-household)
- [How do I change a password?](#how-do-i-change-a-password)
- [How do I add AI API keys?](#how-do-i-add-ai-api-keys)
- [How do I add a Logo.dev API key?](#how-do-i-add-a-logodev-api-key)

## How do I rename a household?

1. Sign in as an admin, or as someone allowed to update that household.
2. Open **Management** in the sidebar and choose the **Households** tab.
3. Press the pencil (**Edit group**) on the household's row.
4. Change **Group Name** and press **Save**.

Receipts, shopping lists and members stay with the household; only its name changes.

## How do I change a password?

Passwords are set by an admin; there is no "forgot password" email and no change-password box in User Settings.

1. Sign in as an admin.
2. Open **Management** in the sidebar and choose the **Users** tab.
3. Press the key icon (**Set password**) on the person's row. This works for your own row too.
4. Type a new password, or use the generate button, and save. Send the new password to the person and ask them to sign in with it.

On a fresh install the admin signs in with `admin` / `admin`: change that password straight away. If nobody who can set
passwords remembers theirs, the stored passwords are one-way hashes and cannot be read back; ask another admin, or restore a backup.

## How do I add AI API keys?

The AI reads your receipts, so it needs a key from a provider (or a model you run yourself). You create the key on the
provider's website, then paste it into CartVibe. Each link goes straight to the provider's keys page; it asks you to sign in first.

| Provider | Create the key here | Paste it in CartVibe |
| :--- | :--- | :--- |
| **Claude** (Anthropic) | [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) | **AI** page, provider **Claude** |
| **Gemini** (Google) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | **AI** page, provider **Gemini** |
| **ChatGPT** (OpenAI) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | **AI** page, provider **ChatGPT** |

A model you run yourself (**Local LM**, such as LM Studio or Ollama) needs no key from these sites: choose it on the same **AI** page and enter its address.

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
