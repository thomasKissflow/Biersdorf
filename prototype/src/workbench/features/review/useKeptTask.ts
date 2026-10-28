// After a submit the task leaves the user's queue (tasks reload). A screen keeps the task it was opened with, so it
// can still show the submit's outcome (lane diff, "could not read with your access" note, audit warning) instead of
// jumping to "not in your queue". `held` says whether the task is still in the queue: actions need held = true
// (ground rule 13); the kept task is for display only.
import { useRef } from "react";
import type { TaskVM } from "../../data/viewModels";

export function useKeptTask(found: TaskVM | null, key: string): { task: TaskVM | null; held: boolean } {
  const ref = useRef<{ key: string; task: TaskVM } | null>(null);
  if (found) ref.current = { key, task: found };
  else if (ref.current && ref.current.key !== key) ref.current = null;
  return { task: found ?? ref.current?.task ?? null, held: !!found };
}
