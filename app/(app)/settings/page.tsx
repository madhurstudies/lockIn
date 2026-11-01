import { connection } from "next/server";
import SettingsView from "@/components/SettingsView";
import { getSettings } from "@/lib/store";

export default async function Settings() {
  await connection();
  return <SettingsView initial={await getSettings()} />;
}
