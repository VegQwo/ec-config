/* ============================================================
 *  EC配置刷写插件 v2 — 打包产物（由 build.js 生成，请勿手改）
 *  所有模块合并为单一作用域；避免 <script type="module"> 在
 *  OpenRevo 的内联注入环境下不执行的问题。
 * ============================================================ */
(function () {
'use strict';

/* ---------- js/ec-schema.js ---------- */
/**
 * ec-schema.js — 字段定义 + EC 地址映射
 *
 * 所有地址与编码方式均由 ECService.exe 的 Ghidra 反编译源码 + 实机数据双重确认：
 *   · 结构体偏移 + 0x10 = EC 地址（基准 0xD00）
 *   · 反编译证据：FUN_140001f00（dump 输出）、FUN_1400022d0（读 EC）
 *   · 实机验证：ECService -dump 与 raw_ec_read 逐字段一致
 *
 * 字段类型：
 *   bit     — 某个字节的某一位（0/1）
 *   byte    — 单字节 0~255
 *   enum    — 单字节，有枚举含义
 *   hex16   — 16 位小端（低字节在 addr，高字节在 addr+1，最高位为符号位）
 *   ascii   — 连续 N 字节 ASCII 字符串
 *   raw     — 连续 N 字节原始数据（只读展示）
 */

// ---------------------------------------------------------------- 枚举表

const ADPTYPE = {
  0: '330W', 1: '230W', 2: '180W', 3: '150W', 4: '120W',
  5: '90W', 6: '65W', 7: '40W', 8: '280W',
  9: '210W', 10: '250W', 11: '420W',
};

const MODELID = {
  0: 'IDR', 1: 'IDX', 2: 'IDV', 3: 'IDO', 4: 'IDP',
  5: 'IDS', 6: 'IDY', 7: 'IDW', 8: 'IDM', 9: 'IDE', 10: 'IDN',
};

const NBTYPE = {
  1: 'NOTEBOOK_STANDARD',
  2: 'NOTEBOOK_COMMERCIAL',
  33: 'Table33', 34: 'Table34', 35: 'Table35', 36: 'Table36',
};

const LBMODE = {
  0: '关闭', 1: '欢迎', 2: '白色', 3: '红色', 254: '自定义', 255: '未设置',
};

const SPEAKERTYPE = { 0: '2412', 1: '1340', 2: '1133', 3: '3209' };

const AUDIOEFFECT = { 0: 'THX', 1: 'Sound Blaster', 2: 'Nahimic' };

const OCCAPABILITY = {
  0: '软件超频（SW OC）',
  1: '硬件超频（HW OC）',
  2: '硬件超频（HW OC）',
  3: '硬件超频（HW OC）',
  255: '不支持',
};

const ND_TYPE = { 0: 'Game Ready', 1: 'Studio' };

const TURBO_MODE = { 0: '关闭', 1: '开启' };

const ON_OFF = { 0: '关闭', 1: '开启' };

const YES_NO = { 0: '不支持', 1: '支持' };

// ---------------------------------------------------------------- 字段定义
//
// 分组顺序与界面展示顺序一致。
// readOnly = true 的字段只展示不可写。

const FIELDS = [
  // ============ 机种标识 ============
  {
    key: 'romID', label: 'EC ROM ID', group: 'identity',
    kind: 'raw', addr: 0x770, length: 14, readOnly: true,
  },
  {
    key: 'ModelID', label: '机种代号', group: 'identity',
    kind: 'enum', addr: 0xD41, enums: MODELID, freeInput: true,
    hint: '某些机型共用一个 EC 固件，靠此配置来判断机型以及配置功耗上限',
  },
  {
    key: 'NbType', label: '主板类型', group: 'identity',
    kind: 'enum', addr: 0xD43, enums: NBTYPE,
    hint: '修改后会改变模式切换按钮的功能，其他作用未知',
  },

  // ============ 灯效 ============
  {
    key: 'RgbKbSupport', label: 'RGB 键盘支持', group: 'lighting',
    kind: 'bit', addr: 0xD00, bit: 0, enums: YES_NO,
  },
  {
    key: 'SingleColorKb', label: '单色键盘', group: 'lighting',
    kind: 'bit', addr: 0xD00, bit: 1, enums: YES_NO,
  },
  {
    key: 'FourZoneRgbKb', label: '四分区 RGB', group: 'lighting',
    kind: 'bit', addr: 0xD00, bit: 4, enums: YES_NO,
  },
  {
    key: 'RgbKbRedLevel', label: 'RGB 键盘 R', group: 'lighting',
    kind: 'byte', addr: 0xD01, min: 0, max: 255,
  },
  {
    key: 'RgbKbGreenLevel', label: 'RGB 键盘 G', group: 'lighting',
    kind: 'byte', addr: 0xD02, min: 0, max: 255,
  },
  {
    key: 'RgbKbBlueLevel', label: 'RGB 键盘 B', group: 'lighting',
    kind: 'byte', addr: 0xD03, min: 0, max: 255,
  },
  {
    key: 'BL', label: '灯条背光', group: 'lighting',
    kind: 'bit', addr: 0xD00, bit: 3, enums: YES_NO,
  },
  {
    key: 'LbMode', label: '灯条模式', group: 'lighting',
    kind: 'enum', addr: 0xD20, enums: LBMODE,
  },

  // ============ 性能与电源 ============
  {
    key: 'AdpType', label: '适配器功率', group: 'power',
    kind: 'enum', addr: 0xD42, enums: ADPTYPE,
  },
  {
    key: 'TurboMode', label: '狂暴模式', group: 'power',
    kind: 'enum', addr: 0xD44, enums: TURBO_MODE,
    hint: '若关闭会导致官方控制台不显示狂暴模式',
  },
  {
    key: 'OCCapability', label: '超频能力', group: 'power',
    kind: 'enum', addr: 0xD48, enums: OCCAPABILITY,
    hint: '未知功能，不建议修改',
  },

  // ============ 显示 ============
  {
    key: 'DDSSupport', label: 'DDS 支持', group: 'display',
    kind: 'bit', addr: 0xD45, bit: 0, enums: YES_NO,
    hint: '此配置可能会导致电脑黑屏，谨慎修改',
  },
  {
    key: 'ColorCalibration', label: '色彩校准', group: 'display',
    kind: 'bit', addr: 0xD45, bit: 1, enums: YES_NO,
  },

  // ============ 独立显卡 ============
  {
    key: 'NdType', label: 'NVIDIA 驱动类型', group: 'gpu',
    kind: 'bit', addr: 0xD45, bit: 3, enums: ND_TYPE,
    hint: '作用未知。',
  },
  {
    key: 'DgpuCoreFrequencyOffset', label: '独显核心偏移', group: 'gpu',
    kind: 'byte', addr: 0xD4B, min: 0, max: 255,
    hint: '单位与作用未知，不建议修改。',
  },
  {
    key: 'DgpuVramFrequencyOffset', label: '独显显存偏移', group: 'gpu',
    kind: 'hex16', addr: 0xD4C,
    hint: '16 位小端；最高位为符号位（负值）。不建议修改。',
  },
  {
    key: 'DynamicBoost', label: '动态加速', group: 'gpu',
    kind: 'byte', addr: 0xD49, min: 0, max: 255,
    hint: 'DB 功耗，作用未知。',
  },

  // ============ 散热 ============
  {
    key: 'LiquidCooling', label: '水冷支持', group: 'cooling',
    kind: 'bit', addr: 0xD45, bit: 4, enums: YES_NO,
    hint: '可以使不支持水冷的机型上强行支持水冷（官方控制台）',
  },

  // ============ 音频 ============
  {
    key: 'AudioEffect', label: '音频效果', group: 'audio',
    kind: 'enum', addr: 0xD47, enums: AUDIOEFFECT,
    hint: '声卡品牌选择，修改后可能会导致声卡驱动异常',
  },
  {
    key: 'SpeakerType', label: '扬声器型号', group: 'audio',
    kind: 'enum', addr: 0xD46, enums: SPEAKERTYPE,
  },
  {
    key: 'SoundEffect', label: '音效字符串', group: 'audio',
    kind: 'ascii', addr: 0xD50, length: 16,
    hint: '16 字节十六进制文本，未知功能，谨慎修改。',
  },

  // ============ 区域 ============
  {
    key: 'ChinaMode', label: '中国区模式', group: 'region',
    kind: 'bit', addr: 0xD00, bit: 2, enums: YES_NO,
  },

  // ============ 其他 ============
  {
    key: 'D4EC', label: 'D4EC', group: 'misc',
    kind: 'bit', addr: 0xD45, bit: 2, enums: YES_NO,
    hint: '未知功能，不建议修改',
  },
  {
    key: 'QKeyID', label: 'Q 键 ID', group: 'misc',
    kind: 'byte', addr: 0xD4A, min: 0, max: 255,
    hint: '未知功能，不建议修改',
  },
];

// ---------------------------------------------------------------- 分组元信息

const GROUPS = [
  { id: 'identity', label: '机种标识', desc: '决定 EC 如何识别本机并匹配功耗策略' },
  { id: 'lighting', label: '灯效', desc: 'RGB 键盘的支持位、颜色分量与灯条模式' },
  { id: 'power',    label: '性能与电源', desc: '适配器功率、狂暴模式与超频能力' },
  { id: 'display',  label: '显示', desc: 'DDS 支持与色彩校准' },
  { id: 'gpu',      label: '独立显卡', desc: 'NVIDIA 驱动类型、频率偏移与 Dynamic Boost' },
  { id: 'cooling',  label: '散热', desc: '水冷支持' },
  { id: 'audio',    label: '音频', desc: '音频效果、扬声器型号与音效字符串' },
  { id: 'region',   label: '区域', desc: '中国区模式' },
  { id: 'misc',     label: '其他', desc: 'D4EC 与 Q 键 ID' },
];

// ---------------------------------------------------------------- 读取范围
//
// 一次把整块配置区读回来，再在本地解析。
// 144 字节 × 0.7ms ≈ 100ms，比逐字段读省得多。
const EC_CONFIG_BASE = 0xD00;
const EC_CONFIG_LEN = 0x90;   // 0xD00 ~ 0xD8F
const EC_ROMID_BASE = 0x770;
const EC_ROMID_LEN = 14;

// ---------------------------------------------------------------- 编解码

/** 从字节缓冲里读出一个字段的当前值（已按字段类型解码）。 */
function readField(field, buf, romIdBuf) {
  const off = (a) => a - EC_CONFIG_BASE;

  switch (field.kind) {
    case 'bit':
      return (buf[off(field.addr)] >> field.bit) & 1;

    case 'byte':
    case 'enum':
      return buf[off(field.addr)];

    case 'hex16': {
      const lo = buf[off(field.addr)] & 0xFF;
      const hi = buf[off(field.addr + 1)] & 0xFF;
      const neg = (hi & 0x80) !== 0;
      const mag = (hi & 0x7F) * 256 + lo;
      return neg ? -mag : mag;
    }

    case 'ascii': {
      let s = '';
      for (let i = 0; i < field.length; i++) {
        const b = buf[off(field.addr) + i];
        s += (b >= 32 && b < 127) ? String.fromCharCode(b) : ' ';
      }
      return s.replace(/\s+$/, '');
    }

    case 'raw': {
      // romID 位于 EC 0x770，不在配置区 0xD00 内，不能走 off() 换算。
      // 需要调用方额外传入 romIdBuf。
      if (field.addr === EC_ROMID_BASE) {
        if (!romIdBuf) return '';
        let s = '';
        for (let i = 0; i < field.length; i++) {
          const b = romIdBuf[i];
          if (typeof b !== 'number') return '';
          s += b.toString(16).toUpperCase().padStart(2, '0');
        }
        return s;
      }
      let s = '';
      for (let i = 0; i < field.length; i++) {
        const b = buf[off(field.addr) + i];
        if (typeof b !== 'number') return '';
        s += b.toString(16).toUpperCase().padStart(2, '0');
      }
      return s;
    }

    default:
      return null;
  }
}

/**
 * 把一个字段的新值编码进「待写入字节表」。
 * 返回记录该字段直接影响的字节地址列表（用于后续精确写入）。
 */
function encodeField(field, value, writeMap) {
  const touched = [];
  const set = (addr, v) => {
    writeMap[addr] = v & 0xFF;
    touched.push(addr);
  };

  switch (field.kind) {
    case 'bit': {
      const cur = writeMap[field.addr] !== undefined
        ? writeMap[field.addr]
        : field.__cur;
      const v = (cur & ~(1 << field.bit)) | ((value ? 1 : 0) << field.bit);
      set(field.addr, v);
      break;
    }

    case 'byte':
    case 'enum':
      set(field.addr, Number(value));
      break;

    case 'hex16': {
      const n = Number(value);
      const neg = n < 0;
      const mag = Math.abs(n);
      const lo = mag & 0xFF;
      let hi = (mag >> 8) & 0x7F;
      if (neg) hi |= 0x80;
      set(field.addr, lo);
      set(field.addr + 1, hi);
      break;
    }

    case 'ascii': {
      const s = String(value).slice(0, field.length).padEnd(field.length, '\0');
      for (let i = 0; i < field.length; i++) {
        const c = s.charCodeAt(i);
        set(field.addr + i, c === 0 ? 0xFF : (c & 0xFF));
      }
      break;
    }

    default:
      break;
  }

  return touched;
}

// ---------------------------------------------------------------- 便捷查询

function findField(key) {
  return FIELDS.find((f) => f.key === key) || null;
}

function fieldsOfGroup(groupId) {
  return FIELDS.filter((f) => f.group === groupId);
}

/** 所有会写入 0xD45 的位字段（写入时需要先读出该字节原值合并）。 */
const BITFIELD_ADDRS = [0xD00, 0xD45];


/* ---------- js/ec-raw.js ---------- */
/**
 * ec-raw.js — raw_ec 读写通道
 *
 * OpenRevo 宿主通过 Tauri 命令 raw_ec_read / raw_ec_write 直接读写 EC RAM。
 * 这些调用不经过 ECService、不加载任何驱动，因此：
 *   · 不需要管理员权限
 *   · 不受 Windows 驱动签名校验 / HVCI / CiPolicies 影响
 *   · 无进程 spawn 开销，单字节读约 0.7ms
 *
 * 参数形态（实机确认）：
 *   invoke('raw_ec_read',  { request: { protocol: { type: 'TongfangDirectEc' }, address } })
 *   invoke('raw_ec_write', { request: { protocol: { type: 'TongfangDirectEc' }, address, value } })
 *
 * EC 地址空间上限 0x0FFF（4 KB），越界会报
 * "Address out of physical bounds: 0x1000 exceeds 0x0FFF"。
 */


const PROTOCOL = { type: 'TongfangDirectEc' };

/** 拿到宿主注入的 invoke。插件在 iframe 里，必须走 window.parent。 */
function getInvoke() {
  const candidates = [];
  try { if (window.__TAURI_INTERNALS__) candidates.push(window.__TAURI_INTERNALS__); } catch (e) {}
  try {
    if (window.parent && window.parent !== window && window.parent.__TAURI_INTERNALS__) {
      candidates.push(window.parent.__TAURI_INTERNALS__);
    }
  } catch (e) {
    // 跨域时读父窗口会抛异常，忽略
  }
  for (const c of candidates) {
    if (c && typeof c.invoke === 'function') return c.invoke.bind(c);
  }
  return null;
}

class EcError extends Error {
  constructor(message, code, detail) {
    super(message);
    this.name = 'EcError';
    this.code = code || 'UNKNOWN';
    this.detail = detail || null;
  }
}

let _invoke = null;
function invokeOrThrow() {
  if (!_invoke) _invoke = getInvoke();
  if (!_invoke) {
    throw new EcError(
      '找不到 OpenRevo 的 EC 通信通道。请确认插件在 OpenRevo 内运行，并且宿主版本支持 raw_ec 接口。',
      'NO_BRIDGE'
    );
  }
  return _invoke;
}

/** 把宿主抛出的各种错误翻译成人话。 */
function translate(err, addr) {
  const raw = String(err && err.message ? err.message : err);

  if (/out of physical bounds/i.test(raw)) {
    return new EcError(
      `EC 地址 0x${addr.toString(16).toUpperCase()} 超出可访问范围（上限 0x0FFF）。`,
      'OUT_OF_BOUNDS', raw
    );
  }
  if (/参数不匹配|arguments? mismatch|invalid args/i.test(raw)) {
    return new EcError(
      '宿主 EC 接口参数不匹配，可能是 OpenRevo 版本过旧。',
      'BAD_ARGS', raw
    );
  }
  if (/not supported|unsupported|unavailable/i.test(raw)) {
    return new EcError(
      '当前机型不支持直接读写 EC（宿主未启用 TongfangDirectEc 协议）。',
      'UNSUPPORTED', raw
    );
  }
  return new EcError(raw, 'HOST_ERROR', raw);
}

/** 读一个 EC 地址（0~255）。 */
async function readByte(addr) {
  const inv = invokeOrThrow();
  let v;
  try {
    v = await inv('raw_ec_read', { request: { protocol: PROTOCOL, address: addr } });
  } catch (e) {
    throw translate(e, addr);
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new EcError(
      `读取 0x${addr.toString(16).toUpperCase()} 返回了非法值：${String(v)}`,
      'BAD_VALUE', String(v)
    );
  }
  return v & 0xFF;
}

/** 写一个 EC 地址。 */
async function writeByte(addr, value) {
  const inv = invokeOrThrow();
  try {
    await inv('raw_ec_write', {
      request: { protocol: PROTOCOL, address: addr, value: value & 0xFF },
    });
  } catch (e) {
    throw translate(e, addr);
  }
}

/**
 * 连续读一段 EC 内存。
 * 逐字节读，因为宿主只提供单字节接口；0.7ms/次，144 字节约 100ms。
 */
async function readRange(base, len, onProgress) {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = await readByte(base + i);
    if (onProgress && (i & 0x0F) === 0x0F) onProgress(i + 1, len);
  }
  if (onProgress) onProgress(len, len);
  return out;
}

/** 读整块 EC 配置区（0xD00 起 144 字节）。 */
async function readConfig(onProgress) {
  return readRange(EC_CONFIG_BASE, EC_CONFIG_LEN, onProgress);
}

/** 读 romID（0x770 起 14 字节）。 */
async function readRomId() {
  return readRange(EC_ROMID_BASE, EC_ROMID_LEN);
}

/**
 * 按地址表批量写入。
 * writeMap 形如 { 0xD49: 25, 0xD4A: 1 }。
 * 写完自动回读校验，返回每字节的 { addr, want, got, ok }。
 */
async function writeMapChecked(writeMap) {
  const addrs = Object.keys(writeMap).map(Number).sort((a, b) => a - b);

  for (const a of addrs) {
    await writeByte(a, writeMap[a]);
  }

  const results = [];
  for (const a of addrs) {
    const got = await readByte(a);
    results.push({ addr: a, want: writeMap[a] & 0xFF, got, ok: got === (writeMap[a] & 0xFF) });
  }
  return results;
}

/** 探测通道是否可用，返回 { ok, reason }。 */
async function probe() {
  try {
    const v = await readByte(EC_CONFIG_BASE);
    return { ok: true, version: null, sample: v };
  } catch (e) {
    return { ok: false, reason: e.message, code: e.code };
  }
}


/* ---------- js/ec-backup.js ---------- */
﻿/**
 * ec-backup.js — 备份管理（纯前端，localStorage）
 *
 * v1 依赖本地服务把备份写成 .ini 文件，v2 没有服务了，
 * 改为把「读到的原始 EC 配置区字节」序列化后存在浏览器 localStorage。
 * 好处：
 *   · 不需要任何权限，不需要文件系统访问
 *   · 备份的是真正的 EC 原始字节，恢复时逐字节写回，不丢任何位
 *   · 一个备份就是一个完整快照，不受字段增删影响
 *
 * 存储键：ec-config:backups  →  JSON 数组
 */

const STORAGE_KEY = 'ec-config:backups';
const MAX_BACKUPS = 20;

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function toHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).toUpperCase().padStart(2, '0');
  }
  return s;
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

