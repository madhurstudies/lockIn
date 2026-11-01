import Header from "@/components/Header";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Header />
      <main>{children}</main>
    </>
  );
}
