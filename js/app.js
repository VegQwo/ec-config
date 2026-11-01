/**
 * app.js — UI 逻辑
 *
 * 架构（v2）：
 *   · 直接调用宿主 raw_ec_read / raw_ec_write，没有任何本地服务、没有 .exe、没有驱动
 *   · 读取 = 一次性把 0xD00~0xD8F 共 144 字节读回本地，再按 ec-schema 解析
 *   · 写入 = 只写「实际变化的字节」，写完立刻回读逐字节校验
 *   · 备份 = 完整原始字节快照，存在 localStorage
 */

import {
  FIELDS, GROUPS, EC_CONFIG_BASE, EC_CONFIG_LEN, EC_ROMID_BASE, EC_ROMID_LEN,
  readField, encodeField, findField, fieldsOfGroup,
} from './ec-schema.js';
import {
  EcError, readConfig, readRomId, writeMapChecked, probe, readByte,
} from './ec-raw.js';
import {
  listBackups, createBackup, deleteBackup, loadBackup, formatTime,
} from './ec-backup.js';

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
