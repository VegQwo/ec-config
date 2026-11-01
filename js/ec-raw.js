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

import { EC_CONFIG_BASE, EC_CONFIG_LEN, EC_ROMID_BASE, EC_ROMID_LEN } from './ec-schema.js';

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

export class EcError extends Error {
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
export async function readByte(addr) {
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
export async function writeByte(addr, value) {
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
export async function readRange(base, len, onProgress) {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = await readByte(base + i);
    if (onProgress && (i & 0x0F) === 0x0F) onProgress(i + 1, len);
  }
  if (onProgress) onProgress(len, len);
  return out;
}

/** 读整块 EC 配置区（0xD00 起 144 字节）。 */
export async function readConfig(onProgress) {
  return readRange(EC_CONFIG_BASE, EC_CONFIG_LEN, onProgress);
}

/** 读 romID（0x770 起 14 字节）。 */
export async function readRomId() {
  return readRange(EC_ROMID_BASE, EC_ROMID_LEN);
}

/**
 * 按地址表批量写入。
 * writeMap 形如 { 0xD49: 25, 0xD4A: 1 }。
 * 写完自动回读校验，返回每字节的 { addr, want, got, ok }。
 */
export async function writeMapChecked(writeMap) {
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
export async function probe() {
  try {
    const v = await readByte(EC_CONFIG_BASE);
    return { ok: true, version: null, sample: v };
  } catch (e) {
    return { ok: false, reason: e.message, code: e.code };
  }
}
