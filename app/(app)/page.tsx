import { connection } from "next/server";
import TimerView from "@/components/TimerView";
import { getActive, getSettings, getTags } from "@/lib/store";

export default async function Timer() {
  await connection();
  const now = Date.now(); // eslint-disable-line react-hooks/purity -- request-time value, after connection()
  const [active, tags, settings] = await Promise.all([getActive(now), getTags(), getSettings()]);
  return <TimerView initialActive={active} initialNow={now} initialTags={tags} initialSettings={settings} />;
}
