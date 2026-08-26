"use client";

import { useState } from "react";
import type { AiProvider } from "@/domain/ai/provider-config";
import type { AiProviderConfigView } from "@/services/parent/ai-provider-config";

type Props = {
  initial: AiProviderConfigView[];
};

type ProviderFormState = {
  baseUrl: string;
  model: string;
  enabled: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string;
  updatedAt: number | null;
  apiKeyInput: string;
  clearApiKey: boolean;
  pending: boolean;
  error: string;
  success: string;
};

const providerLabels = {
  openai: {
    title: "OpenAI",
    keyLabel: "OpenAI API Key（更换时填写）",
    clearLabel: "清除 OpenAI API Key",
    submitLabel: "保存 OpenAI",
  },
  deepseek: {
    title: "DeepSeek",
    keyLabel: "DeepSeek API Key（更换时填写）",
    clearLabel: "清除 DeepSeek API Key",
    submitLabel: "保存 DeepSeek",
  },
} satisfies Record<AiProvider, {
  title: string;
  keyLabel: string;
  clearLabel: string;
  submitLabel: string;
}>;

function toInitialState(initial: AiProviderConfigView[]) {
  return Object.fromEntries(initial.map((item) => [item.provider, {
    baseUrl: item.baseUrl,
    model: item.model,
    enabled: item.enabled,
    hasApiKey: item.hasApiKey,
    apiKeyMasked: item.apiKeyMasked,
    updatedAt: item.updatedAt,
    apiKeyInput: "",
    clearApiKey: false,
    pending: false,
    error: "",
    success: "",
  }])) as Record<AiProvider, ProviderFormState>;
}

function providerOrder(state: Record<AiProvider, ProviderFormState>) {
  return Object.keys(state) as AiProvider[];
}

export function AiProviderConfigForm({ initial }: Props) {
  const [providers, setProviders] = useState(() => toInitialState(initial));

  function updateProvider(provider: AiProvider, updater: (current: ProviderFormState) => ProviderFormState) {
    setProviders((current) => ({ ...current, [provider]: updater(current[provider]) }));
  }

  async function submit(provider: AiProvider, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = providers[provider];
    const body: {
      provider: AiProvider;
      baseUrl: string;
      model: string;
      enabled: boolean;
      apiKey?: string;
      clearApiKey?: true;
    } = {
      provider,
      baseUrl: current.baseUrl,
      model: current.model,
      enabled: current.enabled,
    };

    if (current.clearApiKey) body.clearApiKey = true;
    else if (current.apiKeyInput !== "") body.apiKey = current.apiKeyInput;

    updateProvider(provider, (value) => ({ ...value, pending: true, error: "", success: "" }));

    try {
      const response = await fetch("/api/parent/ai-config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        updateProvider(provider, (value) => ({
          ...value,
          apiKeyInput: "",
          pending: false,
          error: "保存失败，请刷新后重试",
        }));
        return;
      }

      const payload = await response.json() as { provider: AiProviderConfigView };
      updateProvider(provider, (value) => ({
        ...value,
        baseUrl: payload.provider.baseUrl,
        model: payload.provider.model,
        enabled: payload.provider.enabled,
        hasApiKey: payload.provider.hasApiKey,
        apiKeyMasked: payload.provider.apiKeyMasked,
        updatedAt: payload.provider.updatedAt,
        apiKeyInput: "",
        clearApiKey: false,
        pending: false,
        error: "",
        success: `${providerLabels[provider].title} 配置已保存`,
      }));
    } catch {
      updateProvider(provider, (value) => ({
        ...value,
        apiKeyInput: "",
        pending: false,
        error: "网络连接失败，请检查网络后重试",
      }));
    }
  }

  return (
    <section className="parentSection aiConfigSection" aria-labelledby="ai-config-heading">
      <div className="sectionHeading">
        <h2 id="ai-config-heading">AI 服务配置</h2>
        <p>仅供家长保存地址、模型和密钥，不会在这里发起外部 AI 调用。</p>
      </div>
      <div className="aiConfigGrid">
        {providerOrder(providers).map((provider) => {
          const item = providers[provider];
          const labels = providerLabels[provider];
          return (
            <form key={provider} className="aiProviderCard" onSubmit={(event) => submit(provider, event)}>
              <fieldset disabled={item.pending}>
                <legend>{labels.title}</legend>
                <label>
                  API 地址
                  <input
                    value={item.baseUrl}
                    onChange={(event) => updateProvider(provider, (value) => ({
                      ...value,
                      baseUrl: event.target.value,
                      error: "",
                      success: "",
                    }))}
                  />
                </label>
                <label>
                  模型名称
                  <input
                    value={item.model}
                    onChange={(event) => updateProvider(provider, (value) => ({
                      ...value,
                      model: event.target.value,
                      error: "",
                      success: "",
                    }))}
                  />
                </label>
                <label>
                  {labels.keyLabel}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={item.apiKeyInput}
                    onChange={(event) => updateProvider(provider, (value) => ({
                      ...value,
                      apiKeyInput: event.target.value,
                      error: "",
                      success: "",
                    }))}
                  />
                </label>
                <p className="aiProviderStatus">当前状态：<span>{item.hasApiKey ? item.apiKeyMasked : "未配置"}</span></p>
                <label className="aiProviderToggle">
                  <input
                    type="checkbox"
                    checked={item.clearApiKey}
                    onChange={(event) => updateProvider(provider, (value) => ({
                      ...value,
                      clearApiKey: event.target.checked,
                      error: "",
                      success: "",
                    }))}
                  />
                  {labels.clearLabel}
                </label>
                <label className="aiProviderToggle">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(event) => updateProvider(provider, (value) => ({
                      ...value,
                      enabled: event.target.checked,
                      error: "",
                      success: "",
                    }))}
                  />
                  启用
                </label>
                <button type="submit">{labels.submitLabel}</button>
                {item.error && <p role="alert">{item.error}</p>}
                {item.success && <p className="aiProviderSuccess">{item.success}</p>}
              </fieldset>
            </form>
          );
        })}
      </div>
    </section>
  );
}