/** 读全部备份（新到旧）。 */
function listBackups() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function saveAll(arr) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 新建备份。
 * @param {Uint8Array} configBytes  144 字节 EC 配置区原始值
 * @param {Uint8Array} romIdBytes   14 字节 romID
 * @param {string} name             用户起的名字
 * @param {object} parsed           解析后的字段值（便于列表展示摘要）
 */
function createBackup(configBytes, romIdBytes, name, parsed) {
  const list = listBackups();
  const label = String(name || '').trim() || `备份 ${nowStamp()}`;

  const entry = {
    id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: label.slice(0, 40),
    createdAt: Date.now(),
    config: toHex(configBytes),
    romId: romIdBytes ? toHex(romIdBytes) : '',
    summary: parsed || null,
  };

  list.unshift(entry);
  while (list.length > MAX_BACKUPS) list.pop();

  if (!saveAll(list)) {
    throw new Error('备份保存失败：浏览器存储空间不足，请先删除旧备份。');
  }
  return entry;
}

function deleteBackup(id) {
  const list = listBackups().filter((b) => b.id !== id);
  saveAll(list);
  return list;
}

/** 取回备份的字节。 */
function loadBackup(id) {
  const b = listBackups().find((x) => x.id === id);
  if (!b) return null;
  return {
    entry: b,
    config: fromHex(b.config),
    romId: b.romId ? fromHex(b.romId) : null,
  };
}

