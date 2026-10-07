export interface Route {
  page: "home" | "scan" | "history" | "about";
  q?: string;
  lens?: string;
  scan?: string;
  home?: string;
  site?: string;
}

export function readRoute(): Route {
  const p = new URLSearchParams(location.search);
  const page = (p.get("page") as Route["page"]) || (p.get("scan") || p.get("q") ? "scan" : "home");
  return {
    page,
    q: p.get("q") ?? undefined,
    lens: p.get("lens") ?? undefined,
    scan: p.get("scan") ?? undefined,
    home: p.get("home") ?? undefined,
    site: p.get("site") ?? undefined,
  };
}

export function writeRoute(r: Route, replace = false) {
  const p = new URLSearchParams();
  if (r.page === "history" || r.page === "about") p.set("page", r.page);
  if (r.scan) p.set("scan", r.scan);
  else if (r.q) {
    p.set("q", r.q);
    if (r.lens) p.set("lens", r.lens);
  }
  if (r.home) p.set("home", r.home);
  if (r.site) p.set("site", r.site);
  const url = `${location.pathname}${p.toString() ? "?" + p : ""}`;
  if (url === location.pathname + location.search) return;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
}
