import Header from "@/components/Header";
import SettingsSync from "@/components/SettingsSync";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SettingsSync />
      <Header />
      <main>{children}</main>
    </>
  );
}
