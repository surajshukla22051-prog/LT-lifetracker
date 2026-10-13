/* LifeTrack settings. Edit only this file.
   1) Keep GOOGLE_CLIENT_ID as the public OAuth Web application Client ID. The
      matching client ID and its secret must also be set on the Cloudflare Worker.
   2) Enable Google Drive API and allow drive.appdata for Google account cross-device data sync.
   3) Enable the APIs and read-only scopes selected below for this OAuth client.
   4) GOOGLE_FIT selects the legacy Fit API; when false, Google Health is used instead.
      The legacy Fit API is deprecated and may stop working.
   5) LIFETRACK_APP_URL is the same-origin Cloudflare-hosted app used for secure
      persistent Google sync. Set it to the deployed Worker URL.
   6) Never put a Google client secret, refresh token, or Groq API key in this file. */
window.LT_CONFIG = {
    GOOGLE_CLIENT_ID: "962104658585-rc3pe5st455kn9fia2dhq9s221f1fof4.apps.googleusercontent.com",
    GOOGLE_HEALTH: true,
    GOOGLE_FIT: true,
    LIFETRACK_APP_URL: "https://lifetrack-ai.surajshukla22051.workers.dev",
    GROQ_WORKER_URL: "https://lifetrack-ai.surajshukla22051.workers.dev"
};
