# Raihan & Aiman · Wedding memories

A mobile-first wedding camera. Guests scan your QR code, capture a photo, optionally leave a wish, and send it to your private Telegram collection. Guests never need Telegram, an account, or contact details.

[GitHub repository](https://github.com/zaimanza/raihanaiman_wedding_qr)

[Live wedding camera](https://raihanaiman-wedding-qr.vercel.app/) — use this HTTPS address as the destination for your wedding QR code.

## The guest experience

```text
/ → camera → capture → /summary → photo + optional wish → Submit
                                                          ↓
                          private Telegram photo + caption
                                                          ↓
                         “Sent with love” → fresh camera
```

The rear camera is preferred. A camera switch appears when a second camera is available. Camera permission is the only device permission requested; the app does not record video or audio.

The Summary route requires a captured photo in React memory. Direct entry, another tab, a bookmark, or refreshing `/summary` returns to `/`. Retake discards the draft. Failed uploads preserve the photo and wish so the guest can retry. Successful delivery briefly shows a success state, clears the draft, and restarts the camera.

## Architecture and privacy

React, TypeScript, Vite, React Router, native CSS, `getUserMedia`, and Canvas power the frontend. The same repository contains a Node.js Vercel function at `api/submit.ts`.

```text
Camera frame
  → resized JPEG Blob in browser memory
  → POST /api/submit (multipart/form-data)
  → Vercel function memory
  → Telegram Bot API sendPhoto
  → private Telegram group or channel
```

Photos and wishes are never written to localStorage, sessionStorage, IndexedDB, cookies, a database, or server temporary files. The preview uses a temporary object URL, which is released when its draft is discarded. There is no analytics, tracking integration, gallery, guest login, or offline submission queue. Refreshing or closing the page intentionally loses an unsent draft.

Telegram is the final persistent destination. Group/channel members with access can see the photos; manage membership and invitation links accordingly. Vercel may retain normal platform request metadata. Application logs contain safe operational categories rather than photo bytes, wishes, bot tokens, or Telegram request URLs.

## Run locally

Use **Node.js 22** and npm.

If this checkout already has a configured `.env.local`, keep that file and run `npm run dev`. The setup commands below are for a fresh clone.

```sh
git clone https://github.com/zaimanza/raihanaiman_wedding_qr.git
cd raihanaiman_wedding_qr
npm ci
cp .env.example .env.local
```

Configure Telegram using the steps below, then edit `.env.local` in your editor:

```dotenv
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_destination_chat_id
NODEJS_HELPERS=0
```

The Telegram values are placeholders, not working credentials. Keep the actual credentials only in the ignored local file and Vercel's environment settings. Both Telegram variables are server-side; never use a `VITE_` prefix. `NODEJS_HELPERS=0` is a recommended, non-secret Vercel runtime setting that keeps uploads as raw streams. The API also supports Vercel's default in-memory request replay. Local Vite does not use Node helpers; this setting is included for deployment configuration.

```sh
npm run dev
```

Open the localhost URL printed by Vite. The development server serves both the frontend and `/api/submit` using the same API handler as production. Only the two Telegram variables are loaded into the server process. Restart the development server after editing them.

Camera access requires a secure context. Desktop `http://localhost` is supported by modern browsers. A phone opening `http://192.168.…` on your LAN generally cannot use `getUserMedia`, even if the site loads. Test phones using the deployed **HTTPS** URL or a trusted local HTTPS setup. If a QR scanner opens an embedded browser with restricted camera access, use its “Open in Safari” or “Open in Chrome” option.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Frontend and local upload API |
| `npm run build` | Type-check and create the production frontend in `dist/` |
| `npm test` | Automated tests |
| `npm run check` | Type-check, tests, and production build |
| `npm run preview` | Inspect the built static frontend; this command does **not** serve the upload API |
| `npm run telegram:chat-id` | Discover destination chat IDs without printing your token |

The GitHub workflow runs `npm run check` on pushes and pull requests. The browser verification callbacks in `scripts/browser/` can also be run with the Playwright CLI while the local development server is running:

```sh
npx @playwright/cli -s=wedding open about:blank
npx @playwright/cli -s=wedding run-code --filename=scripts/browser/setup-camera.js
npx @playwright/cli -s=wedding run-code --filename=scripts/browser/check-flow.js
npx @playwright/cli -s=wedding run-code --filename=scripts/browser/check-frame.js
npx @playwright/cli -s=wedding run-code --filename=scripts/browser/check-preview.js
npx @playwright/cli -s=wedding run-code --filename=scripts/browser/check-layout.js
npx @playwright/cli -s=wedding close
```

These callbacks use a clearly labelled simulated camera stream and controlled upload responses, exercise memory/navigation/cleanup/error handling, and check light/dark layouts at phone, tablet, desktop, and landscape sizes. They use the default local URL `http://localhost:5173`. They do not send test photos to Telegram. Screenshots stay in ignored `output/playwright/`. Actual phone cameras and Telegram delivery still require the live checks below.

## Telegram setup

Only the wedding organizers perform these steps. Guests interact solely with the website.

### 1. Create your bot

1. Open Telegram on your phone or computer.
2. Search for **@BotFather** and select Telegram's official account, or open [BotFather](https://t.me/BotFather).
3. Tap Start, then send `/newbot`.
4. Choose a display name, such as `Raihan & Aiman Wedding Memories`.
5. Choose an available username ending in `bot`, such as `RaihanAimanMemoriesBot`.
6. Copy the token BotFather provides into `TELEGRAM_BOT_TOKEN` in `.env.local`. Do not paste it into source code, screenshots, issues, public chats, or a browser address bar.

Keep this bot dedicated to the wedding app. It only sends photos; it does not need commands, inline mode, a webhook, or an always-running bot service. See [Telegram's bot creation guide](https://core.telegram.org/bots/features#creating-a-new-bot).

### 2. Create the private destination

Choose one destination:

| Destination | Setup and bot permissions |
| --- | --- |
| **Private group** | Create a New Group with the organizers, keep its group type Private, and add the bot by username. Allow the bot to send messages and photos. An ordinary member is sufficient when these permissions are allowed; restricted groups may require an administrator exception. Keep BotFather privacy mode enabled. |
| **Private channel** | Create a New Channel and select Private. Open its Administrators settings, add the bot, and enable **Post Messages**. The bot must be an administrator allowed to post. Other optional administrator powers are unnecessary. |

Telegram labels vary slightly between mobile and desktop apps. For a channel, select the channel itself as your destination, not a linked discussion group. This app posts to the chat's main feed; it does not configure forum topic IDs. Telegram documents [group creation](https://telegram.org/faq#q-how-do-i-create-a-group), [private channels](https://telegram.org/faq_channels#q-how-are-public-and-private-channels-different), and [channel posting permissions](https://core.telegram.org/bots/api#chatadministratorrights).

The website QR code should link to your website, not the Telegram invite link. Invite only the people who should see the collection to the private destination.

### 3. Discover `TELEGRAM_CHAT_ID` safely

1. Ensure `.env.local` contains `TELEGRAM_BOT_TOKEN`. Leave `TELEGRAM_CHAT_ID` blank initially.
2. In your **group**, send `/start@YourBotUsername`, replacing the username with your bot's username. Explicitly addressing the bot works with privacy mode enabled. The bot does not need to reply.
3. For a **channel**, publish a short setup post as the organizer after adding the bot. This generates a `channel_post` update.
4. From this repository, run:

   ```sh
   npm run telegram:chat-id
   ```

5. Match the printed destination title/type and copy its complete numeric `id` to `TELEGRAM_CHAT_ID` in `.env.local`.
6. Keep the minus sign. Supergroups and channels commonly begin with `-100`; basic group IDs are also negative. Do not invent or prepend `-100` yourself. A positive personal-chat ID is not your private group/channel ID.
7. Restart `npm run dev` if it was already running.

The utility reads the token from the environment, checks for a configured webhook, then calls Telegram's `getUpdates`. It prints only destination metadata. It does not upload a photo, print message content, or remove an existing webhook.

If no chat appears, send a **new** addressed group command or channel post and rerun the utility. Stop any other program polling the same bot. Telegram keeps incoming updates for at most 24 hours, and `getUpdates` cannot run while a webhook is configured. Use a new dedicated bot if another application owns the webhook; do not disrupt that application. See [Telegram's update documentation](https://core.telegram.org/bots/api#getupdates).

### 4. Test a real upload

1. Start the app and grant camera permission.
2. Capture a photo. Check that it previews correctly on Summary.
3. Write a short wish, then tap **Send Our Wish**.
4. Wait for the success state and return to the camera.
5. Open the private destination as an organizer and verify the actual photo and caption arrived.
6. Repeat with an empty wish; the photo should still arrive.

Capturing does not upload anything. The success state appears only after the server receives Telegram's successful response. Automated tests use controlled Telegram responses; they cannot establish your real token, chat permissions, physical camera compatibility, or live delivery.

## Deploy to Vercel

The frontend and API deploy together. No separate backend project is needed.

1. Push this repository to [GitHub](https://github.com/zaimanza/raihanaiman_wedding_qr).
2. Sign in to Vercel and choose **Add New → Project**.
3. Import `zaimanza/raihanaiman_wedding_qr`.
4. Use the repository root as Root Directory and select the **Vite** preset.
5. Use `npm run build` as Build Command and `dist` as Output Directory. The checked-in configuration handles the Summary route and API separately.
6. Use **Node.js 22.x**, matching the repository's runtime.
7. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the project's Environment Variables settings. Use the **Secret** type when available. Select **Production**; also select **Preview** if preview deployments should allow uploads. A separate test bot/destination is useful for Preview. Do not select a browser-exposed `VITE_` variable name.
8. Recommended: add a third, **non-secret** environment setting, **`NODEJS_HELPERS` = `0`**, in **Production and Preview**. This disables Vercel's automatic request helpers so the API receives the raw multipart stream and controls buffering from the start. The API also handles Vercel's default in-memory request replay with the same input limits, so uploads work if this setting is omitted. See [disabling Vercel Node.js helpers](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration#disabling-helpers-for-nodejs).
9. Deploy. If variables were added or changed after a deployment, create a **new deployment/redeploy**; previous deployments do not inherit those changes.
10. Open the production HTTPS URL on actual phones and complete the real-upload test.
11. Encode the production root URL, ending in `/`, in your printed wedding QR code. Scan the printed version before the event. Do not encode `/summary` or a temporary preview URL.

The production URL must be accessible to guests without Vercel authentication or deployment-password prompts. Test it in a browser where you are signed out of Vercel. A custom domain is optional; the supplied HTTPS Vercel domain works.

See [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [environment-variable scope and redeployment](https://vercel.com/docs/environment-variables), and [supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Upload validation and limits

The client saves the centered crop visible in the camera preview, preserves that composition's aspect ratio, and limits the long edge to 1920px without upscaling. The original botanical corners and centered Raihan & Aiman Wedding · 11 Oct 2026 text are preview decorations only. Flowers, wedding text, animated light specks, and camera controls are absent from the saved JPEG shown in Summary and sent to Telegram. Front-camera capture matches the mirrored camera image.

It encodes JPEG at 0.86 quality, trying 0.82 and then 0.78 only when necessary to meet the size limit. If even those settings exceed 3 MiB, capture fails gracefully and asks the guest to retry. Canvas captures the displayed camera frame, so uploaded photos do not carry phone-file EXIF orientation metadata.

The API independently validates multipart structure, expected fields, MIME type, image signature/dimensions, photo size, and normalized wish length. It accepts **JPEG, PNG, and WebP** only; the camera produces JPEG. Photos are limited to **3 MiB** and the entire request to **3.25 MiB**, leaving space below Vercel's **4.5 MB** request limit. Wishes are limited to **800 UTF-16 code units**; emoji may count as two. Captions are sent as plain text, so guest content cannot inject Telegram formatting. An empty wish is supported. Telegram allows 1024 caption characters and photos up to 10 MB; the application's stricter limits are intentional. See [Vercel function limits](https://vercel.com/docs/functions/limitations) and [Telegram `sendPhoto`](https://core.telegram.org/bots/api#sendphoto).

The API accepts same-origin browser submissions and returns generic guest-facing failures. The client locks submission immediately and retains one submission ID through retries. A bounded, short-lived server memory cache coalesces duplicate requests on the **same function instance**. It retains operational IDs, not photo bytes or wishes.

This is **best-effort duplicate prevention**, not durable exactly-once delivery. Independent Vercel instances do not share memory. A Telegram upload can also succeed while its response is lost; retrying may create a duplicate in that case. There is no database, durable queue, or distributed rate limiter. Same-origin checks discourage cross-site browser requests but do not authenticate a public endpoint or prevent a script from calling it. For public abuse, use the protections available in your Vercel plan and keep the wedding link's distribution intentional.

Telegram's published guidance advises roughly one message per second to a single chat and limits bots in groups to 20 messages per minute. Busy bursts can receive rate limits; guests keep their drafts and retry after the indicated wait. Internet, Telegram availability, and Vercel Hobby usage limits still apply. The app does not enable paid Telegram broadcasts. See [Telegram's sending limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this) and [Vercel Hobby limits](https://vercel.com/docs/limits).

## Before the wedding

- Test iPhone Safari, Android Chrome, and Samsung Internet on the production HTTPS URL with real cameras.
- Test front/rear switching, portrait/landscape rotation, short screens, keyboard visibility, safe-area padding, and widths near 375, 390, 412, and 430px.
- Deny camera permission once, then verify the permission guidance and retry behavior. Check a device with no camera.
- Retake a photo and confirm the old image/wish disappear. Refresh Summary and confirm it returns to the camera. Check browser Back/Forward.
- Temporarily disconnect the network on Summary, submit, and verify the photo/wish survive the error. Reconnect and retry.
- Tap Submit repeatedly and confirm only one request is active. Verify success in Telegram rather than relying only on the browser display.
- Try an empty wish and emoji near the character limit. Confirm buttons and textarea work using a keyboard and reduced-motion settings.
- Check venue Wi-Fi/mobile coverage and Vercel usage; perform a small controlled burst to confirm the Telegram destination handles expected arrivals.
- Keep an organizer able to check the private collection during the event.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Camera unavailable on a phone | Use HTTPS, not a LAN HTTP address. Open in Safari/Chrome if an embedded QR browser restricts camera access. |
| Camera permission denied | Allow camera access for the site in the browser/device settings, return to the page, then retry. The app cannot override a denied permission. |
| Camera busy or no camera found | Close another camera app/tab, retry, or use a device with a camera. Only video permission is needed. |
| `/summary` returns to the camera | Expected when no photo exists in the current tab's React memory, including after a refresh. |
| Chat-ID utility prints no destinations | Send a fresh `/start@YourBotUsername` in the group or publish a fresh channel post, confirm bot membership, and stop other polling processes. |
| Chat-ID utility reports a webhook | Another integration owns incoming updates. Use a dedicated new bot or obtain the destination ID from that integration. The wedding app requires no webhook. |
| Server logs indicate bot authorization failure | Check the exact token copied from BotFather, the local/Vercel environment scope, and whether it was rotated. Restart locally or redeploy on Vercel. |
| Server logs indicate destination/permission failure | Keep the complete negative chat ID. Confirm bot membership and photo permission for a group, or administrator **Post Messages** permission for a channel. If a group migrated to a supergroup, rediscover its current ID. |
| Upload works locally but fails on Vercel | Confirm both Telegram variables exist in the deployment's environment, then redeploy. The recommended **`NODEJS_HELPERS=0`** setting enables direct streaming; default request replay is also supported. `npm run preview` alone has no API. Check the Vercel function logs for safe error categories. |
| Guest sees a temporary upload error | Keep the page open and retry after connectivity returns. If a waiting time is shown, let it elapse; Telegram may be rate-limiting a burst. |
| Repeated failures during heavy use | Check Telegram rate limits, Vercel usage, and destination permissions. There is no hidden offline queue. |
| Duplicate photo after a retry | An earlier delivery may have succeeded despite a lost response, or the retry reached another function instance. An organizer can remove the duplicate in Telegram. |

If the bot token is ever disclosed, revoke it using BotFather, generate a replacement, update `.env.local` and Vercel, and redeploy. Do not paste raw Telegram API errors or token-bearing URLs into public support conversations.

## Project layout

```text
api/submit.ts              Server-only Telegram submission handler
src/components/           Icons, botanical decoration, shared UI
src/context/              In-memory photo/wish draft
src/hooks/                Camera lifecycle and controls
src/pages/CameraPage.tsx   Full-screen camera at /
src/pages/SummaryPage.tsx  Protected preview and wish at /summary
src/services/             Same-origin submission client
src/styles/               Responsive enchanted-garden theme
src/types/                Application types
src/utils/                Photo capture, compression, and helpers
scripts/                  Safe Telegram setup utility
vite.config.ts            Build settings and local API middleware
vercel.json               Deployment routing and security headers
.env.example              Blank server credential template
```

No service worker or offline cache is installed. Changes to the visual theme do not require changing Telegram credentials or adding a backend service.
