// Adapted from shadcn/ui (MIT), new-york registry. See PROVENANCE.md.
import * as React from "react";
import { cva } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import css from "virtual:compat-styles";

const cn = (...values) => twMerge(clsx(values));
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        outline:
          "border border-input bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
      },
      size: { default: "h-9 px-4 py-2", sm: "h-8 rounded-md px-3 text-xs" },
    },
    defaultVariants: { variant: "outline", size: "sm" },
  },
);
export function Button({ className, variant, size, ...props }) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
export function Card({ className, as: Comp = "section", ...props }) {
  return (
    <Comp
      data-slot="card"
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
// Adapted shadcn Separator styling with native semantics; no headless runtime.
export function Separator({
  className,
  decorative = true,
  orientation = "horizontal",
  ...props
}) {
  return (
    <div
      data-slot="separator"
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
export function Badge({ className, tone = "neutral", ...props }) {
  return (
    <span
      data-slot="badge"
      data-tone={tone}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}
export function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
export function Textarea({ className, ...props }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
export function NativeSelect({ className, ...props }) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-9 max-w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
export function Table({ className, ...props }) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-auto">
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom text-sm text-foreground",
          className,
        )}
        {...props}
      />
    </div>
  );
}
const element = (tag, slot, classes) =>
  function Primitive({ className, ...props }) {
    return React.createElement(tag, {
      "data-slot": slot,
      className: cn(classes, className),
      ...props,
    });
  };
export const TableHeader = element("thead", "table-header", "[&_tr]:border-b");
export const TableBody = element(
  "tbody",
  "table-body",
  "[&_tr:last-child]:border-0",
);
export const TableRow = element(
  "tr",
  "table-row",
  "border-b border-border transition-colors hover:bg-muted/50",
);
export const TableHead = element(
  "th",
  "table-head",
  "h-10 px-3 text-left align-middle font-medium text-foreground",
);
export const TableCell = element(
  "td",
  "table-cell",
  "p-3 align-top text-foreground",
);
export const TableCaption = element(
  "caption",
  "table-caption",
  "mb-3 text-left text-sm text-muted-foreground",
);
export const Label = element(
  "label",
  "label",
  "text-sm font-medium leading-none",
);
export function Alert({ className, ...props }) {
  return (
    <div
      data-slot="alert"
      className={cn(
        "relative w-full rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm",
        className,
      )}
      {...props}
    />
  );
}

// Shared disclosure chrome for tables and report sections. A framed table is
// lazy; legacy details preserve their mounted forms while hiding closed content.
const titleText = (value) => {
  if (value == null || typeof value === "boolean") return "";
  if (Array.isArray(value)) return value.map(titleText).join("");
  if (typeof value === "object")
    return titleText(value.props?.children ?? value.children);
  return String(value);
};
export function Fold({
  title,
  count,
  children,
  className,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  framed = true,
  heading = false,
  keepMounted = false,
  ...props
}) {
  const [internalOpen, setOpen] = React.useState(defaultOpen);
  const open = controlledOpen === undefined ? internalOpen : controlledOpen;
  const visited = React.useRef(false);
  if (open) visited.current = true;
  const content =
    Array.isArray(children) && children.length === 1 ? children[0] : children;
  const Shell = framed ? Card : "div";
  const Heading = heading ? "h3" : "div";
  return (
    <Shell
      {...props}
      className={cn("compat-fold", !framed && "compat-disclosure", className)}
      data-slot="collapsible"
      data-state={open ? "open" : "closed"}
    >
      <div className="compat-fold-header">
        <Heading className="compat-fold-title">
          {title}
          {count != null ? <span className="compat-count">{count}</span> : null}
        </Heading>
        <Button
          className="shrink-0"
          aria-label={`${open ? "收起" : "展开"}${titleText(title)}`}
          aria-expanded={open}
          onClick={() => {
            const next = !open;
            if (controlledOpen === undefined) setOpen(next);
            onOpenChange?.(next);
          }}
          type="button"
          variant="ghost"
        >
          {open ? "收起" : "展开"}
          <span aria-hidden="true">{open ? "−" : "+"}</span>
        </Button>
      </div>
      {open || (keepMounted && visited.current) ? (
        <div
          data-slot="collapsible-content"
          hidden={!open}
          className="compat-fold-content"
        >
          {typeof content === "function" ? content() : content}
        </div>
      ) : null}
    </Shell>
  );
}

// Adapt the shared factories' details/summary markup without rendering native
// triangle controls. onToggle remains compatible with the controlled review log.
export function Disclosure({
  children,
  open,
  onToggle,
  keepMounted = false,
  ...props
}) {
  const [summary, ...content] = Array.isArray(children) ? children : [children];
  const title = summary?.props?.children ?? summary?.children;
  return (
    <Fold
      {...props}
      title={title}
      framed={false}
      keepMounted={keepMounted}
      defaultOpen={Boolean(open)}
      open={onToggle ? Boolean(open) : undefined}
      onOpenChange={
        onToggle
          ? (next) =>
              onToggle({
                target: { open: next },
                currentTarget: { open: next },
              })
          : undefined
      }
    >
      {content}
    </Fold>
  );
}

// Keep card boundaries and headings visible; initialize heavy sections only when
// they approach the viewport. Once visited, retain editor state and focus.
export function DeferredPanel({ title, label, children }) {
  const root = React.useRef(null);
  const [ready, setReady] = React.useState(
    typeof IntersectionObserver !== "function",
  );
  React.useEffect(() => {
    if (ready || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      (rows) => {
        if (rows.some((row) => row.isIntersecting)) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [ready]);
  const content =
    Array.isArray(children) && children.length === 1 ? children[0] : children;
  return (
    <div ref={root} className="compat-panel-mount">
      {ready ? (
        typeof content === "function" ? (
          content()
        ) : (
          content
        )
      ) : (
        <Card aria-label={label}>
          <h3>{title}</h3>
          <p role="status">内容将在进入视区时加载。</p>
        </Card>
      )}
    </div>
  );
}
export function Pager({ page, total, pageSize = 50, onPageChange, label }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1) return null;
  return (
    <nav className="compat-pagination" aria-label={`${label}分页`}>
      <span role="status">
        第 {page + 1} / {pages} 页 · 共 {total} 项
      </span>
      <Button
        type="button"
        aria-label={`上一页${label}`}
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        上一页
      </Button>
      <Button
        type="button"
        aria-label={`下一页${label}`}
        disabled={page + 1 >= pages}
        onClick={() => onPageChange(page + 1)}
      >
        下一页
      </Button>
    </nav>
  );
}

function hostTheme() {
  if (typeof document === "undefined") return "light";
  const root = document.documentElement,
    body = document.body;
  for (const element of [root, body]) {
    if (
      element?.classList.contains("dark") ||
      element?.dataset.theme === "dark" ||
      element?.dataset.colorScheme === "dark"
    )
      return "dark";
    if (
      element?.classList.contains("light") ||
      element?.dataset.theme === "light" ||
      element?.dataset.colorScheme === "light"
    )
      return "light";
  }
  const scheme =
    typeof getComputedStyle === "function"
      ? getComputedStyle(root).colorScheme
      : "";
  return scheme === "dark" ||
    (scheme !== "light" &&
      globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches)
    ? "dark"
    : "light";
}
export function Scope({ children, inline = false, onVisibilityChange }) {
  const container = React.useRef(null);
  const [theme, setTheme] = React.useState(hostTheme);
  React.useEffect(installStyles, []);
  React.useEffect(() => {
    if (!onVisibilityChange) return;
    if (typeof IntersectionObserver !== "function") {
      onVisibilityChange(true);
      return;
    }
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver((rows) =>
      onVisibilityChange(rows.some((row) => row.isIntersecting)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisibilityChange]);
  React.useEffect(() => {
    if (
      typeof document === "undefined" ||
      typeof MutationObserver === "undefined"
    )
      return;
    const update = () => setTheme(hostTheme());
    const observer = new MutationObserver(update);
    for (const element of [document.documentElement, document.body])
      if (element)
        observer.observe(element, {
          attributes: true,
          attributeFilter: [
            "class",
            "style",
            "data-theme",
            "data-color-scheme",
          ],
        });
    const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media?.removeEventListener("change", update);
    };
  }, []);
  const Comp = inline ? "span" : "div";
  return (
    <Comp
      ref={container}
      className={inline ? "dsc-ui dsc-inline" : "dsc-ui"}
      data-theme={theme}
    >
      {children}
    </Comp>
  );
}

// Style owners survive HMR overlap; an old generation cannot remove newer CSS.
export function installStyles() {
  if (typeof document === "undefined") return () => {};
  const key = "__DSH_COMPAT_STYLES__";
  const owner = {};
  const registry = window[key] || (window[key] = new Map());
  let entry = registry.get(css);
  if (!entry) {
    const node = document.createElement("style");
    node.setAttribute("data-dsh-compat-styles", "");
    node.textContent = css;
    document.head.appendChild(node);
    entry = { node, owners: new Set() };
    registry.set(css, entry);
  }
  entry.owners.add(owner);
  return () => {
    entry.owners.delete(owner);
    if (!entry.owners.size) {
      entry.node.remove();
      registry.delete(css);
    }
    if (!registry.size && window[key] === registry) delete window[key];
  };
}

// Factories accept this adapter while their pure, Node-safe sources stay shared.
export const ui = {
  button: Button,
  input: Input,
  textarea: Textarea,
  select: NativeSelect,
  table: Table,
  thead: TableHeader,
  tbody: TableBody,
  tr: TableRow,
  th: TableHead,
  td: TableCell,
  caption: TableCaption,
  label: Label,
  section: Card,
  details: Disclosure,
  Fold,
  Pager,
};
