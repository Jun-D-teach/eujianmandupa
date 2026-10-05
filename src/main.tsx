import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { AuthProvider } from "@/hooks/use-auth";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import "./index.css";
import { registerServiceWorker } from "./lib/pwa";
// ExamPage diimpor STATIS (bukan lazy) — kode ujian harus sudah ikut terbaca
// begitu shell aplikasi terbuka, supaya tombol "Kerjakan" tetap jalan saat
// internet dimatikan. Lazy import = fetch chunk = gagal saat offline.
import ExamPage from "./pages/ExamPage.tsx";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in the browser runtime). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      // Gagal memuat chunk saat offline (lazy import / jaringan mati) →
      // tampilkan panduan yang bisa dimengerti siswa, bukan layar error.
      const gagalKoneksi = /dynamically imported module|failed to fetch|load failed|networkerror|network request failed/i.test(
        this.state.message,
      );
      if (gagalKoneksi) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
            <div className="max-w-md space-y-4 text-center">
              <p className="text-sm font-semibold">
                Koneksi internet terputus
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                Aplikasi belum menyimpan bagian ini di perangkat. Sambungkan
                internet sebentar lalu muat ulang halaman — soal dan jawaban
                tetap aman di perangkat.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl border border-border bg-muted px-4 py-2 text-xs font-semibold transition hover:bg-muted/70"
              >
                Muat ulang
              </button>
            </div>
          </div>
        );
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// PWA: service worker untuk shell offline saat ujian berlangsung.
registerServiceWorker();

/** Auto-detect subfolder hosting (mis. /eujian-mandupa/) agar React Router
 *  mencocokkan rute dengan benar saat app dideploy di subdirektori.
 *  Vite `base: "./"` membuat BASE_URL tidak valid sebagai basename,
 *  jadi dihitung runtime dari window.location.pathname.
 *
 *  PENTING: segmen rute aplikasi (/auth, /dashboard, /ujian/:id) harus
 *  DIBUANG dari pathname — basename hanya berisi folder hosting. Tanpa ini,
 *  refresh di URL dalam (mis. /eujian-mandupa/ujian/ID atau .../auth) membuat
 *  basename = seluruh path sehingga Routes tidak pernah cocok. */
function hitungRouterBasename(): string {
  let path = window.location.pathname;
  path = path.replace(/\/index\.html$/i, "");
  path = path.replace(/\/(auth|dashboard|ujian)(\/[^/]*)*$/i, "");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path === "/" ? "" : path;
}

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <AuthProvider>
        <BrowserRouter basename={hitungRouterBasename()}>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              {/* URL lama .../dashboard/auth -> halaman login (jaga-jaga bila
                  skrip normalisasi di index.html belum sempat jalan). */}
              <Route
                path="/dashboard/auth"
                element={<Navigate to="/auth" replace />}
              />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/dashboard" />}
              />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/ujian/:ujianId"
                element={
                  <RequireAuth
                    title="Masuk untuk mengerjakan ujian"
                    description="Unduh soal dan pengerjaan ujian memerlukan akun siswa."
                  >
                    <ExamPage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
