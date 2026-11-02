# EC配置刷写插件 — 仓库维护规范

> 本文件只约束维护者的工作流程，不对外发布。README.md 才是面向用户的门面。

---

## 一、文件角色划分

| 文件 | 谁来改 | 说明 |
|---|---|---|
| `README.md` | **用户在 GitHub 网页上直接改** | 面向用户的门面。措辞、措辞风格、机型列表、致谢等由用户定稿 |
| `CHANGELOG.md` | 我（AI）按版本追加 | 面向开发者的变更记录 |
| `manifest.json` | 我，只改 `version` 字段 | 版本号必须与 CHANGELOG 最新条目一致 |
| `index.html` | 我（由 build.js 生成） | 单文件产物，构建后勿手改 |
| `js/*.js` | 我 | 源码。改完必须重新构建 |
| `css/ec-config.css` | 我 | |
| `build.js` | 我 | 构建脚本 |

**核心原则：README.md 的最终版以 GitHub 上的为准。** 用户可能随时在网页上调整措辞，本地副本永远是被拉取的一方，不是被推送的一方。

---

## 二、版本发布流程（必须按顺序）

### 1. 从远端拉取最新状态（第一步，不可跳过）

```bash
cd /tmp && rm -rf ec-sync
git -c http.proxy= clone --depth 1 https://github.com/VegQwo/ec-config.git ec-sync
```

**目的：** 拿到用户可能在网页上改过的 README.md 和其它文件，避免用过期副本覆盖掉用户的修改。

**为什么不用 gh-proxy：** 代理只支持匿名的 clone/fetch，不支持带凭据的 push（会返回 `No anonymous write access`）。所以 clone 可以走代理，push 必须直连。

### 2. 修改源码

在 `E:\dsh工作区\ec-config-release\` 里改（这是发布目录，同时也是唯一权威本地副本）。

### 3. 重新构建

```bash
cd "/e/dsh工作区/ec-config-release" && node build.js
```

产物：`index.html`（单文件，内含 CSS + bundle.js）。

### 4. 升版本号

**两处都要改，不能只改一处：**

- `E:\dsh工作区\ec-config-release\manifest.json` → `version`
- `C:\Users\VegOwo\AppData\Roaming\OpenRevo\plugins\ec-config\manifest.json` → `version`

### 5. 更新 CHANGELOG.md

在文件顶部、`---` 分隔线之后插入新版本条目，格式：

```markdown
## 0.9.x

**YYYY-MM-DD**

### 新增 / 变更 / 修复

- 条目
```

**格式约束：**
- 版本号用三级标题 `##`
- 日期单独一行加粗
- 分类只用「新增 / 变更 / 修复 / 其他」四个
- 每条说清楚**改了什么**和**为什么**，不要只写「优化了 X」

### 6. 同步到安装目录

安装目录：`C:\Users\VegOwo\AppData\Roaming\OpenRevo\plugins\ec-config\`

需要同步的文件：
- `index.html`
- `js/ec-schema.js`、`js/bundle.js`、`js/app.js`、`js/ec-raw.js`、`js/ec-backup.js`
- `css/ec-config.css`
- `manifest.json`
- `README.md`、`CHANGELOG.md`

**验证方式：** 逐文件 `md5sum` 对比两个目录，必须全部 `same`。

### 7. 推送到 GitHub

```bash
cd /tmp/ec-sync
# 先把发版目录的内容覆盖过来
cp -r "/e/dsh工作区/ec-config-release/." .
# 但 README.md 要保留远端版本（见下一节）
git add -A
git -c user.name="VegOwo" -c user.email="vegowo@gmail.com" -c core.autocrlf=false commit -m "v0.9.x: 摘要"
```

推送必须直连 github.com（不能用 gh-proxy），带 PAT：

```bash
git -c credential.helper= -c http.proxy= push "https://<TOKEN>@github.com/VegQwo/ec-config.git" main
```

**注意：**
- `-c http.proxy=` 用于绕过系统代理，直连才认凭据
- 推送完立即 `git remote set-url --push origin "https://github.com/VegQwo/ec-config.git"`
- **PAT 只用于当次调用，绝不写入 `.git-credentials` 或任何文件**
- 推送后提醒用户去 https://github.com/settings/tokens 撤销

### 8. 推送后校验

```bash
git -c http.proxy= ls-remote origin main   # 远端 SHA
git rev-parse HEAD                          # 本地 SHA
```

两个 SHA 必须一致。

---

## 三、README.md 的处理规则（最容易出错的地方）

### 规则

1. **发版前**：从远端 clone，用远端 README.md **覆盖**本地副本。
2. **发版中**：不要修改 README.md 的任何措辞。
3. **推送时**：README.md 保持远端原样，不产生 diff。
4. **绝不**用本地的旧 README 覆盖远端。

### 例外：只有当版本号出现在 README 里时才改

README 的「更新日志」章节写着：

```
见 [CHANGELOG.md](CHANGELOG.md)。当前版本 **0.9.2**。
```

**升版本号时，这行里的版本号也要同步改。** 这是 README 里唯一允许我改的内容。

如果用户以后在新的 README 里加了别的内容（功能列表、截图、FAQ 等），同样规则：**只改版本号那一处，其余不动。**

---

## 四、构建与产物约束

- **必须是单文件 `index.html`**：OpenRevo 宿主用 `srcdoc` 注入 iframe，外部 `<script src>` 不执行。`build.js` 负责把 CSS 和 bundle.js 内联。
- **不允许有 BOM**：宿主用 `serde_json` 解析 manifest.json，带 BOM 会直接解析失败，插件退化为 `v0.1.0 / directory`。
  - 写文件用 `[System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding($false)))`
  - 验证：`head -c 3 file.json | od -An -tx1`，应为 `7b 0a 20`（`{\n `），不是 `ef bb bf`
- **manifest 校验规则**（市场校验器）：
  - `author` 必须等于仓库 owner（现在是 `VegQwo`）
  - `min_host_version` 必须是三段纯数字（现在是 `0.9.3`）
  - id 与目录名一致（`ec-config`）

---

## 五、市场收录

- 仓库需要 topic **`openrevo-plugin`** 才会被快车道收录（约 1 小时）
- 市场 PR 仓库：`LIPiston/open-revo-market`，文件 `market/overrides.json`
- 已有 PR #1（fork 自 `VegQwo/open-revo-market`），用于指定显示名 `EC配置刷写插件`

---

## 六、不要做的事

- ❌ 不要把 PAT 写进任何文件
- ❌ 不要用 gh-proxy 推送（只支持读）
- ❌ 不要手改 `index.html`（会被下次 build 覆盖）
- ❌ 不要只改一处 manifest.json（安装目录和发布目录必须同步）
- ❌ 不要在 README 里自作主张调整措辞
- ❌ 不要忘记推送后校验 SHA
