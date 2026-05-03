import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

const config: QuartzConfig = {
  configuration: {
    pageTitle: "WormLikeChain",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    locale: "en-US",
    baseUrl: "blog.wormlikechain.com",
    ignorePatterns: [
      "private",
      "templates",
      ".obsidian",
      "drafts",
      "assets",
      "README.md",
      "Setup and Troubleshooting.md",
      "published",
      "quartz-config",
    ],
    defaultDateType: "created",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Source Serif 4",
        body: "Source Sans Pro",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#f5eff0",
          lightgray: "#d4c4c8",
          gray: "#8a7880",
          darkgray: "#3a2830",
          dark: "#2a1820",
          secondary: "#963a4a",
          tertiary: "#b04858",
          highlight: "rgba(150, 58, 74, 0.15)",
          textHighlight: "rgba(176, 72, 88, 0.35)",
        },
        darkMode: {
          light: "#1a1719",
          lightgray: "#3a3440",
          gray: "#8a8290",
          darkgray: "#d4c8cc",
          dark: "#e4d8dc",
          secondary: "#c4707e",
          tertiary: "#d4848f",
          highlight: "rgba(196, 112, 126, 0.22)",
          textHighlight: "rgba(212, 132, 143, 0.32)",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: { light: "github-light", dark: "github-dark" },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description({ descriptionLength: 500, maxDescriptionLength: 750 }),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
        rssFullHtml: false,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      Plugin.CustomOgImages(),
    ],
  },
}

export default config
