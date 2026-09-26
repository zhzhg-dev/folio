# Folio

[English](README.md) · 简体中文

**Keep the source. Own the writing.**

本地优先的资料与写作工作空间。导入资料，写下自己的判断，保留引用的原始版本，在资料发生变化时重新审阅。支持简体中文和 English。

A local-first workspace for sources and writing. Import evidence, write with versioned citations, and review what changed without losing your own edits.

> 0.3 可运行预览版。资料问答、证据核对与写作已经接通；本地 AI 仍是实验功能。

默认以英文打开。在侧栏的 **English / 中文** 切换界面语言，手机端也可使用底部语言按钮；选择会自动保存。切换界面不会翻译或覆盖你的正文。新版使用 Geist 操作字体、Newsreader 英文阅读字体和 Noto Sans SC 中文字体，字体文件随应用本地托管。

## 开始使用

需要 Node.js 22.13+（建议 Node.js 24）和 npm。

```sh
npm ci
npm run dev
```

打开 `http://127.0.0.1:5174`。无需创建账号或设置 API Key。

```sh
npm run typecheck
npm test
npm run build
npm start
```

`npm start` 预览生产构建。生产文件在 `dist/`，可部署到支持 HTTPS 的静态托管；目前按站点根路径部署。开发服务仅监听本机。

## 已实现

- 独立资料问答工作区：限定资料范围、连续追问、问答记录与未发送问题自动保存。
- 无需模型的原文查找，以及可选的本地 AI 回答；找不到依据时显示明确的无答案状态。
- PDF 原始页面阅读、引用所在文字行高亮、缩放与翻页；保留阅读页码。
- 选择回答段落，带着版本化引用写入正文；正文未再次修改时可撤销写入，并自动保留写入前快照。

- 多项目、富文本编辑、大纲、快捷查找、专注模式。
- PDF / TXT / Markdown 导入和文本粘贴；PDF 按页提取文字。
- 本地自动保存、跨窗口覆盖冲突检测。
- 引用绑定资料 ID、不可变版本、页码/段落和原文；点击可回到对应版本。
- 更新资料后标记旧引用，逐项替换；更新资料不会自动改写正文。
- 文档快照与恢复；恢复、替换引用、采纳 AI 草稿前自动保存快照。
- Word、Markdown、HTML 导出和打印；JSON 项目备份包含历史版本、原文件和快照。
- 可选 WebGPU 本地 AI：Web Worker 内运行 WebLLM / Qwen3，草稿先预览、确认后追加。
- 响应式侧栏、手机抽屉、中英文切换、基础键盘操作。
- 生产构建生成离线应用缓存和 PWA 清单。
- 支持 WebMCP 的浏览器可列出和打开项目；该接口不暴露全文。

## 试一遍核心流程

1. 新建项目，导入 PDF 或粘贴资料。
2. 写下观点，从资料面板选择原文并点击「引用」。
3. 保存文档快照。
4. 为同一资料上传修改后的版本，打开「来源检查」。
5. 查看旧原文，选择新原文替换引用，确认正文没有被重写。
6. 导出 Word 或项目备份；从设置恢复备份会创建新项目。

初始研究简报及来源均为**虚构演示资料**，不可当作市场事实使用。

## 数据与成本

正文、资料原文件和历史记录保存在当前浏览器的 IndexedDB；没有应用后端、遥测或云端文档上传。数据按网址和浏览器隔离。**清理浏览器数据、更换网址或设备前请导出备份。** 本地存储不等于加密存储，也不能替代备份。

核心功能不调用付费 API。本地 AI 首次需联网下载较大的模型文件，占用设备显存、内存和磁盘。文件托管服务会收到常规下载请求，资料文本不会因此上传。下载可用性及硬件支持取决于设备与网络，应用没有代付推理费用。

生产构建预缓存应用文件，首次在线加载完成后可离线写作；离线生成还要求模型成功下载并留在缓存中。私有站点登录和首次访问仍需网络。

## 当前边界

- 单文件上限 20 MB，PDF 上限 300 页；每项目最多 20 份资料，原文件及历史版本总计最多 80 MB。
- PDF 提供原始页面和匹配文字行高亮；尚无扫描件 OCR，复杂排版与旋转文字的定位准确性仍需完善。
- 检索采用按段落分块、词项相关性排序、中文双字切分与小型双语词典，最多选择 6 个片段，总计不超过 2,400 字符。尚无通用跨语言语义检索或全项目长文推理。
- 追问可引用上一问题的语境；之前生成的回答不会被当作原始证据。AI 对资料分歧的判断仍需人工核对。
- 引用检查确认版本与原文存在，不能证明生成内容必然得到资料支持。采纳前请核对。
- AI 只追加草稿，不会自动覆写正文或发布内容。
- 尚无账号同步、协同编辑、原生移动应用和后台定时更新。
- JSON 备份在大项目上会增加导出时内存占用。
- 当前检查不包含真实设备矩阵、全模型质量评测和完整离线验收。

## 技术结构

```text
app/                       页面入口与视觉样式
components/folio/          编辑器、资料、版本、审阅、助手
components/ui/             界面基础组件
lib/folio/model.ts         项目、不可变版本、引用、快照
lib/folio/storage.ts       IndexedDB 与保存冲突检测
lib/folio/integrity.ts     引用状态与文档结构验证
lib/folio/files.ts         导入、导出、备份与校验
lib/folio/ai.ts            本地召回与结构化生成
tests/                     数据完整性与导出检查
scripts/create-offline.mjs 离线缓存构建
```

React 19、TypeScript、Vite、Tiptap、Dexie、PDF.js、WebLLM；Shadcn / Radix 基础组件与定制样式。静态架构使核心数据留在用户设备，也减少个人维护时的服务器费用。

## 验证与后续

详见 [QA.md](QA.md)。下一阶段优先级：更广的中英文检索评测 → AI 跨设备可靠性 → OCR 与复杂 PDF 排版 → 安装及浏览器兼容性。

## English quick start

Run `npm ci`, then `npm run dev` and visit `http://127.0.0.1:5174`. Switch language in workspace settings. Import a text PDF, Markdown or TXT source, write a note and insert citations. Updating a source retains old evidence and manual writing. Review outdated citations individually. Export Word, Markdown or HTML, or back up an entire project as JSON.

All document data is browser-local. Back up before clearing storage or changing origins. Local AI is optional and experimental; it requires WebGPU, a model download and enough memory. Retrieval is currently keyword-based and limited. Citations prove provenance, not factual correctness. Cloud sync and OCR are not implemented.

## License

Folio application code uses the MIT License. Dependencies, vendored assets and model weights retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
