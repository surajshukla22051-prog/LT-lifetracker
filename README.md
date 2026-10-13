# LifeTrack

A static LifeTrack habit-tracking dashboard.

## Run online with GitHub Pages

1. Create or use the GitHub repository [LT-lifetracker](https://github.com/surajshukla22051-prog/LT-lifetracker).
2. Upload all files in this folder to the repository root.
3. In **Settings → Pages**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)`, then save.
5. Your site will be available at:

[Open LifeTrack](https://surajshukla22051-prog.github.io/LT-lifetracker/)

The LifeTrack logo is configured as the site favicon, phone home-screen icon,
and installable web-app icon through `manifest.webmanifest`.
The public Privacy Policy and Terms of Service are available in `privacy.html`
and `terms.html`.

## Install LifeTrack as an app

Deploy the site to GitHub Pages and open the HTTPS site once on each device.
On Android, open Chrome's menu and choose **Install app** or **Add to Home
screen**. On Windows, open the site in Chrome or Edge and choose **Install
LifeTrack** from the address bar or browser menu. The service worker caches the
app shell for launch when offline; Google sign-in, Drive sync, and health sync
still require an internet connection. Updates are fetched from the site when
online.

## LifeTrack AI (Groq)

The dashboard includes a blue bell assistant for text chat, optional browser
speech input/output, private notes, and review-before-save suggestions for
habits, goals, Daily Body & Mind Plan preferences, and extra plan tasks. Notes and custom
plan tasks are stored in this browser/account namespace and included in manual
LifeTrack backup files; AI chat history stays in this browser and is not sent
with backups. The assistant keeps up to 24 recent user/assistant exchanges in
this browser and sends those recent messages with each prompt so it can follow
up on earlier details. When you send a prompt, LifeTrack sends the recent chat, habit
names, goal summary, a seven-day check-in count, and limited plan preferences
to Groq through the Worker. It does not send body measurements or saved notes
as context. Avoid including sensitive health or personal information in chat.

The Groq API key must stay in a server-side secret. To deploy the included
Cloudflare Worker:

1. Install Node.js and sign in to a Cloudflare account.
2. From the `worker` directory, run `npx wrangler login`.
3. Edit `worker/wrangler.toml` and set `ALLOWED_ORIGINS` to the exact HTTPS
   origin serving LifeTrack (for this GitHub Pages site, the origin has no
   repository path).
4. From the `worker` directory, deploy the Worker, then set the key as a
   secret:

   ```powershell
   npx wrangler deploy
   npx wrangler secret put GROQ_API_KEY
   ```

   Paste the key only into Wrangler's hidden prompt. Never add it to `config.js`,
   source code, or chat. The optional Worker variable `GROQ_MODEL` can select a
   Groq model; the configured default is `openai/gpt-oss-120b`.
5. Copy the deployed Worker HTTPS URL into `GROQ_WORKER_URL` in `config.js`,
   without adding `/api/assistant`, then publish the updated static site.

The Worker only accepts requests from the configured origin, limits request
size, and has a best-effort per-instance request throttle. Configure Cloudflare
edge rate limiting for stronger production abuse protection; browser-origin
checks alone are not authentication.

Reminder notifications use browser push with the Cloudflare Worker scheduler.
After a user grants notification permission and enables reminders from the
hosted HTTPS site, the Worker checks schedules every minute and can send pushes
while the tab is closed. The user's reminder names/times, time zone and browser
push subscription are stored in the Worker-bound Cloudflare KV namespace. Push
payloads are encrypted for the browser by Web Push; the Worker still needs the
subscription details to deliver them. Remove reminders in LifeTrack to remove
their server-side schedule. The device must be online and allow background
notifications; mobile users may need to install LifeTrack as an app. Browser
or operating-system power settings can delay or suppress delivery. This
scheduler sends reminders, not continuous/background AI.

The Worker KV namespace, per-minute Cron Trigger and VAPID key are configured
for this deployment. For a new Cloudflare account, create a `PUSH_SUBSCRIPTIONS`
KV namespace with Wrangler and replace the namespace ID in `worker/wrangler.toml`.
Create a VAPID P-256 key pair, put the private JWK in the Cloudflare
`VAPID_PRIVATE_JWK` Worker secret, and put only its matching public key in
`VAPID_PUBLIC_KEY` in `wrangler.toml`. Never commit the private JWK.
The push subscription and reminder schedule belong to the browser/device that
enabled them. Enable notifications separately on each device; removing the
reminders or using **Delete all your data** removes that device's server-side
schedule.

## Google Login

The Google button on `index.html` signs in and requests Drive app-data access
for cross-device LifeTrack backups. Enable the **Google Drive API** in the same
Google Cloud project as the OAuth client, and allow the `drive.appdata` scope.
LifeTrack stores one private JSON file in the account's hidden Drive app-data
folder; it is not visible in normal Drive listings.

Use a Google OAuth **Web application** Client ID in:

`config.js`

and add this as an **Authorized JavaScript origin** in Google Cloud:

`https://surajshukla22051-prog.github.io`

