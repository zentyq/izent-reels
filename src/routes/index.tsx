import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { LandingPage } from "@/components/landing/LandingPage";

export const Route = createFileRoute("/")({
  validateSearch: z.object({
    auth: z.enum(["signin", "signup"]).optional(),
    authError: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Izent Reels. Faceless reels, created and posted for you." },
      {
        name: "description",
        content: "Izent Reels scripts, produces, and publishes shorts to your connected accounts. You stay off camera.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { auth, authError } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <LandingPage
      authMode={auth ?? null}
      authError={authError}
      onAuthModeChange={(mode) => {
        if (mode) navigate({ to: "/", search: { auth: mode } });
        else navigate({ to: "/", search: {} });
      }}
    />
  );
}
