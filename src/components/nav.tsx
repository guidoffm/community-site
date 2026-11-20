import { getActor } from "@/lib/auth/session";
import { unreadCount } from "@/services/messages";
import { APP_NAME, siteUrl } from "@/lib/domains";
import { logout } from "@/app/actions/auth";
import { Avatar } from "./decor";

/** Navigation mit absoluten Links – wird auch auf den Community-Subdomains angezeigt. */
export async function Nav() {
  const actor = await getActor();
  const unread = actor ? await unreadCount(actor) : 0;
  const item = "rounded-full px-3 py-1.5 font-medium text-slate-600 transition hover:bg-brand-light hover:text-brand-dark";
  return (
    <header className="sticky top-0 z-40 border-b border-violet-100 bg-white/80 backdrop-blur-md">
      <div className="h-1 bg-gradient-brand" />
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3 text-sm">
        <a href={siteUrl("/")} className="mr-3 font-display text-2xl font-extrabold text-gradient">{APP_NAME}</a>
        <a href={siteUrl("/communities")} className={item}>Communities</a>
        {actor && (
          <>
            <a href={siteUrl("/messages")} className={item}>
              Nachrichten
              {unread > 0 && <span className="chip ml-1 bg-pop text-white">{unread}</span>}
            </a>
            <a href={siteUrl("/homepage")} className={item}>Meine Homepage</a>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {actor ? (
            <>
              <span className="hidden items-center gap-2 text-slate-600 sm:inline-flex">
                <Avatar name={actor.name} id={actor.userId} size="h-8 w-8 text-xs" />
                {actor.name}
              </span>
              <form action={logout}>
                <button className="btn-secondary px-3 py-1.5">Abmelden</button>
              </form>
            </>
          ) : (
            <>
              <a href={siteUrl("/login")} className={item}>Anmelden</a>
              <a href={siteUrl("/register")} className="btn px-3 py-1.5">Registrieren</a>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