Do not add `/LT-lifetracker/` to the authorized origin.

Name/email login and Guest mode do not verify identity and remain local to the
current browser/device. Signing in with the same typed email on another device
does not synchronize that local account; use Google sign-in for cloud sync.
Sign in with the same Google account on each device to sync habit check-ins and
other LifeTrack data through its private Drive app-data storage. Changes save
automatically; an already-open device checks for updates once a minute and when
you return to its tab.

LifeTrack remembers the signed-in account name and email in this browser and
opens the dashboard automatically after refreshes and browser restarts. This
local app session lasts until you choose **Log out** or clear this site's
browser data. The profile menu shows which account is remembered and offers
**Switch account** and **Log out** actions.

Google access tokens are short-lived and held only in temporary browser session
storage; LifeTrack never stores your Google password or a refresh token in the
browser. After a browser restart or token expiry, the LifeTrack account remains
signed in, while Google Drive/health sync may pause. Use **Reconnect Google
sync** in the profile menu to grant a fresh temporary token without signing
into LifeTrack again. No OAuth client secret or refresh-token server is
configured for this static GitHub Pages app.

## Fitness data sync

LifeTrack can import steps and sleep from either Google Fit or Google Health.
`config.js` selects the source: `GOOGLE_FIT: true` uses the legacy Fit API and
its read-only Fit scopes; `GOOGLE_FIT: false` with `GOOGLE_HEALTH: true` uses
Google Health and its read-only Health scopes. The two scope families are not
requested together. The current local setting selects Google Fit. Enable the
matching API and scopes in Google Cloud for this OAuth client. After changing
the source, sign in with Google again and grant the newly requested permissions.

For Google Health mode, Fitness Today checks the Google Health identity before
importing readings. If the account is not linked, choose **Set up Google
Health** there and complete setup with the same Google account. If prompted
about a legacy Fitbit account, migrate it to that Google account, then choose
**Retry sync**. For Google Fit mode, the legacy API must still be available to
the project and account; it is deprecated and may stop working. Google access
tokens are temporary and expire when a browser session ends. The LifeTrack
account stays signed in; use **Reconnect Google sync** in the dashboard profile
menu to resume Drive and health syncing without returning to the login page.
Reconnecting requires the same Google account. Data availability depends on
the account, connected devices, and recorded readings. Successfully imported
health readings show **from Google**. The Sleep tile identifies Google-sourced
sleep and offers a provider sync action; manual sleep entry remains an explicit
fallback. Other manually entered values remain separate. Water, focus, mood,
and unavailable device readings stay manual.

If health sync returns HTTP 403, read the full response shown in Fitness Today.
In Google Health mode, `Could not mint UberMint from GaiaMint` means the Google
Health account link was rejected: sign out of the Google Health app, sign back
in with the intended Google account, and complete any requested Fitbit-account
migration. Google sign-in alone does not create an active Google Health profile.
In Google Fit mode, make sure the Fit API and requested Fit read-only scopes are
enabled, then sign in again to grant those scopes. See Google's
[Health API setup](https://developers.google.com/health/setup) and
[troubleshooting guide](https://developers.google.com/health/troubleshooting).
