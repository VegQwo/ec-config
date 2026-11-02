# EC配置刷写插件

OpenRevo 插件：直接读写 **Uniwill / Tongfang/ AiStone** 机型的 EC 配置区。

> ⚠️ **这是直接操作嵌入式控制器（EC）内存的工具。改错配置可能导致风扇异常、指示灯异常、性能受限甚至无法开机。动手前请先备份，并确认你知道自己在改什么。**

---

## 这是什么

笔记本的 EC（Embedded Controller）里有一块配置区，记录着这台机器的键盘 RGB、灯条模式、机种代号、适配器功率、狂暴模式、独显频率偏移、音频方案等参数。厂商通常只在工厂刷写一次，用户在系统里看不到也改不了。

这个插件通过 OpenRevo 宿主提供的 `raw_ec_read` / `raw_ec_write` 通道，把这块配置区（`0xD00`–`0xD8F`，144 字节）读出来，逐字段展示、允许修改，改完再写回去并逐字节回读校验。

**不需要管理员权限，不需要装驱动，不受 Windows 驱动签名校验 / HVCI / 厂商 CiPolicies 影响**——这是它相比同类工具最大的不同。

---

## 安装

### 方式一：插件市场（推荐）

在 OpenRevo 的「插件市场」页签里搜索「EC配置刷写插件」，点安装。

### 方式二：手动安装

1. 下载本仓库，解压
2. 把整个文件夹放到 `%APPDATA%\OpenRevo\plugins\ec-config\`
3. 重启 OpenRevo
4. 侧边栏【插件】页 → 找到「EC配置刷写插件」→ 打开开关
5. 顶栏会出现同名页签

---

## 使用

```
打开插件 → 自动读取当前配置 → 逐组查看/修改 → 查看变更预览 → 应用变更 → 关机
```

### 几个必须知道的事

**1. 改完要关机，不是重启**

新值写进 EC 之后，固件要等到**下一次加电自检**才会按新配置工作。系统里的「重启」是热复位，不会让 EC 重新初始化。

插件里有「关机」按钮，点它之后机器会完全断电。

> 部分机型关机后会自动再开机一次，这是刷写生效的标志，属于正常现象。

**2. 备份**

插件内置备份功能，存在浏览器 localStorage 里（最多 20 份）。改之前先点「创建备份」，改坏了能载回来。

**3. 未知字段不要乱改**

有些字段（OCCapability、D4EC、QKeyID、SoundEffect）的作用尚未确认，插件的提示里会写「未知功能，谨慎修改」。这不是免责声明，是真的不知道。

---

## 支持的机型

只要 EC 配置区布局是这套标准（`0xD00` 起 144 字节）的机型都支持，包括但不限于：

- Tongfang（AiStone）模具：旷世、耀世、极光、25 26蛟龙等系列
- Uniwill 模具

**不支持的机型**：插件会检测 `0xD00` 的首字节，布局不符会明确提示「此 EC 布局未知」，不会盲目写入。

---

## 特别感谢

- [Tody](https://github.com/) 的 `ECService.exe`（2023）——本项目的 EC 地址映射表全部来自对它的逆向分析
- OpenRevo 宿主提供的 `raw_ec` 原生通道——没有它这个插件只能依赖驱动和提权

---

## 技术细节

### EC 配置区布局（已实测验证）

| 地址 | 字段 | 说明 |
|---|---|---|
| `0xD00` bit0 | RgbKbSupport | RGB 键盘支持 |
| `0xD00` bit1 | SingleColorKb | 单色键盘 |
| `0xD00` bit2 | ChinaMode | 中国区模式 |
| `0xD00` bit3 | BL | 灯条背光 |
| `0xD00` bit4 | FourZoneRgbKb | 四分区 RGB |
| `0xD01`–`0xD03` | RgbKbRed/Green/BlueLevel | RGB 键盘颜色分量（十进制 0–255）|
| `0xD20` | LbMode | 灯条模式 |
| `0xD41` | ModelID | 机种代号 |
| `0xD42` | AdpType | 适配器功率档位 |
| `0xD43` | NbType | 主板类型 |
| `0xD44` | TurboMode | 狂暴模式 |
| `0xD45` bit0–bit4 | DDSSupport / ColorCalibration / D4EC / NdType / LiquidCooling | 杂项开关 |
| `0xD46` | SpeakerType | 扬声器型号 |
| `0xD47` | AudioEffect | 音频方案 |
| `0xD48` | OCCapability | 超频能力 |
| `0xD49` | DynamicBoost | 动态加速 |
| `0xD4A` | QKeyID | Q 键 ID |
| `0xD4B` | DgpuCoreFrequencyOffset | 独显核心偏移 |
| `0xD4C`–`0xD4D` | DgpuVramFrequencyOffset | 独显显存偏移 |
| `0xD50`–`0xD5F` | SoundEffect | 音效字符串（ASCII）|
| `0x770`–`0x77D` | romID | 键盘 ROM ID（只读）|

### 为什么不用 ECService

官方工具 `ECService.exe` 通过 `HwRwDrv.sys` 驱动访问 EC，那个驱动没有 WHQL 签名，在开启驱动签名强制或厂商代码完整性策略的机器上会被拦截——这就是很多人用不了的原因。

`raw_ec` 通道由宿主直接与 EC 通信（走 ACPI 或平台原生接口），绕开了整个驱动层。

### 已知限制

- 部分机型的 EC 固件对 PL4（总功耗上限）有「不得低于 PL2」的约束，改 PL4 时要同步调整 PL2
- EC 固件版本差异会导致同一字段在不同机型上表现不同，遇到异常请先备份再回滚

---

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。当前版本 **0.9.2**。

---

## 许可

MIT
