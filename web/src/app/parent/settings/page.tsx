import Link from "next/link";
import { redirect } from "next/navigation";
import { getDatabase } from "@/db/client";
import { requireRole } from "@/lib/auth/current-user";
import { AiProviderConfigForm } from "@/components/ai-provider-config-form";
import { listAiProviderConfigs } from "@/services/parent/ai-provider-config";

export default async function SettingsPage() {
  const parent = await requireRole("parent");
  if (!parent.isAdmin) redirect("/parent");

  const db = getDatabase();
  const configs = listAiProviderConfigs(db);

  return (
    <main className="parentPage">
      <header className="parentHeader">
        <div>
          <p className="eyebrow">
            <Link href="/parent">← 返回孩子列表</Link>
          </p>
          <h1>系统设置</h1>
        </div>
      </header>

      <AiProviderConfigForm initial={configs} />
    </main>
  );
}
