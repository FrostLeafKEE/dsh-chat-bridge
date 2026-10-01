# 第三方代码说明

本插件自身代码以 MIT 许可发布（见 `LICENSE`）。下面列出仓库内**复制或改写**了第三方来源的部分。除此之外，本插件不包含任何从其他插件仓库复制的实现。

## 1. DSH 宿主共享模块表（逐字复制）

- 来源：DeepSeek Harness, `packages/client/web/src/platform.ts`
- 上游许可：MIT
- 上游版本：`0.2.0-rc.2`，提交 `639ed015397290b3745d163aafe02ffee4aa3f84`
- 位置：`build/platform-externals.ts` 中的 `PLATFORM_MODULES` 与 `PRELOADED_CLIENT_EXTERNALS`
- 说明：这两个常量是宿主冻结模块表的规格。本插件必须按同名同序复述它们，才能正确地把共享依赖留作 external。构建期**不会**从 DSH checkout 读取该文件；DSH 基线升级时需要人工核对。

## 2. Client lazy-CJS 构建协议（按文档重写，非复制）

- 参考：DeepSeek Harness, `packages/client/tsdown.client.ts`（MIT）与 `packages/client/modules/README.zh.md`
- 位置：`build/client-bundle.ts`
- 说明：注册包裹格式（`window.__ModuleLoader__.load({ id, factory })`、`intro`/`footer`、CJS + browser 输出）是该协议的公开约定。本文件是**独立实现的最小适配**，没有复制上游的 CSS Modules 虚拟化、bundle 输入隔离门、tsc sourcemap 串接、HMR chunk 重写器等仅适用于 monorepo 的部分。上游预设是仓库内工具，不是已发布的 SDK 导出，因此不能 import。

## 3. 未复制的内容

- 没有复制任何第三方插件的源码、构建脚本或测试。
- 没有打包任何第三方运行时（依赖全部为 devDependency 或宿主模块表提供）。
- 没有打包 DSH 源码或夹具。
