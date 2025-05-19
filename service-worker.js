self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => console.log("SW active"));
self.addEventListener("fetch", () => {});
