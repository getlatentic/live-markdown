/**
 * The scrollbar of a paged view. The editor's own scrollbar shows the few
 * windows it holds; this one shows the place in the whole file, and takes
 * the view anywhere in it.
 */

const SMALLEST_THUMB = 28;

export interface PagedScrollbar {
  readonly element: HTMLElement;
  /** Where the top of the view is in the file, and how much of the file it
   *  shows, each as a share of the whole. */
  show(top: number, shown: number): void;
  destroy(): void;
}

/** `onJump` is given the share of the file the user moved the thumb to. */
export function pagedScrollbar(onJump: (share: number) => void): PagedScrollbar {
  const track = document.createElement("div");
  track.className = "cm-paged-scrollbar";
  track.setAttribute("role", "scrollbar");
  track.setAttribute("aria-orientation", "vertical");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.style.cssText = "position:relative;flex:0 0 12px;align-self:stretch;cursor:default;touch-action:none";
  const thumb = document.createElement("div");
  thumb.className = "cm-paged-scrollbar__thumb";
  thumb.style.cssText = "position:absolute;left:2px;right:2px;border-radius:4px;background:currentColor;opacity:0.35";
  track.appendChild(thumb);

  /** The share of the file a pointer at `clientY` stands for, with the
   *  thumb held `grip` pixels below its top. */
  const shareAt = (clientY: number, grip: number): number => {
    const room = track.clientHeight - thumb.offsetHeight;
    return room <= 0 ? 0 : Math.min(1, Math.max(0, (clientY - track.getBoundingClientRect().top - grip) / room));
  };

  let grip: number | null = null;
  const onDown = (event: PointerEvent): void => {
    event.preventDefault();
    const onThumb = event.target === thumb;
    grip = onThumb ? event.clientY - thumb.getBoundingClientRect().top : thumb.offsetHeight / 2;
    track.setPointerCapture(event.pointerId);
    if (!onThumb) onJump(shareAt(event.clientY, grip));
  };
  const onMove = (event: PointerEvent): void => {
    if (grip !== null) onJump(shareAt(event.clientY, grip));
  };
  const onUp = (): void => {
    grip = null;
  };
  track.addEventListener("pointerdown", onDown);
  track.addEventListener("pointermove", onMove);
  track.addEventListener("pointerup", onUp);
  track.addEventListener("pointercancel", onUp);

  return {
    element: track,
    show(top, shown) {
      const height = Math.max(SMALLEST_THUMB, shown * track.clientHeight);
      thumb.style.height = `${height}px`;
      thumb.style.top = `${top * Math.max(0, track.clientHeight - height)}px`;
      track.setAttribute("aria-valuenow", String(Math.round(top * 100)));
    },
    destroy() {
      track.remove();
    },
  };
}
