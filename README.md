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