function clearAllBackups() {
  localStorage.removeItem(STORAGE_KEY);
}

/** 供界面展示：把创建时间格式化成「2026-05-20 14:32」。 */
function formatTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}


/* ---------- js/app.js ---------- */
﻿/**
 * app.js — UI 逻辑
 *
 * 架构（v2）：
 *   · 直接调用宿主 raw_ec_read / raw_ec_write，没有任何本地服务、没有 .exe、没有驱动
 *   · 读取 = 一次性把 0xD00~0xD8F 共 144 字节读回本地，再按 ec-schema 解析
 *   · 写入 = 只写「实际变化的字节」，写完立刻回读逐字节校验
 *   · 备份 = 完整原始字节快照，存在 localStorage
 */




// ================================================================ 状态

const state = {
  /** 上一次从 EC 读回的完整配置区原始字节 */
  baseline: null,
  /** romID 原始字节 */
  romId: null,
  /** 上次读取时间 */
  loadedAt: null,
  /** 当前界面上的待写入值 { key: value } */
  edits: {},
  /** 通道是否可用 */
  online: false,
  reading: false,
};

const $ = (id) => document.getElementById(id);

// ================================================================ 日志

/**
 * 日志分两层：
 *   · 界面日志（log-panel）：只放用户看得懂的关键节点
 *   · 诊断轨迹（traceLines）：每一步的细节，含十六进制、耗时、错误原文，
 *     供「生成诊断报告」导出。用户把报告发过来就能定位问题。
 */
