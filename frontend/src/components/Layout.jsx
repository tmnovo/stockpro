import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { api } from "@/lib/api";

export default function Layout({ title, children }) {
  const [companyName, setCompanyName] = useState("OMS");

  useEffect(() => {
    api.get("/settings")
      .then(({ data }) => setCompanyName(data.company_name || "OMS"))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar companyName={companyName} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={title} />
        <main className="flex-1 p-4 md:p-6 max-w-[1600px] w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
