# 内置 3D 形象（VRM）

两只都是 **VRoid Studio 早期样例模型**，授权 **CC0 1.0**（VRoid 官方明确放开：
可自由编辑、可再分发、可商用、免署名）。

| 文件 | 模型 | 体积 |
|---|---|---|
| `sendagaya_shino.vrm` | Sendagaya Shino | ~15MB |
| `sakurada_fumiriya.vrm` | Sakurada Fumiriya | ~19MB |

- 出处：https://vroid.pixiv.help/hc/en-us/articles/4402614652569
  （镜像：https://opengameart.org/content/vroid-studio-cc0-models）
- 用途：宠物伴星的默认 3D 形象；用户在「设置 → 宠物 → 3D 形象」里切换，
  也可以载入自己的 `.vrm`（只在本机读取，不上传）。

替换/新增：把同格式文件放进本目录，并同步
`packages/ui/src/stores/pet.ts` 的 `PET_BUILTIN_VRMS` 与 `apps/desktop/main.cjs`
的 `PET_BUILTIN_VRM_FILES` 白名单（两边 id 必须一致）。
