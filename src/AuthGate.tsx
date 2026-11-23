import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, LogOut, Loader2, ShieldCheck } from "lucide-react";

type AuthGateProps = {
  children: ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const [status, setStatus] = useState<"checking" | "signed-out" | "signed-in">("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.status === 503) {
          setError(data.error || "Login belum dikonfigurasi oleh admin.");
          setStatus("signed-out");
          return;
        }
        if (!response.ok) throw new Error(data.error || "Tidak dapat memeriksa sesi login.");
        setStatus(data.authenticated ? "signed-in" : "signed-out");
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Tidak dapat memeriksa sesi login.");
        setStatus("signed-out");
      });

    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Login gagal. Silakan coba lagi.");
      setPassword("");
      setStatus("signed-in");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login gagal. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Tidak dapat mengakhiri sesi.");
      setStatus("signed-out");
      setPassword("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tidak dapat mengakhiri sesi.");
    }
  };

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0] text-emerald-deep" role="status">
        <Loader2 className="w-6 h-6 animate-spin" aria-label="Memeriksa sesi login" />
      </div>
    );
  }

  if (status === "signed-in") {
    return (
      <>
        {children}
        <div className="fixed top-3 right-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2">
          {error && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 shadow" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-emerald-deep px-3 py-2 text-sm font-semibold text-white shadow-lg hover:bg-emerald-light"
          >
            <LogOut className="h-4 w-4" />
            Keluar
          </button>
        </div>
      </>
    );
  }

  const isConfigurationError = error.includes("belum dikonfigurasi") || error.includes("ADMIN_USERNAME");

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F7F5F0] px-4 py-10">
      <section className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-900/10 bg-white shadow-xl">
        <div className="bg-emerald-deep px-7 py-8 text-center text-white">
          <img src="/logo-192.png" alt="" className="mx-auto mb-4 h-16 w-16 rounded-2xl border border-gold-heritage/40" />
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-gold-heritage/50 bg-white/10 text-gold-bright">
            {isConfigurationError ? <ShieldCheck className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
          </div>
          <h1 className="text-2xl font-bold">Masuk ke Kharisma Pedia</h1>
          <p className="mt-2 text-sm text-white/75">Gunakan akun admin yang telah disiapkan.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5 px-7 py-7">
          {error && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
              {error}
              {isConfigurationError && (
                <p className="mt-2">
                  Atur variabel login di file <code>.env</code> saat berjalan lokal, atau di Project Settings → Environment Variables di Vercel.
                </p>
              )}
            </div>
          )}

          {!isConfigurationError && (
            <>
              <label className="block text-sm font-semibold text-stone-700">
                Nama pengguna
                <input
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-3 font-normal outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                />
              </label>
              <label className="block text-sm font-semibold text-stone-700">
                Kata sandi
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-3 font-normal outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                />
              </label>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-deep px-4 py-3 font-bold text-white transition hover:bg-emerald-light disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? "Memeriksa..." : "Masuk"}
              </button>
            </>
          )}
        </form>
      </section>
    </main>
  );
}
