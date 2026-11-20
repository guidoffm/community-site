import { getActor } from "@/lib/auth/session";
import { unreadCount } from "@/services/messages";
import { APP_NAME, siteUrl } from "@/lib/domains";
import { logout } from "@/app/actions/auth";

/** Navigation mit absoluten Links – wird auch auf den Community-Subdomains angezeigt. */
export async function Nav() {
  const actor = await getActor();
  const unread = actor ? await unreadCount(actor) : 0;
  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
        <a href={siteUrl("/")} className="text-lg font-bold text-brand">{APP_NAME}</a>
        <a href={siteUrl("/communities")} className="hover:text-brand">Communities</a>
        {actor && (
          <>
            <a href={siteUrl("/messages")} className="hover:text-brand">
              Nachrichten
              {unread > 0 && <span className="ml-1 rounded-full bg-brand px-2 py-0.5 text-xs text-white">{unread}</span>}
            </a>
            <a href={siteUrl("/homepage")} className="hover:text-brand">Meine Homepage</a>
          </>
        )}
        <div className="ml-auto flex items-center gap-3">
          {actor ? (
            <>
              <span className="text-slate-500">{actor.name}</span>
              <form action={logout}>
                <button className="btn-secondary">Abmelden</button>
              </form>
            </>
          ) : (
            <>
              <a href={siteUrl("/login")} className="hover:text-brand">Anmelden</a>
              <a href={siteUrl("/register")} className="btn">Registrieren</a>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
