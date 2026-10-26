export default {
  content: ["./plugin/src/**/*.{jsx,js}", "./lib/workflow-panels.mjs"],
  important: ".dsc-ui",
  corePlugins: { preflight: false },
  theme: {
    extend: {
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
