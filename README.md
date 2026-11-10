# LifeTrack

A LifeTrack habit-tracking dashboard served by Cloudflare Workers, with GitHub
Pages kept as a redirect/entry point.

## Publish LifeTrack

1. Create or use the GitHub repository [LT-lifetracker](https://github.com/surajshukla22051-prog/LT-lifetracker).
2. Upload the app source files to the repository root. Do **not** upload
   `files/client_secret_*.json`, `files/*.jks`, or `worker/.wrangler/`; keep
   client secrets, signing keys, and local Cloudflare state private.
3. In **Settings → Pages**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)`, then save.
5. The GitHub Pages URL stays as an entry point and redirects users to the
   same-origin Cloudflare app required for persistent, secure Google sessions.

[Open LifeTrack](https://lifetrack-ai.surajshukla22051.workers.dev/)

The primary app URL is `https://lifetrack-ai.surajshukla22051.workers.dev/`.
Deploy the Worker and configure its secrets and auth KV namespace (instructions
below) before enabling the redirect in `config.js`.

The LifeTrack logo is configured as the site favicon, phone home-screen icon,
and installable web-app icon through `manifest.webmanifest`.
The public Privacy Policy and Terms of Service are available in `privacy.html`
and `terms.html`.

## LifeTrack AI V2.0 development

V2 is being built in phases inside the existing web dashboard, Cloudflare
Worker, and Android WebView app. The V2 roadmap and current implementation
scope are in [`V2_ROADMAP.md`](./V2_ROADMAP.md). The first increment adds a
transparent daily Life Score with adjustable category weights; it uses actual
tracker records, excludes missing optional data, and does not score exercise
minutes. Weight preferences are currently saved only on the active account's
device. This work is not a production V2 release: the published app/APK version
stays unchanged until the release is fully tested and deliberately deployed.
The separate [monetization and AI Coach roadmap](./V2_MONETIZATION_AI_ROADMAP.md)
records the audited architecture, chosen D1/Razorpay/Google identity foundation,
and phased implementation status. D1 is provisioned and bound to the deployed
Worker; production ads and account-based AI metering remain disabled.

The monetization schema in `worker/migrations/` is applied to the configured
Cloudflare D1 database and the Worker is bound to it. AdMob IDs are configured
server-side, but both ad switches remain off. AI usage metering is also explicitly
off (`AI_USAGE_CONTROL_ENABLED=false`), so the existing 40-chat shared daily cap
still applies; its counter is now stored atomically in D1 rather than written to
KV on every chat. Payments and subscription activation remain inactive. Do not
enable ad serving or rewards until AdMob review, consent configuration, the
server-side verification callback, and owner authorization are ready.
Google OAuth state and refreshed sessions are stored in D1 with expiry so the
login flow does not depend on daily Cloudflare KV writes; existing KV sessions
are still accepted during migration.

The proposed plan prices are Free ₹0, Pro Monthly ₹99/month, and Pro Yearly
₹699/year; subscription checkout and renewal are not active. The proposed AI/Groq
allocation is 10% of each verified gross payment: ₹9.90 from a ₹99 monthly charge,
or ₹69.90 from a ₹699 annual charge. This amount is an internal cost allocation,
not money sent to Groq or a spendable user balance; Groq bills the account owner
separately. Razorpay settles eligible proceeds to the merchant bank account
configured in Razorpay after provider fees, taxes, refunds, and other applicable
adjustments. AdMob is unrelated to subscription payment settlement. Refund
eligibility remains subject to a reviewed policy and manual admin approval; no
refund is automatic or guaranteed here.

The existing Groq API key and configured model remain shared by the app. A
D1-backed metering path and cross-device conversation storage are implemented,
but metering remains disabled until its budgets and cost controls are configured.
Payment/subscription activation is not live.

### Goals and habits

New goals create a matching habit by default, so progress is tracked through
real check-ins. You can choose Easy, Medium, or Hard difficulty, or select an
existing habit or all habits instead. Goal progress remains available in the
yearly month-by-month view.

## Install LifeTrack as an app

Deploy the Worker app and open its HTTPS URL once on each device.
On Android, open Chrome's menu and choose **Install app** or **Add to Home
screen**. On Windows, open the site in Chrome or Edge and choose **Install
LifeTrack** from the address bar or browser menu. The service worker caches the
app shell from either the login page or dashboard, including `index.html` and
`dashboard.html`, for launch when offline; Google sign-in, Drive sync, and
health sync still require an internet connection. Updates are fetched from the site when
online. On Android, the APK switches WebView to cached-resource mode while
internet is unavailable and back to normal network-first loading when a
validated connection returns; previously loaded pages/resources are required.
Bundled assets are also served through Android's service-worker request path,
so an installed web service worker cannot bypass the APK's offline fallback.
Tracker edits are saved to local storage immediately; a persistent
dirty marker remains until a Drive upload succeeds. When the connection returns,
LifeTrack pulls the latest Drive file, merges it with local changes, and retries
pending uploads on reconnect and at one-minute intervals. HTML, CSS, and
JavaScript use network-first caching, with the cached app shell as the offline
fallback; Google, OAuth, and API requests are not cached.

