import { connection } from "next/server";
import TimerView from "@/components/TimerView";
import { getActive, getTags } from "@/lib/store";

export default async function Timer() {
  await connection();
  const now = Date.now();
  const [active, tags] = await Promise.all([getActive(now), getTags()]);
  return <TimerView initialActive={active} initialNow={now} initialTags={tags} />;
}
