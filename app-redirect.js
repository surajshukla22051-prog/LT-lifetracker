(function () {
    "use strict";

    if (location.protocol === "file:") return;

    const configuredUrl = window.LT_CONFIG && window.LT_CONFIG.LIFETRACK_APP_URL;
    if (!configuredUrl) return;

    let appUrl;
    try {
        appUrl = new URL(configuredUrl);
        if (appUrl.protocol !== "https:") throw new Error("LifeTrack app URL must use HTTPS.");
    } catch (error) {
        console.error("LifeTrack app URL is invalid.", error);
        return;
    }
    if (appUrl.origin === location.origin) return;

    const page = location.pathname.split("/").filter(Boolean).pop() || "index.html";
    const supportedPages = new Set(["index.html", "dashboard.html", "privacy.html", "terms.html"]);
    const target = new URL(supportedPages.has(page) ? page : "index.html", appUrl);
    target.search = location.search;
    target.hash = location.hash;
    window.LT_REDIRECTING = true;
    location.replace(target.toString());
})();
