/**
 * 外观风格（Appearance Styles）—— Client 半。
 *
 * 设计要点
 * 1. 只用公开扩展点：`sidebar.panellist`（侧栏入口）+ `main`（主面板）+ Client locale 服务，
 *    另加 `theme.overrideTokens` 作为可选的加固层。不替换应用根节点、不追加第二个应用、不改布局。
 * 2. 一套配色两处落地：
 *    - 主题令牌层（17 个 --dsw-alias-* / --dsw-specific-* 令牌，light/dark 成对）负责"换色"，
 *      这样聊天区、侧栏、菜单、输入框、卡片等所有消费令牌的宿主组件都会跟着变；
 *    - 本插件自己的作用域样式表负责"质感"：环境渐变、圆角尺度、投影、毛玻璃、动效与焦点环。
 *    样式表里的令牌声明带 !important，避免宿主路由样式按需注入、顺序靠后时把主题盖掉；
 *    恢复默认时整张表移除，外观原样回退。
 * 3. 持久化用 localStorage（键 `dsh-appearance.style`），失败（隐私模式）时静默降级为本次会话生效。
 */
window.__ModuleLoader__.load({
	id: '@local/appearance-styles',
	factory: (require) => {
		const React = require('react');
		const h = React.createElement;
		const { useEffect, useState } = React;

		// ---------------------------------------------------------------- 常量
		const NS = 'appearance-styles';
		const PANEL_ID = 'dsh-appearance';
		const SIDEBAR_ORDER = 30;
		const STORAGE_KEY = 'dsh-appearance.style';
		const OVERRIDE_SOURCE = 'dsh-appearance-styles';
		const SHEET_STYLE = 'dsh-appearance-style';
		const SHEET_BASE = 'dsh-appearance-base';

		// ---------------------------------------------------------------- 文案
		const ZH = {
			panel: '外观',
			title: '外观风格',
			subtitle: '挑一种视觉风格，整个应用——侧边栏、聊天区、卡片、菜单——会立刻换成这套配色与质感。',
			reset: '恢复默认外观',
			resetHint: '当前是 DeepSeek Harness 的原始外观。选一种风格即可开始。',
			activeNote: '已应用到整个应用，下次打开会自动沿用。',
			active: '使用中',
			hint: '每种风格都自带浅色与深色两套配色，跟随应用的明暗模式自动切换。',
			'style.pink.name': 'B 站粉',
			'style.pink.desc': '樱花粉品牌色配天蓝点缀，圆润、轻盈，带一点二次元的元气。',
			'style.ocean.name': '深海蓝',
			'style.ocean.desc': '冷静的科技蓝，收紧的圆角与克制的投影，专注而克制。',
			'style.forest.name': '森野绿',
			'style.forest.desc': '苔绿与晨雾，最大的圆角与柔和的绿调阴影，安静、舒展。',
			'style.twilight.name': '暮光紫',
			'style.twilight.desc': '紫罗兰渐变与微光投影，深色下像夜色里的霓虹。',
			'style.mono.name': '极简黑白',
			'style.mono.desc': '去掉一切彩色噪音，锐利的直角、硬朗的投影，只有黑白灰。',
		};

		const EN = {
			panel: 'Appearance',
			title: 'Appearance',
			subtitle: 'Pick a visual style and the whole app — sidebar, conversation, cards, menus — switches to that palette and texture at once.',
			reset: 'Restore default look',
			resetHint: 'You are on the original DeepSeek Harness look. Pick a style to begin.',
			activeNote: 'Applied across the app; it will be remembered next time.',
			active: 'Active',
			hint: 'Every style ships a light and a dark palette and follows the app color scheme.',
			'style.pink.name': 'Bilibili Pink',
			'style.pink.desc': 'Cherry-blossom pink with a sky-blue accent, rounder corners and a light bounce.',
			'style.ocean.name': 'Deep Ocean',
			'style.ocean.desc': 'A calm tech blue with tight corners and restrained shadows.',
			'style.forest.name': 'Forest',
			'style.forest.desc': 'Moss green and morning mist, the roundest corners, soft green-tinted shadows.',
			'style.twilight.name': 'Twilight',
			'style.twilight.desc': 'Violet gradients and a faint glow; in dark mode it reads like neon at night.',
			'style.mono.name': 'Mono',
			'style.mono.desc': 'No color noise: crisp corners, hard shadows, nothing but black, white and grey.',
		};

		let tr = (key) => key;

		// ------------------------------------------------------------ 令牌映射
		// spec 的字段名 → CSS 自定义属性。alias 组是主题服务公开管理的令牌，
		// extra 组是宿主样式里同样按 body / body[data-ds-dark-theme] 声明的具体层令牌。
		const TOKEN_MAP = {
			base: '--dsw-alias-bg-base',
			layer1: '--dsw-alias-bg-layer-1',
			layer2: '--dsw-alias-bg-layer-2',
			overlay: '--dsw-alias-bg-overlay',
			border1: '--dsw-alias-border-l1',
			border2: '--dsw-alias-border-l2',
			brand: '--dsw-alias-brand-primary',
			text: '--dsw-alias-label-primary',
			text2: '--dsw-alias-label-secondary',
			error: '--dsw-alias-state-error-primary',
			idle: '--dsw-alias-state-idle-primary',
			success: '--dsw-alias-state-success-primary',
			warn: '--dsw-alias-state-warn-primary',
			sidebar: '--dsw-specific-sidebar-fill',
			bubble: '--dsw-specific-bubble',
			bubbleHi: '--dsw-specific-bubble-highlight',
			navActive: '--dsw-specific-sidebar-nav-item-active',
			navHover: '--dsw-specific-sidebar-nav-item-hover',
			navAccent: '--dsw-specific-sidebar-nav-item-active-accent',
			input: '--dsw-specific-input-major',
			selector: '--dsw-specific-selector',
			tip: '--dsw-specific-tip',
			link: '--dsw-alias-link',
			hover: '--dsw-alias-interactive-bg-hover',
			focus: '--dsw-focus-ring-color',
			scrollbar: '--dsw-alias-scrollbar-bg-l1',
			scrollbarHover: '--dsw-alias-scrollbar-hover-l1',
		};

		// 只有主题服务公开列出的别名令牌走 overrideTokens；其余靠样式表落地。
		const ALIAS_KEYS = [
			'base', 'layer1', 'layer2', 'overlay', 'border1', 'border2', 'brand',
			'text', 'text2', 'error', 'idle', 'success', 'warn', 'sidebar',
		];

		// ------------------------------------------------------------ 风格定义
		// 每套风格：19 个颜色（浅/深各一份）+ 圆角尺度 + 投影 + 背景渐变 + 预览色。
		const STYLES = [
			{
				id: 'pink',
				preview: ['#FB7299', '#FF9EC0', '#5AC8FA'],
				radius: { xs: '6px', sm: '10px', md: '14px', lg: '18px', xl: '22px', panel: '30px' },
				cornerShape: 'superellipse(1.6)',
				deco: 'glow',
				backdrop: 'blur(28px) saturate(160%)',
				shadowTint: '190,90,125',
				shadowRing: '251,114,153',
				shadowRingDark: '255,133,169',
				gradient: {
					light: 'radial-gradient(540px 360px at 4% -6%, #FFA8C7 0%, rgba(255,168,199,0) 70%), radial-gradient(460px 320px at 104% 104%, #B9E3FF 0%, rgba(185,227,255,0) 68%), linear-gradient(170deg, #FFEDF4 0%, #FBE1EC 100%)',
					dark: 'radial-gradient(520px 340px at 6% -6%, #7A2C4B 0%, rgba(122,44,75,0) 70%), radial-gradient(440px 300px at 104% 104%, #1C3C57 0%, rgba(28,60,87,0) 68%), linear-gradient(170deg, #2A1620 0%, #170D14 100%)',
				},
				light: {
					base: 'rgba(255,247,250,0.66)',
					layer1: 'rgba(255,255,255,0.94)',
					layer2: 'rgba(255,252,253,0.96)',
					overlay: 'rgba(255,248,251,0.98)',
					border1: 'rgba(251,114,153,0.16)',
					border2: 'rgba(251,114,153,0.30)',
					brand: '#FB7299',
					text: '#241A1E',
					text2: '#6C5762',
					error: '#E23D66',
					idle: '#F0C9D6',
					success: '#2FA96B',
					warn: '#DE8A1E',
					sidebar: 'rgba(255,241,246,0.70)',
					bubble: 'rgba(255,236,242,0.95)',
					bubbleHi: 'rgba(251,114,153,0.20)',
					navActive: 'rgba(251,114,153,0.14)',
					navHover: 'rgba(251,114,153,0.08)',
					navAccent: 'rgba(251,114,153,0.30)',
					input: 'rgba(255,255,255,0.94)',
					selector: 'rgba(255,238,244,0.96)',
					tip: 'rgba(255,243,247,0.94)',
					link: '#E24E7C',
					hover: 'rgba(251,114,153,0.10)',
					focus: 'rgba(251,114,153,0.55)',
					scrollbar: 'rgba(251,114,153,0.28)',
					scrollbarHover: 'rgba(251,114,153,0.48)',
				},
				dark: {
					base: 'rgba(26,16,21,0.74)',
					layer1: 'rgba(38,24,31,0.94)',
					layer2: 'rgba(46,30,38,0.95)',
					overlay: 'rgba(42,27,35,0.98)',
					border1: 'rgba(251,114,153,0.18)',
					border2: 'rgba(251,114,153,0.34)',
					brand: '#FF85A9',
					text: '#FBEDF2',
					text2: '#C4ABB6',
					error: '#FF7A92',
					idle: '#4A3540',
					success: '#4FCB8B',
					warn: '#F3B24C',
					sidebar: 'rgba(22,13,18,0.78)',
					bubble: 'rgba(56,34,44,0.95)',
					bubbleHi: 'rgba(255,133,169,0.24)',
					navActive: 'rgba(255,133,169,0.16)',
					navHover: 'rgba(255,133,169,0.09)',
					navAccent: 'rgba(255,133,169,0.36)',
					input: 'rgba(40,26,33,0.95)',
					selector: 'rgba(46,29,37,0.96)',
					tip: 'rgba(44,28,36,0.95)',
					link: '#FF9DBA',
					hover: 'rgba(255,133,169,0.12)',
					focus: 'rgba(255,133,169,0.60)',
					scrollbar: 'rgba(255,133,169,0.30)',
					scrollbarHover: 'rgba(255,133,169,0.48)',
				},
			},
			{
				id: 'ocean',
				preview: ['#2E7BF6', '#5AA0FF', '#7FE3FF'],
				radius: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px', panel: '26px' },
				cornerShape: 'superellipse(1.4)',
				deco: 'glow',
				backdrop: 'blur(24px) saturate(150%)',
				shadowTint: '40,80,140',
				shadowRing: '46,123,246',
				shadowRingDark: '78,141,255',
				gradient: {
					light: 'radial-gradient(560px 380px at 0% -6%, #A9D2FF 0%, rgba(169,210,255,0) 70%), radial-gradient(480px 330px at 100% 102%, #B6F0FF 0%, rgba(182,240,255,0) 68%), linear-gradient(165deg, #EDF6FF 0%, #E2EFFE 100%)',
					dark: 'radial-gradient(540px 360px at 0% -6%, #1E4A78 0%, rgba(30,74,120,0) 70%), radial-gradient(460px 320px at 100% 102%, #124C63 0%, rgba(18,76,99,0) 68%), linear-gradient(165deg, #0F1D2E 0%, #0A1420 100%)',
				},
				light: {
					base: 'rgba(244,249,255,0.66)',
					layer1: 'rgba(255,255,255,0.94)',
					layer2: 'rgba(246,250,255,0.96)',
					overlay: 'rgba(242,248,255,0.98)',
					border1: 'rgba(46,123,246,0.14)',
					border2: 'rgba(46,123,246,0.28)',
					brand: '#2E7BF6',
					text: '#0E1B2B',
					text2: '#51637A',
					error: '#D93B3B',
					idle: '#C2D5EC',
					success: '#1F9D63',
					warn: '#DC8A16',
					sidebar: 'rgba(233,242,253,0.70)',
					bubble: 'rgba(232,243,255,0.95)',
					bubbleHi: 'rgba(46,123,246,0.20)',
					navActive: 'rgba(46,123,246,0.13)',
					navHover: 'rgba(46,123,246,0.07)',
					navAccent: 'rgba(46,123,246,0.30)',
					input: 'rgba(255,255,255,0.94)',
					selector: 'rgba(235,244,255,0.96)',
					tip: 'rgba(238,246,255,0.94)',
					link: '#2E7BF6',
					hover: 'rgba(46,123,246,0.10)',
					focus: 'rgba(46,123,246,0.55)',
					scrollbar: 'rgba(46,123,246,0.26)',
					scrollbarHover: 'rgba(46,123,246,0.45)',
				},
				dark: {
					base: 'rgba(10,16,26,0.74)',
					layer1: 'rgba(17,26,40,0.94)',
					layer2: 'rgba(22,33,50,0.95)',
					overlay: 'rgba(21,32,50,0.98)',
					border1: 'rgba(90,150,255,0.18)',
					border2: 'rgba(90,150,255,0.32)',
					brand: '#4E8DFF',
					text: '#E7EFFB',
					text2: '#9BAFCA',
					error: '#FF7B7B',
					idle: '#2B3B52',
					success: '#3FC98A',
					warn: '#EFB150',
					sidebar: 'rgba(8,13,22,0.78)',
					bubble: 'rgba(24,38,58,0.95)',
					bubbleHi: 'rgba(78,141,255,0.24)',
					navActive: 'rgba(78,141,255,0.16)',
					navHover: 'rgba(78,141,255,0.09)',
					navAccent: 'rgba(78,141,255,0.36)',
					input: 'rgba(18,28,43,0.95)',
					selector: 'rgba(23,34,52,0.96)',
					tip: 'rgba(22,33,50,0.95)',
					link: '#7CB0FF',
					hover: 'rgba(78,141,255,0.12)',
					focus: 'rgba(78,141,255,0.60)',
					scrollbar: 'rgba(78,141,255,0.30)',
					scrollbarHover: 'rgba(78,141,255,0.48)',
				},
			},
			{
				id: 'forest',
				preview: ['#2E9E68', '#5FC48F', '#B7E8C9'],
				radius: { xs: '8px', sm: '12px', md: '16px', lg: '20px', xl: '24px', panel: '32px' },
				cornerShape: 'superellipse(1.8)',
				deco: 'glow',
				backdrop: 'blur(30px) saturate(150%)',
				shadowTint: '40,90,65',
				shadowRing: '46,158,104',
				shadowRingDark: '60,197,132',
				gradient: {
					light: 'radial-gradient(560px 380px at 2% -6%, #A9E5C2 0%, rgba(169,229,194,0) 70%), radial-gradient(470px 330px at 102% 102%, #CFF3DA 0%, rgba(207,243,218,0) 68%), linear-gradient(165deg, #EDFBF2 0%, #E2F7EA 100%)',
					dark: 'radial-gradient(540px 360px at 2% -6%, #1C5537 0%, rgba(28,85,55,0) 70%), radial-gradient(450px 310px at 102% 102%, #10402A 0%, rgba(16,64,42,0) 68%), linear-gradient(165deg, #0D2217 0%, #08160F 100%)',
				},
				light: {
					base: 'rgba(245,251,247,0.66)',
					layer1: 'rgba(255,255,255,0.94)',
					layer2: 'rgba(248,252,249,0.96)',
					overlay: 'rgba(243,250,245,0.98)',
					border1: 'rgba(46,158,104,0.14)',
					border2: 'rgba(46,158,104,0.28)',
					brand: '#2E9E68',
					text: '#10201A',
					text2: '#4F6559',
					error: '#C94040',
					idle: '#C6DFD1',
					success: '#1E9E5F',
					warn: '#C98A16',
					sidebar: 'rgba(233,246,238,0.70)',
					bubble: 'rgba(233,248,240,0.95)',
					bubbleHi: 'rgba(46,158,104,0.20)',
					navActive: 'rgba(46,158,104,0.13)',
					navHover: 'rgba(46,158,104,0.07)',
					navAccent: 'rgba(46,158,104,0.30)',
					input: 'rgba(255,255,255,0.94)',
					selector: 'rgba(236,248,241,0.96)',
					tip: 'rgba(240,250,244,0.94)',
					link: '#2E9E68',
					hover: 'rgba(46,158,104,0.10)',
					focus: 'rgba(46,158,104,0.55)',
					scrollbar: 'rgba(46,158,104,0.26)',
					scrollbarHover: 'rgba(46,158,104,0.45)',
				},
				dark: {
					base: 'rgba(9,18,14,0.74)',
					layer1: 'rgba(15,29,22,0.94)',
					layer2: 'rgba(19,36,27,0.95)',
					overlay: 'rgba(21,39,29,0.98)',
					border1: 'rgba(70,200,140,0.16)',
					border2: 'rgba(70,200,140,0.30)',
					brand: '#3CC584',
					text: '#E4F3EA',
					text2: '#9DB8A8',
					error: '#F07A7A',
					idle: '#2A3F33',
					success: '#4BD396',
					warn: '#E5B25C',
					sidebar: 'rgba(8,16,12,0.78)',
					bubble: 'rgba(24,44,34,0.95)',
					bubbleHi: 'rgba(60,197,132,0.24)',
					navActive: 'rgba(60,197,132,0.15)',
					navHover: 'rgba(60,197,132,0.08)',
					navAccent: 'rgba(60,197,132,0.34)',
					input: 'rgba(16,31,24,0.95)',
					selector: 'rgba(20,37,28,0.96)',
					tip: 'rgba(20,38,28,0.95)',
					link: '#6BDDA8',
					hover: 'rgba(60,197,132,0.12)',
					focus: 'rgba(60,197,132,0.58)',
					scrollbar: 'rgba(60,197,132,0.30)',
					scrollbarHover: 'rgba(60,197,132,0.48)',
				},
			},
			{
				id: 'twilight',
				preview: ['#7C5CFF', '#A98BFF', '#FF9BD2'],
				radius: { xs: '6px', sm: '10px', md: '14px', lg: '18px', xl: '24px', panel: '32px' },
				cornerShape: 'superellipse(1.7)',
				deco: 'glow',
				backdrop: 'blur(32px) saturate(170%)',
				shadowTint: '70,50,130',
				shadowRing: '124,92,255',
				shadowRingDark: '154,123,255',
				gradient: {
					light: 'radial-gradient(560px 380px at 2% -6%, #C9B4FF 0%, rgba(201,180,255,0) 70%), radial-gradient(470px 330px at 104% 102%, #F2C8FF 0%, rgba(242,200,255,0) 68%), linear-gradient(165deg, #F4EFFF 0%, #EDE5FE 100%)',
					dark: 'radial-gradient(540px 360px at 2% -6%, #4A3494 0%, rgba(74,52,148,0) 70%), radial-gradient(450px 310px at 104% 102%, #472A6B 0%, rgba(71,42,107,0) 68%), linear-gradient(165deg, #1A1230 0%, #120C22 100%)',
				},
				light: {
					base: 'rgba(248,246,255,0.66)',
					layer1: 'rgba(255,255,255,0.94)',
					layer2: 'rgba(251,249,255,0.96)',
					overlay: 'rgba(246,242,255,0.98)',
					border1: 'rgba(124,92,255,0.14)',
					border2: 'rgba(124,92,255,0.28)',
					brand: '#7C5CFF',
					text: '#1A1430',
					text2: '#5B5378',
					error: '#D64B6E',
					idle: '#D7CDF0',
					success: '#2E9E72',
					warn: '#D08A1E',
					sidebar: 'rgba(241,237,253,0.70)',
					bubble: 'rgba(238,232,255,0.95)',
					bubbleHi: 'rgba(124,92,255,0.20)',
					navActive: 'rgba(124,92,255,0.13)',
					navHover: 'rgba(124,92,255,0.07)',
					navAccent: 'rgba(124,92,255,0.30)',
					input: 'rgba(255,255,255,0.94)',
					selector: 'rgba(243,239,255,0.96)',
					tip: 'rgba(246,242,255,0.94)',
					link: '#7C5CFF',
					hover: 'rgba(124,92,255,0.10)',
					focus: 'rgba(124,92,255,0.55)',
					scrollbar: 'rgba(124,92,255,0.26)',
					scrollbarHover: 'rgba(124,92,255,0.45)',
				},
				dark: {
					base: 'rgba(14,11,26,0.74)',
					layer1: 'rgba(24,19,42,0.94)',
					layer2: 'rgba(30,24,52,0.95)',
					overlay: 'rgba(34,26,58,0.98)',
					border1: 'rgba(150,120,255,0.18)',
					border2: 'rgba(150,120,255,0.32)',
					brand: '#9A7BFF',
					text: '#EDE8FF',
					text2: '#A99FCC',
					error: '#FF8095',
					idle: '#372F52',
					success: '#4ACB9A',
					warn: '#E9B45E',
					sidebar: 'rgba(12,9,22,0.78)',
					bubble: 'rgba(38,30,68,0.95)',
					bubbleHi: 'rgba(154,123,255,0.24)',
					navActive: 'rgba(154,123,255,0.16)',
					navHover: 'rgba(154,123,255,0.09)',
					navAccent: 'rgba(154,123,255,0.36)',
					input: 'rgba(26,21,46,0.95)',
					selector: 'rgba(31,25,53,0.96)',
					tip: 'rgba(32,25,56,0.95)',
					link: '#B49BFF',
					hover: 'rgba(154,123,255,0.12)',
					focus: 'rgba(154,123,255,0.60)',
					scrollbar: 'rgba(154,123,255,0.30)',
					scrollbarHover: 'rgba(154,123,255,0.48)',
				},
			},
			{
				id: 'mono',
				preview: ['#111111', '#7A7A80', '#E6E6E8'],
				radius: { xs: '2px', sm: '4px', md: '8px', lg: '10px', xl: '12px', panel: '16px' },
				cornerShape: 'superellipse(1.15)',
				deco: 'outline',
				backdrop: 'blur(16px) saturate(120%)',
				shadowTint: '0,0,0',
				shadowRing: '0,0,0',
				shadowRingDark: '255,255,255',
				gradient: {
					light: 'radial-gradient(560px 380px at 50% -12%, #FFFFFF 0%, rgba(255,255,255,0) 74%), linear-gradient(170deg, #FBFBFC 0%, #ECECEF 100%)',
					dark: 'radial-gradient(560px 380px at 50% -12%, #34343A 0%, rgba(52,52,58,0) 74%), linear-gradient(170deg, #141416 0%, #0A0A0C 100%)',
				},
				light: {
					base: 'rgba(251,251,251,0.86)',
					layer1: 'rgba(255,255,255,0.98)',
					layer2: 'rgba(250,250,250,0.98)',
					overlay: 'rgba(255,255,255,0.99)',
					border1: 'rgba(0,0,0,0.07)',
					border2: 'rgba(0,0,0,0.13)',
					brand: '#111111',
					text: '#0B0B0C',
					text2: '#56565A',
					error: '#C22323',
					idle: '#C9C9CC',
					success: '#1A8F4E',
					warn: '#B8791C',
					sidebar: 'rgba(245,245,246,0.90)',
					bubble: 'rgba(244,244,245,0.98)',
					bubbleHi: 'rgba(0,0,0,0.10)',
					navActive: 'rgba(0,0,0,0.06)',
					navHover: 'rgba(0,0,0,0.035)',
					navAccent: 'rgba(0,0,0,0.14)',
					input: 'rgba(255,255,255,0.98)',
					selector: 'rgba(245,245,246,0.98)',
					tip: 'rgba(246,246,247,0.98)',
					link: '#0B0B0C',
					hover: 'rgba(0,0,0,0.05)',
					focus: 'rgba(17,17,17,0.55)',
					scrollbar: 'rgba(0,0,0,0.22)',
					scrollbarHover: 'rgba(0,0,0,0.38)',
				},
				dark: {
					base: 'rgba(10,10,11,0.90)',
					layer1: 'rgba(22,22,24,0.97)',
					layer2: 'rgba(28,28,30,0.97)',
					overlay: 'rgba(28,28,31,0.99)',
					border1: 'rgba(255,255,255,0.07)',
					border2: 'rgba(255,255,255,0.14)',
					brand: '#FAFAFA',
					text: '#F4F4F5',
					text2: '#A7A7AD',
					error: '#F27A7A',
					idle: '#3A3A3E',
					success: '#3FC97F',
					warn: '#E2B055',
					sidebar: 'rgba(14,14,15,0.93)',
					bubble: 'rgba(32,32,35,0.97)',
					bubbleHi: 'rgba(255,255,255,0.12)',
					navActive: 'rgba(255,255,255,0.08)',
					navHover: 'rgba(255,255,255,0.045)',
					navAccent: 'rgba(255,255,255,0.18)',
					input: 'rgba(24,24,26,0.97)',
					selector: 'rgba(30,30,33,0.97)',
					tip: 'rgba(28,28,31,0.97)',
					link: '#FAFAFA',
					hover: 'rgba(255,255,255,0.06)',
					focus: 'rgba(250,250,250,0.55)',
					scrollbar: 'rgba(255,255,255,0.22)',
					scrollbarHover: 'rgba(255,255,255,0.38)',
				},
			},
		];

		const STYLE_BY_ID = new Map(STYLES.map((style) => [style.id, style]));

		// -------------------------------------------------------- 令牌层生成
		function buildOverrides(style) {
			const overrides = {};
			for (const key of ALIAS_KEYS) {
				overrides[TOKEN_MAP[key]] = { light: style.light[key], dark: style.dark[key] };
			}
			return overrides;
		}

		function tokenDecls(spec, important) {
			const lines = [];
			for (const key of Object.keys(TOKEN_MAP)) {
				const value = spec[key];
				if (typeof value !== 'string') continue;
				lines.push(`  ${TOKEN_MAP[key]}: ${value}${important ? ' !important' : ''};`);
			}
			return lines.join('\n');
		}

		function radiusDecls(style) {
			return [
				`  --dsw-radius-xs: ${style.radius.xs};`,
				`  --dsw-radius-sm: ${style.radius.sm};`,
				`  --dsw-radius-md: ${style.radius.md};`,
				`  --dsw-radius-lg: ${style.radius.lg};`,
				`  --dsw-radius-xl: ${style.radius.xl};`,
				`  --dsw-radius-panel: ${style.radius.panel};`,
				`  --dsw-corner-shape: ${style.cornerShape};`,
				`  --dsw-menu-backdrop-filter: ${style.backdrop};`,
			].join('\n');
		}

		function elevationDecls(style, scheme) {
			const dark = scheme === 'dark';
			const cast = (alpha) => `rgba(${style.shadowTint},${(alpha * (dark ? 2.6 : 1)).toFixed(3)})`;
			const ring = `rgba(${dark ? style.shadowRingDark : style.shadowRing},${dark ? 0.20 : 0.12})`;
			const values = {
				'--dsw-elevation-soft': `0 0 0 .5px ${ring}, 0 4px 18px ${cast(0.07)}, 0 0 26px ${cast(0.05)}`,
				'--dsw-elevation-panel': `0 0 0 .5px ${ring}, 0 8px 26px ${cast(0.10)}, 0 0 32px ${cast(0.06)}`,
				'--dsw-elevation-prominent': `0 0 0 .5px ${ring}, 0 14px 38px ${cast(0.16)}, 0 0 40px ${cast(0.08)}`,
				'--dsw-shadow-lv1': `0 2px 6px ${cast(0.08)}`,
				'--dsw-shadow-lv2': `0 6px 16px ${cast(0.08)}, 0 2px 8px ${cast(0.05)}`,
				'--dsw-shadow-lv3': `0 12px 34px ${cast(0.16)}, 0 2px 10px ${cast(0.06)}`,
			};
			return Object.keys(values)
				.map((name) => `  ${name}: ${values[name]};`)
				.join('\n');
		}

		// ------------------------------------------------- 侧栏卡片（浮卡 + 双卡区）
		// 宿主的侧栏类名带 CSS module 哈希前缀（wtg9ga_），所以这里全部用"后缀包含"匹配
		// （[class*="panelRow"] 这种），宿主升级换了哈希仍然命中；所有规则都从
		// [class*="sidebarCol"] 起步，绝不外溢到右侧栏或主面板。
		// 浮卡外壳落在该列唯一的直接子元素（侧栏根）上：宿主给根元素写了行内 width，
		// 只有 !important 压得住行内样式，宽度/高度各减 16px 再配 8px 外边距，
		// 四周就能露出页面底色，浮卡才"脱"得出来。
		// ------------------------------------------------- 侧栏卡片（浮卡 + 双卡区）
		// 宿主的侧栏类名带 CSS module 哈希前缀（wtg9ga_），所以这里全部用"后缀包含"匹配
		// （[class*="panelRow"] 这种），宿主升级换了哈希仍然命中；所有规则都从
		// [class*="sidebarCol"] 起步，绝不外溢到右侧栏或主面板。
		// 三条踩过的坑，改之前先看一眼：
		// ① [class*="newSession"] 会连 newSessionLabel / LabelMask / Content 一起命中，
		//    给它们加底色描边就会出现"文字外面套一个小白框"。按钮一律写 button[class*=…]。
		// ② 工作区那一列（regionArea）宿主用负外边距把滚动条推到侧栏边缘，内部再用
		//    --dsh-sidebar-inline-padding 反向补偿；想在托盘里加内边距，就把这个变量在
		//    托盘内部归零，否则补偿链打架，内容被圆角切掉、表头图标越界。
		// ③ 托盘只用淡色底 + 圆角，不再描边——条目卡自己有 1px 边，两层边叠在一起就是
		//    双层边框的脏相。
		// ------------------------------------------------- 侧栏卡片（浮卡 + 双卡区）
		// 宿主的侧栏类名带 CSS module 哈希前缀（wtg9ga_ / GAkraW_ / wnFoaW_），所以这里
		// 全部用"后缀包含"匹配（[class*="panelRow"] 这种），宿主升级换了哈希仍然命中；
		// 所有规则都从 [class*="sidebarCol"] 起步，绝不外溢到右侧栏或主面板。
		// 几条踩过的坑，改之前先看一眼：
		// ① [class*="newSession"] 会连 newSessionLabel / LabelMask / Content 一起命中，
		//    给它们加底色描边就会出现"文字外面套一个小白框"。按钮一律写 button[class*=…]。
		// ② 工作区那一列（regionArea）宿主用负外边距把滚动条推到侧栏边缘，内部再用
		//    --dsh-sidebar-inline-padding 反向补偿；想在托盘里加内边距，就把这个变量在
		//    托盘内部归零，否则补偿链打架，内容被圆角切掉、表头图标越界。
		// ③ 托盘只用淡色底 + 圆角，不再描边——卡片自己有 1px 边，两层边叠在一起就是
		//    双层边框的脏相。
		// ④ 导航条目（插件 / 插件市场 / …）不做成卡片，保持宿主原样：透明行、无圆角无
		//    描边，hover 用宿主自带的淡底；只有"选中"这一件事用本插件的品牌色语言表达。
		// ⑤ 会话行（工作区列表里带 leading 头像的那一条）做成和新会话按钮同款小卡：
		//    层底色 + 1px 描边 + 10px 圆角 + 轻阴影，选中时光晕铺满整张卡；指示条 / 圆点
		//    用 background-image 画，不占 ::before/::after（宿主拖拽排序要用这两个伪元素）。
		function sidebarSheetText(style) {
			const deco = style.deco === 'outline' ? 'outline' : 'glow';
			const tint = style.shadowTint;

			// 浅色与深色成对生成：同一个选择器前缀换掉，其余结构完全一致。
			const scheme = (mode) => {
				const dark = mode === 'dark';
				const scope = dark ? 'body[data-ds-dark-theme]' : 'body';
				const col = `${scope} [class*="sidebarCol"]`;
				const brand = 'var(--dsw-alias-brand-primary)';

				const line = dark ? 'rgba(255,255,255,0.10)' : 'rgba(20,24,40,0.06)';
				const itemLine = dark ? 'rgba(255,255,255,0.12)' : 'rgba(20,24,40,0.07)';
				const cardBg = dark
					? 'color-mix(in srgb, var(--dsw-alias-bg-layer-1) 44%, transparent)'
					: 'color-mix(in srgb, var(--dsw-alias-bg-layer-1) 56%, transparent)';
				const trayBg = dark
					? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent)'
					: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent)';
				const itemBg = dark ? 'var(--dsw-alias-bg-layer-2)' : 'var(--dsw-alias-bg-layer-1)';
				const itemShadow = dark ? '0 1px 2px rgba(0,0,0,0.35)' : `0 1px 2px rgba(${tint},0.07)`;
				const cardShadow = dark
					? '0 18px 38px -20px rgba(0,0,0,0.62), 0 1px 2px rgba(0,0,0,0.32)'
					: `0 18px 38px -22px rgba(${tint},0.34), 0 2px 8px rgba(${tint},0.08)`;
				const brandLine = `color-mix(in srgb, ${brand} 42%, transparent)`;
				const hoverBg = `color-mix(in srgb, ${brand} 8%, ${itemBg})`;
				const selectBg = `color-mix(in srgb, ${brand} 9%, ${itemBg})`;
				const selectGlow = `0 0 18px color-mix(in srgb, ${brand} 24%, transparent), inset 0 0 0 1px color-mix(in srgb, ${brand} 16%, transparent)`;

				const parts = [];

				// ① 父列：交出自己的底色与右边框，页面渐变从浮卡四周露出来。
				parts.push(`${col} {
  background: transparent !important;
  border-right-color: transparent !important;
  overflow: visible !important;
}`);

				// ② 浮卡外壳：内缩 8px、圆角 16px、1px 描边 + 投影 + 毛玻璃。
				parts.push(`${col} > * {
  box-sizing: border-box !important;
  width: calc(100% - 16px) !important;
  height: calc(100% - 16px) !important;
  margin: 8px !important;
  background: ${cardBg} !important;
  border: 1px solid ${line} !important;
  border-radius: 16px !important;
  box-shadow: ${cardShadow} !important;
  backdrop-filter: blur(16px) saturate(150%);
}`);

				// 兜底：万一日后槽位在侧栏根外面多包一层 div，浮卡会落在包装层上，这时把
				// 里面的侧栏根"摊平"——取消它自己的底色/边框，免得盖住浮卡或被裁掉。
				parts.push(`${col} > * > [class*="root"] {
  box-sizing: border-box !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  background: transparent !important;
  border: none !important;
  border-radius: inherit !important;
  box-shadow: none !important;
}`);

				// ③ 导航卡区：只做淡底托盘。条目本身回归宿主原样（透明行 + 宿主 hover 淡底）。
				parts.push(`${col} [class*="panelList"] {
  box-sizing: border-box !important;
  margin: 0 0 8px !important;
  padding: 6px !important;
  background: ${trayBg} !important;
  border-radius: 12px !important;
}`);

				// ④ 工作区卡区：把宿主的负边距补偿链在托盘内部归零，内容才落在 8px 内边距里。
				parts.push(`${col} [class*="regionArea"] {
  --dsh-sidebar-inline-padding: 0px;
  box-sizing: border-box !important;
  margin: 0 0 8px !important;
  padding: 8px !important;
  background: ${trayBg} !important;
  border-radius: 12px !important;
}`);

				// ⑤ 新建会话按钮：完整小卡，作为"卡片语言"的基准样式。
				parts.push(`${col} button[class*="newSession"] {
  position: relative;
  box-sizing: border-box !important;
  margin: 0 0 8px !important;
  background: ${itemBg} !important;
  border: 1px solid ${itemLine} !important;
  border-radius: 10px !important;
  box-shadow: ${itemShadow} !important;
  transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease, border-color 160ms ease;
}`);

				parts.push(`${col} button[class*="newSession"]:hover {
  transform: translateY(-1px);
  background: ${hoverBg} !important;
  border-color: ${brandLine} !important;
  box-shadow: ${itemShadow}, 0 6px 16px -10px color-mix(in srgb, ${brand} 42%, transparent) !important;
}`);

				// ⑥ 账号按钮（侧栏底部、头像 + 名字那一条）：和新会话按钮同款小卡。
				//    宿主把账号菜单挂在 sidebar.settings 槽位，触发器是 button[class*="trigger"]，
				//    只有它里面带 [class*="avatar"]（未登录时退化成 … 图标 + data-signed-out）。
				//    菜单打开（aria-expanded="true"）就是"选中"：光晕铺满整张卡。
				const accountTrigger = 'button[class*="trigger"]:is(:has([class*="avatar"]), [data-signed-out="true"])';

				parts.push(`${col} [class*="settingsArea"] ${accountTrigger} {
  position: relative;
  box-sizing: border-box !important;
  background: ${itemBg} !important;
  border: 1px solid ${itemLine} !important;
  border-radius: 10px !important;
  box-shadow: ${itemShadow} !important;
  transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease, border-color 160ms ease;
}`);

				parts.push(`${col} [class*="settingsArea"] ${accountTrigger}:hover {
  transform: translateY(-1px);
  background: ${hoverBg} !important;
  border-color: ${brandLine} !important;
  box-shadow: ${itemShadow}, 0 6px 16px -10px color-mix(in srgb, ${brand} 42%, transparent) !important;
}`);

				parts.push(`${col} [class*="settingsArea"] ${accountTrigger}[aria-expanded="true"] {
  background: ${selectBg} !important;
  border-color: ${brandLine} !important;
  box-shadow: ${selectGlow} !important;
}`);

				// ⑦ 选中态（导航条目）：宿主只给一层淡底，这里补上品牌语言。
				//    glow＝品牌淡底 + 左缘 3×16 指示条 + 一圈柔光；outline＝内描边 + 右上圆点。
				if (deco === 'glow') {
					parts.push(`${col} [class*="panelRow"][class*="panelActive"] {
  background-color: color-mix(in srgb, ${brand} 10%, transparent) !important;
  box-shadow: 0 0 18px color-mix(in srgb, ${brand} 16%, transparent) !important;
}`);

					parts.push(`${col} [class*="panelRow"][class*="panelActive"] {
  background-image: linear-gradient(${brand}, ${brand}) !important;
  background-size: 3px 16px !important;
  background-position: 2px 50% !important;
  background-repeat: no-repeat !important;
}`);
				} else {
					parts.push(`${col} [class*="panelRow"][class*="panelActive"] {
  background-color: color-mix(in srgb, ${brand} 5%, transparent) !important;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, ${brand} 26%, transparent) !important;
}`);
				}

				// ⑨ 底部：账号按钮自己就是小卡（见 ⑥），这一行只是它的 flex 行容器。
				//    宿主给的是 width:calc(100% + 4px) / margin:4px -2px（让触发器吃满侧栏宽度），
				//    这里拉回 100%，让账号小卡和上面的卡片左缘对齐；行本身不再加任何卡片装饰。
				parts.push(`${col} [class*="settingsArea"] [class*="triggerRow"] {
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: 100% !important;
  margin: 2px 0 !important;
  padding: 0 !important;
  gap: 4px !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}`);

				parts.push(`${col} [class*="footerActions"] > * {
  box-sizing: border-box !important;
  margin: 2px !important;
  min-height: 32px;
  background: ${itemBg} !important;
  border: 1px solid ${itemLine} !important;
  border-radius: 10px !important;
  box-shadow: ${itemShadow} !important;
}`);

				// ⑩ 隐藏滚动条：工作区区域（工作区树 / 频道列表 / 任务列表）去掉滚动条，
				//    但保留滚动能力：scrollbar-width:none + ::-webkit-scrollbar{display:none}，
				//    同时把 scrollbar-gutter 归零，免得右侧留下一条空白沟。
				parts.push(`${col} [class*="regionArea"], ${col} [class*="regionArea"] * {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
  scrollbar-gutter: auto !important;
}`);

				parts.push(`${col} [class*="regionArea"]::-webkit-scrollbar, ${col} [class*="regionArea"] *::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}`);

				// ⑪ 任务 / 频道滑块（@michengai/dsh-im-connect 注入）：沿用胶囊形态，
				//    换成侧栏卡片语言——容器品牌淡底 + 卡片描边色，thumb 品牌淡底 + 品牌描边 + 微光。
				//    注意：thumb 的 inset / width 由 im-connect 与宿主 primitives 接管（负责滑动动画），
				//    这里只改颜色、描边、圆角，绝不写 inset，否则滑块会卡在第一页。
				parts.push(`${col} .ima-tabs-wrap {
  display: flex !important;
  flex: none !important;
  width: 100% !important;
  margin: 0 0 8px !important;
  padding: 0 !important;
}`);

				parts.push(`${col} .ima-tabs-wrap .ima-segmented-tabs {
  box-sizing: border-box !important;
  width: 100% !important;
  height: 32px !important;
  min-height: 32px !important;
  max-height: 32px !important;
  padding: 2px !important;
  border: 0 !important;
  border-radius: 10px !important;
  background: color-mix(in srgb, ${brand} 5%, transparent) !important;
  box-shadow: inset 0 0 0 1px ${line} !important;
}`);

				parts.push(`${col} .ima-tabs-wrap .ima-segmented-tabs > span {
  border: 1px solid ${brandLine} !important;
  border-radius: 8px !important;
  background: color-mix(in srgb, ${brand} 10%, ${itemBg}) !important;
  box-shadow: 0 1px 2px rgba(0,0,0,0.10), 0 0 12px color-mix(in srgb, ${brand} 16%, transparent) !important;
  transition: transform 160ms ease, left 160ms ease, width 160ms ease, background-color 160ms ease !important;
}`);

				parts.push(`${col} .ima-tabs-wrap .ima-segmented-tabs [role="tab"] {
  height: 28px !important;
  border-radius: 8px !important;
  font-size: 13px !important;
  color: var(--dsw-alias-label-secondary) !important;
  transition: color 160ms ease !important;
}`);

				parts.push(`${col} .ima-tabs-wrap .ima-segmented-tabs [role="tab"]:hover {
  color: var(--dsw-alias-label-primary) !important;
}`);

				parts.push(`${col} .ima-tabs-wrap .ima-segmented-tabs [role="tab"][aria-selected="true"] {
  color: var(--dsw-alias-label-primary) !important;
  font-weight: 600 !important;
}`);

				// 旧版 im-connect 分支（宿主没有 SegmentedTabs 时）也按同一套语言收口。
				parts.push(`${col} .ima-tabs {
  display: flex !important;
  gap: 4px !important;
  margin: 0 0 8px !important;
  padding: 2px !important;
  border-bottom: 0 !important;
  border-radius: 10px !important;
  background: color-mix(in srgb, ${brand} 5%, transparent) !important;
  box-shadow: inset 0 0 0 1px ${line} !important;
}`);

				parts.push(`${col} .ima-tabs .ima-tab {
  flex: 1 1 0 !important;
  height: 28px !important;
  padding: 0 8px !important;
  border-radius: 8px !important;
  font-size: 13px !important;
  color: var(--dsw-alias-label-secondary) !important;
}`);

				parts.push(`${col} .ima-tabs .ima-tab.on {
  color: var(--dsw-alias-label-primary) !important;
  font-weight: 600 !important;
  background: color-mix(in srgb, ${brand} 10%, ${itemBg}) !important;
  box-shadow: none !important;
}`);

				return parts.join('\n\n');
			};

			// ⑩ 折叠成图标列：浮卡与托盘全部退回贴边直角，只留 36px 图标行。
			const collapsed = `body [data-sidebar-collapsed] [class*="sidebarCol"] > * {
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  border-radius: 0 !important;
  border-color: transparent !important;
  box-shadow: none !important;
  background: transparent !important;
  backdrop-filter: none !important;
}

body [data-sidebar-collapsed] [class*="sidebarCol"] [class*="panelList"],
body [data-sidebar-collapsed] [class*="sidebarCol"] [class*="regionArea"] {
  padding: 0 !important;
  margin: 0 !important;
  background: transparent !important;
  border-radius: 0 !important;
}

body [data-sidebar-collapsed] [class*="sidebarCol"] button[class*="newSession"],
body [data-sidebar-collapsed] [class*="sidebarCol"] button[class*="panelRow"],
body [data-sidebar-collapsed] [class*="sidebarCol"] [class*="settingsArea"] button[class*="trigger"]:has([class*="avatar"]),
body [data-sidebar-collapsed] [class*="sidebarCol"] [class*="settingsArea"] button[class*="trigger"][data-signed-out="true"] {
  background: transparent !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
  transform: none !important;
}

body [data-sidebar-collapsed] [class*="sidebarCol"] button[class*="newSession"] {
  margin: 0 0 12px !important;
}

body [data-sidebar-collapsed] [class*="sidebarCol"] button[class*="newSession"]:hover,
body [data-sidebar-collapsed] [class*="sidebarCol"] button[class*="panelRow"]:hover {
  background-color: var(--dsw-alias-interactive-bg-hover) !important;
}

body [data-sidebar-collapsed] [class*="sidebarCol"] [class*="panelRow"][class*="panelActive"] {
  background-image: none !important;
  box-shadow: none !important;
}`;

			// ⑫ 宿主自带的工作区底部渐隐条（.GAkraW_fade：transparent → sidebar-fill，高 24px）：
			//    卡片化之后它就是一块没来由的渐变压边，直接去掉。
			//    选择器按 CSS module 后缀匹配（…_fade），不写死哈希；只作用于 regionArea 子树，
			//    不会碰侧栏根部那套 hover 淡出（.wtg9ga_fading）。
			const noFade = `body [class*="sidebarCol"] [class*="regionArea"] [class$="_fade"] {
  display: none !important;
}`;

			return [
				`/* 侧栏卡片（浅色）—— ${style.id} */`,
				scheme('light'),
				`/* 侧栏卡片（深色）—— ${style.id} */`,
				scheme('dark'),
				'/* 侧栏卡片：折叠态 */',
				collapsed,
				noFade,
			].join('\n');
		}

		// ------------------------------------------------------ 样式表文本
		function styleSheetText(style) {
			return [
				`/* 外观风格：${style.id} —— 令牌（浅色） */`,
				`body {\n${tokenDecls(style.light, true)}\n}\n`,
				`/* 外观风格：${style.id} —— 令牌（深色） */`,
				`body[data-ds-dark-theme] {\n${tokenDecls(style.dark, true)}\n}\n`,
				// 宿主的投影/圆角变量是声明在 "body, body *" 上的，所以这里必须用同样的选择器
				// 才能覆盖到每个后代元素（仅声明在 body 上会被逐元素的宿主规则压掉）。
				`body, body * {\n${radiusDecls(style)}\n}\n`,
				`body, body * {\n${elevationDecls(style, 'light')}\n}\n`,
				`body[data-ds-dark-theme], body[data-ds-dark-theme] * {\n${elevationDecls(style, 'dark')}\n}\n`,
				// 环境渐变：底色令牌是半透明色，所以固定背景的渐变会从各层"透"出来。
				`body {\n  background-image: ${style.gradient.light} !important;\n  background-attachment: fixed;\n  background-repeat: no-repeat;\n  background-size: cover;\n}\n`,
				`body[data-ds-dark-theme] {\n  background-image: ${style.gradient.dark} !important;\n}\n`,
				sidebarSheetText(style),
				// 轻微动效：只挂在可交互元素上，160ms 内收，不碰布局属性。
				'a, button, input, select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [role="option"] {\n  transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease, opacity 160ms ease;\n}\n',
				'::selection {\n  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent);\n}\n',
				'@media (prefers-reduced-motion: reduce) {\n  a, button, input, select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [role="option"] {\n    transition: none !important;\n    animation: none !important;\n  }\n}\n',
			].join('\n');
		}

		// ------------------------------------------------------ 面板样式表
		const BASE_CSS = `
/* 外观风格面板：只消费宿主令牌，所以面板自身也会跟着所选风格变化。 */
.das-root { height: 100%; width: 100%; display: flex; flex-direction: column; overflow: hidden; }
.das-scroll { flex: 1 1 auto; overflow-y: auto; padding: 28px 32px 40px; }
.das-content { max-width: 1040px; margin: 0 auto; }
.das-head { margin: 0 0 22px; }
.das-title { margin: 0 0 6px; font-size: 20px; line-height: 28px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.das-sub { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); max-width: 64ch; }
.das-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(216px, 1fr)); gap: 14px; }
.das-card {
  display: flex; flex-direction: column; gap: 10px; padding: 12px;
  text-align: left; cursor: pointer; font: inherit;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-lg);
  box-shadow: var(--dsw-elevation-soft);
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}
.das-card:hover { transform: translateY(-2px); border-color: var(--dsw-alias-border-l2); box-shadow: var(--dsw-elevation-panel); }
.das-card[aria-pressed="true"] {
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, transparent), var(--dsw-elevation-panel);
}
.das-card:focus-visible, .das-reset:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 80%, transparent);
  outline-offset: 3px;
}
.das-thumb { position: relative; height: 82px; border-radius: var(--dsw-radius-md); border: 1px solid var(--dsw-alias-border-l1); overflow: hidden; }
.das-dots { position: absolute; left: 10px; bottom: 10px; display: flex; gap: 6px; }
.das-dot { width: 13px; height: 13px; border-radius: 999px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.14), 0 1px 2px rgba(0,0,0,.10); }
.das-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.das-name { font-size: 13px; line-height: 18px; font-weight: 600; }
.das-badge {
  font-size: 11px; line-height: 16px; padding: 1px 8px; border-radius: 999px; white-space: nowrap;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);
  color: var(--dsw-alias-brand-primary);
}
.das-desc { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.das-foot {
  margin: 26px 0 0; padding-top: 18px; border-top: 1px solid var(--dsw-alias-border-l1);
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
}
.das-reset {
  font: inherit; font-size: 13px; line-height: 20px; padding: 7px 14px; cursor: pointer;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  transition: background-color 160ms ease, border-color 160ms ease, opacity 160ms ease;
}
.das-reset:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.das-reset:disabled { opacity: .45; cursor: default; }
.das-note { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.das-hint { margin: 18px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); opacity: .82; }
@media (prefers-reduced-motion: reduce) {
  .das-card, .das-reset { transition: none !important; }
  .das-card:hover { transform: none; }
}

/* 视图钳制：网页壳最外层不关页面级滚动时，任何后代超出视口高度都会在窗口右缘
   长出文档级滚动条（约 12~15px），它出现/消失时把整个界面横向挤动。聊天区自己
   的滚动条用了 scrollbar-gutter:stable，恒定占位不抖；这里把 html/body 一并钳住，
   只留内部滚动容器。打印时恢复，避免只打印出第一屏。 */
html, body { overflow: hidden; height: 100%; }
@media print { html, body { overflow: visible; height: auto; } }

/* 选中高亮动效：同组近距离滑动（View Transitions）、跨组或超距只淡入淡出。
   两组各自一个 view-transition-name，靠 data-dsh-hl 属性挂在当前选中项上。 */
[data-dsh-hl="nav"] { view-transition-name: dsh-hl-nav; }
[data-dsh-hl="session"] { view-transition-name: dsh-hl-session; }
[class*="panelRow"], [class*="sessionRow"] {
  transition: background-color 200ms cubic-bezier(.22,.61,.36,1), box-shadow 200ms cubic-bezier(.22,.61,.36,1);
}
/* 只让两组高亮做动效，页面其余部分不参与快照交叉淡入，避免整页闪一下。 */
::view-transition-old(root), ::view-transition-new(root) { animation: none; }
::view-transition-group(dsh-hl-nav), ::view-transition-group(dsh-hl-session) {
  animation-duration: 200ms;
  animation-timing-function: cubic-bezier(.22,.61,.36,1);
}
@media (prefers-reduced-motion: reduce) {
  [class*="panelRow"], [class*="sessionRow"] { transition: none !important; }
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) {
    animation-duration: 1ms !important;
  }
}
`;

		// ------------------------------------------------------ 样式表生命周期
		function writeSheet(key, css) {
			let el = document.querySelector(`style[data-plugin="${key}"]`);
			if (!el) {
				el = document.createElement('style');
				el.setAttribute('data-plugin', key);
				document.head.appendChild(el);
			}
			if (el.textContent !== css) el.textContent = css;
		}

		function removeSheet(key) {
			for (const el of document.querySelectorAll(`style[data-plugin="${key}"]`)) el.remove();
		}

		// ------------------------------------------------------ 持久化
		function readStored() {
			try {
				const value = window.localStorage.getItem(STORAGE_KEY);
				return value && STYLE_BY_ID.has(value) ? value : null;
			} catch (error) {
				return null;
			}
		}

		function persist(id) {
			try {
				if (id) window.localStorage.setItem(STORAGE_KEY, id);
				else window.localStorage.removeItem(STORAGE_KEY);
			} catch (error) {
				/* 隐私模式 / 存储被禁用：本次会话仍然生效，只是不记忆。 */
			}
		}

		// ------------------------------------------------------ 应用风格
		let activeId = null;
		let overrideDispose = null;
		let themeService = null;

		function bindThemeService(ctx) {
			try {
				if (ctx.theme) return ctx.theme;
			} catch (error) { /* 未注入时可能抛错，继续走 ctx.get */ }
			try {
				return typeof ctx.get === 'function' ? ctx.get('theme') : null;
			} catch (error) {
				return null;
			}
		}

		function applyStyle(id, remember) {
			const style = id ? STYLE_BY_ID.get(id) : null;

			// 先撤掉旧的令牌层与旧样式表，避免两层同时生效。
			if (overrideDispose) {
				try { overrideDispose(); } catch (error) { /* 已被同 source 的新层替换 */ }
				overrideDispose = null;
			}

			if (!style) {
				activeId = null;
				removeSheet(SHEET_STYLE);
				if (remember) persist(null);
				return null;
			}

			activeId = style.id;

			// 加固层：把别名令牌交给主题服务（inline 优先级最高，不怕宿主样式后到）。
			if (themeService && typeof themeService.overrideTokens === 'function') {
				try {
					overrideDispose = themeService.overrideTokens(OVERRIDE_SOURCE, buildOverrides(style));
				} catch (error) {
					console.warn('[appearance-styles] 主题令牌层注册失败，改用样式表生效：', error);
					overrideDispose = null;
				}
			}

			writeSheet(SHEET_STYLE, styleSheetText(style));
			if (remember) persist(style.id);
			return style.id;
		}

		// ------------------------------------------------------ 侧栏图标
		function AppearanceIcon(props) {
			const size = typeof props?.size === 'number' && props.size > 0 ? props.size : 18;
			return h('svg', {
				width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
				xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': 'true', focusable: 'false',
			},
				h('path', {
					d: 'M12 3.2a8.8 8.8 0 0 0 0 17.6c1.1 0 1.9-.8 1.9-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8h1.6a4.5 4.5 0 0 0 4.5-4.5c0-4.3-4-6.9-8.8-6.9Z',
					stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round',
				}),
				h('circle', { cx: 8.2, cy: 10, r: 1.35, fill: 'currentColor' }),
				h('circle', { cx: 11.6, cy: 7.4, r: 1.35, fill: 'currentColor' }),
				h('circle', { cx: 15.4, cy: 8.7, r: 1.35, fill: 'currentColor', opacity: 0.75 }),
				h('circle', { cx: 7.6, cy: 14.4, r: 1.35, fill: 'currentColor', opacity: 0.75 }),
				h('circle', { cx: 10.6, cy: 16.6, r: 1.2, fill: 'currentColor', opacity: 0.5 })
			);
		}

		// ------------------------------------------------------ 主面板
		function AppearancePanel() {
			const [current, setCurrent] = useState(() => activeId ?? readStored());

			// 风格如果在别处被改（例如未来加的快捷键），面板跟着刷新。
			useEffect(() => {
				const stored = readStored();
				if (stored !== current) setCurrent(stored);
				// 只在挂载时对齐一次：面板是唯一写入方，不需要监听 storage 事件。
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, []);

			const pick = (id) => {
				const applied = applyStyle(id, true);
				setCurrent(applied);
			};

			const reset = () => {
				applyStyle(null, true);
				setCurrent(null);
			};

			return h('section', { className: 'das-root', 'aria-label': tr('title') },
				h('div', { className: 'das-scroll' },
					h('div', { className: 'das-content' },
						h('header', { className: 'das-head' },
							h('h1', { className: 'das-title' }, tr('title')),
							h('p', { className: 'das-sub' }, tr('subtitle'))
						),
						h('div', { className: 'das-grid' },
							...STYLES.map((style) => {
								const selected = style.id === current;
								return h('button', {
									key: style.id,
									type: 'button',
									className: 'das-card',
									'aria-pressed': selected ? 'true' : 'false',
									'data-style-id': style.id,
									onClick: () => pick(style.id),
								},
									h('span', {
										className: 'das-thumb',
										style: { backgroundImage: `linear-gradient(135deg, ${style.preview[0]} 0%, ${style.preview[1]} 52%, ${style.preview[2]} 100%)` },
										'aria-hidden': 'true',
									},
										h('span', { className: 'das-dots' },
											...style.preview.map((color, index) => h('span', {
												key: index,
												className: 'das-dot',
												style: { background: color },
											}))
										)
									),
									h('span', { className: 'das-meta' },
										h('span', { className: 'das-name' }, tr(`style.${style.id}.name`)),
										selected ? h('span', { className: 'das-badge' }, tr('active')) : null
									),
									h('span', { className: 'das-desc' }, tr(`style.${style.id}.desc`))
								);
							})
						),
						h('div', { className: 'das-foot' },
							h('button', {
								type: 'button',
								className: 'das-reset',
								onClick: reset,
								disabled: current === null,
							}, tr('reset')),
							h('p', { className: 'das-note' }, current ? tr('activeNote') : tr('resetHint'))
						),
						h('p', { className: 'das-hint' }, tr('hint'))
					)
				)
			);
		}

		// ------------------------------------------------- 选中高亮动效（同组滑动 / 跨组淡入）
		// 两组各自一个 view-transition-name：nav＝全局面板导航，session＝工作区会话行。
		// 只在"同组、且新旧选中行垂直距离 ≤ 240px"时才用 View Transitions 拦一次点击做位移
		// morph；其余情况（跨组、超距、不支持 VT、减少动效）一律不拦，交给 CSS 的 200ms 淡入淡出。
		const HL_ATTR = 'data-dsh-hl';
		const HL_NAV_ROW = '[class*="sidebarCol"] [class*="panelList"] button[class*="panelRow"]';
		const HL_SESSION_ROW = '[class*="sidebarCol"] [class*="regionArea"] [class*="sessionRow"]';
		const HL_MAX_SLIDE = 240;

		function hlGroupOf(row) {
			if (!row || typeof row.matches !== 'function') return null;
			if (row.matches(HL_NAV_ROW)) return 'nav';
			if (row.matches(HL_SESSION_ROW)) return 'session';
			return null;
		}

		function hlMotionEnabled() {
			if (typeof document === 'undefined') return false;
			if (typeof document.startViewTransition !== 'function') return false;
			try {
				if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
			} catch (error) {
				/* matchMedia 不可用时按允许处理 */
			}
			return true;
		}

		function hlSlideDistanceOk(from, to) {
			try {
				const a = from.getBoundingClientRect();
				const b = to.getBoundingClientRect();
				const distance = Math.abs((a.top + a.height / 2) - (b.top + b.height / 2));
				return Number.isFinite(distance) && distance <= HL_MAX_SLIDE;
			} catch (error) {
				return false;
			}
		}

		/**
		 * 安装侧边栏选中高亮的过渡：
		 * - 同组近距离：捕获阶段拦下 click，用 startViewTransition 包住宿主的状态更新再转发点击；
		 * - 其余情况直接放行，由 CSS 过渡完成淡入淡出。
		 * @param ctx - 插件上下文（只用 ctx.effect 管理生命周期）
		 * @returns 清理函数
		 */
		function installHighlightMotion(ctx) {
			if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
				return () => {};
			}

			let replaying = false;
			const marked = new Set();

			const mark = (row, group) => {
				if (!row || !group) return;
				row.setAttribute(HL_ATTR, group);
				marked.add(row);
			};
			const unmark = (row) => {
				if (!row) return;
				row.removeAttribute(HL_ATTR);
				marked.delete(row);
			};

			// 启动时把当前选中项标好，否则第一次同组切换拿不到"旧位置"。
			try {
				const activeNav = document.querySelector(`${HL_NAV_ROW}[class*="panelActive"]`);
				if (activeNav) mark(activeNav, 'nav');
				const activeSession = document.querySelector(`${HL_SESSION_ROW}[class*="selected"]`);
				if (activeSession) mark(activeSession, 'session');
			} catch (error) {
				/* 初始标记失败不影响点击 */
			}

			const onClick = (event) => {
				if (replaying) return;
				const target = event.target;
				if (!target || typeof target.closest !== 'function') return;
				const row = target.closest(`${HL_NAV_ROW}, ${HL_SESSION_ROW}`);
				if (!row) return;
				const group = hlGroupOf(row);
				if (!group) return;

				let prev = null;
				try {
					prev = document.querySelector(`[${HL_ATTR}="${group}"]`);
				} catch (error) {
					prev = null;
				}
				if (prev === row) return; // 点的是当前项，无事可做

				const canSlide = prev !== null && hlMotionEnabled() && hlSlideDistanceOk(prev, row);
				if (!canSlide) {
					// 跨组 / 超距 / 不支持 VT：放行点击，只更新标记，靠 CSS 淡入淡出。
					mark(row, group);
					return;
				}

				event.preventDefault();
				event.stopPropagation();
				try {
					const transition = document.startViewTransition(() => {
						replaying = true;
						try {
							row.click();
						} finally {
							replaying = false;
						}
						unmark(prev);
						mark(row, group);
					});
					if (transition && transition.finished && typeof transition.finished.catch === 'function') {
						transition.finished.catch(() => { /* 过渡被取消时保持最终状态 */ });
					}
				} catch (error) {
					// VT 起不来就退回普通点击，保证导航不受影响。
					replaying = false;
					row.click();
				}
			};

			document.addEventListener('click', onClick, true);
			return () => {
				document.removeEventListener('click', onClick, true);
				for (const row of marked) row.removeAttribute(HL_ATTR);
				marked.clear();
			};
		}

		// ------------------------------------------------------ 插件出口
		return {
			inject: ['slots', 'locale'],
			apply(ctx) {
				ctx.locale.register(NS, { zh: ZH, en: EN });
				tr = ctx.locale.bind(NS);

				themeService = bindThemeService(ctx);

				// 面板自身的外壳样式：常驻，随插件卸载移除。
				ctx.effect(() => {
					writeSheet(SHEET_BASE, BASE_CSS);
					return () => removeSheet(SHEET_BASE);
				}, 'appearance-styles: panel stylesheet');

				// 启动时恢复上次选择；卸载时撤掉令牌层与风格样式表，外观原样回退。
				ctx.effect(() => {
					applyStyle(readStored(), false);
					return () => {
						if (overrideDispose) {
							try { overrideDispose(); } catch (error) { /* 层已被替换 */ }
							overrideDispose = null;
						}
						activeId = null;
						removeSheet(SHEET_STYLE);
					};
				}, 'appearance-styles: active style');

				// 主题服务若比本插件晚就绪，等它就绪后把令牌层补上。
				if (!themeService && typeof ctx.inject === 'function') {
					try {
						ctx.inject(['theme'], (scope) => {
							themeService = scope.theme ?? bindThemeService(scope);
							if (themeService && activeId) applyStyle(activeId, false);
						});
					} catch (error) {
						/* 没有依赖注入通道时，样式表已经足够。 */
					}
				}

				// 侧边栏选中高亮动效：同组滑动、跨组淡入（200ms）。
				ctx.effect(() => installHighlightMotion(ctx), 'appearance-styles: highlight motion');

				ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
					name: 'sidebar.panellist',
					id: PANEL_ID,
					order: SIDEBAR_ORDER,
					locale: NS,
					label: () => tr('panel'),
				}, AppearanceIcon));

				ctx.slots.inject('main', () => ctx.slots.register({
					name: 'main',
					key: PANEL_ID,
					locale: NS,
				}, AppearancePanel));
			},
		};
	},
});
