import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/* Service worker пишется плагином, а не руками, по одной причине: список файлов
   для предзагрузки должен содержать РЕАЛЬНОЕ имя бандла с хешем, а оно известно
   только после сборки. Список, набитый вручную, разойдётся с первым же билдом,
   и офлайн тихо перестанет работать.

   Версия кэша — хеш от самого списка. Ничего не изменилось — версия та же и кэш
   не перезаливается; изменился хоть один файл — версия новая, старый кэш сносится.

   skipWaiting + clients.claim: новый worker забирает управление сразу. Иначе
   классическая беда — человек не понимает, почему правки не приезжают неделями.
   Плата за это одна: уже открытая страница доживёт на старой версии до следующего
   открытия. */
function serviceWorker() {
  const walk = (dir, base = "") => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name), base + e.name + "/") : [base + e.name]
    );
  };
  return {
    name: "hv-service-worker",
    apply: "build",
    generateBundle(_opts, bundle) {
      // содержимое public/ копируется мимо бандла, поэтому берём его с диска
      const fromPublic = walk("public").filter((f) => f !== "manifest.webmanifest");
      const fromBundle = Object.keys(bundle).filter((n) => !n.endsWith(".map"));
      const files = ["./", "manifest.webmanifest", ...fromBundle, ...fromPublic].sort();
      const version = "hv-" + crypto.createHash("sha1").update(files.join("|")).digest("hex").slice(0, 12);
      this.emitFile({ type: "asset", fileName: "sw.js", source: `/* сгенерирован сборкой, править бесполезно */
const V = ${JSON.stringify(version)};
const FILES = ${JSON.stringify(files)};
const HOME = new URL("./", self.location).href;

self.addEventListener("install", (e) => {
  // reload, а не обычный fetch: GitHub Pages отдаёт max-age=600, и предзагрузка
  // рисковала бы положить в кэш прошлую сборку из HTTP-кэша браузера
  e.waitUntil(caches.open(V)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* ignoreVary обязателен, и это не перестраховка. Vite вешает на модуль crossorigin,
   поэтому браузер шлёт Origin; сервер отвечает Vary: Origin; а предзагрузка ходила из
   worker'а без Origin. По правилам Vary это разные записи — бандл не находился в кэше,
   уходил в сеть и без неё падал. Отдаём свои же файлы по одному URL. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(V).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => (req.mode === "navigate" ? caches.match(HOME, { ignoreVary: true }) : Promise.reject(new Error("офлайн")))))
  );
});
` });
    },
  };
}

export default defineConfig({
  // Проектная страница GitHub Pages живёт в подпапке /hvostoed/, поэтому база не корневая.
  base: "/hvostoed/",
  plugins: [react(), serviceWorker()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: Boolean(process.env.PORT),
  },
});
