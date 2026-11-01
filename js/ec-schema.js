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

export const ADPTYPE = {
  0: '330W', 1: '230W', 2: '180W', 3: '150W', 4: '120W',
  5: '90W', 6: '65W', 7: '40W', 8: '280W',
};

export const MODELID = {
  0: 'IDR', 1: 'IDX', 2: 'IDV', 3: 'IDO', 4: 'IDP',
  5: 'IDS', 6: 'IDY', 7: 'IDW', 8: 'IDM', 9: 'IDE', 10: 'IDN',
};

export const NBTYPE = {
  1: 'NOTEBOOK_STANDARD',
  2: 'NOTEBOOK_COMMERCIAL',
  33: 'Table33', 34: 'Table34', 35: 'Table35', 36: 'Table36',
};

export const LBMODE = {
  0: '关闭', 1: '欢迎', 2: '白色', 3: '红色', 254: '自定义', 255: '未设置',
};

export const SPEAKERTYPE = { 0: '2412', 1: '1340', 2: '1133', 3: '3209' };

export const AUDIOEFFECT = { 0: 'THX', 1: 'Sound Blaster', 2: 'Nahimic' };

export const OCCAPABILITY = {
  0: '软件超频（SW OC）',
  1: '硬件超频（HW OC）',
  2: '硬件超频（HW OC）',
  3: '硬件超频（HW OC）',
  255: '不支持',
};

export const ND_TYPE = { 0: 'Game Ready', 1: 'Studio' };

export const TURBO_MODE = { 0: '关闭', 1: '开启' };

export const ON_OFF = { 0: '关闭', 1: '开启' };

export const YES_NO = { 0: '不支持', 1: '支持' };

// ---------------------------------------------------------------- 字段定义
//
// 分组顺序与界面展示顺序一致。
// readOnly = true 的字段只展示不可写。

export const FIELDS = [
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

export const GROUPS = [
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
export const EC_CONFIG_BASE = 0xD00;
export const EC_CONFIG_LEN = 0x90;   // 0xD00 ~ 0xD8F
export const EC_ROMID_BASE = 0x770;
export const EC_ROMID_LEN = 14;

// ---------------------------------------------------------------- 编解码

/** 从字节缓冲里读出一个字段的当前值（已按字段类型解码）。 */
export function readField(field, buf, romIdBuf) {
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
export function encodeField(field, value, writeMap) {
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

export function findField(key) {
  return FIELDS.find((f) => f.key === key) || null;
}

export function fieldsOfGroup(groupId) {
  return FIELDS.filter((f) => f.group === groupId);
}

/** 所有会写入 0xD45 的位字段（写入时需要先读出该字节原值合并）。 */
export const BITFIELD_ADDRS = [0xD00, 0xD45];
