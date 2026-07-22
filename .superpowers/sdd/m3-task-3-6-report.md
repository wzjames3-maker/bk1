# M3 任务 3-6 报告：Pipeline 服务层和步骤执行器

## 状态：✅ 完成

## 创建的文件（12 个）

### 任务 3：DeepSeek 编剧服务
| 文件 | 说明 |
|------|------|
| `src/lib/services/deepseek.ts` | DeepSeek 编剧服务（OpenAI SDK 兼容） |
| `src/lib/pipeline/steps/script.ts` | 编剧步骤执行器 |

### 任务 4：TTS 服务
| 文件 | 说明 |
|------|------|
| `src/lib/services/tts-aliyun.ts` | 阿里云 TTS 合成 |
| `src/lib/services/tts-mimo.ts` | MiMo TTS 合成 |
| `src/lib/services/tts-router.ts` | TTS 路由（按 provider 分发） |
| `src/lib/pipeline/steps/tts.ts` | TTS 步骤执行器（逐段合成 + 30s 预览） |

### 任务 5：FFmpeg 混音
| 文件 | 说明 |
|------|------|
| `src/lib/services/ffmpeg.ts` | FFmpeg 混音服务（concat 拼接） |
| `src/lib/pipeline/steps/mix.ts` | 混音步骤执行器 |

### 任务 6：后处理 + 解析 + 确认
| 文件 | 说明 |
|------|------|
| `src/lib/services/post-process.ts` | 后处理服务（show notes + 章节生成） |
| `src/lib/pipeline/steps/post.ts` | 后处理步骤执行器 |
| `src/lib/pipeline/steps/parse.ts` | 素材解析步骤执行器 |
| `src/lib/pipeline/steps/confirm.ts` | 确认步骤执行器 |

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `dc1687f` | feat: add DeepSeek scripting service and pipeline step |
| 2 | `7175cf3` | feat: add TTS services (Aliyun + MiMo) and pipeline step |
| 3 | `c01ac84` | feat: add FFmpeg mixing service and pipeline step |
| 4 | `f8efe07` | feat: add post-processing, parsing, and confirm pipeline steps |

## 验证

- `npx tsc --noEmit`：✅ 0 错误

## 功能摘要

- **DeepSeek 编剧**：调用 DeepSeek API 生成结构化对话脚本 `[{role, text, emotion, pause_ms}]`，支持指数退避重试
- **TTS 合成**：支持阿里云和 MiMo 两个供应商，按 voice 表中的 provider 字段路由；逐段合成并上传到 Supabase Storage
- **30s 预览**：编剧完成后标记 `preview_url: 'pending'`，TTS 步骤中拼接前 3 段生成预览音频
- **FFmpeg 混音**：下载所有段落到临时目录，用 concat 协议拼接为最终 MP3
- **后处理**：调用 DeepSeek 生成 show notes、章节列表、封面建议
- **素材解析**：解析 URL 和纯文本素材，提取文本存入 `extracted_text`
- **确认步骤**：检查 `skip_confirmation` 参数，不跳过时抛出 `WAITING_FOR_CONFIRMATION` 暂停 pipeline