const logLines = [];
const traceLines = [];
const SESSION_START = new Date();

function pad2(n) {
  return String(n).padStart(2, '0');
}

function hex(n, width) {
  return `0x${Number(n).toString(16).toUpperCase().padStart(width || 2, '0')}`;
}

function nowStamp() {
  const t = new Date();
  const ms = String(t.getMilliseconds()).padStart(3, '0');
  return `${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}.${ms}`;
}

/** 写一条诊断轨迹（不进界面）。 */
function trace(msg) {
  traceLines.push(`${nowStamp()} ${msg}`);
}

/** 写一条界面日志；同时记入诊断轨迹。level: info | ok | warn | error */
function log(msg, level) {
  const stamp = `[${nowStamp().slice(0, 8)}]`;
  logLines.push(`${stamp} ${msg}`);
  traceLines.push(`${nowStamp()} ${msg}`);

  const panel = $('log-panel');
  if (panel) {
    const line = document.createElement('div');
    line.className = 'ec-log-line' + (level ? ` ec-log-${level}` : '');
    line.textContent = `${stamp} ${msg}`;
    panel.appendChild(line);
    panel.scrollTop = panel.scrollHeight;
  }
  syncDiagLog();
}

/** 把轨迹同步到诊断面板的 <pre>。 */
function syncDiagLog() {
  const diag = $('diag-log');
  if (diag) {
    diag.textContent = traceLines.length
      ? traceLines.join('\n')
      : '运行记录会显示在这里。';
  }
}

// ================================================================ 通道检测

async function checkBridge() {
  const badge = $('bridge-status');
  badge.textContent = '正在检测 EC 通道…';
  badge.className = 'ec-agent-badge ec-offline';

  trace(`--- 通道探测开始 ---`);
  trace(`UA: ${navigator.userAgent}`);
  trace(`href=${location.href}  origin=${String(location.origin)}`);
  trace(`window.__TAURI_INTERNALS__=${typeof window.__TAURI_INTERNALS__}`);
  try {
    trace(`parent.__TAURI_INTERNALS__=${typeof (window.parent && window.parent.__TAURI_INTERNALS__)}`);
  } catch (e) {
    trace(`读父窗口失败: ${e && e.message}`);
  }

  const t0 = performance.now();
  const r = await probe();
  trace(`probe() ${Math.round(performance.now() - t0)}ms → ${JSON.stringify(r)}`);

  if (r.ok) {
    state.online = true;
    badge.textContent = 'EC 通道就绪';
    badge.className = 'ec-agent-badge ec-online';
    $('header-actions').hidden = false;
    $('unsupported-panel').hidden = true;
    log(`EC 通道就绪（0x${EC_CONFIG_BASE.toString(16).toUpperCase()} 采样值 ${hex(r.sample)}）。`, 'ok');
    return true;
  }

  state.online = false;
  badge.textContent = 'EC 通道不可用';
  badge.className = 'ec-agent-badge ec-offline';
  $('header-actions').hidden = true;

  const panel = $('unsupported-panel');
  panel.hidden = false;

  if (r.code === 'NO_BRIDGE') {
    $('unsupported-title').textContent = '不在 OpenRevo 内运行';
    $('unsupported-text').textContent =
      '本插件需要在 OpenRevo 中打开才能读写 EC。请从 OpenRevo 的插件页签进入本插件。';
  } else if (r.code === 'UNSUPPORTED') {
    $('unsupported-title').textContent = '本机不支持直接读写 EC';
    $('unsupported-text').textContent =
      '当前 OpenRevo 版本没有启用 TongfangDirectEc 协议，或本机不是 Uniwill / Tongfang 模具。' +
      '可能是宿主版本过旧，请更新到最新版 OpenRevo 后重试。';
  } else if (r.code === 'OUT_OF_BOUNDS') {
    $('unsupported-title').textContent = 'EC 地址不可访问';
    $('unsupported-text').textContent = r.reason;
  } else {
    $('unsupported-title').textContent = '无法读取 EC';
    $('unsupported-text').textContent = r.reason;
  }

  log(`EC 通道不可用：${r.reason}${r.code ? `（${r.code}）` : ''}`, 'error');
  return false;
}

