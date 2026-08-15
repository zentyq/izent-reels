import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { IzentLogo } from "./brand";
import { getPublicAppSettings } from "@/lib/admin.functions";

const NAV = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/faq", label: "FAQ" },
  { to: "/blog", label: "Blog" },
  { to: "/about", label: "About" },
] as const;

const FOOTER = {
  Product: [
    { to: "/how-it-works", label: "How it works" },
    { to: "/faq", label: "FAQ" },
    { to: "/blog", label: "Blog" },
  ],
  Company: [
    { to: "/about", label: "About us" },
    { to: "/contact", label: "Contact us" },
  ],
  Legal: [
    { to: "/privacy", label: "Privacy policy" },
    { to: "/terms", label: "Terms of service" },
  ],
} as const;

export function MarketingLayout({
  children,
  headerActions,
}: {
  children: React.ReactNode;
  headerActions?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const fnPublic = useServerFn(getPublicAppSettings);
  const [registrationOpen, setRegistrationOpen] = useState(true);

  useEffect(() => {
    fnPublic()
      .then((res) => {
        if (res.ok) setRegistrationOpen(res.settings.registrationOpen);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-white text-neutral-950" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-bold text-[15px] tracking-tight">
            <IzentLogo className="h-8 w-8" />
            Izent Reels
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-neutral-500 md:flex">
            {NAV.map((item) => (
              <Link key={item.to} to={item.to} className="hover:text-neutral-900">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {headerActions ?? (
              <>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/", search: { auth: "signin" } })}
                  className="hidden h-10 rounded-full border border-neutral-200 px-3.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 sm:inline-flex sm:items-center"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate({ to: "/", search: { auth: registrationOpen ? "signup" : "signin" } })
                  }
                  className="h-10 rounded-full bg-[#C9A227] px-5 text-sm font-semibold text-neutral-950 hover:bg-[#B8961C]"
                >
                  {registrationOpen ? "Get started" : "Sign in"}
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-neutral-100 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2 font-bold">
              <IzentLogo className="h-7 w-7" />
              Izent Reels
            </div>
            <p className="mt-3 text-sm text-neutral-500">
              Scripts, produces, and publishes shorts to your connected accounts. You stay off camera.
            </p>
          </div>
          {Object.entries(FOOTER).map(([heading, links]) => (
            <div key={heading}>
              <div className="text-sm font-semibold">{heading}</div>
              <ul className="mt-3 space-y-2 text-sm text-neutral-500">
                {links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="hover:text-neutral-900">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-neutral-100 py-6 text-center text-xs text-neutral-400">
          © {new Date().getFullYear()} Izent Reels
        </div>
      </footer>
    </div>
  );
}

export function PageHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-14 text-center sm:px-6 sm:pt-16">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-3 text-neutral-500">{subtitle}</p>
    </div>
  );
}
