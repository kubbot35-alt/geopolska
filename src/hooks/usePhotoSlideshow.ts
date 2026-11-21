import {useEffect, useRef, useState} from 'react';
import {
  createShuffledSlideDeck,
  type BackdropPhotoSlide,
  type ISlideDeckCursor,
} from '../domain/titleBackdropSlides';

export interface SlideshowBufferSlot {
  readonly slide: BackdropPhotoSlide;
  readonly renderKey: string;
}

export interface DoubleBufferedSlideshowState {
  readonly slots: readonly [SlideshowBufferSlot | null, SlideshowBufferSlot | null];
  readonly activeBuffer: 0 | 1 | null;
}

const PRELOAD_TIMEOUT_MS = 12_000;
const MAX_CONSECUTIVE_FAILURES = 16;

function preloadImageUrl(url: string, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      signal.removeEventListener('abort', handleAbort);
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };

    const handleAbort = () => {
      img.src = '';
      finish(false);
    };

    const timeoutId = window.setTimeout(() => handleAbort(), PRELOAD_TIMEOUT_MS);
    signal.addEventListener('abort', handleAbort, {once: true});

    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(() => finish(true), () => finish(true));
      } else {
        finish(true);
      }
    };
    img.onerror = () => finish(false);
    img.src = url;
  });
}

async function fetchNextWorkingSlide(
  deck: ISlideDeckCursor,
  failedIds: Set<string>,
  signal: AbortSignal,
): Promise<BackdropPhotoSlide | null> {
  for (let tries = 0; tries < MAX_CONSECUTIVE_FAILURES; tries += 1) {
    if (signal.aborted) {
      return null;
    }
    const candidate = deck.next(failedIds);
    if (!candidate) {
      return null;
    }
    const loaded = await preloadImageUrl(candidate.imageUrl, signal);
    if (signal.aborted) {
      return null;
    }
    if (loaded) {
      return candidate;
    }
    failedIds.add(candidate.id);
  }
  return null;
}

export function usePhotoSlideshow(
  slides: readonly BackdropPhotoSlide[],
  intervalMs: number,
): DoubleBufferedSlideshowState {
  const [state, setState] = useState<DoubleBufferedSlideshowState>({
    slots: [null, null],
    activeBuffer: null,
  });

  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const slideCount = slides.length;

  useEffect(() => {
    const pool = slidesRef.current;
    if (pool.length === 0) {
      return;
    }

    const deck = createShuffledSlideDeck(pool);
    const failedIds = new Set<string>();
    const abortController = new AbortController();
    let epoch = 0;
    let currentBuffer: 0 | 1 | null = null;
    let preloadedNext: BackdropPhotoSlide | null = null;
    let isPreloading = false;
    let waitingForPreload = false;
    let timerId = 0;
    let rafId = 0;
    let rafInnerId = 0;

    const commitSlide = (slide: BackdropPhotoSlide) => {
      if (abortController.signal.aborted) return;
      const targetBuffer: 0 | 1 = currentBuffer === 0 ? 1 : 0;
      epoch += 1;
      const nextSlot: SlideshowBufferSlot = {
        slide,
        renderKey: `${slide.id}-${epoch}`,
      };

      setState((prev) => ({
        slots:
          targetBuffer === 0
            ? [nextSlot, prev.slots[1]]
            : [prev.slots[0], nextSlot],
        activeBuffer: prev.activeBuffer,
      }));

      rafId = window.requestAnimationFrame(() => {
        rafInnerId = window.requestAnimationFrame(() => {
          if (abortController.signal.aborted) return;
          currentBuffer = targetBuffer;
          setState((prev) => ({...prev, activeBuffer: targetBuffer}));
          scheduleNextTick();
          void beginPreload();
        });
      });
    };

    const scheduleNextTick = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        if (abortController.signal.aborted) return;
        if (document.hidden) {
          scheduleNextTick();
          return;
        }
        if (preloadedNext) {
          const ready = preloadedNext;
          preloadedNext = null;
          commitSlide(ready);
        } else {
          waitingForPreload = true;
          if (!isPreloading) {
            void beginPreload();
          }
        }
      }, intervalMs);
    };

    const beginPreload = async () => {
      if (isPreloading || abortController.signal.aborted) return;
      isPreloading = true;
      const slide = await fetchNextWorkingSlide(deck, failedIds, abortController.signal);
      isPreloading = false;
      if (!slide || abortController.signal.aborted) return;

      if (currentBuffer === null || waitingForPreload) {
        waitingForPreload = false;
        commitSlide(slide);
      } else {
        preloadedNext = slide;
      }
    };

    const handleOnline = () => {
      failedIds.clear();
      if (!isPreloading && !preloadedNext) {
        void beginPreload();
      }
    };

    window.addEventListener('online', handleOnline);
    void beginPreload();

    return () => {
      abortController.abort();
      window.clearTimeout(timerId);
      window.cancelAnimationFrame(rafId);
      window.cancelAnimationFrame(rafInnerId);
      window.removeEventListener('online', handleOnline);
    };
  }, [slideCount, intervalMs]);

  return state;
}
