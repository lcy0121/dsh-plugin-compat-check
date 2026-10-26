export default {
  content: ["./plugin/src/**/*.{jsx,js}", "./lib/workflow-panels.mjs"],
  important: ".dsc-ui",
  corePlugins: { preflight: false },
  theme: {
    extend: {
      fontSize: {
        sm: ["var(--dsc-font-body)", { lineHeight: "1.6" }],
        xs: ["var(--dsc-font-small)", { lineHeight: "1.6" }],
      },
      colors: Object.fromEntries(
        [
          "background",
          "foreground",
          "card",
          "card-foreground",
          "primary",
          "primary-foreground",
          "secondary",
          "secondary-foreground",
          "muted",
          "muted-foreground",
          "accent",
          "accent-foreground",
          "border",
          "input",
          "ring",
        ].map((name) => [name, `hsl(var(--dsc-${name}) / <alpha-value>)`]),
      ),
    },
  },
};