// ================================================================ 读取

function prepareError(e) {
  if (e instanceof EcError) return e;
  const err = new EcError(e && e.message ? e.message
    : typeof e === 'string' ? e : '未知错误', 'ERROR');
  err.detail = e;
  return err;
}

async function doRead() {
  if (state.reading) return;          // 防重入：自动读取与手动点击可能同时触发
  if (!state.online) {
    const ok = await checkBridge();
    if (!ok) return;
  }

  state.reading = true;
  const btn = $('btn-dump');
  btn.disabled = true;
  btn.textContent = '读取中…';
  const t0 = performance.now();
  log(`开始从 EC 读取配置区（${hex(EC_CONFIG_BASE)}–${hex(EC_CONFIG_BASE + EC_CONFIG_LEN - 1)}，${EC_CONFIG_LEN} 字节）…`, 'info');
  trace(`readConfig: base=${hex(EC_CONFIG_BASE)} len=${EC_CONFIG_LEN} 单字节接口`);

  try {
    // 配置区：逐字节读，每读满 32 字节打一条进度轨迹
    const cfg = new Uint8Array(EC_CONFIG_LEN);
    for (let i = 0; i < EC_CONFIG_LEN; i++) {
      cfg[i] = await readByte(EC_CONFIG_BASE + i);
      const done = i + 1;
      if (done % 32 === 0 || done === EC_CONFIG_LEN) {
        // 本段起始下标 = 已读数量向上取整到 32 的块首
        const startIdx = Math.floor((done - 1) / 32) * 32;
        const from = EC_CONFIG_BASE + startIdx;
        const chunk = Array.from(cfg.slice(startIdx, done))
          .map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        trace(`  [${String(done).padStart(3, ' ')}/${EC_CONFIG_LEN}] 起 ${hex(from)}: ${chunk}`);
      }
    }
    const tCfg = Math.round(performance.now() - t0);
    trace(`配置区读取完成 ${tCfg}ms`);

    // romID：14 字节
    const rom = new Uint8Array(EC_ROMID_LEN);
    for (let i = 0; i < EC_ROMID_LEN; i++) rom[i] = await readByte(EC_ROMID_BASE + i);
    trace(`romID ${hex(EC_ROMID_BASE)} × ${EC_ROMID_LEN}: ${
      Array.from(rom).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`);

    state.baseline = cfg;
    state.romId = rom;
    state.loadedAt = Date.now();
    state.edits = {};

    // 把解析结果记进轨迹，出问题时能直接看到每个字段读到什么
    trace('--- 字段解析 ---');
    for (const f of FIELDS) {
      let v;
      try { v = readField(f, cfg, rom); } catch (e) { v = `<解析异常: ${e && e.message}>`; }
      trace(`  ${f.key.padEnd(24, ' ')} ${String(v).padEnd(20, ' ')} (${f.label})`);
    }

    const elapsed = Math.round(performance.now() - t0);
    log(`读取完成：${cfg.length} 字节配置 + ${rom.length} 字节 romID，用时 ${elapsed}ms。`, 'ok');

    $('dump-time').textContent = `读取于 ${formatTime(state.loadedAt)}`;
    $('main-workspace').hidden = false;
    $('shutdown-box').hidden = true;

    renderFields();
    renderDiff();
    renderBackups();
  } catch (raw) {
    const e = prepareError(raw);
    trace(`读取异常: code=${e.code} message=${e.message} detail=${JSON.stringify(e.detail)}`);
    log(`读取失败：${e.message}`, 'error');
    if (e.code === 'NO_BRIDGE' || e.code === 'UNSUPPORTED') {
      state.online = false;
      void checkBridge();
    }
  } finally {
    state.reading = false;
    btn.disabled = false;
    btn.textContent = '读取当前配置';
  }
}

// ================================================================ 渲染字段

function currentValue(field) {
  if (field.key in state.edits) return state.edits[field.key];
  if (!state.baseline) return null;
  // romID 不在配置区内，单独从 state.romId 取
  if (field.kind === 'raw') {
    return Array.from(state.romId || [])
      .map((b) => Number(b).toString(16).toUpperCase().padStart(2, '0'))
      .join('');
  }
  return readField(field, state.baseline, state.romId);
}

function renderFields() {
  const host = $('field-list');
  host.innerHTML = '';

  if (!state.baseline) return;

  for (const group of GROUPS) {
    const fields = fieldsOfGroup(group.id);
    if (!fields.length) continue;

    const section = document.createElement('div');
    section.className = 'ec-group';

    const title = document.createElement('div');
    title.className = 'ec-group-title';
    title.textContent = group.label;
    section.appendChild(title);

    for (const field of fields) {
      section.appendChild(renderField(field));
    }
    host.appendChild(section);
  }
}

function renderField(field) {
  const row = document.createElement('div');
  row.className = 'ec-field';
  row.dataset.key = field.key;

  const labelBox = document.createElement('div');
  labelBox.className = 'ec-field-label';

  const name = document.createElement('span');
  name.className = 'ec-field-name';
  name.textContent = field.label;

  const key = document.createElement('span');
  key.className = 'ec-field-key';
  key.textContent = field.key;

  labelBox.append(name, key);

  if (field.readOnly) {
    const tag = document.createElement('span');
    tag.className = 'ec-readonly-tag';
    tag.textContent = '只读';
    name.appendChild(tag);
  }

  const input = buildInput(field, field.readOnly);
  row.append(labelBox, input);

  if (field.hint) {
    const hint = document.createElement('div');
    hint.className = 'ec-field-hint';
    hint.textContent = field.hint;
    row.appendChild(hint);
  }

  return row;
}

