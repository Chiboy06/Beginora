# Setting up the shared Beginora Telegram bot

With this set up, users connect Telegram with one tap (Settings > Telegram > Connect). They never create a bot or copy a token.

## How it works

```
Phone app  ──https──►  Relay (Cloudflare Worker + D1 database)  ──►  Telegram Bot API
                         holds the bot token as a secret
Telegram   ──webhook──►  Relay  (messages users send to the bot)
```

- The **bot token lives only in the relay**, as an encrypted Cloudflare secret. It is never in the app: anyone can unpack an APK, and with the token they could read every user's messages.
- **Connecting:**
  1. The app asks the relay for a one-time code.
  2. The relay opens `t.me/<YourBot>?start=<code>` in Telegram.
  3. The user taps **Start**.
  4. Telegram sends `/start <code>` to the relay, which links that chat to that phone.
- **Sending:** the app calls the relay, and the relay calls Telegram. Each phone may send at most 30 messages an hour.
- **Replies:** messages users send to the bot wait in the relay until the phone collects them. They are deleted then, or after 24 hours at most.
- **Disconnecting:** `/stop` in Telegram, or **Disconnect** in the app, deletes the link and any waiting messages.

The code is in `relay/`. Its tests run against real SQLite and Postgres databases: `npm run test:relay` (run `npm install` in `relay/` once first).

## About Cloudinary

Cloudinary stores and serves images and videos. It cannot run code, so it cannot receive Telegram's webhook or keep a bot token secret. Use **Cloudflare Workers** (Part 2 below) or **Supabase** (at the end). Both run the same code.

---

## Part 1: create the bot (5 minutes)

1. In Telegram, open **@BotFather** and send `/newbot`.
2. Give it a display name, for example `Beginora`.
3. Give it a username ending in `bot`, for example `BeginoraHelperBot`. If the name is taken, try another.
4. BotFather replies with a **token** like `123456789:AAH...`. Keep it private, and never put it in the app or in git.
5. Optional, in BotFather:
   - `/setdescription`: "Beginora sends your reminders and helps you start tasks."
   - `/setuserpic`: upload the app icon.
   - `/setcommands`, then paste these four lines:
     ```
     next - What should I do next?
     add - Add a task
     stuck - Help me start
     done - Mark the current task done
     ```

## Part 2: deploy the relay on Cloudflare (15 minutes)

