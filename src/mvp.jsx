import React from "react";
import { createRoot } from "react-dom/client";
import { MvpApp } from "../hvostoed.jsx";

createRoot(document.getElementById("root")).render(<MvpApp />);

/* Тот же service worker, что и у главной страницы: MVP живёт в том же scope,
   и повторные заходы из рекламы грузятся из кэша, а не тянут бандл заново. */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});
  });
}