function buildInput(field, readOnly) {
  const value = currentValue(field);

  // 允许自由输入的字段（如 ModelID）→ 纯数字输入框
  if (field.freeInput) {
    return buildFreeInput(field, value, readOnly);
  }

  // 有枚举定义的字段用下拉框（值 · 含义）
  if (field.enums && (field.kind === 'enum' || field.kind === 'bit')) {
    return buildEnumSelect(field, value, readOnly);
  }

  const input = document.createElement('input');
  input.className = 'ec-field-input';

  // ROM ID：14 字节，用空格分隔的十六进制，独占一行
  if (field.kind === 'raw') {
    input.classList.add('rom');
    input.value = formatRomId(value);
    input.placeholder = 'FF FF FF … (14 字节)';
    input.disabled = true;
    return input;
  }
  // 十六进制字符串（SoundEffect）
  if (field.kind === 'ascii') {
    input.value = value ?? '';
    input.type = 'text';
    input.placeholder = field.hint ?? '';
    input.disabled = readOnly;
    input.addEventListener('change', () => onEdit(field, input.value));
    return input;
  }

  input.value = value ?? '';
  input.type = 'number';
  if (field.min !== undefined) input.min = field.min;
  if (field.max !== undefined) input.max = field.max;
  input.disabled = readOnly;

  input.addEventListener('change', () => {
    const next = parseInt(input.value, 10);
    if (Number.isNaN(next)) {
      log(`${field.label}：不是合法整数，已还原`, 'warn');
      input.value = value ?? '';
      return;
    }
    onEdit(field, next);
  });

  return input;
}

/**
 * 为带枚举定义的字段生成下拉框。
 * 每个选项显示「值 · 含义」，避免用户凭数字猜含义而写错。
 * 若当前值不在枚举内，额外插入一个「当前值」选项，绝不擅自改写。
 */
function buildEnumSelect(field, value, readOnly) {
  const sel = document.createElement('select');
  sel.className = 'ec-field-input';

  const enums = field.enums;
  const known = Object.prototype.hasOwnProperty.call(enums, value);

  if (!known && value !== undefined && value !== null) {
    const o = document.createElement('option');
    o.value = String(value);
    o.textContent = `${value} · (未收录)`;
    sel.appendChild(o);
  }

  for (const [v, label] of Object.entries(enums)) {
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = `${v} · ${label}`;
    sel.appendChild(o);
  }

  sel.value = String(value ?? Object.keys(enums)[0]);
  sel.disabled = readOnly;
  sel.addEventListener('change', () => onEdit(field, parseInt(sel.value, 10)));
  return sel;
}

/**
 * 可自由输入的字段（如 ModelID）。
 * 纯数字输入框，不提供下拉建议；字段含义见下方 hint 说明。
 */
function buildFreeInput(field, value, readOnly) {
  const input = document.createElement('input');
  input.className = 'ec-field-input';
  input.type = 'number';
  input.min = field.min ?? 0;
  input.max = field.max ?? 255;
  input.value = value ?? '';
  input.disabled = readOnly;
  input.title = field.hint ?? '';

  input.addEventListener('change', () => {
    const next = parseInt(input.value, 10);
    if (Number.isNaN(next) || next < (field.min ?? 0) || next > (field.max ?? 255)) {
      log(`${field.label}：请输入 ${field.min ?? 0}~${field.max ?? 255} 的整数，已还原`, 'warn');
      input.value = value ?? '';
      return;
    }
    onEdit(field, next);
  });

  return input;
}

/** 把 "FFFFFFFF..." 格式化成 "0xFF 0xFF 0xFF ..." 形式，与 v1 一致。 */
function formatRomId(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/[\s,]/g, '');
  const pairs = s.match(/../g) || [];
  return pairs.map((p) => '0x' + p.toUpperCase()).join(' ');
}

function onEdit(field, rawValue) {
  const orig = state.baseline ? readField(field, state.baseline, state.romId) : null;
  let v;

  if (field.kind === 'ascii') {
    v = String(rawValue);
  } else if (field.kind === 'hex16') {
    v = Number(rawValue);
    if (!Number.isFinite(v)) v = 0;
  } else {
    v = Number(rawValue);
    if (!Number.isFinite(v)) v = 0;
  }

  if (v === orig || (field.kind !== 'ascii' && Number(v) === Number(orig))) {
    delete state.edits[field.key];
  } else {
    state.edits[field.key] = v;
  }

  renderFields();
  renderDiff();
}

function isChanged(field) {
  return field.key in state.edits;
}

// ================================================================ 差异计算

function computePlan() {
  if (!state.baseline) return { writeMap: {}, changes: [] };

  const writeMap = {};
  const changes = [];

  for (const field of FIELDS) {
    if (!(field.key in state.edits)) continue;
    if (field.readOnly) continue;

    // 位字段需要以「当前 EC 原值」为底合并，否则会抹掉同字节的其它位
    field.__cur = state.baseline[field.addr - EC_CONFIG_BASE];

    const before = readField(field, state.baseline, state.romId);
    const after = state.edits[field.key];
    encodeField(field, after, writeMap);

    changes.push({ field, before, after });
  }

  return { writeMap, changes };
}

function renderDiff() {
  const host = $('diff-panel');
  host.innerHTML = '';

  const { writeMap, changes } = computePlan();

  $('diff-count').textContent = changes.length ? `${changes.length} 项变更` : '无变更';

  if (!changes.length) {
    host.innerHTML = '<div class="ec-empty"><p class="ec-muted">修改左侧任意配置项后，这里将显示将要改变的字段。</p></div>';
  } else {
    for (const c of changes) {
      const item = document.createElement('div');
      item.className = 'ec-diff-item';

      const label = document.createElement('span');
      label.className = 'ec-field-name';
      label.textContent = c.field.label + (c.field.readOnly ? '（只读）' : '');

      const arrow = document.createElement('span');
      arrow.className = 'ec-diff-arrow';
      arrow.innerHTML =
        `<span class="ec-diff-from">${escapeHtml(displayValue(c.field, c.before))}</span>` +
        ` → <span class="ec-diff-to">${escapeHtml(displayValue(c.field, c.after))}</span>`;

      item.append(label, arrow);
      host.appendChild(item);
    }
  }

  // 标记脏字段（与 v1 一致的 .dirty 高亮）
  for (const row of document.querySelectorAll('.ec-field')) {
    const key = row.dataset.key;
    const changed = key in state.edits;
    row.classList.toggle('dirty', changed);
  }

  syncButtons();
}

