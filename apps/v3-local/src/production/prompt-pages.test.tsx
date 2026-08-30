import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { remoteApi } from "./api";
import { RemoteAIPromptPage } from "./prompt-pages";
import type { RemoteAIModelConfig, RemoteAIPrompt } from "./types";

const defaultPrompt = "你是逐幼儿观察分析助手。请严格区分客观事实、专业解释和待验证假设，并依据当前年龄段知识卡提出可执行应答，不得补造任何未提供的行为或语言。".repeat(2);
const item: RemoteAIPrompt = {
  key: "observation_analysis",
  name: "逐幼儿观察分析",
  category: "观察",
  description: "结合多类型证据生成观察、识别、应答与拓展。",
  defaultVersion: "observation-analysis.qwen.v5",
  effectiveVersion: "observation-analysis.qwen.v5",
  source: "default",
  revision: 0,
  defaultPrompt,
  customPrompt: null,
  effectivePrompt: defaultPrompt,
  basePromptVersion: "observation-analysis.qwen.v5",
  baseVersionOutdated: false,
  changeNote: "",
  updatedAt: null,
  updatedBy: null,
  updatedByName: null,
};
const modelConfig: RemoteAIModelConfig = {
  model: "qwen3.7-plus-2026-05-26",
  defaultModel: "qwen3.7-plus-2026-05-26",
  source: "environment",
  revision: 0,
  updatedAt: null,
  updatedBy: null,
  updatedByName: null,
  options: [
    { value: "qwen3.7-plus-2026-05-26", label: "qwen3.7-plus-2026-05-26", description: "当前默认模型。" },
    { value: "qwen3.7-flash", label: "qwen3.7-flash", description: "日常快速分析。" },
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("researcher AI prompt page", () => {
  it("lists the scene, exposes immutable safety and saves a tenant revision", async () => {
    vi.spyOn(remoteApi, "aiPrompts").mockResolvedValue({
      immutableSafetyPrompt: "禁止诊断、排名、标签化和编造证据。",
      items: [item],
    });
    vi.spyOn(remoteApi, "aiModelConfig").mockResolvedValue({ item: modelConfig });
    const update = vi.spyOn(remoteApi, "updateAIPrompt").mockResolvedValue({
      item: {
        ...item,
        source: "custom",
        revision: 1,
        customPrompt: `${defaultPrompt}\n增加本园观察重点。`,
        effectivePrompt: `${defaultPrompt}\n增加本园观察重点。`,
        effectiveVersion: "custom.observation_analysis.r1@observation-analysis.qwen.v5",
        updatedByName: "教研员",
        updatedAt: "2026-08-28T09:00:00.000Z",
      },
    });

    render(<RemoteAIPromptPage />);

    expect(await screen.findAllByText("逐幼儿观察分析")).toHaveLength(2);
    expect(screen.getByText("安全与循证底线不可修改")).toBeInTheDocument();
    const editor = screen.getByLabelText(/园所场景提示词/);
    fireEvent.change(editor, { target: { value: `${defaultPrompt}\n增加本园观察重点。` } });
    fireEvent.change(screen.getByLabelText(/修改说明/), { target: { value: "加强观察重点" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并用于后续 AI" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith("observation_analysis", {
      systemPrompt: `${defaultPrompt}\n增加本园观察重点。`,
      expectedRevision: 0,
      changeNote: "加强观察重点",
    }));
    expect(await screen.findByText(/下一次该场景调用 AI 时立即采用新版本/)).toBeInTheDocument();
  });

  it("saves one shared model selection for every AI scene", async () => {
    vi.spyOn(remoteApi, "aiPrompts").mockResolvedValue({
      immutableSafetyPrompt: "禁止诊断、排名、标签化和编造证据。",
      items: [item],
    });
    vi.spyOn(remoteApi, "aiModelConfig").mockResolvedValue({ item: modelConfig });
    const update = vi.spyOn(remoteApi, "updateAIModelConfig").mockResolvedValue({
      item: { ...modelConfig, model: "qwen3.7-flash", source: "tenant", revision: 1, updatedByName: "教研员" },
    });

    render(<RemoteAIPromptPage />);

    fireEvent.change(await screen.findByLabelText("千问模型"), { target: { value: "qwen3.7-flash" } });
    fireEvent.click(screen.getByRole("button", { name: "保存统一模型" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith({
      model: "qwen3.7-flash",
      expectedRevision: 0,
    }));
    expect(await screen.findByText(/下一次所有 AI 场景调用都会使用该模型/)).toBeInTheDocument();
  });
});