You need a free Cloudflare account (https://dash.cloudflare.com/sign-up) and Node.js. Run these commands in a terminal, from the project folder.

1. Log in to Cloudflare from the terminal:
   ```bash
   cd relay
   npx wrangler login
   ```
2. Create the database:
   ```bash
   npx wrangler d1 create beginora-relay
   ```
   Copy the `database_id` it prints into `relay/wrangler.toml`, in place of `REPLACE_WITH_YOUR_DATABASE_ID`.
3. Set `BOT_USERNAME` in `relay/wrangler.toml` to your bot's username, without the `@`.
4. Create the tables:
   ```bash
   npx wrangler d1 execute beginora-relay --remote --file=schema.sql
   ```
5. Store the secrets. Each command asks you to paste a value.
   - The bot token from BotFather:
     ```bash
     npx wrangler secret put BOT_TOKEN
     ```
   - A long random password that only Telegram will know. You can make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
     ```bash
     npx wrangler secret put WEBHOOK_SECRET
     ```
6. Deploy:
   ```bash
   npx wrangler deploy
   ```
   It prints the address, for example `https://beginora-telegram-relay.<your-account>.workers.dev`.
7. Tell Telegram to send the bot's messages to the relay. Put your own values in place of the three parts in capitals:
   ```bash
   curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" -H "Content-Type: application/json" -d "{\"url\":\"https://YOUR-RELAY-ADDRESS/webhook\",\"secret_token\":\"YOUR_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\"],\"drop_pending_updates\":true}"
   ```
   The reply should be `{"ok":true,"result":true,"description":"Webhook was set"}`.
8. Check it:
   ```bash
   curl "https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo"
   ```
   The `url` should be your relay, and there should be no `last_error_message`.

Typing a command with the token in it saves the token in your terminal history. Clear the history afterwards, or type the commands in a terminal that does not keep history.

## Part 3: point the app at the relay

1. Add the relay address to the build, in `eas.json` under `build.preview.env`, and under `production` too when you ship:
   ```json
   "EXPO_PUBLIC_TELEGRAM_RELAY_URL": "https://beginora-telegram-relay.<your-account>.workers.dev"
   ```
   For local development, put the same line in `.env` instead. See `.env.example`.
2. Rebuild the app, for example `eas build -p android --profile preview`. `EXPO_PUBLIC_` values are built into the app, so an over-the-air update alone does not add this address.
3. On the phone:
   1. Open **Settings > Telegram > Connect the Beginora bot**, then tap **Connect**.
   2. Telegram opens. Tap **Start**.
   3. Back in the app, it shows **Connected as \<your name\>**.
   4. Tap **Send a test message**. The message arrives in Telegram.
4. Two-way replies:
   1. Turn on **Answer my Telegram messages**.
   2. Send `/next` to the bot. Beginora answers within about 15 seconds while the app is open or kept running in the background.

## Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| "The shared Beginora bot is not set up in this build." | `EXPO_PUBLIC_TELEGRAM_RELAY_URL` is missing, or isn't `https`. | Repeat Part 3, then rebuild. |
| The bot says "This chat isn't connected yet". | The link was older than 10 minutes, or Connect wasn't tapped first. | Tap Connect again in the app. |
| Nothing happens when you tap Start. | The webhook isn't set. | Repeat Part 2 step 7, and check with `getWebhookInfo`. |
| `getWebhookInfo` shows "Wrong response from the webhook: 403". | `WEBHOOK_SECRET` differs from `secret_token`. | Set both to the same value. |
| "Too many messages this hour." | The 30-per-hour limit for each phone. | Wait, or raise `SENDS_PER_HOUR` in `relay/src/worker.js`. |
| You need the relay's logs. | — | Run `npx wrangler tail` in `relay/`. |

## Cost and limits

- Cloudflare's free plan includes a daily allowance of Worker requests and D1 reads and writes. That is enough for a pilot with many users. Check the current numbers at https://developers.cloudflare.com/workers/platform/pricing/ and https://developers.cloudflare.com/d1/platform/pricing/.
- Telegram allows about 30 messages per second for each bot, and 1 per second for each chat (https://core.telegram.org/bots/faq).

## Security checklist

- The bot token appears only in `wrangler secret`. It is never in `wrangler.toml`, the app, git or chat.
- Every webhook call must carry Telegram's `X-Telegram-Bot-Api-Secret-Token`. Any other call is refused.
- Each phone has a random secret, stored in Android secure storage. The relay keeps only its SHA-256 hash.
- The relay accepts only private chats; groups and channels are ignored.
- Message text is deleted as soon as the phone collects it, and after 24 hours at most. The relay never logs message text.
- Users are told in the app that Telegram and the relay can read these messages. Telegram bot chats are not end-to-end encrypted.
- If the token ever leaks:
  1. In @BotFather, send `/revoke` to get a new token.
  2. Run `npx wrangler secret put BOT_TOKEN` with the new token.
  3. Run the `setWebhook` command again.

## Alternative: Supabase instead of Cloudflare

The same relay code runs as a Supabase Edge Function, on Postgres instead of D1. It lives in `supabase/functions/telegram-relay/index.ts`, with `relay/src/pg-adapter.js` and `relay/schema.postgres.sql`. The relay tests run on both databases; Postgres is tested through PGlite.

You need a free Supabase project (https://supabase.com) and the Supabase CLI (`npm install -g supabase`). Run these from the project folder.

1. Create the tables:
   1. In the Supabase dashboard, open **SQL Editor**.
   2. Paste all of `relay/schema.postgres.sql` and click **Run**.

   The script turns on row-level security, so these tables are not reachable through Supabase's public API.
2. Link the CLI to your project. Your project ref is in your dashboard URL: `supabase.com/dashboard/project/<ref>`.
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```
3. Store the secrets. `SUPABASE_DB_URL` is provided automatically.
   ```bash
   supabase secrets set BOT_TOKEN=YOUR_BOT_TOKEN WEBHOOK_SECRET=YOUR_LONG_RANDOM_SECRET BOT_USERNAME=YourBotUsername
   ```
4. Deploy. `--no-verify-jwt` is needed because Telegram cannot send a Supabase login; the relay checks its own secret instead.
   ```bash
   supabase functions deploy telegram-relay --no-verify-jwt
   ```
5. Point Telegram at it, as in Part 2 step 7, with this address:
   ```
   https://YOUR_PROJECT_REF.supabase.co/functions/v1/telegram-relay/webhook
   ```
6. In the app build, set:
   ```
   EXPO_PUBLIC_TELEGRAM_RELAY_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/telegram-relay
   ```
   Then rebuild, as in Part 3.
7. Logs: Supabase dashboard > **Edge Functions** > **telegram-relay** > **Logs**.

Choose one host. Do not set the webhook to both: Telegram sends updates to only one address.

## Running the relay tests yourself

```bash
cd relay
npm install
npm test
```

This runs every relay test against SQLite and against Postgres. All 17 should pass.
