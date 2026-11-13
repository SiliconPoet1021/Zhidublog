---
title: '在博客里写数学公式：KaTeX 与 LaTeX 快速上手'
description: '记录知渡博客的公式写法，包括行内公式、独立公式、矩阵、对齐推导和本地预览流程。'
pubDate: 2026-11-13
category: tech
tags:
  - LaTeX
  - KaTeX
  - Markdown
  - 写作
---

数学公式不应该成为写作的负担。知渡博客使用 KaTeX 在构建阶段解析 LaTeX 公式，本地开发预览和线上文章都可以直接看到排版结果。

## 两种最常用的写法

行内公式适合放在句子里，例如质能方程 $E = mc^2$，或者用 $O(n \log n)$ 表示算法复杂度。写法是用一对美元符号包住公式：

```markdown
质能方程是 $E = mc^2$。
```

独立公式适合需要单独强调的推导、定义或损失函数。用两对美元符号包住公式，并让 `$$` 各自单独占一行：

```markdown
$$
\mathcal{L}(\theta)
= -\frac{1}{N}\sum_{i=1}^{N}
\log p_\theta(y_i \mid x_i)
$$
```

渲染后会得到：

$$
\mathcal{L}(\theta)
= -\frac{1}{N}\sum_{i=1}^{N}
\log p_\theta(y_i \mid x_i)
$$

## 常见公式示例

分式、根号和上下标：

$$
\operatorname{softmax}(z_i)
= \frac{e^{z_i}}{\sum_{j=1}^{n} e^{z_j}},
\qquad
\bar{x} = \frac{1}{n}\sum_{i=1}^{n}x_i
$$

矩阵和线性代数：

$$
\mathbf{A} =
\begin{bmatrix}
1 & 2 \\
3 & 4
\end{bmatrix},
\qquad
\mathbf{A}^{-1}\mathbf{A} = \mathbf{I}
$$

多行对齐：

$$
\begin{aligned}
(a+b)^2 &= a^2 + 2ab + b^2 \\
(a-b)^2 &= a^2 - 2ab + b^2
\end{aligned}
$$

这些写法覆盖了技术文章里大多数场景。更复杂的符号、环境和排版规则，可以查阅 [KaTeX 支持的函数列表](https://katex.org/docs/supported.html)。

## 本地预览

在 `src/content/blog/` 中编辑 Markdown 文件后运行：

```bash
npm run dev
```

打开 `http://localhost:4321` 即可检查公式排版。发布前再运行一次 `npm run check`，确保文章和页面链接都能正常构建。

## 几个容易踩坑的地方

1. **不要漏掉闭合符号。** 每个 `$...$` 和 `$$...$$` 都需要成对出现。
2. **公式块建议单独占行。** 这样更稳定，也更方便后续修改。
3. **正文里的美元符号要转义。** 如果只是想显示价格，可以写成 `\$100`。
4. **代码块里的公式不会被解析。** 这正是我们想要的行为，代码示例可以保持原样。

公式支持目前在构建阶段完成。访问者打开文章时，收到的已经是排版好的页面，不需要在浏览器里重新计算，也不会增加服务器内存压力。
