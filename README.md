# LifeTrack

🚀 **[Open LifeTrack](https://surajshukla22051-prog.github.io/LT-lifetracker/)**

A simple and modern life tracking dashboard for managing habits, goals, routines and personal progress.


A static LifeTrack habit-tracking dashboard.

## Run online with GitHub Pages

1. Create a GitHub repository named `LifeTrack`.
2. Upload all files in this folder to the repository root.
3. In **Settings → Pages**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)`, then save.
5. Your site will be available at:

`https://YOUR-GITHUB-USERNAME.github.io/LifeTrack/`

## Google Login

The LifeTrack Google button is already implemented in `index.html`, but
`config.js` currently contains a placeholder Client ID.

After you have a Google OAuth **Web application** Client ID, put it in:

`config.js`

and add this as an **Authorized JavaScript origin** in Google Cloud:

`https://YOUR-GITHUB-USERNAME.github.io`

Do not add `/LifeTrack/` to the authorized origin.

The normal name/email login and Guest mode work without Google OAuth.
