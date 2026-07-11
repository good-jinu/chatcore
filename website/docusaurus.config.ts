import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
	title: "ChatCore",
	tagline:
		"An in-process, database-agnostic, event-sourced messaging engine for TypeScript",

	// Production URL and the path the site is served from on GitHub Pages.
	url: "https://good-jinu.github.io",
	baseUrl: "/chatcore/",

	// GitHub Pages deployment config.
	organizationName: "good-jinu",
	projectName: "chatcore",
	trailingSlash: false,

	// Generated API markdown can contain cross-links that don't always resolve
	// to a Docusaurus anchor; warn instead of failing the whole build.
	onBrokenLinks: "warn",
	onBrokenAnchors: "warn",

	// `.md` -> CommonMark, `.mdx` -> MDX. Keeps the TypeDoc-generated `.md`
	// files (with generics like `Array<T>`) from being parsed as JSX.
	markdown: {
		format: "detect",
		hooks: {
			onBrokenMarkdownLinks: "warn",
		},
	},

	i18n: {
		defaultLocale: "en",
		locales: ["en"],
	},

	presets: [
		[
			"classic",
			{
				docs: {
					routeBasePath: "/",
					sidebarPath: "./sidebars.ts",
					editUrl: "https://github.com/good-jinu/chatcore/tree/main/website/",
				},
				blog: false,
				theme: {
					customCss: "./src/css/custom.css",
				},
			} satisfies Preset.Options,
		],
	],

	themeConfig: {
		navbar: {
			title: "ChatCore",
			items: [
				{
					type: "docSidebar",
					sidebarId: "docsSidebar",
					position: "left",
					label: "Docs",
				},
				{
					to: "/api/",
					label: "API",
					position: "left",
				},
				{
					href: "https://www.npmjs.com/package/chatcore",
					label: "npm",
					position: "right",
				},
				{
					href: "https://github.com/good-jinu/chatcore",
					label: "GitHub",
					position: "right",
				},
			],
		},
		footer: {
			style: "dark",
			links: [
				{
					title: "Docs",
					items: [
						{ label: "Getting Started", to: "/getting-started" },
						{ label: "API Reference", to: "/api/" },
					],
				},
				{
					title: "More",
					items: [
						{
							label: "GitHub",
							href: "https://github.com/good-jinu/chatcore",
						},
						{
							label: "npm",
							href: "https://www.npmjs.com/package/chatcore",
						},
					],
				},
			],
			copyright: `Copyright © ${"2026"} ChatCore. Built with Docusaurus.`,
		},
		prism: {
			theme: prismThemes.github,
			darkTheme: prismThemes.dracula,
			additionalLanguages: ["bash", "json"],
		},
	} satisfies Preset.ThemeConfig,
};

export default config;
