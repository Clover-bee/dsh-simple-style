# DSH Simple Style（外观风格）

给 **DeepSeek Harness Web UI** 换肤的插件：侧边栏多一个「外观」入口，点开后从 5 套风格里挑一套，整个应用（侧边栏、聊天区、菜单、输入框、卡片）立刻换配色与质感，选择记在本机，刷新后沿用。

> A theme plugin for the DeepSeek Harness Web UI. Five visual styles, each with light and dark palettes; the sidebar also becomes a floating card with two separated card areas.

## 风格

| id | 名称 | 品牌色（浅 / 深） |
| --- | --- | --- |
| `pink` | B 站粉 | `#FB7299` / `#FF85A9` |
| `ocean` | 深海蓝 | `#2E7BF6` / `#4E8DFF` |
| `forest` | 森野绿 | `#2E9E68` / `#3CC584` |
| `twilight` | 暮光紫 | `#7C5CFF` / `#9A7BFF` |
| `mono` | 极简黑白 | `#111111` / `#FAFAFA` |

每套都带 **浅色 + 深色** 两套取值，跟随应用当前的明暗模式；切换风格时颜色、圆角、投影、背景渐变一起换。

## 做了什么

- **整体换肤**：通过主题服务的 `overrideTokens` 覆盖 `--dsw-alias-*` / `--dsw-specific-*` 令牌，再叠一层本插件作用域的样式表负责质感（环境渐变、圆角尺度、投影、毛玻璃、160ms 过渡、焦点环）。
- **侧边栏卡片化**：整栏是从页面边缘脱开的浮卡（四周 8px 内缩、16px 圆角、1px 描边、投影 + 背景模糊）；栏内上半区（导航）与下半区（工作区）各是一张独立卡片区，中间留 8px 空隙。
- **条目与按钮**：导航行、新建会话按钮、底部账号按钮（头像 + 名字）、工具行都做成 10px 圆角的小卡；账号菜单打开时光晕铺满整卡。
- **选中态按风格自动选**：彩色四套用「左缘 3×16 品牌色指示条 + 品牌淡底 + 柔光」；极简黑白只留品牌淡底 + 1px 内描边，不加任何圆点/指示条。
- **隐藏工作区滚动条**（仍可用滚轮/触控板滚动，且不留空白沟）。
- **任务 / 频道滑块**（im-connect 注入的胶囊控件）换成同一套卡片语言：10px 圆角容器、品牌 5% 淡底、thumb 品牌描边与轻光晕。
- **面板**：侧边栏「外观」入口打开主面板，5 张风格卡即时切换，当前风格标记「使用中」，另有「恢复默认外观」与持久化（localStorage，键 `dsh-appearance.style`）。
- 卸载时撤掉令牌层与注入的样式表，外观原样回退；动效在 `prefers-reduced-motion` 下自动关闭。

## 安装

包在 `appearance-styles/`，是本仓库唯一的运行内容。用 DSH 的插件管理器指向该目录安装：

```text
plugin_manager install_bundle   target: <克隆目录>/appearance-styles
```

装完刷新 Web 界面即可。**从 git 恢复**：`git clone https://github.com/Clover-bee/dsh-simple-style.git`，再对 `appearance-styles/` 执行上面的安装命令（本地目录安装是链接形式，之后改仓库里的 `client.js` 刷新页面就生效，不需要重装）。

## 使用

1. 左侧边栏点「外观」图标（调色盘）打开面板；
2. 点任意风格卡即时生效，当前风格显示「使用中」；
3. 「恢复默认外观」回到 DSH 原始样式并清掉本地记录。

## 目录结构

```text
appearance-styles/
├── index.js           # Host 半，空实现（全部逻辑在浏览器侧）
├── client.js          # Client 半：风格定义、令牌层、样式表、侧栏/主面板注册
├── cordis.patch.yml   # bundle 补丁：把插件插入 profile
├── locale/            # 中英文案 + 插件元数据（meta.title / meta.description）
│   ├── zh.json
│   └── en.json
└── icon.svg           # 侧边栏图标（调色盘 + 5 个色点）
```

## 自检

```bash
node --check appearance-styles/client.js
```

装好后手测清单：

1. 侧栏出现「外观」入口，点开面板能看到 5 张风格卡；
2. 逐一点击：背景、侧栏、文字、品牌色、卡片质感、背景渐变同步变化；
3. 切到深色模式再点一遍，两套配色都成立、文字可读；
4. 刷新页面，上次选择仍保留；
5. 点「恢复默认外观」，回到原始外观且无残留描边/阴影/指示条。

> 开发时用的冒烟测试与对比度脚本属于本地工具（`.tmp/`，未入库），仓库只放运行所需文件。

## 实现边界

- 只用公开扩展点：`sidebar.panellist` / `main` 槽位、主题令牌、Client locale 服务；不改 DSH 源码、不替换应用根节点、不追加第二个应用。
- 侧栏样式通过 CSS module 类名**后缀**匹配（如 `[class*="sidebarCol"]`、`[class*="panelRow"]`、`button[class*="newSession"]`），不写死哈希前缀；宿主若改类名，需要同步这些选择器。
- 「恢复默认」= 移除令牌层与样式表，不做其它副作用。
