/**
 * Save a media URL to the device in a way that works on mobile and desktop.
 * - Mobile (iOS/Android): Web Share sheet → Save Video / Save to Files
 * - Desktop / fallback: fetch as blob + programmatic <a download>
 * - Last resort: open ?download=1 (Content-Disposition: attachment)
 */
export async function downloadMediaToDevice(
  url: string,
  filename = "video.mp4",
): Promise<"shared" | "downloaded" | "opened"> {
  const safeName = filename.replace(/[^\w.\-() ]+/g, "_") || "video.mp4";

  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Could not fetch media (${res.status})`);
  const blob = await res.blob();
  const type = blob.type || "video/mp4";
  const file = new File([blob], safeName, { type });

  const isMobile =
    typeof navigator !== "undefined" &&
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");

  if (
    isMobile &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: safeName,
      });
      return "shared";
    } catch (e) {
      // User cancelled share sheet — don't fall through to another download prompt
      if ((e as Error)?.name === "AbortError") return "shared";
    }
  }

  // Programmatic download (desktop + many Android browsers)
  try {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = safeName;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4_000);
    return "downloaded";
  } catch {
    // ignore and try attachment URL
  }

  const joiner = url.includes("?") ? "&" : "?";
  window.open(`${url}${joiner}download=1`, "_blank", "noopener,noreferrer");
  return "opened";
}
