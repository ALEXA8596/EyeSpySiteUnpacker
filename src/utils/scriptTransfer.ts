// Utility functions for transferring podcast scripts between pages (localStorage + download + clipboard)
export const LOCALSTORAGE_KEY = 'podcastScript';
export const LOCALSTORAGE_SEGMENTS_KEY = 'podcastSegments';

export function saveScriptToLocalStorage(key: string, script: string) {
  try {
    localStorage.setItem(key, script);
    return true;
  } catch (e) {
    console.error('Error saving script to localStorage', e);
    return false;
  }
}

export function loadScriptFromLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.error('Error reading script from localStorage', e);
    return null;
  }
}

export function downloadScript(script: string, filename = 'podcast-script.txt') {
  try {
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    console.error('Error downloading script', e);
    return false;
  }
}

export async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    console.error('Clipboard copy failed', e);
    return false;
  }
}

// JSON segment helpers
export type ExportSegment = { speakerIndex: number; text: string };

export function saveSegmentsToLocalStorage(key: string, segments: ExportSegment[]) {
  try {
    localStorage.setItem(key, JSON.stringify(segments));
    return true;
  } catch (e) {
    console.error('Error saving segments to localStorage', e);
    return false;
  }
}

export function loadSegmentsFromLocalStorage(key: string): ExportSegment[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as ExportSegment[];
  } catch (e) {
    console.error('Error loading segments from localStorage', e);
    return null;
  }
}

export function downloadJSON(obj: any, filename = 'podcast-segments.json') {
  try {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    console.error('Error downloading JSON', e);
    return false;
  }
}
