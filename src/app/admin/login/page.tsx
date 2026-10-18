import { Suspense } from "react";
import { redirect } from "next/navigation";
import { hasAdminSession } from "@/server/admin-session";
import { Splash } from "../../splash";
import { LoginForm } from "./login-form";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<Splash />}>
      <LoginScreen />
    </Suspense>
  );
}

async function LoginScreen() {
  // Already logged in on this device: straight to the Admin.
  if (await hasAdminSession()) redirect("/admin");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Admin
        </span>
        <h1 className="text-3xl font-bold tracking-tight">Inloggen als host</h1>
        <p className="text-stone-400">Je blijft ingelogd op dit toestel.</p>
      </header>
      <LoginForm />
    </main>
  );
}