### Windows and macOS desktop app

The optional native desktop launcher is in `desktop/`. It opens the hosted
LifeTrack dashboard in the default browser, adds a tray/menu-bar launcher, and
registers **Ctrl+Alt+L** (on macOS, **Control+Option+L**). Opening the browser
keeps the existing LifeTrack sign-in and saved browser data available. The
launcher starts at login so the global shortcut remains available. Choose
**Quit LifeTrack** from the tray menu to stop the background helper. If another
app already owns that hotkey, LifeTrack reports that it could not register it.

Build the Windows installer on Windows with Node.js 22.12 or newer:

```powershell
cd desktop
npm install
npm run dist:win
```

Build the macOS DMG/ZIP on a Mac with Node.js 22.12 or newer:

```sh
cd desktop
npm install
npm run dist:mac
```

Installers are written to `desktop/releases/`. The macOS build must be produced on
macOS; publicly distributing it without security warnings also requires Apple
code signing and notarization. Install LifeTrack and launch it once on each
computer to enable the global shortcut and automatic startup.

### Native Android app (APK)

An optional Android Studio project is in `android/`. Open that folder in
Android Studio with JDK 17 and the Android SDK for API 36 installed, let Gradle
sync, then use **Build > Build Bundle(s) / APK(s) > Build APK(s)**. Android
Studio places the debug APK under `android/app/build/outputs/apk/debug/`; install
it on the phone and open LifeTrack once.
The Android project is prepared at version 1.1.8 (version code 33); the public
APK remains at 1.1.7 until the new release is configured and built. The
dashboard updates only
the visible section during tracker refreshes, and its phone layout avoids
continuous blur and heavy hover effects to reduce rendering work.

The native app schedules reminders with Android alarms, so they can appear in
the system notification panel after the app is swiped away. In its dashboard,
add reminders again and tap **Enable Android phone reminders** to grant
notification and (on Android 12+) exact-alarm access. The native app has
separate local browser storage from Chrome/PWA, so reminders and other
device-local data do not automatically transfer between them. Google sign-in
in the Android app opens the secure Google authorization page in the system
browser and returns the account to LifeTrack.

#### Optional advertising setup

The Android app uses Google's official Mobile Ads SDK and UMP consent SDK.
Production advertising stays off. Real AdMob IDs and Cloudflare D1 are configured,
but account review, consent messages, the SSV callback, and owner authorization
are still pending. AdMob bank or
payout details are not needed to build or test with Google's sample ads.

