import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { SITE_URL } from "./site";

export { SITE_URL };

/*
 * Per-page <head> tags for a single-page app.
 *
 * index.html carries one title, description and canonical for the whole site.
 * Left alone, every route — a blog post, a product — tells Google it is a
 * copy of the homepage, and the homepage is the only page that can rank.
 */

/** The address of a path, as search engines should index it. */
export function canonicalUrl(pathname: string): string {
  const path = pathname.replace(/\/+$/, "");
  return `${SITE_URL}${path || "/"}`;
}

// AppSettingsContext sets the site title from app_settings once they load,
// which can be after a page has set its own. The default is remembered here
// and applied only while no page title is in force.
let defaultTitle = typeof document === "undefined" ? "" : document.title;
let pageTitleActive = false;

export function setDefaultTitle(title: string) {
  defaultTitle = title;
  if (!pageTitleActive) document.title = title;
}

function setHeadTag(
  selector: string,
  create: () => HTMLElement,
  attr: string,
  value: string
): () => void {
  let el = document.head.querySelector<HTMLElement>(selector);
  const existed = !!el;
  const previous = el?.getAttribute(attr) ?? null;
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
  return () => {
    if (!existed) el?.remove();
    else if (previous !== null) el?.setAttribute(attr, previous);
  };
}

function setMeta(kind: "name" | "property", key: string, content: string) {
  return setHeadTag(
    `meta[${kind}="${key}"]`,
    () => {
      const m = document.createElement("meta");
      m.setAttribute(kind, key);
      return m;
    },
    "content",
    content
  );
}

/** Keeps the canonical link and og:url on the current route. Call once, in the app shell. */
export function useCanonicalUrl() {
  const { pathname } = useLocation();
  useEffect(() => {
    const href = canonicalUrl(pathname);
    setHeadTag(
      'link[rel="canonical"]',
      () => {
        const l = document.createElement("link");
        l.rel = "canonical";
        return l;
      },
      "href",
      href
    );
    setMeta("property", "og:url", href);
  }, [pathname]);
}

export interface PageMeta {
  title: string;
  description: string;
  /** Absolute URL. */
  image?: string;
  type?: "website" | "article";
  /** schema.org object(s), written as one JSON-LD script. */
  jsonLd?: object;
}

/**
 * Title, description, social tags and structured data for the page that calls
 * it, put back as they were when the page unmounts.
 */
export function usePageMeta(meta: PageMeta | null) {
  const key = meta ? JSON.stringify(meta) : "";
  useEffect(() => {
    if (!meta) return;
    const undo: (() => void)[] = [];

    pageTitleActive = true;
    document.title = meta.title;

    undo.push(setMeta("name", "description", meta.description));
    undo.push(setMeta("property", "og:title", meta.title));
    undo.push(setMeta("property", "og:description", meta.description));
    undo.push(setMeta("property", "og:type", meta.type ?? "website"));
    undo.push(setMeta("name", "twitter:title", meta.title));
    undo.push(setMeta("name", "twitter:description", meta.description));
    if (meta.image) {
      undo.push(setMeta("property", "og:image", meta.image));
      undo.push(setMeta("name", "twitter:image", meta.image));
    }
    if (meta.jsonLd) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.text = JSON.stringify(meta.jsonLd);
      document.head.appendChild(script);
      undo.push(() => script.remove());
    }

    return () => {
      undo.reverse().forEach((fn) => fn());
      pageTitleActive = false;
      document.title = defaultTitle;
    };
    // `key` stands in for `meta`, which callers rebuild on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
