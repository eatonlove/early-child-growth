import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "./router";
import { TongjiMark } from "./production/TongjiMark";
import "./styles.css";

const RootApp = lazy(() => import.meta.env.VITE_APP_MODE === "production"
  ? import("./production/ProductionApp").then((module) => ({ default: module.ProductionApp }))
  : import("./App").then((module) => ({ default: module.App })));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div className="loading-screen"><TongjiMark /><h1>正在进入同迹</h1><span className="loading-line" /></div>}><RootApp /></Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