To create the IDs, open the [AdMob Console](https://admob.google.com/), choose
**Apps → Add app → Android**, and use the Android package name
`com.lifetrack.app`. In that app, create separate **Banner** and **Rewarded**
ad units. Copy the App ID and both unit IDs from AdMob; never substitute the
sample IDs below as production IDs.

For Android development, Google's sample IDs are already built in and real ads
cannot be used in a debug build. To opt into test ads, add
`ENABLE_ADMOB_TEST_ADS=true` to the local Gradle properties. The test IDs are:

- App: `ca-app-pub-3940256099942544~3347511713`
- Banner: `ca-app-pub-3940256099942544/9214589741`
- Rewarded: `ca-app-pub-3940256099942544/5224354917`

Test rewarded ads only display a test result; they never grant AI credits. A
release build requires real App ID and both real unit IDs in local Gradle
properties (`ADMOB_APP_ID`, `ADMOB_BANNER_AD_UNIT_ID`,
`ADMOB_REWARDED_AD_UNIT_ID`) plus `ENABLE_REAL_ADMOB_ADS=true`. Keep these
values out of source control.

Secure rewarded credits use the configured Cloudflare D1 database and all three
migrations. The Worker variables `ADMOB_APP_ID`,
`ADMOB_BANNER_AD_UNIT_ID`, and `ADMOB_REWARDED_AD_UNIT_ID` to the same real
IDs. Set `MONETIZATION_ADMIN_EMAIL` to the owner's verified Google sign-in email
(as a Worker secret). The owner must sign in again after that configuration so
the current verified-email status is available to the backend. Configure the
AdMob rewarded unit's
server-side verification callback to
`https://<your-worker-host>/api/monetization/reward/ssv`; AdMob appends the
signed callback parameters. Then sign in as the configured owner and enable
banner/rewarded ads from the dashboard's owner controls. The current deployment
keeps both switches off; owner controls will be available after the verified
email secret is configured. The database defaults
both switches off. Reward policy defaults are five AI credits once every seven
days, expiring after 24 hours; the backend verifies the signed callback and
prevents duplicate claims. Do not enable rewards until the callback has been
configured and tested.

Before enabling production ads, configure and publish the applicable UMP
privacy messages in AdMob **Privacy & messaging**, verify the published
privacy-policy disclosure, and test consent, Free/Pro banner behavior,
rewarded-ad completion, duplicate callbacks, and expiry on a test device.
Keep the owner ad switches off until those checks pass. Never click live ads
during testing.

For the website, set `ADSENSE_CLIENT_ID` and `ADSENSE_INSTALL_SLOT_ID` in both
root `config.js` and `worker/site/config.js` after AdSense approval. Until both
are valid, no advertising script is requested and the ad container stays
hidden. Configure Google's required privacy/consent messages in the relevant
accounts before enabling ads. The app and website do not send LifeTrack
habit/health records for ad targeting. The backend IDs are configured, but
remote switches remain off, so this deployment does not generate ads or revenue.
The Android app
checks the server-verified subscription status before loading a banner and
suppresses it for an active Pro entitlement. The website install-page slot also
checks server status before loading; it is withheld when a signed-in account's
entitlement cannot be verified. A failed entitlement check does not grant Pro
access.
Android can stop alarms after the app is force-stopped; reopen the app to
resume them. The APK loads the hosted Worker app and includes a bundled dashboard fallback
for network failures. It still needs internet for first-time online features,
Google sign-in, Drive sync, health uploads, and fetching newer site content. The Android app also schedules one
original daily motivation notification at a random local time between 9 AM and
9 PM. Keep LifeTrack notifications enabled to receive it; opening the AI panel
or dismissing the Android notification clears its unread badge.
The Android reminder controls show notification and exact-alarm permission
status. Use **Test alarm while app is closed (1 min)** to test alarm scheduling;
swipe the app away from Recents without force-stopping it, then wait for the
system notification. The separate notification display test checks only
immediate notification display, not background alarm delivery. Unread reminders
appear as a count on the AI launcher until the AI panel is opened or their
Android notification is dismissed.

To import health readings on Android, open **Additional features** and choose
**Connect Android Health Connect**. Approve the individual read permissions for
Steps, Sleep, and Active calories, then allow Health Connect background
reads for scheduled collection. Steps and sleep are read independently, so
denying an optional data type does not block the others. Android 9+ with Google Play services is
required; Android 13 and older may need the Health Connect app installed.
Automatic collection uses unique WorkManager jobs: local reads have no network
constraint, while Drive uploads wait for a connection and are kept in a local
SQLite queue when offline. Health Connect Changes API tokens are stored locally
to apply new, updated, and deleted records, with a recent-history backfill if a
token expires. The dashboard shows granted permissions, last sync, an estimated
next sync, and pending uploads; the estimate is not a guarantee.

WorkManager's periodic interval is at least 15 minutes and Android may delay
execution for battery, idle, or manufacturer policies. Opening LifeTrack also
triggers a sync. If allowed, the existing foreground step monitor can update
the phone's step count and Health Connect readings more frequently while its
persistent notification is active; it uses more battery. Swiping the app away
does not itself stop WorkManager, but Android Force stop prevents scheduled
work until the app is launched again. WorkManager normally restores work after
reboot; exact background timing cannot be guaranteed.

When Google Drive is connected and the phone is online, readings merge into
LifeTrack's existing private Drive data file without replacing unrelated data.
Otherwise they remain queued on the phone. The web dashboard reads the same
Drive fitness records, so PC updates depend on the existing dashboard refresh
and an available network connection.

The Android app checks the Worker for newer APKs about once per day when
network access is available and can post an update notification. Older APKs
also show an in-dashboard update prompt; tapping it opens the APK download in
the phone's browser, where Android asks the user to confirm installation. This
is a browser/download flow, not a silent install or push notification.
Notification permission and Android background scheduling affect system
notifications. To publish a new Android version, increment `versionCode` in
`android/app/build.gradle.kts`, update `ANDROID_LATEST_VERSION_CODE` in
`worker/wrangler.toml`, rebuild the APK, replace
`worker/site/lifetrack-android.apk`, then run `node worker/build-assets.mjs`
before deploying the Worker.

The Android dashboard caches its app shell after the first successful online
load. Once cached, the dashboard and locally stored tracker data remain
available offline; Google Drive, AI, and other server-backed features need an
internet connection. Pending tracker edits sync when the connection returns
and Google sync is authorized.

The dashboard's AI header **Install** menu offers Windows and Mac browser
installation, iPhone Safari Home Screen instructions, the Android APK, and the
iOS source project with Mac/Xcode setup instructions. Full platform steps are
available in [`install.html`](./install.html). Mac and iPhone can use the
installable web app now; the native iPhone app still needs an Apple-signed
TestFlight build, and the native Mac launcher needs to be built on a Mac.
The debug APK built from this project is
`android/app/build/outputs/apk/debug/app-debug.apk`; the copy served by the
Worker is `worker/site/lifetrack-android.apk`. Rebuild and replace that copy
before running `node worker/build-assets.mjs` and deploying the Worker.

### Native iPhone app (TestFlight / App Store)

The iOS app source is in `ios/`. It uses Apple's system sign-in session for
Google OAuth and schedules habit reminders with iPhone local notifications.
Download the source from
[`ios/LifeTrack-iOS-source.zip`](./ios/LifeTrack-iOS-source.zip) or from the
dashboard Install menu. Mac/Xcode/TestFlight setup steps are in
[`install.html`](./install.html#ios-xcode) and [`ios/README.md`](./ios/README.md).
To build it, use a Mac with current Xcode and XcodeGen, open a terminal in
`ios/`, run `xcodegen generate`, then open `LifeTrack.xcodeproj`. Select your
Apple Developer team and a unique bundle identifier under **Signing &
Capabilities**, then archive and upload through Xcode Organizer to App Store
Connect for TestFlight review. Public App Store distribution also requires
App Store review and the app's privacy details.

Google sign-in in this iOS app uses the Worker OAuth handoff for
`returnTo=ios`; deploy the updated `worker/index.js` before testing iPhone
Google sign-in. Building and signing an `.ipa` requires macOS/Xcode and the
Apple Developer account; it cannot be produced from this Windows workspace.
The app also requests read-only Apple Health access for steps and sleep only
when you choose **Connect Apple Health** in **Additional features**. Readings
are imported into Fitness Today and remain on-device unless you use Google
sign-in, which includes them in the existing private Google Drive tracker
sync.

## LifeTrack AI (Groq)

The dashboard includes a logo-branded assistant for text chat, optional browser
speech input/output, private notes, and review-before-apply controls for habits
and today's check-ins, goals, fitness logs, reading progress, body-profile
settings, reminders, daily tasks, focus sessions, navigation, and extra plan tasks. The
assistant only proposes changes explicitly requested in chat; users review and
apply each proposal before it changes tracker data. Private notes remain local
and are not sent to the AI. Voice input requires
a supported browser on HTTPS (or localhost) with microphone permission. Notes and custom
plan tasks are stored in this browser/account namespace and included in manual
LifeTrack backup files; private notes and AI chat history are not sent with
manual backups. The assistant keeps up to 24 recent user/assistant exchanges.
For Google sign-in accounts, recent chat history is also synced through the
private Google Drive app-data area so it can continue across devices using the
same Google account. Other account types keep chat history on this device.
When you send a prompt, LifeTrack sends the recent chat,
habit names, each habit's today's done/undone status, goal summary, a seven-day
check-in count, limited plan preferences, today's steps/water/sleep/focus/mood
values, reading progress, and saved reminder names/times to Groq through the Worker. It does not send body
measurements or saved notes as context. The assistant follows the user's language and tone and may use an
occasional fitting emoji to keep replies friendly. If browser speech recognition is unavailable, the microphone records
until you tap it again and sends the audio through the Worker to Groq for
transcription; review the recognized text before pressing Send. Recordings are
not saved by LifeTrack. Avoid including sensitive health or personal information
in chat or voice recordings.

Groq API keys must stay in server-side Worker secrets. The Worker can use
`GROQ_API_KEY_2` as a fallback if `GROQ_API_KEY` is rejected or rate-limited.
Configure each key separately with `npx wrangler secret put GROQ_API_KEY` and
`npx wrangler secret put GROQ_API_KEY_2` from the `worker` directory. A
fallback key only helps if it has available quota; keys sharing the same Groq
account or organization may share limits.

To deploy the included Cloudflare Worker:

1. Install Node.js and sign in to a Cloudflare account.
2. From the `worker` directory, run `npx wrangler login`.
3. Edit `worker/wrangler.toml` and set `ALLOWED_ORIGINS` to the exact HTTPS
   origins serving LifeTrack, including the Worker app origin.
4. Create a separate KV namespace for OAuth sessions, then replace
   `REPLACE_WITH_AUTH_KV_NAMESPACE_ID` in `wrangler.toml` with its ID:

   ```powershell
   npx wrangler kv namespace create LIFETRACK_AUTH
   ```

5. Configure the Google OAuth Web application client. Register this exact
   **Authorized redirect URI** in Google Cloud Console:

   `https://lifetrack-ai.surajshukla22051.workers.dev/api/auth/google/callback`

   Set the following Worker secrets (never add them to project files):

   ```powershell
   npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
   npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
   npx wrangler secret put GOOGLE_TOKEN_ENCRYPTION_KEY
   ```

   Enter the existing Web application Client ID and its client secret when
   prompted. Generate a separate random encryption key, for example:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   Keep the generated encryption key private and back it up securely; changing
   it makes existing encrypted Google refresh tokens unreadable, so affected
   users must reconnect.

6. From the `worker` directory, build the public app assets and deploy:

   ```powershell
   node build-assets.mjs
   npx wrangler deploy
   npx wrangler secret put GROQ_API_KEY
   ```

   Paste the key only into Wrangler's hidden prompt. Never add it to `config.js`,
   source code, or chat. The optional Worker variable `GROQ_MODEL` can select a
   Groq model; the configured default is `openai/gpt-oss-120b`.
7. Publish the updated project to GitHub Pages. `app-redirect.js` sends entry
   point visits to the Worker app; the Worker serves the actual dashboard and
   API from the same origin.

Google's consent screen must be in **Production** for long-lived refresh tokens.
In Testing mode Google can expire refresh tokens after seven days. Google may
also require OAuth verification for the requested Drive and health scopes.

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

The Google button on `index.html` uses the Cloudflare Worker authorization-code
flow. Enable the **Google Drive API** in the same Google Cloud project as the
OAuth client, and allow the `drive.appdata` scope.
LifeTrack stores one private JSON file in the account's hidden Drive app-data
folder; it is not visible in normal Drive listings.

Use the Google OAuth **Web application** Client ID and secret as Worker secrets
as described above. The public Client ID is also retained in:

`config.js`

The callback URL must match the **Authorized redirect URI** exactly. Google
client secrets are server-only; never commit or publish them.

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

Google access tokens remain short-lived in browser session storage. A
30-day, rolling, HttpOnly/Secure/SameSite cookie identifies the session, while
the refresh token is encrypted with a separate Worker secret before storage in
the private `LIFETRACK_AUTH` KV namespace. The app refreshes access tokens
without prompting again; signing out revokes the LifeTrack session. Users can
revoke LifeTrack's Google access at any time in Google Account security
settings. Google can still invalidate a refresh token, and the user may then
need to connect again.

## Fitness data and health permissions

The web app does not request Google Fit or Google Health scopes. Google sign-in
continues to request the basic profile and private Google Drive app-data access
used for account sync. In the native Android and iPhone apps, choose
**Additional features → Connect health data** to grant read-only Steps and
Sleep access through Android Health Connect or Apple Health. LifeTrack imports
available health readings into Fitness Today; device health readings are
read-only in the dashboard. The workout plan has a Start/Stop/Save exercise
timer; saved minutes sync as fitness data, reset for each new day, and appear
in daily and yearly Fitness trends. Focus progress is shown against a
30-minute daily target and counts only completed LifeTrack **Focus Session**
minutes; Android app usage is not treated as Focus. The timer works on both
Android and PC, restores running or paused sessions after a reload, and syncs
completed sessions through Google Drive. Android's separate Device Focus
permission can read app foreground usage; PC browsers cannot read usage time
from other Windows apps. Device usage requires the separate Usage Access
special permission, reads no app names, and can be revoked in Android settings.
On Android 13 and later, sideloaded APKs may require **App info → ⋮ → Allow
restricted settings** before Usage Access can be enabled; LifeTrack guides you
to the relevant settings screens.
Water and mood remain user-editable. Android continuous monitoring
uses the phone's step counter and Health Connect in an ongoing foreground
service, with a persistent notification showing steps and sync status. It needs
Health Connect background access, notifications, and Physical activity
permission. It refreshes about once a minute while running, but Android can
still stop services; WorkManager's fallback is limited to at least 15 minutes.
Permissions are optional and can be revoked in system settings.

Health data is not requested during Google sign-in. Imported Fitness Today
entries stay on the device unless you use Google sign-in, in which case they
are included with the existing tracker backup in the private Google Drive
app-data area.
