import Link from "next/link";
import { getDatabase } from "@/db/client";
import { requireParent } from "@/lib/auth/parent-child";
import { AiProviderConfigForm } from "@/components/ai-provider-config-form";
import { listAiProviderConfigs } from "@/services/parent/ai-provider-config";

export default async function SettingsPage() {
  const parent = await requireParent();
  if (!parent.isAdmin) throw new Response(null, { status: 403 });

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
