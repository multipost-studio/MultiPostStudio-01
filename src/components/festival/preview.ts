/**
 * Admin "Preview on this device": a session-only override the festival layer
 * reads, so an admin can see a theme without publishing it to anyone else.
 */
export const PREVIEW_KEY = "mps-festival-preview";
export const PREVIEW_EVENT = "mps-festival-preview";

export function readPreview(): string | null {
  try {
    return window.sessionStorage.getItem(PREVIEW_KEY);
  } catch {
    return null;
  }
}

export function setFestivalPreview(id: string | null): void {
  try {
    if (id) window.sessionStorage.setItem(PREVIEW_KEY, id);
    else window.sessionStorage.removeItem(PREVIEW_KEY);
  } catch {
    /* storage blocked: the event below still updates this tab */
  }
  window.dispatchEvent(new Event(PREVIEW_EVENT));
}
