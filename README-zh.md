<p align="center">
  <img src="icon.png" alt="LyraUI" width="128" height="128">
</p>

<h1 align="center">LyraUI</h1>

<p align="center">一个极简、快速的 Chrome 插件，与本地 Ollama 模型对话</p>

<p align="center">
  <a href="README.md">English</a>
  &nbsp;|&nbsp;
  <a href="README-zh.md">中文</a>
</p>

---

## 功能

- **流式对话** — 实时 Token 输出，支持上下文记忆
- **思考过程预览** — 支持 DeepSeek、QwQ 等推理模型的可折叠思考块
- **翻译面板** — 内置 12 种语言翻译，流式输出结果
- **零配置** — 自动检测本地所有 Ollama 模型
- **轻量** — 原生 JS，无需构建，无框架依赖

## 安装

### 从 Release 安装

1. 从 [Releases](https://github.com/chinskylee/LyraUI/releases) 下载最新 `.zip` 并解压
2. 在 Chromium 浏览器中打开 `chrome://extensions`
3. 开启右上角**开发者模式**
4. 点击**加载已解压的扩展程序**，选择解压后的文件夹

### 从源码安装

1. 克隆本仓库，在 Chromium 浏览器中打开 `chrome://extensions`
2. 开启右上角**开发者模式**
3. 点击**加载已解压的扩展程序**，选择项目文件夹

> 需要本地运行 [Ollama](https://ollama.com)，默认地址 `127.0.0.1:11434`

## 使用

| 操作           | 方式                                   |
|----------------|----------------------------------------|
| 打开聊天       | 点击工具栏扩展图标                     |
| 发送消息       | `Enter`                                |
| 换行           | `Shift + Enter`                        |
| 切换模型       | 顶部下拉菜单                           |
| 翻译           | 切换到 **Translate** 标签，`Ctrl + Enter` 执行 |

### 翻译

翻译面板支持 12 种语言，流式输出结果。推荐使用 **translategemma 系列模型** 以获得最佳效果，例如 `translategemma:4b` 兼顾速度和质量。翻译提示词遵循 translategemma 官方格式，支持源语言选择（默认自动识别）。

## 示例

### 与Gemma 4对话
![与Gemma 4对话](demo/chat-demo.png)
*聊天页面向Gemma 4:2b模型问好的示例*

### 翻译博客引言
![翻译博客引言](demo/translate-demo.png)
*翻译我的博客文章引言的示例*

## 技术栈

- Manifest V3（Service Worker + `declarativeNetRequest`）
- 原生 HTML/CSS/JS — 无框架、无构建工具
- Ollama REST API（`/api/chat`、`/api/tags`）流式调用

## 为什么叫 "LyraUI"？

Lyra（天琴座）是北天一个小而明亮的星座。这个扩展也是如此 — 紧凑、专注，是你通往本地 AI 的窗口。

## 开源协议

MIT

## 致谢

- [Page Assist](https://github.com/n4ze3m/page-assist) — 启发本项目开发的 Chrome 插件
- [DeepSeek-V4-Pro](https://deepseek.com) — 为本项目的开发过程提供支持
- [NanoBanana2](https://gemini.google/overview/image-generation/) — 辅助创建了 Logo，其设计呈现出更深邃、更稳定、视觉更舒适的布局，仿佛一颗璀璨的星座完美悬浮于浏览器标签页中央。