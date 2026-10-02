# LifeTrack

A static LifeTrack habit-tracking dashboard.

## Run online with GitHub Pages

1. Create or use the GitHub repository [LT-lifetracker](https://github.com/surajshukla22051-prog/LT-lifetracker).
2. Upload all files in this folder to the repository root.
3. In **Settings → Pages**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)`, then save.
5. Your site will be available at:

[Open LifeTrack](https://surajshukla22051-prog.github.io/LT-lifetracker/)

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

LifeTrack currently reads fitness data through Google Health, enabled in
`config.js` with `GOOGLE_HEALTH: true` and `GOOGLE_FIT: false`; it does not use
the legacy Google Fit API. Enable the Google Health API and allow its activity
and sleep read-only scopes for the same OAuth client. These permissions are
requested during Google sign-in. If Fitness Today says health data is not
connected, choose **Reconnect Google** there and allow the requested scopes.
Google access tokens expire, so sign in with Google again after a session ends
to resume cloud and health syncing. Before using health sync, sign in to the
Google Health mobile app with the same account and finish its setup. Data
availability depends on the account, connected devices, and recorded readings.
Water, focus, mood, blood pressure, and unavailable device readings stay manual.

If health sync returns HTTP 403, Google sign-in alone may not mean that the
account has an active Google Health profile. Sign in to the Google Health app
with the same Google account first. If Google reports an old Fitbit account,
complete its migration to that Google account, then retry **Sync now**. Also
check that Google Health API and the requested scopes are enabled in the
Google Cloud project, and add the Gmail address as an OAuth test user while
the consent screen is in Testing. See Google's
[Health API setup](https://developers.google.com/health/setup) and
[troubleshooting guide](https://developers.google.com/health/troubleshooting).
