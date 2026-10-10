# 回归 fixture：无界循环

3 个 JS 文件，全部用**无扩展名**的相对导入，且 `a.js` 与 `b.js` 成环：

```
index.js → b   (b.js)
b.js     → a   (a.js)
a.js     → a   (a.js)
```

修复前，`local_graph` 会在这里无界膨胀（实测队列涨到 32 万条、`seen` 只有 8 个文件，
98% CPU 空转不停）。真实触发者是打包了 undici 的插件，例如 `@liustack/modlens`。

跑法：`tools/parity/parity.sh tools/parity/fixtures` —— 目录里每个子目录会被当成一个
node_modules 根来对拍。改动 `local_graph` 后必须确认这个 fixture 仍在秒级完成。
