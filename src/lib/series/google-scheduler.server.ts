/**
 * Google Calendar + Cloud Scheduler helpers for Series auto-posting.
 *
 * Notes:
 * - GOOGLE_API_KEY works for limited Calendar/public APIs.
 * - Cloud Scheduler job create requires a service account / OAuth access token
 *   (API keys alone are rejected by cloudscheduler.googleapis.com).
 * - We always persist schedules in our DB and expose /api/series/cron for reliable posting.
 */

function googleApiKey(): string | null {
  return process.env.GOOGLE_API_KEY || process.env.GOOGLE_CLOUD_API_KEY || null;
}

/** Build a Google Calendar "create event" deep link (no OAuth required). */
export function googleCalendarCreateLink(input: {
  title: string;
  description?: string;
  start: Date;
  end?: Date;
  timezone?: string;
}): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const start = fmt(input.start);
  const end = fmt(input.end || new Date(input.start.getTime() + 30 * 60_000));
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    details: input.description || "",
    dates: `${start}/${end}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Attempt to insert a Calendar event via API key (works only for public calendars /
 * when Calendar API allows the key). Falls back to deep-link metadata.
 */
export async function syncGoogleCalendarEvent(input: {
  title: string;
  description?: string;
  start: Date;
  end?: Date;
  timezone?: string;
  calendarId?: string;
}): Promise<{ ok: boolean; eventId?: string; htmlLink?: string; error?: string }> {
  const key = googleApiKey();
  const calendarId = encodeURIComponent(input.calendarId || "primary");
  const htmlLink = googleCalendarCreateLink(input);

  if (!key) {
    return { ok: true, htmlLink, error: "GOOGLE_API_KEY not set — using calendar link only" };
  }

  try {
    const body = {
      summary: input.title,
      description: input.description || "",
      start: {
        dateTime: input.start.toISOString(),
        timeZone: input.timezone || "Europe/London",
      },
      end: {
        dateTime: (input.end || new Date(input.start.getTime() + 30 * 60_000)).toISOString(),
        timeZone: input.timezone || "Europe/London",
      },
    };
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Expected without OAuth — return deep link so UI can still open Calendar
      return {
        ok: true,
        htmlLink,
        error: data?.error?.message || `Calendar API ${res.status}`,
      };
    }
    return {
      ok: true,
      eventId: data.id,
      htmlLink: data.htmlLink || htmlLink,
    };
  } catch (e) {
    return { ok: true, htmlLink, error: (e as Error).message };
  }
}

/**
 * Ensure a Cloud Scheduler HTTP job hits our cron endpoint on a cadence.
 * Requires GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_ACCESS_TOKEN (or ADC).
 * API keys alone cannot create Scheduler jobs.
 */
export async function ensureSeriesCronSchedulerJob(input: {
  cronUrl: string;
  cronSecret: string;
  location?: string;
  schedule?: string;
}): Promise<{ ok: boolean; jobName?: string; error?: string; skipped?: boolean }> {
  const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
  const location = input.location || process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
  const token =
    process.env.GOOGLE_CLOUD_ACCESS_TOKEN ||
    process.env.GOOGLE_OAUTH_ACCESS_TOKEN ||
    null;

  if (!project || !token) {
    return {
      ok: true,
      skipped: true,
      error:
        "Cloud Scheduler needs GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_ACCESS_TOKEN (service account). Using in-app cron + queue instead.",
    };
  }

  const parent = `projects/${project}/locations/${location}`;
  const jobId = "izentsocial-series-post-cron";
  const name = `${parent}/jobs/${jobId}`;
  const schedule = input.schedule || "*/15 * * * *"; // every 15 minutes

  const jobBody = {
    name,
    description: "IzentSocial Series — generate due videos and auto-post",
    schedule,
    timeZone: "UTC",
    httpTarget: {
      uri: input.cronUrl,
      httpMethod: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Series-Cron-Secret": input.cronSecret,
      },
      body: Buffer.from(JSON.stringify({ source: "cloud-scheduler" })).toString("base64"),
    },
  };

  try {
    // Try create; if exists, patch
    const createRes = await fetch(
      `https://cloudscheduler.googleapis.com/v1/${parent}/jobs?key=${encodeURIComponent(googleApiKey() || "")}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jobBody),
      },
    );
    const createBody = await createRes.json().catch(() => ({}));
    if (createRes.ok) {
      return { ok: true, jobName: createBody.name || name };
    }
    if (createRes.status === 409 || String(createBody?.error?.status) === "ALREADY_EXISTS") {
      const patchRes = await fetch(
        `https://cloudscheduler.googleapis.com/v1/${name}?updateMask=schedule,httpTarget,timeZone`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(jobBody),
        },
      );
      const patchBody = await patchRes.json().catch(() => ({}));
      if (!patchRes.ok) {
        return { ok: false, error: patchBody?.error?.message || `Scheduler patch ${patchRes.status}` };
      }
      return { ok: true, jobName: name };
    }
    return {
      ok: false,
      error: createBody?.error?.message || `Scheduler create ${createRes.status}`,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
