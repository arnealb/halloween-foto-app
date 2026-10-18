import { logoutAction } from "../actions";
import { AdminNav } from "./admin-nav";

/**
 * Shell of every Admin section: title, section tabs and logout. Static: it
 * reads no session, so each page guards its own data via requireHost().
 */
export default function BeheerLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-stone-800 bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 pt-3">
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
            Admin
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-full px-3 py-1.5 text-sm text-stone-400 hover:bg-stone-800 hover:text-stone-100"
            >
              Uitloggen
            </button>
          </form>
        </div>
        <AdminNav />
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}
