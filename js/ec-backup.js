/**
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
export function listBackups() {
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
export function createBackup(configBytes, romIdBytes, name, parsed) {
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

export function deleteBackup(id) {
  const list = listBackups().filter((b) => b.id !== id);
  saveAll(list);
  return list;
}

/** 取回备份的字节。 */
export function loadBackup(id) {
  const b = listBackups().find((x) => x.id === id);
  if (!b) return null;
  return {
    entry: b,
    config: fromHex(b.config),
    romId: b.romId ? fromHex(b.romId) : null,
  };
}

export function clearAllBackups() {
  localStorage.removeItem(STORAGE_KEY);
}

/** 供界面展示：把创建时间格式化成「2026-05-20 14:32」。 */
export function formatTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
