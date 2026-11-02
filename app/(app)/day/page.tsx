import { connection } from "next/server";
import DayView from "@/components/DayView";
import { getActive, getConstraints, getSettings } from "@/lib/store";

export default async function Day() {
  await connection();
  const now = Date.now(); // eslint-disable-line react-hooks/purity -- request-time value, after connection()
  const [active, constraints, settings] = await Promise.all([getActive(now), getConstraints(), getSettings()]);
  return <DayView initialActive={active} initialNow={now} initialConstraints={constraints} settings={settings} />;
}
