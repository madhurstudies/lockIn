import { connection } from "next/server";
import TimerView from "@/components/TimerView";
import { MAX_PLANNED_MS } from "@/lib/session";
import { getActive, getSettings, getTags } from "@/lib/store";

export default async function Timer({ searchParams }: PageProps<"/">) {
  await connection();
  const now = Date.now(); // eslint-disable-line react-hooks/purity -- request-time value, after connection()
  const [active, tags, settings] = await Promise.all([getActive(now), getTags(), getSettings()]);
  const set = Number((await searchParams).set); // minutes, from the Day tab's Start
  const initialMins = Number.isInteger(set) && set > 0 ? Math.min(set, MAX_PLANNED_MS / 60_000) : undefined;
  return <TimerView initialActive={active} initialNow={now} initialTags={tags} initialSettings={settings} initialMins={initialMins} />;
}