function displayValue(field, v) {
  if (v === null || v === undefined) return 'N/A';
  if (Array.isArray(v)) {
    return v.map((b) => Number(b).toString(16).toUpperCase().padStart(2, '0')).join(' ');
  }
  return String(v);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** 备份区沿用的短别名，与 v1 保持一致 */
const esc = escapeHtml;

// ================================================================ 按钮态

function syncButtons() {
  const { changes } = state.baseline ? computePlan() : { changes: [] };
  const busy = state.busy === true;

  $('btn-apply').disabled = busy || changes.length === 0;
  $('btn-apply').textContent = busy
    ? '写入中…'
    : `应用变更${changes.length ? ` (${changes.length})` : ''}`;
  $('btn-dump').disabled = busy;
  $('btn-create-backup').disabled = busy || !state.baseline;
}

// ================================================================ 写入

async function doApply() {
  const { writeMap, changes } = computePlan();
  if (!changes.length) return;

  const byteCount = Object.keys(writeMap).length;
  $('confirm-count').textContent = String(changes.length);
  $('confirm-commands').textContent = Object.keys(writeMap)
    .sort((a, b) => a - b)
    .map((a) => `0x${Number(a).toString(16).toUpperCase()} ← 0x${
      (writeMap[a] & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`)
    .join('\n');
  $('confirm-ack').checked = false;
  $('btn-confirm-ok').disabled = true;

  const dlg = $('confirm-dialog');
  dlg.showModal();

  const ok = await new Promise((resolve) => {
    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      resolve(dlg.returnValue === 'confirm');
    };
    dlg.addEventListener('close', onClose);
  });

  if (!ok) {
    log('已取消写入。');
    return;
  }

  const btn = $('btn-apply');
  btn.disabled = true;
  btn.textContent = '写入中…';
  log(`开始写入 ${byteCount} 个字节…`);

  try {
    const results = await writeMapChecked(writeMap);
    const bad = results.filter((r) => !r.ok);

    if (bad.length) {
      for (const b of bad) {
        log(`校验失败 0x${b.addr.toString(16).toUpperCase()}：` +
            `期望 0x${b.want.toString(16).toUpperCase()}，` +
            `实际 0x${b.got.toString(16).toUpperCase()}`, 'error');
      }
      log(`写入后回读校验失败（${bad.length}/${results.length} 字节不一致）。`, 'error');
    } else {
      log(`写入成功，${results.length} 个字节全部回读校验通过。`, 'ok');
      $('shutdown-box').hidden = false;
    }

    // 重新读一次刷新基线
    const cfg = await readConfig();
    state.baseline = cfg;
    state.edits = {};
    renderFields();
    renderDiff();
    renderBackups();
  } catch (raw) {
    log(`写入失败：${prepareError(raw).message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '应用变更';
  }
}

// ================================================================ 备份

function renderBackups() {
  const list = $('backup-list');
  const badge = $('backup-status');
  const items = listBackups();

  if (!items.length) {
    list.innerHTML =
      '<div class="ec-backup-empty">尚未备份。建议在进行任何修改前先创建一份备份。</div>';
    badge.textContent = '尚未备份';
    badge.className = 'ec-backup-badge ec-backup-none';
    return;
  }

  badge.textContent = `已备份 ${items.length} 份`;
  badge.className = 'ec-backup-badge ec-backup-has';

  list.innerHTML = '';
  for (const b of items) {
    const row = document.createElement('div');
    row.className = 'ec-backup-item';

    const info = document.createElement('div');
    info.className = 'ec-backup-info';
    info.innerHTML = `<div class="ec-backup-name">${esc(b.name)}</div>` +
                     `<div class="ec-backup-time">${formatTime(b.createdAt)}</div>`;

    const acts = document.createElement('div');
    acts.className = 'ec-backup-acts';

    const btnLoad = document.createElement('button');
    btnLoad.className = 'ec-btn ec-btn-sm';
    btnLoad.textContent = '恢复';
    btnLoad.addEventListener('click', () => restoreBackup(b.id));

    const btnDel = document.createElement('button');
    btnDel.className = 'ec-btn ec-btn-sm ec-btn-ghost';
    btnDel.textContent = '删除';
    btnDel.addEventListener('click', async () => {
      const yes = await askConfirm('删除备份', `确定删除备份「${esc(b.name)}」吗？此操作不可撤销。`);
      if (!yes) return;
      deleteBackup(b.id);
      renderBackups();
      log(`已删除备份「${b.name}」。`);
    });

    acts.appendChild(btnLoad);
    acts.appendChild(btnDel);

    row.appendChild(info);
    row.appendChild(acts);
    list.appendChild(row);
  }
}

async function restoreBackup(id) {
  const b = loadBackup(id);
  if (!b) {
    log('备份不存在。', 'error');
    return;
  }

  const yes = await askConfirm(
    '恢复备份',
    `将把备份「${esc(b.entry.name)}」的 ${b.config.length} 个字节完整写回 EC。` +
    `这会覆盖当前所有配置项，写入后需要关机再开机才生效。`
  );
  if (!yes) return;

  const writeMap = {};
  for (let i = 0; i < b.config.length; i++) {
    writeMap[EC_CONFIG_BASE + i] = b.config[i];
  }

  log(`开始恢复备份「${b.entry.name}」…`);
  try {
    const results = await writeMapChecked(writeMap);
    const bad = results.filter((r) => !r.ok);
    if (bad.length) {
      log(`恢复后校验失败（${bad.length}/${results.length} 字节不一致）。`, 'error');
    } else {
      log('备份恢复完成，全部字节回读校验通过。', 'ok');
      $('shutdown-box').hidden = false;
    }
    const cfg = await readConfig();
    state.baseline = cfg;
    state.edits = {};
    renderFields();
    renderDiff();
  } catch (raw) {
    log(`恢复失败：${prepareError(raw).message}`, 'error');
  }
}

function doCreateBackup() {
  if (!state.baseline) {
    log('请先读取当前配置再创建备份。', 'warn');
    return;
  }
  const name = $('backup-name').value;
  try {
    const entry = createBackup(state.baseline, state.romId, name, null);
    $('backup-name').value = '';
    renderBackups();
    log(`已创建备份「${entry.name}」。`, 'ok');
  } catch (e) {
    log(`创建备份失败：${e.message}`, 'error');
  }
}

// ================================================================ 对话框

function askConfirm(title, htmlBody) {
  return new Promise((resolve) => {
    $('ask-title').textContent = title;
    $('ask-body').innerHTML = htmlBody;
    const dlg = $('ask-dialog');
    dlg.returnValue = '';
    dlg.showModal();
    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      resolve(dlg.returnValue === 'confirm');
    };
    dlg.addEventListener('close', onClose);
  });
}

// ================================================================ 绑定

function bind() {
  $('btn-dump').addEventListener('click', doRead);
  $('btn-retry').addEventListener('click', () => { void checkBridge(); });
  $('btn-apply').addEventListener('click', doApply);
  $('btn-create-backup').addEventListener('click', doCreateBackup);

  $('confirm-ack').addEventListener('change', (e) => {
    $('btn-confirm-ok').disabled = !e.target.checked;
  });

  $('btn-diag-copy').addEventListener('click', async () => {
    let txt;
    try {
      txt = buildReport();
    } catch (e) {
      txt = `=== 报告生成失败 ===\n${e && e.message}\n\n${traceLines.join('\n')}`;
    }
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error('clipboard api unavailable');
      }
      await navigator.clipboard.writeText(txt);
      $('diag-status').textContent = `已复制 ${txt.length} 字符`;
      return;
    } catch (e) {
      // 沙盒 iframe 里 clipboard API 常被禁用，退回到「显示文本框让用户手动全选」
      trace(`复制失败: ${e && e.message}，切换到手动选择模式`);
      showReportBox(txt, '复制受限，请点文本框后 Ctrl+A、Ctrl+C');
    }
  });

  $('btn-shutdown').addEventListener('click', handleShutdown);
}

let PLUGIN_VERSION = '1.0.0';

/** 把报告正文显示在诊断面板里，供用户手动复制。 */
function showReportBox(text, hint) {
  const box = $('report-box');
  if (box) {
    box.value = text;
    box.hidden = false;
    try {
      box.focus();
      box.select();
    } catch (e) {
      // 某些 WebView 在隐藏切换的同一帧里 focus/select 会抛错，忽略即可
    }
  }
  const diag = $('diag-log');
  if (diag) diag.textContent = text;
  const st = $('diag-status');
  if (st) st.textContent = hint;
  // 展开诊断面板，让用户一定能看到内容
  const details = $('diag-box');
  if (details) details.open = true;
}

/** 组装诊断报告全文（脱敏：不含任何用户隐私数据，只有 EC 原始字节与技术状态）。 */
function buildReport() {
  // 报告生成绝不能因为某个子步骤出错而整体失败，否则用户拿不到任何东西
  try {
    return buildReportInner();
  } catch (e) {
    const fallback = [
      '=== EC配置刷写插件 v2 诊断报告（降级模式）===',
      `生成时间: ${new Date().toString()}`,
      `组装报告时出错: ${e && e.message}`,
      `堆栈: ${e && e.stack}`,
      '',
      '--- 界面日志 ---',
      logLines.length ? logLines.join('\n') : '(空)',
      '',
      '--- 诊断轨迹 ---',
      traceLines.length ? traceLines.join('\n') : '(空)',
      '',
      '=== 报告结束 ===',
    ].join('\n');
    return fallback;
  }
}

function buildReportInner() {
  const lines = [];
  lines.push('=== EC配置刷写插件 v2 诊断报告 ===');
  lines.push(`生成时间: ${new Date().toString()}`);
  lines.push(`会话开始: ${SESSION_START.toString()}`);
  lines.push(`插件版本: ${PLUGIN_VERSION}`);
  lines.push('');
  lines.push('--- 运行环境 ---');
  lines.push(`URL: ${location.href}`);
  lines.push(`Origin: ${String(location.origin)}`);
  lines.push(`平台: ${navigator.platform || 'n/a'}`);
  lines.push(`语言: ${navigator.language}`);
  lines.push(`UA: ${navigator.userAgent}`);
  lines.push('');
  lines.push('--- 状态 ---');
  lines.push(`通道可用: ${state.online}`);
  lines.push(`读取中: ${state.reading}`);
  lines.push(`已读取: ${state.loadedAt ? formatTime(state.loadedAt) : '否'}`);
  lines.push(`基线字节数: ${state.baseline ? state.baseline.length : 0}`);
  lines.push(`romID 字节数: ${state.romId ? state.romId.length : 0}`);
  lines.push(`待写入字段数: ${Object.keys(state.edits || {}).length}`);

  if (state.baseline) {
    lines.push('');
    lines.push(`--- 当前配置区原始字节 (${hex(EC_CONFIG_BASE)} 起 ${state.baseline.length} 字节) ---`);
    for (let i = 0; i < state.baseline.length; i += 16) {
      const row = Array.from(state.baseline.slice(i, i + 16))
        .map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
      lines.push(`${hex(EC_CONFIG_BASE + i, 3)}: ${row}`);
    }
    lines.push('');
    lines.push('--- 字段解析结果 ---');
    for (const f of FIELDS) {
      let v;
      try { v = readField(f, state.baseline, state.romId); } catch (e) { v = `<异常: ${e && e.message}>`; }
      lines.push(`${f.key} = ${v}   (${f.label})`);
    }
  }

  if (state.romId) {
    lines.push('');
    lines.push(`--- romID (${hex(EC_ROMID_BASE)}) ---`);
    lines.push(Array.from(state.romId)
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
  }

  const backups = listBackups();
  lines.push('');
  lines.push(`--- 备份 ---`);
  lines.push(`共 ${backups.length} 份`);

  lines.push('');
  lines.push('--- 界面日志 ---');
  lines.push(logLines.length ? logLines.join('\n') : '(空)');

  lines.push('');
  lines.push('--- 诊断轨迹（含每一步细节）---');
  lines.push(traceLines.length ? traceLines.join('\n') : '(空)');

  lines.push('');
  lines.push('=== 报告结束 ===');
  return lines.join('\n');
}

/**
 * 关机。
 * 宿主只提供「重启」（shutdown.exe /r，热复位不会重新初始化 EC），
 * 因此这里通过插件自带的极简伴随服务（shutdown_helper.exe，127.0.0.1:18946）
 * 执行真正的 shutdown.exe /s /f /t 0。
 */
const SHUTDOWN_BASE = 'http://127.0.0.1:18946';

async function shutdownFetch(path, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 4000);
  try {
    const res = await fetch(SHUTDOWN_BASE + path, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function handleShutdown() {
  const ok = await askConfirm(
    '关机',
    '将会关闭本机。请等机器完全断电后，再手动按电源键开机 —— EC 固件需要一次完整的加电自检才会应用新配置。\n\n'
    + '用系统的「重启」不算生效。',
  );
  if (!ok) return;

  const btn = $('btn-shutdown');
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '正在关机…';

  try {
    const n = await shutdownFetch('/api/nonce', 3000);
    if (!n || !n.nonce) throw new Error('未取到授权码');
    await shutdownFetch('/api/shutdown?nonce=' + encodeURIComponent(n.nonce), 3000);
    log('已向系统发出关机指令，机器将在数秒内断电。请等完全断电后再开机。', 'ok');
    $('diag-status').textContent = '正在关机…';
  } catch (err) {
    btn.disabled = false;
    btn.textContent = oldText;
    const reason = err && err.name === 'AbortError' ? '关机服务无响应' : (err && err.message) || '未知错误';
    log('关机失败：' + reason + '。请手动关机：开始菜单 → 电源 → 关机。', 'err');
    $('diag-status').textContent = '关机失败';
    $('shutdown-box').hidden = false;
  }
}

// ================================================================ 启动

async function main() {
  bind();
  renderBackups();
  const ok = await checkBridge();
  if (ok) {
    // 通道就绪后自动读取一次，省掉用户点「读取当前配置」这一步。
    // 用 setTimeout 让首帧先渲染出来，避免用户看到一片空白。
    setTimeout(() => { void doRead(); }, 0);
  }
}

main();


})();