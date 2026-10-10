(function () {
    "use strict";

    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;

    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
            .catch((error) => console.error("LifeTrack offline support could not start", error));
    });
})();