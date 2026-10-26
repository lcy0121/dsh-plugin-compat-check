# UI component provenance

The Button, Card, Badge, Input, Textarea, Table, Label, Separator and Alert primitives in
`index.jsx` are adapted from [shadcn/ui](https://github.com/shadcn-ui/ui), MIT,
using the [new-york source registry](https://ui.shadcn.com/r/styles/new-york/button.json),
[Native Select](https://ui.shadcn.com/docs/components/native-select), and
[Separator](https://ui.shadcn.com/docs/components/separator).

Local adaptations: function components compatible with the host's React;
unused ref/asChild/portal features removed; semantic status colors; scoped theme
tokens; native Select and Separator semantics; a disclosure composed from Card and Button with explicit
expanded state and conditional content. Legacy details/summary markup is adapted
to the same explicit button controls; review history keeps its controlled state
and form disclosures retain their mounted content while hidden. No Radix/Base UI or React runtime is
bundled. The disclosure is a local component, not an unmodified upstream
Collapsible. Tailwind utilities compile with preflight disabled and every rule
scoped to `.dsc-ui`. Runtime dependencies are bundled from the frozen root lock;
build tooling remains repository-only. See the shipped THIRD_PARTY_NOTICES.md.

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
