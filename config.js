/* LifeTrack settings. Edit only this file.
   1) Paste your Google OAuth Client ID below (Google Cloud Console > Credentials > Web application).
      In "Authorized JavaScript origins" add your live site, e.g. https://surajshukla22051-prog.github.io
   2) Enable Google Drive API and allow drive.appdata for Google account cross-device data sync.
   3) Enable the API and read-only scopes selected below for this OAuth Client ID.
   4) GOOGLE_FIT selects the legacy Fit API; when false, Google Health is used instead.
      The legacy Fit API is deprecated and may stop working.
   5) Set GROQ_WORKER_URL to your deployed Cloudflare Worker URL to enable LifeTrack AI.
      Never put a Groq API key in this file. */
window.LT_CONFIG = {
    GOOGLE_CLIENT_ID: "962104658585-rc3pe5st455kn9fia2dhq9s221f1fof4.apps.googleusercontent.com",
    GOOGLE_HEALTH: true,
    GOOGLE_FIT: true,
    GROQ_WORKER_URL: "https://lifetrack-ai.surajshukla22051.workers.dev"
};
