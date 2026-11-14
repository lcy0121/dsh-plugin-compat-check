# UI component provenance

The Button, Card, Badge, Input, Textarea, Table, Label, Separator and Alert primitives in
`index.jsx` are adapted from [shadcn/ui](https://github.com/shadcn-ui/ui), MIT,
using the [new-york source registry](https://ui.shadcn.com/r/styles/new-york/button.json),
[Native Select](https://ui.shadcn.com/docs/components/native-select), and
[Separator](https://ui.shadcn.com/docs/components/separator).

Local adaptations use host-compatible React function components, semantic colors,
scoped theme tokens and native Select/Separator semantics; unused ref/asChild/portal
features are removed. Card/Button disclosures use explicit expanded state and
conditional content; review history stays controlled and hidden forms stay mounted.
This disclosure is local, not upstream Collapsible. No Radix/Base UI or React
runtime is bundled. Tailwind disables preflight and scopes every rule to `.dsc-ui`.
Runtime dependencies use the frozen root lock; build tooling stays repository-only.
See the shipped THIRD_PARTY_NOTICES.md. The upstream MIT notice follows unchanged.

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
