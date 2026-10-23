/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// Chrome on Android only offers installation when a fetch handler exists.
// Pass-through on purpose: caching authenticated pages would serve stale or
// logged-out content.
self.addEventListener('fetch', (event) => {
	event.respondWith(fetch(event.request));
});
