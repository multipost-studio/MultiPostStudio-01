"use client";

import * as React from "react";
import { isValidTimezone } from "./timezones";
import { browserTimeZone } from "./tz-math";

/**
 * The time zone the Calendar and Queue show times in. It is a choice of this browser, remembered here and shared live between the
 * two pages and between open tabs; until someone chooses, it is the device's own time zone. A saved name the engine does not know
 * is ignored. Nothing about it is sent anywhere: posts keep their real instant, only how it is shown changes.
 */
const KEY = "mps-calendar-tz";
const EVENT = "mps-calendar-tz-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function readSaved(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function useCalendarTimeZone(): { timeZone: string; deviceZone: string; isDevice: boolean; setTimeZone: (tz: string | null) => void } {
  const saved = React.useSyncExternalStore(subscribe, readSaved, () => "");
  const deviceZone = React.useMemo(() => browserTimeZone(), []);
  const timeZone = isValidTimezone(saved) ? saved : deviceZone;
  const setTimeZone = React.useCallback((tz: string | null) => {
    try {
      if (tz && isValidTimezone(tz)) window.localStorage.setItem(KEY, tz);
      else window.localStorage.removeItem(KEY);
    } catch {
      /* private mode: the choice lasts until the page is closed, through the event below */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { timeZone, deviceZone, isDevice: timeZone === deviceZone, setTimeZone };
}
