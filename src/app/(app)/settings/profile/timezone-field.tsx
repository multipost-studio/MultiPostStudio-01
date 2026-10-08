"use client";

import * as React from "react";
import { Field, Select } from "@/components/ui/input";

/**
 * Time zone picker with every zone the browser knows, plus a one-tap "use this
 * device's zone". The zone drives analytics days, the calendar, best-time
 * suggestions and streak days, so a wrong default (UTC) shifts all of them.
 */
export function TimezoneField({ options, defaultValue }: { options: { value: string; label: string }[]; defaultValue: string }) {
  const [value, setValue] = React.useState(defaultValue);
  const [device, setDevice] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      setDevice(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
    } catch {
      setDevice(null);
    }
  }, []);

  // A saved zone the list does not contain (renamed in a newer tz database) still shows up.
  const list = options.some((o) => o.value === value) ? options : [{ value, label: value }, ...options];
  const canUseDevice = device !== null && device !== value && options.some((o) => o.value === device);

  return (
    <Field label="Time zone" hint="Sets your analytics days, calendar, best posting times and streak days.">
      <Select name="timezone" value={value} onChange={(e) => setValue(e.target.value)}>
        {list.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {canUseDevice && (
        <button type="button" onClick={() => setValue(device!)} className="mt-1.5 text-[13px] font-medium text-[var(--primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
          Your device is on {device!.replace(/_/g, " ")}. Use that
        </button>
      )}
    </Field>
  );
}
