/* ===== WordDeck — service worker =====
 * cache-first สำหรับไฟล์แอปทั้งหมด (ใช้ออฟไลน์ได้)
 * + แจ้งเตือนตามตาราง: periodicsync / notification triggers / sync จากหน้าเว็บ
 */
const VERSION = "wd-v1.2.0";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./data/words.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/badge-96.png",
  "./icons/apple-touch-icon.png",
];

/* ---------- install / activate ---------- */
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.allSettled(APP_SHELL.map(u => c.add(new Request(u, { cache: "reload" }))));
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "SKIP_WAITING") self.skipWaiting();
  if (d.type === "SCHEDULE") saveSchedule(d.items || []);
});

/* ---------- fetch: cache-first ---------- */
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // หน้าเว็บ: cache-first ไปที่ index.html (รองรับ ?session=… ตอนออฟไลน์)
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const cached = await caches.match("./index.html");
      if (cached) {
        fetchAndPut(req).catch(() => {});
        return cached;
      }
      try { return await fetch(req); }
      catch { return new Response("<h1>ออฟไลน์</h1><p>เปิดแอปครั้งแรกต้องมีเน็ตก่อน</p>", { headers: { "Content-Type": "text/html;charset=utf-8" } }); }
    })());
    return;
  }

  // ฟอนต์ Google: stale-while-revalidate (ออฟไลน์ก็ยังได้ฟอนต์ที่เคยโหลด)
  if (url.origin.includes("fonts.googleapis.com") || url.origin.includes("fonts.gstatic.com")) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const net = fetchAndPut(req).catch(() => null);
      return cached || (await net) || new Response("", { status: 504 });
    })());
    return;
  }

  if (url.origin !== location.origin) return;

  // ไฟล์แอป: cache-first + อัปเดตเบื้องหลัง
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) { fetchAndPut(req).catch(() => {}); return cached; }
    try { return await fetchAndPut(req); }
    catch { return new Response("", { status: 504 }); }
  })());
});

async function fetchAndPut(req) {
  const res = await fetch(req);
  if (res && res.ok && res.type !== "opaque") {
    const c = await caches.open(VERSION);
    c.put(req, res.clone());
  }
  return res;
}

/* ---------- เก็บตารางไว้ใน Cache Storage (ใช้แทน IndexedDB ให้เรียบง่าย) ---------- */
const SCHED_URL = "./__wd_schedule__";
async function saveSchedule(items) {
  const c = await caches.open(VERSION);
  await c.put(SCHED_URL, new Response(JSON.stringify({ items, savedAt: Date.now() }), { headers: { "Content-Type": "application/json" } }));
}
async function readSchedule() {
  const r = await caches.match(SCHED_URL);
  if (!r) return { items: [], savedAt: 0 };
  try { return await r.json(); } catch { return { items: [], savedAt: 0 }; }
}

/* ---------- Periodic Background Sync: เช็กว่าถึงเวลาช่วงไหนแล้ว ---------- */
self.addEventListener("periodicsync", e => {
  if (e.tag === "wd-reminder") e.waitUntil(checkDueSessions());
});
self.addEventListener("sync", e => {
  if (e.tag === "wd-reminder") e.waitUntil(checkDueSessions());
});

async function checkDueSessions() {
  const { items, savedAt } = await readSchedule();
  if (!items.length) return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const toMin = t => { const [a, b] = t.split(":").map(Number); return a * 60 + b; };
  const sameDay = new Date(savedAt).toDateString() === now.toDateString();
  for (const it of items) {
    const m = toMin(it.t);
    if (nowMin >= m && nowMin < m + 30) {
      const tag = `wd-${it.key}-${now.toDateString()}`;
      const existing = await self.registration.getNotifications({ tag });
      if (existing.length) continue;
      // ถ้าตารางเป็นของวันก่อน ก็ยังเตือนได้ (ตารางเดิมซ้ำทุกวัน)
      await self.registration.showNotification(it.title, {
        body: it.body,
        tag,
        icon: "./icons/icon-192.png",
        badge: "./icons/badge-96.png",
        lang: "th",
        requireInteraction: false,
        data: { url: `./?session=${it.key}`, key: it.key },
      });
    }
  }
}

/* ---------- คลิกการแจ้งเตือน → เปิด/โฟกัสแอปแล้วเริ่มช่วงนั้น ---------- */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const key = e.notification.data?.key;
  const url = e.notification.data?.url || "./";
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if (c.url.includes(self.registration.scope)) {
        await c.focus();
        if (key) c.postMessage({ type: "OPEN_SESSION", key });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

/* ---------- push (เผื่ออนาคตต่อ push server) ---------- */
self.addEventListener("push", e => {
  let d = { title: "WordDeck", body: "ถึงเวลาฝึกคำศัพท์แล้ว" };
  try { if (e.data) d = { ...d, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: "./icons/icon-192.png", badge: "./icons/badge-96.png", lang: "th",
    data: { url: d.url || "./" },
  }));
});
