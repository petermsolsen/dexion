// ────────────────────────────────────────────────────
//  ADF PARSER
// ────────────────────────────────────────────────────
const ADF = {
  SECTOR_SIZE: 512,

  // ── Disk geometry — set dynamically by detectAndApplyFormat() ───────────────
  TRACKS: 80,
  SIDES: 2,
  SECTORS_PER_TRACK: 11,     // 11 = DD, 22 = HD
  get TOTAL_SECTORS() { return this.TRACKS * this.SIDES * this.SECTORS_PER_TRACK; },
  get DISK_SIZE()     { return this.TOTAL_SECTORS * this.SECTOR_SIZE; },
  get ROOT_BLOCK()    { return Math.floor(this.TOTAL_SECTORS / 2); },  // 880 DD / 1760 HD

  // ── Disk/filesystem type — set by detectAndApplyFormat() ────────────────────
  DISK_TYPE: 'DD',           // 'DD' | 'HD'
  FS_KIND:   'OFS',          // human-readable identifier
  IS_ADOS:   true,           // true = AmigaDOS (OFS/FFS variants), false = PFS/SFS/Unknown
  IS_FFS:    false,          // fast file system flag (no OFS data-block header)
  HAS_INTL:  false,          // international mode
  HAS_DC:    false,          // directory cache

  // ── Block type constants ─────────────────────────────────────────────────────
  T_HEADER:  2,   // root / dir / file header
  T_DATA:    8,   // OFS data block
  T_LIST:    16,  // extension block
  T_DIRDISK: 33,  // directory-cache block

  ST_ROOT:     1,
  ST_DIR:      2,
  ST_FILE:    -3,
  ST_SOFTLINK: 3,
  ST_HARDLINK:-4,
};



// ────────────────────────────────────────────────────
// PERF: POPCOUNT LOOKUP (0..255) for bitmap analysis
// ────────────────────────────────────────────────────
const POPCOUNT8 = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let v = i, c = 0;
    while (v) { v &= (v - 1); c++; }
    t[i] = c;
  }
  return t;
})();
// ────────────────────────────────────────────────────
//  FORMAT & GEOMETRY DETECTION
// ────────────────────────────────────────────────────

const KNOWN_SIZES = {
  901120:  { tracks:80, sides:2, spt:11, type:'DD' },
  1802240: { tracks:80, sides:2, spt:22, type:'HD' },
};

function detectFsKind(data) {
  const id = String.fromCharCode(data[0], data[1], data[2]);
  const fl = data[3];

  if (id === 'DOS') {
    const v    = fl & 0x07;
    const ffs  = !!(v & 1);
    const intl = !!(v & 2) || !!(v & 4); // DC (bit2) implies INTL
    const dc   = !!(v & 4);
    const base = ffs ? 'FFS' : 'OFS';
    let name   = base;
    if (intl) name += '+Intl';
    if (dc)   name += '+DC';
    return { kind: name, isAdos: true, isFfs: ffs, hasIntl: intl, hasDc: dc };
  }

  if (id === 'PFS') {
    // fl: 1=PFS1, 2=PFS2, 3=PFS3; 0x10 bit = DirCache variant
    const dc   = !!(fl & 0x10);
    const ver  = fl & 0x0F;
    const name = (ver === 2 ? 'PFS2' : ver === 3 ? 'PFS3' : 'PFS1') + (dc ? '+DC' : '');
    return { kind: name, isAdos: false, isFfs: false, hasIntl: false, hasDc: dc };
  }

  if (id === 'PDS') {
    // 'PDS\x00' = PFS3 (Professional Directory Scan)
    return { kind: 'PFS3', isAdos: false, isFfs: false, hasIntl: false, hasDc: false };
  }

  if (id === 'SFS') {
    const name = fl === 0 ? 'SFS' : fl === 1 ? 'SFS2' : `SFS-v${fl}`;
    return { kind: name, isAdos: false, isFfs: false, hasIntl: false, hasDc: false };
  }

  return {
    kind: `Unknown(${id}\\x${fl.toString(16).padStart(2,'0')})`,
    isAdos: false, isFfs: false, hasIntl: false, hasDc: false
  };
}

function detectAndApplyFormat(buf) {
  const geo = KNOWN_SIZES[buf.byteLength];
  if (geo) {
    ADF.TRACKS = geo.tracks; ADF.SIDES = geo.sides;
    ADF.SECTORS_PER_TRACK = geo.spt; ADF.DISK_TYPE = geo.type;
  } else {
    ADF.TRACKS = 80; ADF.SIDES = 2;
    ADF.SECTORS_PER_TRACK = buf.byteLength >= 1500000 ? 22 : 11;
    ADF.DISK_TYPE = ADF.SECTORS_PER_TRACK === 22 ? 'HD' : 'DD';
  }
  const data = new Uint8Array(buf);
  const fs = detectFsKind(data);
  ADF.FS_KIND = fs.kind; ADF.IS_ADOS = fs.isAdos;
  ADF.IS_FFS = fs.isFfs; ADF.HAS_INTL = fs.hasIntl; ADF.HAS_DC = fs.hasDc;
}

function readPfsVolumeName() {
  try {
    const base = 2 * ADF.SECTOR_SIZE;
    let len = diskView.getUint8(base + 40);
    if (len > 0 && len < 32) {
      let s = '';
      for (let i = 0; i < len; i++) {
        const c = diskView.getUint8(base + 41 + i);
        if (c < 32 || c > 126) { s = ''; break; }
        s += String.fromCharCode(c);
      }
      if (s.length > 0) return s;
    }
    let s2 = '';
    for (let i = 0; i < 31; i++) {
      const c = diskView.getUint8(base + 8 + i);
      if (!c) break;
      if (c < 32 || c > 126) { s2 = ''; break; }
      s2 += String.fromCharCode(c);
    }
    if (s2.length > 1) return s2;
  } catch(e) {}
  return '(unnamed)';
}

function readSfsVolumeName() {
  try {
    const base = 2 * ADF.SECTOR_SIZE;
    let s = '';
    for (let i = 0; i < 63; i++) {
      const c = diskView.getUint8(base + 32 + i);
      if (!c) break;
      if (c < 32 || c > 126) { s = ''; break; }
      s += String.fromCharCode(c);
    }
    if (s.length > 1) return s;
  } catch(e) {}
  return '(unnamed)';
}

let diskData = null;
let diskView = null;
let currentSector = 0;
let sectorTypes = []; // array of type strings per sector
let blockChecksumValid = {}; // sector -> bool, only set for non-free blocks
let activeChain = []; // sectors currently highlighted as a chain
let currentFileChain = []; // sector list for file chain navigation
let currentFileChainIndex = -1; // current position within currentFileChain
let loadedAllEntries = []; // global reference to all parsed directory entries

function u8(sector, offset) {
  return diskView.getUint8(sector * ADF.SECTOR_SIZE + offset);
}
function u16be(sector, offset) {
  return diskView.getUint16(sector * ADF.SECTOR_SIZE + offset, false);
}
function u32be(sector, offset) {
  return diskView.getUint32(sector * ADF.SECTOR_SIZE + offset, false);
}
function i32be(sector, offset) {
  return diskView.getInt32(sector * ADF.SECTOR_SIZE + offset, false);
}
function readStr(sector, offset, len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = u8(sector, offset + i);
    if (!c) break;
    s += String.fromCharCode(c);
  }
  return s;
}
function bcplStr(sector, offset) {
  // Bug fix: clamp length to prevent reading past sector boundary
  const maxLen = Math.max(0, ADF.SECTOR_SIZE - offset - 1);
  const len = Math.min(u8(sector, offset), maxLen, 108); // Amiga names ≤ 108 chars
  return readStr(sector, offset + 1, len);
}

function calcBootChecksum(data) {
  // Amiga boot block checksum: blank checksum word at offset 4-7, sum all 32-bit
  // words with 32-bit addition + carry, return one's complement of sum.
  let sum = 0;
  const limit = Math.min(1024, data.length - 3);
  for (let i = 0; i < limit; i += 4) {
    if (i === 4) continue; // checksum field is blanked (treated as 0)
    const v = ((data[i] << 24) | (data[i+1] << 16) | (data[i+2] << 8) | data[i+3]) >>> 0;
    const old = sum;
    sum = (sum + v) >>> 0;
    if (sum < old) sum = (sum + 1) >>> 0; // add carry on 32-bit overflow
  }
  return (~sum) >>> 0;
}

function blockChecksum(sector) {
  let sum = 0;
  const base = sector * ADF.SECTOR_SIZE;
  for (let i = 0; i < ADF.SECTOR_SIZE; i += 4) {
    const v = diskView.getUint32(base + i, false);
    sum = (sum + v) >>> 0;
  }
  return sum === 0;
}

function computeAllChecksums() {
  blockChecksumValid = {};
  if (!ADF.IS_ADOS) return; // PFS/SFS use different checksum schemes
  for (let s = 2; s < ADF.TOTAL_SECTORS; s++) {
    const type = sectorTypes[s];
    if (!type || type === 'free') continue;
    if (type === 'data') {
      // In OFS, data blocks have T_DATA (8); in FFS, data blocks have no header — skip them.
      const t = diskView.getInt32(s * ADF.SECTOR_SIZE, false);
      if (ADF.IS_FFS) continue; // FFS raw data has no checksum
      if (t !== ADF.T_DATA) continue; // OFS: only validate recognised data blocks
    }
    // file/dir-block/root/bitmap/dircache/ext blocks all have standard checksums
    blockChecksumValid[s] = blockChecksum(s);
  }
}

// ─── BLOCK STRUCTURE PARSER ───────────────────────────────────────────────────

function parseBlockStructure(s) {
  if (!diskData || s < 0 || s >= ADF.TOTAL_SECTORS) return null;
  const type  = sectorTypes[s] || 'free';
  const chkOk = blockChecksumValid[s];

  if (type === 'free') return { kind: 'free', s };
  if (type === 'boot') return parseBoot(s);
  if (type === 'bitmap') return parseBitmapBlock(s);

  const t    = i32be(s, 0);
  const key  = u32be(s, 4);
  const seq  = u32be(s, 8);
  const fst  = u32be(s, 12);
  const st   = i32be(s, ADF.SECTOR_SIZE - 4);

  if (t === 2) { // T_HEADER
    if (st === 1)  return parseRootBlockStructure(s, key, chkOk);
    if (st === 2)  return parseDirBlockStructure(s, key, chkOk);
    if (st === -3) return parseFileHeaderStructure(s, key, seq, fst, chkOk);
    return { kind: 'header_unknown', s, t, st, key, chkOk };
  }
  if (t === 8)  return parseOFSDataBlock(s, key, seq, fst, chkOk);
  if (t === 16) return parseExtensionBlock(s, key, seq, chkOk);
  if (t === 33) return parseDirCacheBlock(s, key, chkOk);
  return { kind: 'unknown', s, t, st, key, chkOk };
}

function parseBoot(s) {
  const id = String.fromCharCode(u8(0,0), u8(0,1), u8(0,2));
  const flags = u8(0, 3);
  const chk = u32be(0, 4);
  const root = u32be(0, 8);
  return { kind: 'boot', s, id, flags, checksum: chk, rootPtr: root };
}

function parseBitmapBlock(s) {
  const chkOk = blockChecksum(s);
  const storedChk = u32be(s, 0);
  let freeBits = 0, usedBits = 0;
  for (let b = 4; b < ADF.SECTOR_SIZE; b++) {
    const byte = u8(s, b);
    const ones = POPCOUNT8[byte];
    freeBits += ones;
    usedBits += (8 - ones);
  }
  return { kind: 'bitmap', s, chkOk, storedChk, freeBits, usedBits };
}

function parseRootBlockStructure(s, key, chkOk) {
  const nameLen = u8(s, ADF.SECTOR_SIZE - 80);
  const name    = readStr(s, ADF.SECTOR_SIZE - 79, nameLen);
  const days    = u32be(s, ADF.SECTOR_SIZE - 92);
  const mins    = u32be(s, ADF.SECTOR_SIZE - 88);
  const ticks   = u32be(s, ADF.SECTOR_SIZE - 84);
  const htSize  = u32be(s, 12);
  const bitmapFlag = i32be(s, 316);
  const bitmapBlocks = [];
  for (let i = 0; i < 25; i++) {
    const b = u32be(s, 320 + i * 4);
    if (b) bitmapBlocks.push(b);
  }
  // Hash table
  const hashTable = [];
  for (let i = 0; i < 72; i++) {
    const e = i32be(s, 24 + i * 4);
    if (e > 0) hashTable.push(e);
  }
  return { kind: 'root', s, key, chkOk, name, date: amigaDateToStr(days, mins, ticks),
    htSize, bitmapFlag, bitmapBlocks, hashTable };
}

function parseDirBlockStructure(s, key, chkOk) {
  const nameLen = u8(s, ADF.SECTOR_SIZE - 80);
  const name    = readStr(s, ADF.SECTOR_SIZE - 79, nameLen);
  const parent  = u32be(s, ADF.SECTOR_SIZE - 12);
  const next    = i32be(s, ADF.SECTOR_SIZE - 16);
  const days    = u32be(s, ADF.SECTOR_SIZE - 92);
  const mins    = u32be(s, ADF.SECTOR_SIZE - 88);
  const ticks   = u32be(s, ADF.SECTOR_SIZE - 84);
  const hashTable = [];
  for (let i = 0; i < 72; i++) {
    const e = i32be(s, 24 + i * 4);
    if (e > 0) hashTable.push(e);
  }
  return { kind: 'dir', s, key, chkOk, name, parent, next, hashTable,
    date: amigaDateToStr(days, mins, ticks) };
}

function parseFileHeaderStructure(s, key, highSeq, firstData, chkOk) {
  const nameLen  = u8(s, ADF.SECTOR_SIZE - 80);
  const name     = readStr(s, ADF.SECTOR_SIZE - 79, nameLen);
  const fileSize = i32be(s, ADF.SECTOR_SIZE - 188);
  const parent   = u32be(s, ADF.SECTOR_SIZE - 12);
  const ext      = u32be(s, ADF.SECTOR_SIZE - 8);
  const next     = i32be(s, ADF.SECTOR_SIZE - 16);
  const prot     = u32be(s, ADF.SECTOR_SIZE - 192);
  const days     = u32be(s, ADF.SECTOR_SIZE - 92);
  const mins     = u32be(s, ADF.SECTOR_SIZE - 88);
  const ticks    = u32be(s, ADF.SECTOR_SIZE - 84);
  const maxSlots = (ADF.SECTOR_SIZE / 4) - 56; // 72
  const safeSeq = Math.min(highSeq >>> 0, maxSlots);
  const dataPtrs = [];
  // Data block ptrs stored REVERSED: first at data_blocks[maxSlots-1]
  for (let i = 0; i < safeSeq; i++) {
    dataPtrs.push(u32be(s, 24 + (maxSlots - 1 - i) * 4));
  }
  return { kind: 'file_header', s, key, chkOk, name, fileSize: Math.max(0, fileSize),
    parent, ext, next, prot, dataPtrs, firstData, highSeq: safeSeq,
    date: amigaDateToStr(days, mins, ticks) };
}

function parseOFSDataBlock(s, headerKey, seqNum, dataSize, chkOk) {
  const nextData = u32be(s, 16);
  const storedChk = u32be(s, 20);
  return { kind: 'ofs_data', s, chkOk, headerKey, seqNum, dataSize, nextData, storedChk };
}

function parseDirCacheBlock(s, key, chkOk) {
  // T_DIRDISK (33): directory-cache block. Parent at offset +508-12; next at +508-8.
  const parent  = u32be(s, ADF.SECTOR_SIZE - 12);
  const next    = u32be(s, ADF.SECTOR_SIZE - 8);
  const records = u32be(s, 8);  // number of cached records
  return { kind: 'dircache', s, key, chkOk, parent, next, records };
}

function parseExtensionBlock(s, key, highSeq, chkOk) {
  const nextExt  = u32be(s, ADF.SECTOR_SIZE - 8);
  const parent   = u32be(s, ADF.SECTOR_SIZE - 12);
  const maxSlots = (ADF.SECTOR_SIZE / 4) - 56; // 72
  const safeSeq  = Math.min(highSeq >>> 0, maxSlots);
  const dataPtrs = [];
  // Data block ptrs stored REVERSED: first at data_blocks[maxSlots-1]
  for (let i = 0; i < safeSeq; i++) {
    dataPtrs.push(u32be(s, 24 + (maxSlots - 1 - i) * 4));
  }
  return { kind: 'ext', s, key, chkOk, nextExt, parent, dataPtrs, highSeq: safeSeq };
}

// ─── CHAIN BUILDER ────────────────────────────────────────────────────────────

function buildChainFromSector(s) {
  const type = sectorTypes[s] || 'free';
  if (type === 'free' || type === 'boot' || type === 'bitmap' || type === 'root') return [];

  const t  = i32be(s, 0);
  const st = i32be(s, ADF.SECTOR_SIZE - 4);

  if (t === 8) {
    const hdr = u32be(s, 4);
    if (hdr > 0 && hdr < ADF.TOTAL_SECTORS) return buildChainFromFileHeader(hdr);
    return [];
  }
  if (t === 16) {
    const parent = u32be(s, ADF.SECTOR_SIZE - 12);
    if (parent > 0 && parent < ADF.TOTAL_SECTORS) return buildChainFromFileHeader(parent);
    return [];
  }
  if (t === 2 && st === -3) return buildChainFromFileHeader(s);
  if (t === 2 && (st === 1 || st === 2)) return buildChainFromDir(s);

  return [];
}

function buildChainFromFileHeader(hdrSector) {
  const chain = [];
  const visited = new Set();

  // Helper: collect all data/ext pointers from one header/ext block
  function collectBlock(sector) {
    if (!sector || sector >= ADF.TOTAL_SECTORS || visited.has(sector)) return;
    visited.add(sector);

    const t   = i32be(sector, 0);
    const st  = i32be(sector, ADF.SECTOR_SIZE - 4);
    const maxSlots = (ADF.SECTOR_SIZE / 4) - 56; // 72
    const seq = Math.min(u32be(sector, 8), maxSlots);
    const chkOk = blockChecksumValid[sector];
    const isHead = sector === hdrSector;
    const kind = isHead ? 'head' : (t === 16 ? 'ext' : 'body');

    // Collect this block's info
    let label = isHead ? 'HDR' : (t === 16 ? 'EXT' : `#${u32be(sector, 8)}`);
    chain.push({ sector, kind, label, chkOk });

    // Data block ptrs stored REVERSED: first at data_blocks[maxSlots-1] (BSIZE-204)
    for (let i = 0; i < seq; i++) {
      const dp = u32be(sector, 24 + (maxSlots - 1 - i) * 4);
      if (dp > 0 && dp < ADF.TOTAL_SECTORS && !visited.has(dp)) {
        visited.add(dp);
        const dChk = blockChecksumValid[dp];
        const dSeq = u32be(dp, 8);
        chain.push({ sector: dp, kind: 'body', label: `#${dSeq || chain.length}`, chkOk: dChk });
      }
    }

    // Follow extension block
    const ext = u32be(sector, ADF.SECTOR_SIZE - 8);
    if (ext > 0 && ext < ADF.TOTAL_SECTORS && !visited.has(ext)) {
      collectBlock(ext);
    }
  }

  collectBlock(hdrSector);

  // Sort by sector number (roughly disk order)
  chain.sort((a, b) => {
    if (a.kind === 'head') return -1;
    if (b.kind === 'head') return 1;
    return a.sector - b.sector;
  });

  return chain;
}

function buildChainFromDir(dirSector) {
  const chain = [{ sector: dirSector, kind: 'head', label: 'DIR',
    chkOk: blockChecksumValid[dirSector] }];
  const t  = i32be(dirSector, 0);
  const st = i32be(dirSector, ADF.SECTOR_SIZE - 4);

  for (let i = 0; i < 72; i++) {
    const entry = i32be(dirSector, 24 + i * 4);
    if (entry > 0 && entry < ADF.TOTAL_SECTORS) {
      // Follow hash chain
      let blk = entry;
      const visitedLocal = new Set();
      while (blk > 0 && blk < ADF.TOTAL_SECTORS && !visitedLocal.has(blk)) {
        visitedLocal.add(blk);
        const eName = safeBcplStr(blk);
        const eSt   = i32be(blk, ADF.SECTOR_SIZE - 4);
        const eChk  = blockChecksumValid[blk];
        const icon  = eSt === 2 ? '📁' : '📄';
        chain.push({ sector: blk, kind: 'body', label: icon + (eName || `S${blk}`), chkOk: eChk });
        blk = i32be(blk, ADF.SECTOR_SIZE - 16); // hash chain next
      }
    }
  }
  return chain;
}

function safeBcplStr(sector) {
  if (!sector || sector <= 0 || sector >= ADF.TOTAL_SECTORS) return '';
  try { return bcplStr(sector, ADF.SECTOR_SIZE - 80); } catch(e) { return ''; }
}

function highlightChain(chain) {
  // Clear previous
  clearChain(false);
  activeChain = chain;
  for (const entry of chain) {
    const el = document.getElementById(`cell-${entry.sector}`);
    if (!el) continue;
    el.classList.add('chain-member');
    if (entry.kind === 'head') el.classList.add('chain-head');
  }
}

function clearChain(resetState = true) {
  document.querySelectorAll('.track-cell.chain-member').forEach(el => {
    el.classList.remove('chain-member', 'chain-head');
  });
  if (resetState) activeChain = [];
}

function amigaDateToStr(days, mins, ticks) {
  try {
    // Validate inputs - corrupt blocks produce garbage values
    if (days < 0 || days > 50000 || mins < 0 || mins > 1440 || ticks < 0) return '(invalid date)';
    const epoch = new Date(1978, 0, 1);
    epoch.setDate(epoch.getDate() + days);
    epoch.setMinutes(epoch.getMinutes() + mins);
    epoch.setMilliseconds(epoch.getMilliseconds() + ticks * 20);
    const s = epoch.toISOString().replace('T', ' ').substring(0, 19);
    return s.startsWith('NaN') ? '(invalid date)' : s;
  } catch(e) { return '(invalid date)'; }
}

// HTML entity escaping - prevents injection from corrupt/adversarial filenames
function safeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseBootBlock() {
  const id    = String.fromCharCode(u8(0,0), u8(0,1), u8(0,2));
  const flags = u8(0, 3);
  const checksum    = u32be(0, 4);
  const rootBlockNum = u32be(0, 8);

  // Filesystem type string — covers all known formats
  let fsType;
  if (id === 'DOS') {
    const v = flags & 0x07;
    fsType = {
      0: 'OFS  (Original File System)',
      1: 'FFS  (Fast File System)',
      2: 'OFS  + International Mode',
      3: 'FFS  + International Mode',
      4: 'OFS  + International Mode + Directory Cache',
      5: 'FFS  + International Mode + Directory Cache',
      6: 'OFS  + Directory Cache',          // DC implies Intl but Intl bit not set
      7: 'FFS  + Directory Cache',
    }[v] ?? `AmigaDOS (Unknown variant 0x${v.toString(16)})`;
  } else if (id === 'PFS') {
    const dc  = !!(flags & 0x10);
    const ver = flags & 0x0F;
    const pn  = ver === 2 ? 'PFS2' : ver === 3 ? 'PFS3' : 'PFS1';
    fsType = `${pn}  (Professional File System${dc ? ' + DirCache' : ''})`;
  } else if (id === 'PDS') {
    fsType = 'PFS3  (Professional Directory Scan)';
  } else if (id === 'SFS') {
    fsType = flags === 0 ? 'SFS  (Smart File System)'
           : flags === 1 ? 'SFS2  (Smart File System 2)'
           : `SFS-v${flags}  (Smart File System)`;
  } else {
    fsType = `Unknown  (${id}\\x${flags.toString(16).padStart(2,'0')})`;
  }

  const stored = (diskView.getUint8(4) << 24) | (diskView.getUint8(5) << 16) |
                 (diskView.getUint8(6) << 8) | diskView.getUint8(7);
  const bootBytes = new Uint8Array(diskData);
  const computed  = calcBootChecksum(bootBytes);
  const checksumOk = (computed >>> 0) === (stored >>> 0);
  const hasCode    = u32be(0, 12) !== 0;

  return { id, flags, fsType, checksum: stored, checksumOk, rootBlockNum, hasCode };
}

function parseRootBlock(s) {
  if (s === undefined) s = ADF.ROOT_BLOCK;
  const type = i32be(s, 0);
  const nameLen = u8(s, ADF.SECTOR_SIZE - 80);
  const name = readStr(s, ADF.SECTOR_SIZE - 79, nameLen);
  const days = u32be(s, ADF.SECTOR_SIZE - 92);
  const mins = u32be(s, ADF.SECTOR_SIZE - 88);
  const ticks = u32be(s, ADF.SECTOR_SIZE - 84);
  const bitmapFlag = i32be(s, 316);
  const bitmapBlocks = [];
  for (let i = 0; i < 25; i++) {
    const b = u32be(s, 320 + i * 4);
    if (b && b < ADF.TOTAL_SECTORS) bitmapBlocks.push(b);
  }
  const checksumOk = blockChecksum(s);
  return { type, name, date: amigaDateToStr(days, mins, ticks), bitmapBlocks, bitmapFlag, checksumOk, sector: s };
}

function parseBitmap(bitmapBlocks) {
  const free = new Array(ADF.TOTAL_SECTORS).fill(false);
  for (const blk of bitmapBlocks) {
    if (blk <= 0 || blk >= ADF.TOTAL_SECTORS) continue;
    const base = blk * ADF.SECTOR_SIZE + 4;
    for (let i = 0; i < (ADF.SECTOR_SIZE - 4); i++) {
      const byte = diskView.getUint8(base + i);
      for (let b = 0; b < 8; b++) {
        const sectorIdx = (i * 8 + b) + 2;
        if (sectorIdx < ADF.TOTAL_SECTORS) free[sectorIdx] = !!(byte & (1 << b));
      }
    }
  }
  return free;
}

function readDirEntries(sector) {
  const entries = [];
  const visited = new Set();
  for (let i = 0; i < 72; i++) {
    let chain = i32be(sector, 24 + i * 4);
    while (chain > 0 && chain < ADF.TOTAL_SECTORS && !visited.has(chain)) {
      visited.add(chain);
      const s = chain;
      const stType = i32be(s, ADF.SECTOR_SIZE - 4);
      const name = bcplStr(s, ADF.SECTOR_SIZE - 80);
      const rawSize = i32be(s, ADF.SECTOR_SIZE - 188);
      const size = stType === -3 ? Math.max(0, Math.min(rawSize, ADF.DISK_SIZE)) : 0;
      const days = u32be(s, ADF.SECTOR_SIZE - 92);
      const mins = u32be(s, ADF.SECTOR_SIZE - 88);
      const ticks = u32be(s, ADF.SECTOR_SIZE - 84);
      const next = i32be(s, ADF.SECTOR_SIZE - 16);
      const prot = stType === -3 ? u32be(s, ADF.SECTOR_SIZE - 192) : 0;
      if (name) entries.push({ sector: s, name, stType, size, prot, date: amigaDateToStr(days, mins, ticks) });
      chain = next;
    }
  }
  return entries;
}

function classifySectors(boot, root, bitmapFree, bitmapBlocks, allEntries) {
  const types = new Array(ADF.TOTAL_SECTORS).fill('free');
  types[0] = 'boot';
  types[1] = 'boot';
  const rootSector = (root && root.sector !== undefined) ? root.sector : ADF.ROOT_BLOCK;
  types[rootSector] = 'root';
  for (const b of bitmapBlocks)
    if (b > 0 && b < ADF.TOTAL_SECTORS) types[b] = 'bitmap';

  // Anything the bitmap says is "used" but not yet classified → raw data
  for (let i = 0; i < ADF.TOTAL_SECTORS; i++)
    if (!bitmapFree[i] && types[i] === 'free') types[i] = 'data';

  // Directory blocks (stType==2 only — NOT root which is already marked)
  for (const e of allEntries)
    if (e.stType === ADF.ST_DIR && e.sector > 0 && e.sector < ADF.TOTAL_SECTORS)
      types[e.sector] = 'dir-block';

  // File header blocks and their extension blocks (T_LIST = 16)
  for (const e of allEntries) {
    if (e.stType === ADF.ST_FILE && e.sector > 0 && e.sector < ADF.TOTAL_SECTORS) {
      types[e.sector] = 'file';
      // Walk the extension chain
      let ext = u32be(e.sector, ADF.SECTOR_SIZE - 8);
      const visited = new Set([e.sector]);
      while (ext > 1 && ext < ADF.TOTAL_SECTORS && !visited.has(ext)) {
        visited.add(ext);
        const primary = diskView.getInt32(ext * ADF.SECTOR_SIZE, false);
        if (primary === 16) { // T_LIST
          types[ext] = 'file';
          ext = u32be(ext, ADF.SECTOR_SIZE - 8);
        } else break;
      }
    }
  }

  // Directory-cache blocks (T_DIRDISK = 33) — scan all data/free used sectors
  if (ADF.HAS_DC) {
    for (let i = 2; i < ADF.TOTAL_SECTORS; i++) {
      if (types[i] === 'data' || types[i] === 'free') {
        if (bitmapFree[i]) continue; // truly free — skip
        const t = diskView.getInt32(i * ADF.SECTOR_SIZE, false);
        if (t === ADF.T_DIRDISK) types[i] = 'dircache';
      }
    }
  }

  return types;
}

/** For PFS/SFS: all non-boot sectors are marked as 'data' (we can't parse their bitmap). */
function classifySectorsForeign() {
  const types = new Array(ADF.TOTAL_SECTORS).fill('data');
  types[0] = 'boot';
  types[1] = 'boot';
  return types;
}

function collectAllEntries(rootSector) {
  const all = [];
  const queue = [{sector: rootSector, path: ''}];
  const visited = new Set();
  const MAX_ENTRIES = 8000;
  while (queue.length > 0 && all.length < MAX_ENTRIES) {
    const {sector, path} = queue.shift();
    if (visited.has(sector)) continue;
    visited.add(sector);
    let entries;
    try { entries = readDirEntries(sector); }
    catch(e) { console.warn(`readDirEntries error at sector ${sector}:`, e); continue; }
    for (const e of entries) {
      e.path = path + '/' + e.name;
      all.push(e);
      if (e.stType === ADF.ST_DIR && e.sector > 0 && e.sector < ADF.TOTAL_SECTORS)
        queue.push({sector: e.sector, path: e.path});
    }
  }
  return all;
}

// ─── File type identification ──────────────────────────────────────────────────
// Returns { icon, typeBadge? }
// Checks (in order): file extension (suffix), known filename prefix/full-name,
// then content-sniffing from first bytes if the file is small enough.

const EXT_ICON = {
  // Executables & libraries
  exe:'⚙️', rexx:'⚙️', rx:'⚙️',
  library:'🔧', lib:'🔧', device:'🔧', handler:'🔧', font:'🔤',
  // Archives
  lha:'📦', lzh:'📦', lzx:'📦', dms:'📦',
  zip:'📦', arc:'📦', zoo:'📦', tar:'📦',
  pp:'📦',
  // Images
  iff:'🖼️', ilbm:'🖼️', ham:'🖼️', pic:'🖼️',
  jpg:'🖼️', jpeg:'🖼️', png:'🖼️', bmp:'🖼️', pcx:'🖼️',
  // Animation
  anim:'🎞️', cdxl:'🎞️', mpg:'🎞️', mpeg:'🎞️',
  // Audio
  '8svx':'🔊', svx:'🔊', wav:'🔊', aif:'🔊', aiff:'🔊',
  // Music / tracker
  mod:'🎵', smus:'🎼', med:'🎵', xm:'🎵', it:'🎵',
  s3m:'🎵', pt:'🎵', nst:'🎵', stk:'🎵', wow:'🎵',
  sid:'🎵', tfx:'🎵', fc:'🎵', fc14:'🎵',
  // Source
  c:'📝', h:'📝', cpp:'📝', a:'📝', s:'📝',
  asm:'📝', i:'📝', p:'📝', pas:'📝', bas:'📝', e:'📝',
  // Object
  o:'🔩', a68:'🔩',
  // Text & docs
  txt:'📄', doc:'📄', nfo:'📄',
  guide:'📖', ag:'📖',
  html:'📄', htm:'📄',
  // Workbench
  info:'🔷', prefs:'⚙️',
  // Disk
  adf:'💾', dsk:'💾', hdf:'💾',
  // Script
  bat:'📜', script:'📜', cmd:'📜',
};

// Prefix and full-name → icon (Amiga disks often have no extension)
const NAME_PREFIX_ICON = [
  // Exact names (full-name match done first)
  { name:'readme',  icon:'📖', badge:'DOC'  },
  { name:'read.me', icon:'📖', badge:'DOC'  },
  { name:'install', icon:'⚙️', badge:'INST' },
  { name:'startup-sequence', icon:'📜', badge:'SCRIPT' },
  { name:'user-startup',     icon:'📜', badge:'SCRIPT' },
  { name:'mountlist',        icon:'📜', badge:'MNTLST' },
  { name:'disk.info',        icon:'🔷', badge:'INFO'  },
  { name:'shell',            icon:'⚙️', badge:'CLI'   },
  // Prefixes
  { prefix:'mod.',     icon:'🎵', badge:'MOD'   },
  { prefix:'pt.',      icon:'🎵', badge:'MOD'   },
  { prefix:'ft.',      icon:'🎵', badge:'MOD'   },
  { prefix:'st-',      icon:'🎵', badge:'MOD'   },
  { prefix:'med.',     icon:'🎵', badge:'MED'   },
  { prefix:'smod.',    icon:'🎵', badge:'MOD'   },
  { prefix:'chip.',    icon:'🎵', badge:'CHIP'  },
  { prefix:'tfmx.',    icon:'🎵', badge:'TFMX'  },
  { prefix:'tfmx-',    icon:'🎵', badge:'TFMX'  },
  { prefix:'smpl.',    icon:'🔊', badge:'SMPL'  },
  { prefix:'samp.',    icon:'🔊', badge:'SMPL'  },
  { prefix:'db.',      icon:'🔊', badge:'DBLK'  }, // DigiBooster
  { prefix:'pic.',     icon:'🖼️', badge:'IFF'   },
  { prefix:'ilbm.',    icon:'🖼️', badge:'ILBM'  },
  { prefix:'anim.',    icon:'🎞️', badge:'ANIM'  },
  { prefix:'icon.',    icon:'🔷', badge:'ICON'  },
  // Suffixes (Amiga sometimes puts type before name)
  { suffix:'.readme',  icon:'📖', badge:'DOC'   },
  { suffix:'.doc',     icon:'📄', badge:'DOC'   },
  { suffix:'.guide',   icon:'📖', badge:'GUIDE' },
  { suffix:'.library', icon:'🔧', badge:'LIB'   },
  { suffix:'.device',  icon:'🔧', badge:'DEV'   },
  { suffix:'.handler', icon:'🔧', badge:'HDL'   },
  { suffix:'.font',    icon:'🔤', badge:'FONT'  },
  { suffix:'.info',    icon:'🔷', badge:'INFO'  },
];

// Magic-byte sniffing — returns { icon, badge } or null
function sniffFileType(sector, size) {
  if (!diskData || size < 4 || size > 4 * 1024 * 1024) return null;
  try {
    const b = new Uint8Array(diskData, sector * ADF.SECTOR_SIZE, Math.min(16, ADF.SECTOR_SIZE));
    // Read actual first file bytes (OFS wraps data at +24)
    const ffs = (u8(0,3) & 1) === 1;
    const dataOff = ffs ? 0 : 24;
    // Need the first real data block
    const nBlocks = u32be(sector, 8);
    if (!nBlocks) return null;
    const maxSlots = (ADF.SECTOR_SIZE / 4) - 56; // 72
    // First data block ptr is at END of array: data_blocks[maxSlots-1]
    const firstData = u32be(sector, 24 + (maxSlots - 1) * 4);
    if (!firstData || firstData >= ADF.TOTAL_SECTORS) return null;
    const db = firstData * ADF.SECTOR_SIZE + dataOff;
    if (db + 8 > diskData.byteLength) return null;

    const d = new Uint8Array(diskData, db, Math.min(12, diskData.byteLength - db));
    const s4 = d[0]!==undefined ? String.fromCharCode(d[0],d[1],d[2],d[3]) : '';
    const s3 = String.fromCharCode(d[0],d[1],d[2]);
    const u16_0 = (d[0]<<8)|d[1];

    // PowerPacker PP20
    if (s4 === 'PP20') return { icon:'📦', badge:'PP20' };

    if (s4 === 'FORM') {
      const ft = String.fromCharCode(d[8],d[9],d[10],d[11]);
      if (ft==='ILBM') return { icon:'🖼️', badge:'ILBM' };
      if (ft==='ANIM') return { icon:'🎞️', badge:'ANIM' };
      if (ft==='8SVX') return { icon:'🔊', badge:'8SVX' };
      if (ft==='SMUS') return { icon:'🎼', badge:'SMUS' };
      if (ft==='FTXT') return { icon:'📄', badge:'FTXT' };
      if (ft==='TDDD') return { icon:'🎨', badge:'3D'   };
      return { icon:'📦', badge:`IFF/${ft.trim()}` };
    }
    // ProTracker / NoiseTracker MOD
    if (size >= 1084) {
      const mk = String.fromCharCode(d[0]||0,d[1]||0,d[2]||0,d[3]||0);
      // MOD magic is at offset 1080 — but we only have first block bytes here
      // Instead: recognisable text header in first bytes
    }
    // AmigaOS hunk executable
    if (u16_0 === 0x03F3 || (d[0]===0x03&&d[1]===0xF3)) return { icon:'⚙️', badge:'HUNK' };
    // LhA archive
    if (d[2]===0x2D&&d[3]===0x6C&&d[4]===0x68) return { icon:'📦', badge:'LhA' };
    // DMS
    if (s4==='DMS!') return { icon:'📦', badge:'DMS' };
    // PNG
    if (d[0]===0x89&&d[1]===0x50&&d[2]===0x4E&&d[3]===0x47) return { icon:'🖼️', badge:'PNG' };
    // JPEG
    if (d[0]===0xFF&&d[1]===0xD8) return { icon:'🖼️', badge:'JPEG' };
    // ZIP
    if (d[0]===0x50&&d[1]===0x4B) return { icon:'📦', badge:'ZIP' };
    // SID / PSID
    if (s4==='PSID'||s4==='RSID') return { icon:'🎵', badge:'SID' };
    // AmigaGuide
    if (s4==='@dat'||String.fromCharCode(d[0],d[1],d[2],d[3],d[4]).toLowerCase()==='@data')
      return { icon:'📖', badge:'GUIDE' };
    if (d[0]==='@'.charCodeAt(0) && d[1]==='d'.charCodeAt(0))
      return { icon:'📖', badge:'GUIDE' };
    // Plain text heuristic (already have isTextData but need raw bytes)
    let printable=0;
    for(let i=0;i<d.length;i++){
      const c=d[i];
      if((c>=0x20&&c<=0x7E)||c===0x09||c===0x0A||c===0x0D||c>=0xA0) printable++;
    }
    if (printable/d.length > 0.85) return { icon:'📄', badge:'TEXT' };
  } catch(e) {}
  return null;
}

function identifyFile(name, sector, size) {
  const nameLow = name.toLowerCase();
  const extDot  = name.lastIndexOf('.');
  const ext     = extDot >= 0 ? nameLow.slice(extDot + 1) : '';

  // 1. Exact extension match
  if (ext && EXT_ICON[ext]) return { icon: EXT_ICON[ext], badge: null };

  // 2. Name prefix / suffix / exact match
  for (const rule of NAME_PREFIX_ICON) {
    if (rule.name   && nameLow === rule.name)            return { icon: rule.icon, badge: null };
    if (rule.prefix && nameLow.startsWith(rule.prefix))  return { icon: rule.icon, badge: rule.badge };
    if (rule.suffix && nameLow.endsWith(rule.suffix))    return { icon: rule.icon, badge: null };
  }

  // 3. Content sniff (lazy — only reads disk if needed)
  const sniffed = sniffFileType(sector, size);
  if (sniffed) return sniffed;

  return { icon: '📄', badge: null };
}

// Compact protection bits for tree: HSPARWED, set=letter unset=·
function protToTreeStr(prot) {
  // Amiga prot word: bit7=H bit6=S bit5=P bit4=A bit3=R bit2=W bit1=E bit0=D
  // Invert: 0 means protected/set for R/W/E/D (lower nibble active-low)
  // Upper nibble (H/S/P/A) are active-high.
  const letters = ['H','S','P','A','R','W','E','D'];
  // bits 7..0
  return letters.map((l, i) => {
    const bit = 7 - i;
    const set = (prot >> bit) & 1;
    // For RWED (bits 3-0): AmigaDOS stores them inverted (0 = permission granted)
    const show = (bit <= 3) ? !set : !!set;
    return show ? `<span class="pa-set">${l}</span>` : `<span class="pa-clr">·</span>`;
  }).join('');
}

// ─── Tree rendering ────────────────────────────────────────────────────────────

function renderTree(entries) {
  const root = { name: 'DISK', children: [], files: [], stType: 1, id: 'dir-root' };
  const byPath = { '': root };
  let nodeId = 0;

  entries.sort((a, b) => {
    if (a.stType === b.stType) return a.name.localeCompare(b.name);
    return (b.stType === 2 ? 1 : 0) - (a.stType === 2 ? 1 : 0);
  });

  for (const e of entries) {
    const parentPath = e.path.substring(0, e.path.lastIndexOf('/'));
    const parent = byPath[parentPath] || root;
    if (e.stType === 2) {
      const id = `dir-${nodeId++}`;
      const node = { name: e.name, children: [], files: [], stType: 2, sector: e.sector, id, date: e.date, prot: e.prot||0 };
      byPath[e.path] = node;
      parent.children.push(node);
    } else {
      parent.files.push(e);
    }
  }

  // Build flat row HTML — dirs render their header row then open a <tbody> for children
  function renderNode(node, depth) {
    const indent = depth * 16;
    const childIndent = indent + 16;
    let rows = '';

    if (depth > 0) {
      const hasChildren = node.children.length > 0 || node.files.length > 0;
      const chevron = hasChildren
        ? `<span class="tree-chevron" id="chv-${node.id}" onclick="event.stopPropagation();treeToggle('${node.id}')">▶</span>`
        : `<span class="tree-spacer"></span>`;
      const dateStr = node.date ? node.date.split(' ')[0] : '';
      const childCount = [
        node.children.length ? `${node.children.length}d` : '',
        node.files.length    ? `${node.files.length}f`    : ''
      ].filter(Boolean).join(' ');

      // Dir header row — in its own tbody so we can target it separately
      rows += `<tbody>
        <tr class="tree-row dir" onclick="treeToggle('${node.id}');selectSector(${node.sector});updateFileInfoPanel(${node.sector})">
          <td class="tc-name">
            <div class="tree-name-inner" style="padding-left:${indent}px">
              ${chevron}
              <span class="tree-icon" id="icon-${node.id}">📂</span>
              <span class="tree-label" title="${safeHtml(node.name)}">${safeHtml(node.name)}</span>
            </div>
          </td>
          <td class="tc-badge"></td>
          <td class="tc-attrs"></td>
          <td class="tc-date">${dateStr}</td>
          <td class="tc-size dir-count">${childCount}</td>
        </tr>
      </tbody>`;

      // Children in a collapsible tbody
      rows += `<tbody class="tree-children" id="children-${node.id}">`;
    }

    for (const child of (node.children || [])) rows += renderNode(child, depth + 1);

    for (const file of (node.files || [])) {
      const { icon, badge } = identifyFile(file.name, file.sector, file.size);
      const safeN = safeHtml(file.name);
      const badgeHtml = badge ? `<span>${badge}</span>` : '';
      const dateStr = file.date ? file.date.split(' ')[0] : '';
      const protHtml = protToTreeStr(file.prot || 0);

      rows += `<tr class="tree-row file"
          onclick="selectFileSector(${file.sector});openFileContent(${file.sector},this.dataset.name,${file.size})"
          data-name="${safeN}"
          title="${safeN}  ${formatSize(file.size)}  ${dateStr}">
        <td class="tc-name">
          <div class="tree-name-inner" style="padding-left:${childIndent}px">
            <span class="tree-spacer"></span>
            <span class="tree-icon">${icon}</span>
            <span class="tree-label">${safeN}</span>
          </div>
        </td>
        <td class="tc-badge">${badgeHtml}</td>
        <td class="tc-attrs">${protHtml}</td>
        <td class="tc-date">${dateStr}</td>
        <td class="tc-size">${formatSize(file.size)}</td>
      </tr>`;
    }

    if (depth > 0) rows += `</tbody>`; // close tree-children tbody

    return rows;
  }

  const bodyRows = renderNode(root, 0);

  return `<table class="tree-table">
    <thead>
      <tr>
        <th class="tc-name">Name</th>
        <th class="tc-badge"></th>
        <th class="tc-attrs" title="H=Hidden S=Script P=Pure A=Archive R=Read W=Write E=Execute D=Delete">Attrs</th>
        <th class="tc-date">Modified</th>
        <th class="tc-size">Size</th>
      </tr>
    </thead>
    ${bodyRows}
  </table>`;
}

function treeToggle(id) {
  const children = document.getElementById(`children-${id}`);
  const chevron  = document.getElementById(`chv-${id}`);
  const icon     = document.getElementById(`icon-${id}`);
  if (!children) return;
  const collapsed = children.classList.toggle('collapsed');
  if (chevron) chevron.classList.toggle('collapsed', collapsed);
  if (icon) icon.textContent = collapsed ? '📁' : '📂';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + 'K';
  return (bytes/1024/1024).toFixed(1) + 'M';
}

function renderDiskMap(freeMap) {
  const spt  = ADF.SECTORS_PER_TRACK;
  const totalSectors = ADF.TOTAL_SECTORS;
  const mapTitle = `BLOCK ALLOCATION MAP — ${totalSectors.toLocaleString()} SECTORS  [${ADF.DISK_TYPE} · ${ADF.FS_KIND}]`;

  // ADF sector order: for track T, side S → sector = (T*2 + S) * spt + n
  // Render two side-by-side grids: Side 0 (left) and Side 1 (right), each 80 rows × spt cols.
  // A thin track-number gutter sits between them for reference.

  const TYPE_LABEL = {
    boot: 'BOOT', root: 'ROOT', bitmap: 'BITMAP', 'dir-block': 'DIR',
    file: 'FILE HDR', data: 'DATA', dircache: 'DIR-CACHE', free: 'FREE'
  };

  function makeCell(sector) {
    const track = Math.floor(sector / spt / 2);
    const side  = Math.floor(sector / spt) % 2;
    const sn    = sector % spt;
    const type  = sectorTypes[sector] || 'free';
    const chkBad = (type !== 'free' && type !== 'boot') && blockChecksumValid[sector] === false;
    const lbl   = TYPE_LABEL[type] || type.toUpperCase();
    const tip   = `Sector ${sector} · Track ${track} Side ${side} Sec ${sn} · ${lbl}${chkBad ? ' ⚠ BAD CHK' : ''}`;
    const sel   = sector === currentSector ? ' selected-cell' : '';
    return `<div class="track-cell ${type}${chkBad ? ' chk-bad' : ''}${sel}" onclick="selectSector(${sector})" title="${tip}" id="cell-${sector}"></div>`;
  }

  // Build both grids row by row (track by track)
  let side0 = '', side1 = '';
  for (let t = 0; t < ADF.TRACKS; t++) {
    const base0 = (t * 2 + 0) * spt;
    const base1 = (t * 2 + 1) * spt;
    for (let n = 0; n < spt; n++) side0 += makeCell(base0 + n);
    for (let n = 0; n < spt; n++) side1 += makeCell(base1 + n);
  }

  // Track-number ruler — one label every 10 tracks
  let trackLabels = '';
  for (let t = 0; t < ADF.TRACKS; t++) {
    const show = (t % 10 === 0) || t === ADF.TRACKS - 1;
    trackLabels += `<div style="height:16px;line-height:16px;font-size:9px;color:${show ? 'var(--wb-dim)' : 'transparent'};text-align:center;font-family:var(--font-mono)">${t}</div>`;
  }

  const corruptCount = Object.values(blockChecksumValid).filter(v => v === false).length;

  return `
    <div class="track-map-title">${mapTitle}</div>

    <!-- Side-by-side disk bitmap -->
    <div style="display:flex;align-items:flex-start;gap:6px;overflow-x:auto">

      <!-- Side 0 -->
      <div>
        <div style="font-family:var(--font-title);font-size:8px;letter-spacing:2px;color:var(--wb-blue);text-align:center;margin-bottom:4px;text-transform:uppercase">Side 0</div>
        <div class="track-grid" style="grid-template-columns:repeat(${spt},14px)">${side0}</div>
      </div>

      <!-- Track number gutter -->
      <div style="display:flex;flex-direction:column;padding-top:20px;flex-shrink:0">${trackLabels}</div>

      <!-- Side 1 -->
      <div>
        <div style="font-family:var(--font-title);font-size:8px;letter-spacing:2px;color:var(--wb-blue);text-align:center;margin-bottom:4px;text-transform:uppercase">Side 1</div>
        <div class="track-grid" style="grid-template-columns:repeat(${spt},14px)">${side1}</div>
      </div>

    </div>

    <div class="map-legend" style="margin-top:10px">
      <div class="legend-item"><span class="legend-dot" style="background:var(--wb-orange)"></span>Boot</div>
      <div class="legend-item"><span class="legend-dot" style="background:var(--wb-amber)"></span>Root</div>
      <div class="legend-item"><span class="legend-dot" style="background:#ff44ff"></span>Bitmap</div>
      <div class="legend-item"><span class="legend-dot" style="background:var(--wb-green)"></span>Dir</div>
      <div class="legend-item"><span class="legend-dot" style="background:#2255cc"></span>File Hdr</div>
      <div class="legend-item"><span class="legend-dot" style="background:#4499ff"></span>Data</div>
      ${ADF.HAS_DC ? `<div class="legend-item"><span class="legend-dot" style="background:#00cccc"></span>DirCache</div>` : ''}
      <div class="legend-item"><span class="legend-dot" style="background:var(--wb-border)"></span>Free</div>
      <div class="legend-item" style="margin-left:auto">
        <span style="position:relative;width:10px;height:10px;display:inline-block;border-radius:2px;background:rgba(0,85,170,0.4);">
          <span style="position:absolute;top:0;right:0;width:0;height:0;border-style:solid;border-width:0 5px 5px 0;border-color:transparent var(--wb-red) transparent transparent"></span>
        </span>
        <span style="color:${corruptCount > 0 ? 'var(--wb-red)' : 'var(--wb-dim)'}">
          ${corruptCount > 0 ? `${corruptCount} corrupt` : 'All checksums OK'}
        </span>
      </div>
    </div>

    <div style="margin-top:16px;padding:10px 0;border-top:1px solid var(--wb-border)">
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--wb-dim);margin-bottom:6px;display:flex;align-items:center;gap:8px">
        BLOCK INSPECTOR
        <span id="map-chk-summary" style="font-size:9px;letter-spacing:1px;color:var(--wb-dim)"></span>
      </div>
      <div id="selected-block-info">
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--wb-dim);padding:8px;text-align:center;opacity:0.5">Click any block to inspect</div>
      </div>
    </div>
  `;
}

function renderBootAnalysis(boot, root) {
  const fsClass = (boot.id === 'DOS' || boot.id === 'PFS' || boot.id === 'PDS' || boot.id === 'SFS') ? 'highlight' : 'error';
  const spt = ADF.SECTORS_PER_TRACK;
  const mediaStr = ADF.DISK_TYPE === 'HD'
    ? `HD 3.5" — 1.76 MB  (${ADF.TRACKS} tracks × ${ADF.SIDES} sides × ${spt} sec/track)`
    : `DD 3.5" — 880 KB  (${ADF.TRACKS} tracks × ${ADF.SIDES} sides × ${spt} sec/track)`;

  const dosVariantRow = ADF.IS_ADOS ? (() => {
    const v = u8(0, 3) & 0x07;
    const rows = [
      [0, 'OFS',          'Original File System — 24-byte data block headers, 488 B/block usable'],
      [1, 'FFS',          'Fast File System — raw 512-byte data blocks, ~5% more capacity'],
      [2, 'OFS+Intl',     'OFS + International Mode — locale-aware filename sorting'],
      [3, 'FFS+Intl',     'FFS + International Mode'],
      [4, 'OFS+Intl+DC',  'OFS + Intl + Directory Cache — pre-built dir listings (T_DIRDISK=33)'],
      [5, 'FFS+Intl+DC',  'FFS + Intl + Directory Cache'],
      [6, 'OFS+DC',       'OFS + Directory Cache (DirCache implies Intl)'],
      [7, 'FFS+DC',       'FFS + Directory Cache (DirCache implies Intl)'],
    ];
    let html = `<div class="kv-key">DOS Flags</div>
    <div class="kv-val" style="padding:0">
      <table style="width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:11px">`;
    for (const [id, short, desc] of rows) {
      const active = id === v;
      html += `<tr style="background:${active ? 'rgba(0,136,255,0.15)' : 'transparent'}">
        <td style="padding:2px 6px;color:var(--wb-dim);width:16px">\\x0${id}</td>
        <td style="padding:2px 6px;color:${active ? 'var(--wb-orange)' : 'var(--wb-dim)'};width:90px;font-weight:${active ? 'bold' : 'normal'}">${short}</td>
        <td style="padding:2px 6px;color:${active ? 'var(--wb-text)' : '#444'};">${desc}</td>
      </tr>`;
    }
    html += `</table></div>`;
    return html;
  })() : '';

  const fsFeatures = ADF.IS_ADOS ? `
    ${dosVariantRow}
    <div class="kv-key">Block Mode</div>
    <div class="kv-val">${ADF.IS_FFS
      ? 'FFS — raw 512 B/block, no header'
      : 'OFS — 24 B header + 488 B data/block'}</div>
    <div class="kv-key">Int\'l Mode</div>
    <div class="kv-val ${ADF.HAS_INTL ? 'highlight' : ''}">${ADF.HAS_INTL
      ? 'Enabled — case-insensitive filename comparison'
      : 'Disabled — ASCII byte-order sorting'}</div>
    <div class="kv-key">Dir Cache</div>
    <div class="kv-val ${ADF.HAS_DC ? 'highlight' : ''}">${ADF.HAS_DC
      ? 'Enabled — T_DIRDISK (33) blocks present'
      : 'Disabled'}</div>
  ` : `
    <div class="kv-key">Note</div>
    <div class="kv-val warn">${ADF.FS_KIND} structures are not AmigaDOS-compatible.
      Use the Hex Viewer to inspect raw blocks.</div>
  `;

  const rootSection = ADF.IS_ADOS ? `
    <div class="analysis-section fade-in">
      <div class="analysis-title">Root Block (Sector ${root.sector !== undefined ? root.sector : ADF.ROOT_BLOCK}${root.sector !== undefined && root.sector !== ADF.ROOT_BLOCK ? ` <span style="color:var(--wb-orange);font-size:9px">FALLBACK</span>` : ''})</div>
      <div class="kv-grid">
        ${boot.rootBlockFallbackReason ? `
        <div class="kv-key">⚠ Note</div>
        <div class="kv-val warn" style="font-size:10px">${boot.rootBlockFallbackReason}</div>
        ` : ''}
        <div class="kv-key">Volume Name</div>
        <div class="kv-val highlight">${root.name || '(unnamed)'}</div>
        <div class="kv-key">Last Modified</div>
        <div class="kv-val info">${root.date}</div>
        <div class="kv-key">Bitmap Valid</div>
        <div class="kv-val ${root.bitmapFlag === -1 ? 'highlight' : 'warn'}">
          ${root.bitmapFlag === -1 ? '0xFFFFFFFF — VALID' : `0x${(root.bitmapFlag>>>0).toString(16).toUpperCase()} — DIRTY`}
        </div>
        <div class="kv-key">Block Checksum</div>
        <div class="kv-val">
          <span class="checksum-badge ${root.checksumOk ? 'ok' : 'fail'}">
            ${root.checksumOk ? '✓ VALID' : '✗ CORRUPT'}
          </span>
        </div>
        <div class="kv-key">Bitmap Blocks</div>
        <div class="kv-val info">${root.bitmapBlocks.join(', ') || '—'}</div>
      </div>
    </div>
  ` : `
    <div class="analysis-section fade-in">
      <div class="analysis-title">Volume</div>
      <div class="kv-grid">
        <div class="kv-key">Volume Name</div>
        <div class="kv-val highlight">${root.name || '(unnamed)'}</div>
        <div class="kv-key">Root Block</div>
        <div class="kv-val info">Sector 2 (${ADF.FS_KIND} root object)</div>
      </div>
    </div>
  `;

  return `
    <div class="analysis-section fade-in">
      <div class="analysis-title">Boot Block (Sectors 0–1)</div>
      <div class="kv-grid">
        <div class="kv-key">Disk Identifier</div>
        <div class="kv-val ${fsClass}">${boot.id}\\x${boot.flags.toString(16).padStart(2,'0')} — ${boot.fsType}</div>
        <div class="kv-key">Checksum</div>
        <div class="kv-val">
          0x${boot.checksum.toString(16).toUpperCase().padStart(8,'0')} &nbsp;
          <span class="checksum-badge ${boot.checksumOk ? 'ok' : 'fail'}">
            ${boot.checksumOk ? '✓ VALID' : '✗ CORRUPT'}
          </span>
        </div>
        <div class="kv-key">Root Block Ptr</div>
        ${(() => {
          const ptr     = boot.rootBlockNum;
          const defBlk  = ADF.ROOT_BLOCK;
          const fallback = boot.rootBlockFallback;
          const reason   = boot.rootBlockFallbackReason;
          if (!ADF.IS_ADOS) {
            return `<div class="kv-val info">Sector ${ptr} (expected ${defBlk})</div>`;
          }
          if (ptr === 0 || ptr >= ADF.TOTAL_SECTORS) {
            return `<div class="kv-val error">
              <span class="checksum-badge fail">⚠ INVALID (${ptr})</span>
              &nbsp;Using default: sector ${defBlk}
            </div>`;
          }
          if (ptr !== defBlk) {
            return `<div class="kv-val warn">
              Sector ${ptr} <span class="checksum-badge fail">⚠ NON-STANDARD</span>
              &nbsp;Expected ${defBlk}
            </div>`;
          }
          return `<div class="kv-val info">Sector ${ptr} <span class="checksum-badge ok">✓ OK</span></div>`;
        })()}
        <div class="kv-key">Executable Code</div>
        <div class="kv-val ${boot.hasCode ? 'highlight' : 'warn'}">${boot.hasCode ? 'YES — Bootable disk' : 'NO — Non-bootable'}</div>
        <div class="kv-key">Filesystem</div>
        <div class="kv-val highlight">${boot.fsType}</div>
        ${fsFeatures}
      </div>
    </div>

    ${rootSection}

    <div class="analysis-section fade-in">
      <div class="analysis-title">Disk Format Summary</div>
      <div class="kv-grid">
        <div class="kv-key">Media Type</div>
        <div class="kv-val">${mediaStr}</div>
        <div class="kv-key">Sector Size</div>
        <div class="kv-val">512 bytes</div>
        <div class="kv-key">Total Sectors</div>
        <div class="kv-val">${ADF.TOTAL_SECTORS.toLocaleString()}</div>
        <div class="kv-key">Total Capacity</div>
        <div class="kv-val">${(ADF.DISK_SIZE / 1024).toFixed(0)} KB (${ADF.DISK_SIZE.toLocaleString()} bytes)</div>
      </div>
    </div>
  `;
}

function renderInfoPanel(boot, root, freeMap, allEntries) {
  const usedSectors = ADF.IS_ADOS ? freeMap.filter(f => !f).length : ADF.TOTAL_SECTORS - 2;
  const freeSectors = ADF.IS_ADOS ? freeMap.filter(f => f).length : 0;
  const usedBytes = usedSectors * ADF.SECTOR_SIZE;
  const freeBytes = freeSectors * ADF.SECTOR_SIZE;
  const usedPct = Math.round(usedSectors / ADF.TOTAL_SECTORS * 100);
  const dirs  = allEntries.filter(e => e.stType === 2).length;
  const files = allEntries.filter(e => e.stType === -3).length;

  return `
    <div class="info-block fade-in">
      <div class="info-block-header">Volume</div>
      <div class="info-block-body">
        <div class="stat-row">
          <span class="stat-label">Name</span>
          <span class="stat-value amber">${root.name || '(unnamed)'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Filesystem</span>
          <span class="stat-value orange">${ADF.FS_KIND}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Disk type</span>
          <span class="stat-value">${ADF.DISK_TYPE === 'HD' ? 'HD — 3.5" High Density' : 'DD — 3.5" Double Density'}</span>
        </div>
        ${ADF.IS_ADOS ? `
        <div class="stat-row">
          <span class="stat-label">Block mode</span>
          <span class="stat-value" style="font-size:10px">${ADF.IS_FFS ? 'FFS  512 B raw' : 'OFS  488 B+hdr'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Int'l mode</span>
          <span class="stat-value ${ADF.HAS_INTL ? 'green' : ''}">${ADF.HAS_INTL ? '✓ On' : 'Off'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Dir cache</span>
          <span class="stat-value ${ADF.HAS_DC ? 'green' : ''}">${ADF.HAS_DC ? '✓ On' : 'Off'}</span>
        </div>` : ''}
        <div class="stat-row">
          <span class="stat-label">Modified</span>
          <span class="stat-value" style="font-size:10px">${root.date ? root.date.split(' ')[0] : '—'}</span>
        </div>
      </div>
    </div>

    <div class="info-block fade-in">
      <div class="info-block-header">Storage Usage</div>
      <div class="info-block-body">
        <div class="stat-row">
          <span class="stat-label">Used</span>
          <span class="stat-value green">${formatSize(usedBytes)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Free</span>
          <span class="stat-value">${ADF.IS_ADOS ? formatSize(freeBytes) : 'N/A'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Total</span>
          <span class="stat-value">${formatSize(ADF.DISK_SIZE)}</span>
        </div>
        <div class="usage-bar">
          <div class="usage-fill" style="width:${usedPct}%"></div>
        </div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--wb-dim);text-align:right;margin-top:4px">${usedPct}% USED</div>
      </div>
    </div>

    <div class="info-block fade-in">
      <div class="info-block-header">Contents</div>
      <div class="info-block-body">
        <div class="stat-row">
          <span class="stat-label">Directories</span>
          <span class="stat-value amber">📁 ${dirs}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Files</span>
          <span class="stat-value">📄 ${files}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Total Entries</span>
          <span class="stat-value">${allEntries.length}</span>
        </div>
      </div>
    </div>

    <div class="info-block fade-in">
      <div class="info-block-header">Integrity</div>
      <div class="info-block-body">
        <div class="stat-row">
          <span class="stat-label">Boot Checksum</span>
          <span class="stat-value ${boot.checksumOk ? 'green' : ''}" style="${!boot.checksumOk?'color:var(--wb-red)':''}">
            ${boot.checksumOk ? '✓ OK' : '✗ FAIL'}
          </span>
        </div>
        ${ADF.IS_ADOS ? `
        <div class="stat-row">
          <span class="stat-label">Root Checksum</span>
          <span class="stat-value ${root.checksumOk ? 'green' : ''}" style="${!root.checksumOk?'color:var(--wb-red)':''}">
            ${root.checksumOk ? '✓ OK' : '✗ FAIL'}
          </span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Bitmap</span>
          <span class="stat-value ${root.bitmapFlag === -1 ? 'green' : 'amber'}">
            ${root.bitmapFlag === -1 ? '✓ VALID' : '⚠ DIRTY'}
          </span>
        </div>` : `
        <div class="stat-row">
          <span class="stat-label">Internals</span>
          <span class="stat-value" style="color:var(--wb-dim)">Not checked (${ADF.FS_KIND})</span>
        </div>`}
      </div>
    </div>

    <div class="info-block fade-in">
      <div class="info-block-header">Geometry</div>
      <div class="info-block-body">
        <div class="stat-row"><span class="stat-label">Tracks</span><span class="stat-value">${ADF.TRACKS} (per side)</span></div>
        <div class="stat-row"><span class="stat-label">Sides</span><span class="stat-value">${ADF.SIDES}</span></div>
        <div class="stat-row"><span class="stat-label">Sectors/Track</span><span class="stat-value">${ADF.SECTORS_PER_TRACK}</span></div>
        <div class="stat-row"><span class="stat-label">Sector Size</span><span class="stat-value">512 B</span></div>
        <div class="stat-row"><span class="stat-label">Total Sectors</span><span class="stat-value">${ADF.TOTAL_SECTORS.toLocaleString()}</span></div>
        <div class="stat-row"><span class="stat-label">Root Block</span><span class="stat-value">${ADF.IS_ADOS ? ADF.ROOT_BLOCK : 2}</span></div>
      </div>
    </div>
  `;
}

function renderHexView(sector) {
  const base = sector * ADF.SECTOR_SIZE;
  const out = [];
  for (let row = 0; row < 32; row++) {
    const offset = row * 16;
    let bytes = '';
    let ascii = '';
    for (let col = 0; col < 16; col++) {
      const b = diskView.getUint8(base + offset + col);
      const isPrint = b >= 0x20 && b < 0x7f;
      const cls = b === 0 ? 'zero' : isPrint ? 'ascii-print' : '';
      bytes += `<span class="hex-b ${cls}">${b.toString(16).padStart(2,'0').toUpperCase()}</span>`;
      if (col === 7) bytes += `<span class="hex-sep">·</span>`;
      ascii += isPrint ? String.fromCharCode(b) : '·';
    }
    out.push(`<div class="hex-row">
      <span class="hex-addr">+${offset.toString(16).padStart(4,'0').toUpperCase()}</span>
      <div class="hex-bytes">${bytes}</div>
      <span class="hex-ascii">${ascii.replace(/</g,'&lt;')}</span>
    </div>`);
  }
  return out.join('');
}

function selectSector(s) {
  currentSector = s;

  // Track position within file chain (or clear if sector is outside it)
  if (currentFileChain.length > 0) {
    const idx = currentFileChain.indexOf(s);
    if (idx !== -1) {
      currentFileChainIndex = idx;
    } else {
      currentFileChain = [];
      currentFileChainIndex = -1;
    }
  }

  // Update selected cell highlight
  document.querySelectorAll('.track-cell.selected-cell').forEach(el => el.classList.remove('selected-cell'));
  const cell = document.getElementById(`cell-${s}`);
  if (cell) cell.classList.add('selected-cell');

  // Render block inspector in disk map panel
  const infoEl = document.getElementById('selected-block-info');
  if (infoEl) {
    try {
      const info = parseBlockStructure(s);
      infoEl.innerHTML = renderBlockInspector(info);
    } catch(err) {
      console.error(`Block inspector error at sector ${s}:`, err);
      infoEl.innerHTML = `<div class="block-inspector"><div class="bi-header">
        <span class="bi-sector-num">S:${s}</span>
        <span class="bi-type-tag data">Error</span>
        <span class="bi-chk-badge bad">✗ PARSE ERROR</span>
      </div><div class="bi-fields">
        <div class="bi-field"><span class="bi-field-offset">—</span>
        <span class="bi-field-name">Error</span>
        <span class="bi-field-value err">${safeHtml(String(err.message || err))}</span></div>
        <div class="bi-field"><span class="bi-field-offset">—</span>
        <span class="bi-field-name">Tip</span>
        <span class="bi-field-value dim">Block may be corrupt. Check hex viewer for raw data.</span></div>
      </div></div>`;
    }
  }

  // Update hex view
  if (diskData) {
    document.getElementById('hex-view').innerHTML = renderHexView(s);
    if (currentFileChain.length > 0) {
      document.getElementById('hex-page-info').textContent =
        `File block ${currentFileChainIndex + 1} / ${currentFileChain.length}  (Sector ${s})`;
      document.getElementById('hex-prev').disabled = currentFileChainIndex <= 0;
      document.getElementById('hex-next').disabled = currentFileChainIndex >= currentFileChain.length - 1;
    } else {
      document.getElementById('hex-page-info').textContent = `Sector ${s} / ${ADF.TOTAL_SECTORS}`;
      document.getElementById('hex-prev').disabled = s <= 0;
      document.getElementById('hex-next').disabled = s >= ADF.TOTAL_SECTORS - 1;
    }
    // Show hex controls only when bitmaphex tab is active
    const activeBitmapHex = document.querySelector('.tab[data-tab="bitmaphex"]')?.classList.contains('active');
    document.getElementById('hex-controls').style.display = activeBitmapHex ? 'flex' : 'none';
    const typeLabel = document.getElementById('hex-sector-type');
    const type = sectorTypes[s] || 'free';
    typeLabel.className = `status-pill ${type !== 'free' ? 'loaded' : 'idle'}`;
    typeLabel.textContent = type.toUpperCase();
  }
}

// ─── BLOCK INSPECTOR RENDERER ─────────────────────────────────────────────────

function field(offset, name, value, cls = '', isLink = false) {
  const linkCls = isLink ? ' link' : '';
  return `<div class="bi-field">
    <span class="bi-field-offset">+${offset < 0 ? (512+offset) : offset}</span>
    <span class="bi-field-name">${name}</span>
    <span class="bi-field-value${cls?(' '+cls):''}${linkCls}">${value}</span>
  </div>`;
}

function sectorLink(s, label) {
  if (!s || s <= 0 || s >= ADF.TOTAL_SECTORS) return `<span style="color:var(--wb-dim)">${label || 0}</span>`;
  const type = sectorTypes[s] || 'free';
  const chk  = blockChecksumValid[s];
  const warn = chk === false ? ' ⚠' : '';
  return `<span class="link" onclick="selectSector(${s})" title="Go to sector ${s}">${label || s}${warn}</span>`;
}

function ptrTable(ptrs, caption = '') {
  if (!ptrs || ptrs.length === 0) return '';
  let html = `<div class="bi-section-label">${caption}</div><div class="bi-field"><div class="bi-ptr-grid">`;
  for (const p of ptrs) {
    const z = !p || p === 0;
    const chkBad = !z && blockChecksumValid[p] === false;
    html += `<span class="bi-ptr-chip${z?' zero':''}" ${z?'':'onclick="selectSector('+p+')"'}>
      ${p}${chkBad ? ' ⚠' : ''}
    </span>`;
  }
  html += `</div></div>`;
  return html;
}

function protToStr(prot) {
  const bits = ['D','E','W','R','A','P','S','H'];
  return bits.map((b, i) => (prot & (1 << (7-i))) ? `<span style="color:var(--wb-amber)">${b}</span>` : `<span style="color:var(--wb-dim)">${b}</span>`).join(' ');
}

function renderBlockInspector(info) {
  if (!info) return `<div style="padding:8px;font-family:var(--font-mono);font-size:11px;color:var(--wb-dim);text-align:center;opacity:0.5">No data</div>`;

  const s = info.s;
  const track = Math.floor(s / ADF.SECTORS_PER_TRACK / 2);
  const side  = Math.floor(s / ADF.SECTORS_PER_TRACK) % 2;
  const byteOff = s * ADF.SECTOR_SIZE;

  // Determine type tag and checksum badge
  const tagMap = {
    free: 'free', boot: 'boot', root: 'root',
    file_header: 'file', dir: 'dir', ofs_data: 'data',
    ext: 'ext', bitmap: 'bitmap', dircache: 'dc',
    header_unknown: 'data', unknown: 'data'
  };
  const tagLabel = {
    free: 'Free', boot: 'Boot', root: 'Root',
    file_header: 'File Header', dir: 'Directory', ofs_data: 'OFS Data',
    ext: 'Extension', bitmap: 'Bitmap', dircache: 'DirCache',
    header_unknown: 'T_HEADER', unknown: 'Unknown'
  };
  const tagCls   = tagMap[info.kind] || 'data';
  const typeDisp = tagLabel[info.kind] || info.kind;
  const chkOk    = info.chkOk;
  const chkBadge = chkOk === undefined
    ? `<span class="bi-chk-badge na">N/A</span>`
    : chkOk
      ? `<span class="bi-chk-badge ok">✓ CHK OK</span>`
      : `<span class="bi-chk-badge bad">✗ CORRUPT</span>`;

  let html = `<div class="block-inspector fade-in">
    <div class="bi-header">
      <span class="bi-sector-num">S:${s}</span>
      <span class="bi-type-tag ${tagCls}">${typeDisp}</span>
      <span style="font-family:var(--font-mono);font-size:9px;color:var(--wb-dim)">T${track}·SD${side}</span>
      ${chkBadge}
    </div>
    <div class="bi-fields">`;

  // ── Common location fields
  html += field(0, 'Byte offset', `0x${byteOff.toString(16).toUpperCase()} (${byteOff.toLocaleString()})`, 'dim');

  if (info.kind === 'free') {
    html += field(0, 'Status', 'Unallocated — no data', 'dim');

  } else if (info.kind === 'boot') {
    html += field(0, 'Disk ID', `"${info.id}" + 0x${info.flags.toString(16).padStart(2,'0')}`, 'name');
    html += field(4, 'Checksum', `0x${info.checksum.toString(16).toUpperCase().padStart(8,'0')}`);
    const rp = info.rootPtr;
    const rpValid = rp > 1 && rp < ADF.TOTAL_SECTORS;
    const rpMatch = rp === ADF.ROOT_BLOCK;
    html += field(8, 'Root block ptr',
      rpValid
        ? `${rp}${rpMatch ? '' : ` <span style="color:var(--wb-orange)">≠ expected ${ADF.ROOT_BLOCK}</span>`}`
        : `${rp} <span style="color:var(--wb-red)">INVALID — fallback: ${ADF.ROOT_BLOCK}</span>`,
      rpValid && rpMatch ? 'ok' : rpValid ? 'warn' : 'err'
    );

  } else if (info.kind === 'bitmap') {
    html += field(0, 'Block checksum', `0x${u32be(s,0).toString(16).toUpperCase().padStart(8,'0')}`, chkOk ? 'ok' : 'err');
    html += field(4, 'Free sectors', info.freeBits, 'ok');
    html += field(4, 'Used sectors', info.usedBits);

  } else if (info.kind === 'root') {
    html += field(0,  'T_PRIMARY', `${u32be(s,0)} (T_HEADER)`);
    html += field(4,  'Own key', `${info.key} ${info.key === s ? '' : '<span style="color:var(--wb-red)">≠ sector!</span>'}`);
    html += field(-4, 'T_SECONDARY', `${i32be(s, ADF.SECTOR_SIZE-4)} (ST_ROOT)`);
    html += `</div>`;
    html += `<div class="bi-section-label">Volume</div><div class="bi-fields">`;
    html += field(-80, 'Volume name', `"${safeHtml(info.name)}"`, 'name');
    html += field(-92, 'Last modified', info.date);
    html += field(316, 'Bitmap valid', info.bitmapFlag === -1 ? '0xFFFFFFFF ✓' : `0x${(info.bitmapFlag>>>0).toString(16).toUpperCase()} DIRTY`, info.bitmapFlag === -1 ? 'ok' : 'warn');
    html += `</div>`;
    html += `<div class="bi-section-label">Bitmap Blocks</div><div class="bi-fields"><div class="bi-field"><div class="bi-ptr-grid">`;
    for (const b of info.bitmapBlocks) {
      html += `<span class="bi-ptr-chip" onclick="selectSector(${b})">${b}</span>`;
    }
    html += `</div></div></div>`;
    if (info.hashTable.length > 0) {
      html += `<div class="bi-section-label">Hash Table Entries (${info.hashTable.length})</div><div class="bi-fields"><div class="bi-field"><div class="bi-ptr-grid">`;
      for (const e of info.hashTable) {
        const nm = safeHtml(safeBcplStr(e));
        html += `<span class="bi-ptr-chip" onclick="selectSector(${e})" title="${nm || 'S'+e}">${e}${nm ? ' ' + nm : ''}</span>`;
      }
      html += `</div></div></div>`;
    }
    // Build + show chain (dir members)
    const chain = buildChainFromDir(s);
    if (chain.length > 1) { highlightChain(chain); html += `</div>` + renderChainPanel(chain, 'Root Directory Contents'); }
    else { html += `</div>`; } // close bi-fields
    return html + `</div>`;  // close block-inspector

  } else if (info.kind === 'dir') {
    html += field(0,  'T_PRIMARY', `${u32be(s,0)} (T_HEADER)`);
    html += field(4,  'Own key', `${info.key}`);
    html += field(-4, 'T_SECONDARY', `${i32be(s, ADF.SECTOR_SIZE-4)} (ST_DIR)`);
    html += `</div>`;
    html += `<div class="bi-section-label">Directory</div><div class="bi-fields">`;
    html += field(-80, 'Name', `"${safeHtml(info.name)}"`, 'name');
    html += field(-92, 'Last modified', info.date);
    html += field(-12, 'Parent', sectorLink(info.parent, `S:${info.parent}`), '', false);
    if (info.next > 0) html += field(-16, 'Hash chain next', sectorLink(info.next, `S:${info.next}`), '', false);
    if (info.hashTable.length > 0) {
      html += `</div><div class="bi-section-label">Entries (${info.hashTable.length})</div><div class="bi-fields"><div class="bi-field"><div class="bi-ptr-grid">`;
      for (const e of info.hashTable) {
        const nm = safeHtml(safeBcplStr(e));
        html += `<span class="bi-ptr-chip" onclick="selectSector(${e})" title="${nm || 'S'+e}">${e}${nm ? ' '+nm : ''}</span>`;
      }
      html += `</div></div>`;
    }
    const chain = buildChainFromDir(s);
    if (chain.length > 1) { highlightChain(chain); html += `</div>` + renderChainPanel(chain, 'Directory Contents'); }
    else { html += `</div>`; } // close bi-fields
    return html + `</div>`; // close block-inspector

  } else if (info.kind === 'file_header') {
    html += field(0,  'T_PRIMARY', `${u32be(s,0)} (T_HEADER)`);
    html += field(4,  'Own key', `${info.key}`);
    html += field(8,  'Num data ptrs', `${info.highSeq}`);
    html += field(-4, 'T_SECONDARY', `${i32be(s, ADF.SECTOR_SIZE-4)} (ST_FILE)`);
    html += `</div>`;
    html += `<div class="bi-section-label">File Info</div><div class="bi-fields">`;
    html += field(-80, 'Filename', `"${safeHtml(info.name)}"`, 'name');
    html += field(-188,'File size', `${info.fileSize.toLocaleString()} bytes (${formatSize(info.fileSize)})`);
    html += field(-92, 'Last modified', info.date);
    html += field(-192,'Protection', protToStr(info.prot));
    html += field(-12, 'Parent dir', sectorLink(info.parent, `S:${info.parent}`));
    if (info.ext > 0) html += field(-8, 'Extension block', sectorLink(info.ext, `S:${info.ext}`), info.ext ? '' : 'dim');
    if (info.next > 0) html += field(-16, 'Hash chain next', sectorLink(info.next, `S:${info.next}`));
    html += `</div>`;   // close bi-fields
    // Data pointers
    html += ptrTable(info.dataPtrs, `Data Block Pointers (${info.dataPtrs.length})`);
    // Build full chain
    const chain = buildChainFromFileHeader(s);
    highlightChain(chain);
    html += renderChainPanel(chain, 'File Data Chain');
    return html + `</div>`;   // close block-inspector

  } else if (info.kind === 'ofs_data') {
    html += field(0,  'T_PRIMARY', `${u32be(s,0)} (T_DATA)`);
    html += field(4,  'Header key', sectorLink(info.headerKey, `S:${info.headerKey}`) + ` <span style="color:var(--wb-dim);font-size:9px">(file header)</span>`);
    html += field(8,  'Sequence #', `${info.seqNum} <span style="color:var(--wb-dim)">(data block ${info.seqNum} of file)</span>`);
    html += field(12, 'Data size', `${info.dataSize} bytes`);
    html += field(16, 'Next data block', info.nextData > 0 ? sectorLink(info.nextData, `S:${info.nextData}`) : '<span style="color:var(--wb-dim)">— (last block)</span>');
    html += field(20, 'Checksum', `0x${info.storedChk.toString(16).toUpperCase().padStart(8,'0')}`, chkOk ? 'ok' : 'err');
    html += `</div>`;   // close bi-fields
    // Navigate to parent file header
    if (info.headerKey > 0 && info.headerKey < ADF.TOTAL_SECTORS) {
      const chain = buildChainFromFileHeader(info.headerKey);
      highlightChain(chain);
      html += renderChainPanel(chain, 'File Data Chain (click header to inspect file)');
    }
    return html + `</div>`;   // close block-inspector

  } else if (info.kind === 'ext') {
    html += field(0,  'T_PRIMARY', `${u32be(s,0)} (T_LIST)`);
    html += field(4,  'Own key', `${info.key}`);
    html += field(8,  'Num data ptrs', `${info.highSeq}`);
    html += field(-12, 'Parent (file hdr)', sectorLink(info.parent, `S:${info.parent}`));
    html += field(-8,  'Next extension', info.nextExt > 0 ? sectorLink(info.nextExt, `S:${info.nextExt}`) : '<span style="color:var(--wb-dim)">— (last)</span>');
    html += `</div>`;   // close bi-fields
    html += ptrTable(info.dataPtrs, `Data Block Pointers (${info.dataPtrs.length})`);
    if (info.parent > 0 && info.parent < ADF.TOTAL_SECTORS) {
      const chain = buildChainFromFileHeader(info.parent);
      highlightChain(chain);
      html += renderChainPanel(chain, 'Full File Chain');
    }
    return html + `</div>`;   // close block-inspector

  } else if (info.kind === 'dircache') {
    html += field(0,  'T_PRIMARY', `${u32be(s,0)} (T_DIRDISK)`);
    html += field(4,  'Own key', `${info.key}`);
    html += field(8,  'Record count', `${info.records}`);
    html += field(-12,'Parent dir', sectorLink(info.parent, `S:${info.parent}`));
    html += field(-8, 'Next cache blk', info.next > 0 ? sectorLink(info.next, `S:${info.next}`) : '<span style="color:var(--wb-dim)">— (last)</span>');
    html += `<div class="bi-section-label" style="color:var(--wb-dim)">Directory cache blocks store pre-computed directory listings for fast access (OFS/FFS + DirCache disks).</div>`;

  } else {
    html += field(0,  'T_PRIMARY',   `0x${u32be(s,0).toString(16).toUpperCase()} (${u32be(s,0)})`);
    html += field(4,  'Own key',     u32be(s,4));
    html += field(8,  'High seq',    u32be(s,8));
    html += field(12, 'First data',  u32be(s,12));
    html += field(16, 'Checksum',    `0x${u32be(s,16).toString(16).toUpperCase().padStart(8,'0')}`);
    html += field(-4, 'T_SECONDARY', `0x${(u32be(s, ADF.SECTOR_SIZE-4)).toString(16).toUpperCase()} (${i32be(s, ADF.SECTOR_SIZE-4)})`);
  }

  html += `</div></div>`;   // close bi-fields + block-inspector
  return html;
}

function renderChainPanel(chain, title) {
  if (!chain || chain.length === 0) return '';
  const corruptInChain = chain.filter(e => e.chkOk === false).length;
  let html = `<div class="bi-chain-panel">
    <div class="bi-chain-title">
      🔗 ${title}
      <span style="color:var(--wb-dim);font-size:9px">${chain.length} block${chain.length>1?'s':''}</span>
      ${corruptInChain > 0 ? `<span style="color:var(--wb-red);font-size:9px">⚠ ${corruptInChain} corrupt</span>` : ''}
      <button class="bi-chain-clear-btn" onclick="clearChain()">Clear</button>
    </div>
    <div class="bi-chain-entries">`;
  for (const entry of chain) {
    const cls = entry.kind === 'head' ? 'head' : entry.kind === 'ext' ? 'ext' : 'body';
    const badMark = entry.chkOk === false ? ' ⚠' : '';
    html += `<span class="bi-chain-entry ${cls}${entry.chkOk===false?' bad':''}"
      onclick="selectSector(${entry.sector})" title="Sector ${entry.sector}${badMark}">
      ${entry.label}<span class="seq-num">:${entry.sector}</span>${badMark}
    </span>`;
  }
  html += `</div></div>`;
  return html;
}


function showLoadError(msg) {
  // Display a non-blocking error banner in the status area
  const pill = document.getElementById('status-pill');
  pill.className = 'status-pill error';
  pill.textContent = `⚠ ${msg}`;
  // Also show in center panel
  const tm = document.getElementById('track-map');
  if (tm) tm.innerHTML = `<div style="padding:24px;font-family:var(--font-mono);font-size:12px;color:var(--wb-red);text-align:center">
    <div style="font-size:32px;margin-bottom:12px">⚠</div>
    <div style="letter-spacing:2px;margin-bottom:8px">DISK READ ERROR</div>
    <div style="color:var(--wb-dim);font-size:11px">${safeHtml(msg)}</div>
  </div>`;
}

// ────────────────────────────────────────────────────
//  MAIN LOAD HANDLER
// ────────────────────────────────────────────────────
async function loadADF(file) {
  const progressEl = document.getElementById('load-progress');
  const barEl = document.getElementById('progress-bar');
  progressEl.style.display = 'block';
  barEl.style.width = '20%';

  const buf = await file.arrayBuffer();
  diskData = buf;
  diskView = new DataView(buf);
  activeChain = [];
  blockChecksumValid = {};
  currentFileChain = [];
  currentFileChainIndex = -1;
  // Stop any playing MOD
  if (modPlayerState) { modPlayerState.stop(); modPlayerState = null; }

  barEl.style.width = '40%';

  // ── 1. Detect geometry + filesystem type ────────────────────────────────────
  detectAndApplyFormat(buf);

  // Minimum sanity check: need at least 2 sectors for the boot block
  if (buf.byteLength < ADF.SECTOR_SIZE * 2) {
    showLoadError(`File too small: ${buf.byteLength} bytes.`);
    progressEl.style.display = 'none';
    diskData = null; diskView = null;
    return;
  }

  // Warn about non-standard sizes but continue
  if (!KNOWN_SIZES[buf.byteLength]) {
    console.warn(`Non-standard ADF size: ${buf.byteLength} bytes. Treating as ${ADF.DISK_TYPE}.`);
  }

  barEl.style.width = '60%';

  // ── 2. Parse — branch on filesystem family ───────────────────────────────────
  let boot, root, bitmapFree, allEntries;
  try {
    boot = parseBootBlock();

    if (ADF.IS_ADOS) {
      // ── Resolve root block: use boot pointer if valid, else fall back to default ──
      const defaultRoot = ADF.ROOT_BLOCK;
      const bootPtr     = boot.rootBlockNum;
      let resolvedRoot, rootFallback, rootFallbackReason;

      if (bootPtr > 1 && bootPtr < ADF.TOTAL_SECTORS) {
        resolvedRoot      = bootPtr;
        rootFallback      = (bootPtr !== defaultRoot);
        rootFallbackReason = rootFallback
          ? `Boot block points to sector ${bootPtr} (non-standard, expected ${defaultRoot})`
          : null;
      } else {
        // Pointer is 0, 1, or out of range — use the AmigaDOS default
        resolvedRoot      = defaultRoot;
        rootFallback      = true;
        rootFallbackReason = bootPtr === 0
          ? `Root block pointer is 0 — using default sector ${defaultRoot}`
          : `Root block pointer ${bootPtr} is out of range — using default sector ${defaultRoot}`;
        console.warn(`[ADF] ${rootFallbackReason}`);
      }

      boot.rootBlockFallback       = rootFallback;
      boot.rootBlockFallbackReason = rootFallbackReason;

      // ── AmigaDOS (OFS / FFS and all variants) ────────────────────────────────
      root       = parseRootBlock(resolvedRoot);
      bitmapFree = parseBitmap(root.bitmapBlocks);
      allEntries = collectAllEntries(resolvedRoot);
      sectorTypes = classifySectors(boot, root, bitmapFree, root.bitmapBlocks, allEntries);
    } else {
      // ── PFS1/PFS2/PFS3 / SFS — graceful display ──────────────────────────────
      const volName = ADF.FS_KIND.startsWith('SFS') ? readSfsVolumeName() : readPfsVolumeName();
      root = {
        name: volName,
        date: '',
        bitmapFlag: 0,
        bitmapBlocks: [],
        checksumOk: null  // not applicable
      };
      bitmapFree = new Array(ADF.TOTAL_SECTORS).fill(false);
      allEntries = [];
      sectorTypes = classifySectorsForeign();
    }
  } catch(err) {
    console.error('ADF parse error:', err);
    progressEl.style.display = 'none';
    document.getElementById('dropzone').classList.remove('hidden');
    diskData = null; diskView = null;
    showLoadError(`Parse failed: ${err.message || err}`);
    return;
  }

  barEl.style.width = '80%';

  // ── 3. Checksums (AmigaDOS only) ─────────────────────────────────────────────
  if (ADF.IS_ADOS) computeAllChecksums();

  // ── 4. Update UI ─────────────────────────────────────────────────────────────
  document.getElementById('dropzone').classList.add('hidden');
  document.getElementById('status-pill').className = 'status-pill loaded';
  document.getElementById('status-pill').textContent = `● ${root.name || 'DISK'}  [${ADF.DISK_TYPE}·${ADF.FS_KIND}]`;

  document.getElementById('tree-container').innerHTML =
    allEntries.length > 0 ? renderTree(allEntries)
    : `<div style="padding:16px;font-family:var(--font-mono);font-size:11px;color:var(--wb-dim);text-align:center">
        ${ADF.FS_KIND} filesystem detected.<br>File tree not available.<br>
        <span style="opacity:0.5;font-size:9px">Use Hex Viewer to inspect raw blocks.</span>
       </div>`;

  document.getElementById('track-map').innerHTML = renderDiskMap(bitmapFree);
  document.getElementById('boot-analysis').innerHTML = renderBootAnalysis(boot, root);
  document.getElementById('info-container').innerHTML = renderInfoPanel(boot, root, bitmapFree, allEntries);
  loadedAllEntries = allEntries;
  // Clear any previous file info selection
  const fileInfoEl = document.getElementById('file-info-container');
  if (fileInfoEl) { fileInfoEl.style.display = 'none'; fileInfoEl.innerHTML = ''; }

  // Reset boot code tab so it regenerates on next visit
  _bootCodeRendered = false;
  if (document.querySelector('.tab[data-tab="bootcode"]')?.classList.contains('active')) {
    renderBootCode();
  } else {
    document.getElementById('bootcode-display').innerHTML =
      `<div class="fc-empty" style="opacity:0.3">
        <div class="fc-empty-icon">${boot.hasCode ? '⚙️' : '🚫'}</div>
        <div class="fc-empty-text">${boot.hasCode ? 'CLICK TAB TO DISASSEMBLE' : 'NO BOOT CODE'}</div>
      </div>`;
  }

  barEl.style.width = '100%';
  setTimeout(() => { progressEl.style.display = 'none'; }, 500);
  selectSector(0);
}

// ────────────────────────────────────────────────────
//  EVENT LISTENERS
// ────────────────────────────────────────────────────
document.getElementById('file-input').addEventListener('change', e => {
  if (e.target.files[0]) loadADF(e.target.files[0]);
});

const dropzone = document.getElementById('dropzone');
document.body.addEventListener('dragover', e => {
  e.preventDefault();
  dropzone.classList.add('dragover');
  dropzone.classList.remove('hidden');
});
document.body.addEventListener('dragleave', e => {
  if (!e.relatedTarget || e.relatedTarget === document.body) {
    dropzone.classList.remove('dragover');
    if (diskData) dropzone.classList.add('hidden');
  }
});
document.body.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) loadADF(file);
});

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const name = tab.dataset.tab;
    ['bootblock','bootcode','bitmaphex','filecontent'].forEach(t => {
      const el = document.getElementById(`tab-${t}`);
      if (!el) return;
      el.style.display = t === name ? 'flex' : 'none';
    });
    if (name === 'bitmaphex') {
      document.getElementById('hex-controls').style.display = diskData ? 'flex' : 'none';
    }
    if (name === 'bootcode' && diskData) {
      renderBootCode();
    }
  });
});

// Hex nav — follows file data chain when a file is selected from the tree
document.getElementById('hex-prev').addEventListener('click', () => {
  if (currentFileChain.length > 0 && currentFileChainIndex > 0) {
    selectSector(currentFileChain[currentFileChainIndex - 1]);
  } else if (currentFileChain.length === 0 && currentSector > 0) {
    selectSector(currentSector - 1);
  }
});
document.getElementById('hex-next').addEventListener('click', () => {
  if (currentFileChain.length > 0 && currentFileChainIndex < currentFileChain.length - 1) {
    selectSector(currentFileChain[currentFileChainIndex + 1]);
  } else if (currentFileChain.length === 0 && currentSector < ADF.TOTAL_SECTORS - 1) {
    selectSector(currentSector + 1);
  }
});

// Keyboard
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeIFF(); return; }
  if (!diskData) return;
  if (document.getElementById('iff-modal').classList.contains('open')) return;
  if (e.key === 'ArrowLeft' && currentSector > 0) selectSector(currentSector - 1);
  if (e.key === 'ArrowRight' && currentSector < ADF.TOTAL_SECTORS - 1) selectSector(currentSector + 1);
  if (e.key === 'ArrowUp' && currentSector > 22) selectSector(currentSector - 22);
  if (e.key === 'ArrowDown' && currentSector < ADF.TOTAL_SECTORS - 22) selectSector(currentSector + 22);
});

// ── SELECT FILE FROM TREE — sets up file chain navigation ─────────────────────
function selectFileSector(headerSector) {
  const chain = buildChainFromFileHeader(headerSector);
  // Build ordered sector list: header first, then data blocks in chain order
  currentFileChain = chain.map(e => e.sector);
  currentFileChainIndex = 0;
  highlightChain(chain);
  selectSector(headerSector);
  updateFileInfoPanel(headerSector);
}

// ════════════════════════════════════════════════════
//  BOOT CODE TAB — MC68000 DISASSEMBLER
// ════════════════════════════════════════════════════

let _bootCodeRendered = false;

function renderBootCode() {
  if (_bootCodeRendered) return;
  _bootCodeRendered = true;

  const display = document.getElementById('bootcode-display');
  if (!diskData) return;

  const bootData  = new Uint8Array(diskData, 0, Math.min(diskData.byteLength, 1024));
  const hasCode   = new DataView(diskData).getUint32(12, false) !== 0;
  // Boot code starts at byte 12 (after DOS id / checksum / rootblock-ptr)
  const CODE_OFF  = 12;
  const codeLen   = 1024 - CODE_OFF;

  // ── Toolbar ────────────────────────────────────────
  const instrCount = hasCode ? '...' : '0';
  display.innerHTML = `
    <div class="disasm-toolbar">
      MC68000 DISASSEMBLY — BOOT BLOCK
      <div class="disasm-toolbar-info">
        Code start: <span>+$${CODE_OFF.toString(16).toUpperCase()}</span> &nbsp;|&nbsp;
        Size: <span>${codeLen} bytes</span> &nbsp;|&nbsp;
        Base PC: <span>$00F80000</span>
      </div>
    </div>
    <div id="disasm-listing-wrap" class="disasm-listing"></div>
  `;

  if (!hasCode) {
    display.querySelector('#disasm-listing-wrap').outerHTML =
      `<div class="disasm-nocode">
        <div style="font-size:48px">🚫</div>
        <div>NON-BOOTABLE DISK</div>
        <div style="font-size:10px;margin-top:4px;opacity:0.6">Boot block contains no executable code</div>
      </div>`;
    return;
  }

  // Amiga Kickstart maps the boot block to $BFC000 but internally jump
  // to offset 12 (past the header). We display addresses relative to the
  // start of the boot block file offset so listings are easy to follow.
  const BASE_PC = 0x00000000;

  setTimeout(() => {
    const instrs = disasm68k(bootData, CODE_OFF, codeLen, BASE_PC + CODE_OFF);
    const wrap   = document.getElementById('disasm-listing-wrap');
    if (!wrap) return;

    // Build a set of branch target addresses for label generation
    const branchTargets = new Set();
    for (const ins of instrs) {
      if (ins.branchTarget !== undefined) branchTargets.add(ins.branchTarget);
    }
    // Also the entry point
    branchTargets.add(BASE_PC + CODE_OFF);

    const labelMap = new Map();
    let labelIdx = 0;
    for (const addr of [...branchTargets].sort((a,b)=>a-b)) {
      if (addr === BASE_PC + CODE_OFF) {
        labelMap.set(addr, 'boot_start');
      } else {
        labelMap.set(addr, `loc_${addr.toString(16).toUpperCase().padStart(4,'0')}`);
        labelIdx++;
      }
    }

    // ── Amiga exec / LVO comment map ────────────────
    const LVO = {
      0xFFFFFFFE: 'OpenLibrary',  0xFFFFFFFC: 'CloseLibrary',
      0xFFFFFFEE: 'FindTask',     0xFFFFFFEC: 'AddTask',
      0xFFFFFFEA: 'RemTask',      0xFFFFFFE8: 'AllocMem',
      0xFFFFFFE6: 'FreeMem',      0xFFFFFFE4: 'GetMsg',
      0xFFFFFFE2: 'PutMsg',       0xFFFFFFDC: 'OldOpenLibrary',
      0xFFFFFFC4: 'DoIO',         0xFFFFFFC2: 'SendIO',
      0xFFFFFFC0: 'CheckIO',      0xFFFFFFBE: 'WaitIO',
      0xFFFFFFBC: 'AbortIO',      0xFFFFFFC8: 'OpenDevice',
      0xFFFFFFC6: 'CloseDevice',
    };

    let rows = '';
    for (const ins of instrs) {
      // Insert label line if this address is a branch target
      if (labelMap.has(ins.addr)) {
        const lbl = labelMap.get(ins.addr);
        rows += `<tr class="disasm-label-row"><td colspan="5">${lbl}:</td></tr>`;
      }

      // Classify row for colouring
      const mn = ins.mnem;
      let rowCls = '';
      if (mn === 'RTS' || mn === 'RTE') rowCls = 'is-rts';
      else if (mn === 'JMP' || mn === 'JRA') rowCls = 'is-jmp';
      else if (mn.startsWith('B') && mn !== 'BTST' && mn !== 'BSET' && mn !== 'BCLR' && mn !== 'BCHG') rowCls = 'is-branch';
      else if (mn === 'DC.W' || mn === 'DC.L') rowCls = 'is-dc';

      // Build coloured operand string
      const opsHtml = colorizeOperands(ins.ops);

      // Build comment
      let cmt = ins.comment || '';
      if (ins.branchTarget !== undefined && labelMap.has(ins.branchTarget)) {
        const lbl = labelMap.get(ins.branchTarget);
        cmt = cmt ? `${cmt} → ${lbl}` : `→ ${lbl}`;
      }
      // Amiga LVO lookup for JSR/JMP with displacement from A6
      if ((mn === 'JSR' || mn === 'JMP') && ins.lvo !== undefined) {
        const name = LVO[ins.lvo >>> 0];
        if (name) cmt = (cmt ? cmt + ' · ' : '') + `exec.${name}`;
      }

      const addrStr  = ins.addr.toString(16).toUpperCase().padStart(8,'0');
      const bytesStr = ins.bytes;
      const cmtHtml  = cmt ? `<span class="cmt-label">; ${safeHtml(cmt)}</span>` : '';

      rows += `<tr class="disasm-row ${rowCls}">
        <td class="dc-addr">$${addrStr}</td>
        <td class="dc-bytes">${bytesStr}</td>
        <td class="dc-mnem">${mn}</td>
        <td class="dc-ops">${opsHtml}</td>
        <td class="dc-comment">${cmtHtml}</td>
      </tr>`;
    }

    wrap.innerHTML = `<table><tbody>${rows}</tbody></table>`;

    // Update toolbar with actual count
    const toolbar = display.querySelector('.disasm-toolbar-info');
    if (toolbar) {
      toolbar.innerHTML = toolbar.innerHTML
        .replace('...', instrs.length.toLocaleString());
    }
  }, 0);
}

// ── Operand syntax colouring ────────────────────────
function colorizeOperands(ops) {
  if (!ops) return '';
  let s = safeHtml(ops);
  // Immediates  #$xx
  s = s.replace(/(#\$[0-9A-Fa-f]+)/g, '<span class="op-imm">$1</span>');
  // Immediate decimals  #n
  s = s.replace(/(#-?\d+)(?![\d])/g, '<span class="op-imm">$1</span>');
  // Addresses  $xxxxxxxx  (bare hex starting with $)
  s = s.replace(/(?<![#A-Za-z])\$([0-9A-Fa-f]{4,8})/g, '<span class="op-addr">\$$1</span>');
  // Address registers
  s = s.replace(/\b(A[0-7]|SP)\b/g, '<span class="op-areg">$1</span>');
  // Data registers
  s = s.replace(/\b(D[0-7])\b/g, '<span class="op-reg">$1</span>');
  // SR/CCR/USP
  s = s.replace(/\b(SR|CCR|USP)\b/g, '<span class="op-sr">$1</span>');
  // (An) parenthesised — indirect indicator
  s = s.replace(/(\([^)]+\))/g, '<span class="op-indir">$1</span>');
  return s;
}

// ════════════════════════════════════════════════════
//  MC68000 DISASSEMBLER
// ════════════════════════════════════════════════════

function disasm68k(data, startOffset, length, basePC) {
  const end = Math.min(startOffset + length, data.length);
  const result = [];

  function u8(o)   { return data[o] & 0xFF; }
  function u16(o)  { return ((data[o] & 0xFF) << 8) | (data[o+1] & 0xFF); }
  function s16(o)  { const v = u16(o); return v >= 0x8000 ? v - 0x10000 : v; }
  function u32(o)  { return (((data[o]&0xFF)<<24)|((data[o+1]&0xFF)<<16)|((data[o+2]&0xFF)<<8)|(data[o+3]&0xFF))>>>0; }

  function h8(v)   { return '$' + (v&0xFF).toString(16).toUpperCase().padStart(2,'0'); }
  function h16(v)  { return '$' + (v&0xFFFF).toString(16).toUpperCase().padStart(4,'0'); }
  function h32(v)  { return '$' + (v>>>0).toString(16).toUpperCase().padStart(8,'0'); }

  const DN = ['D0','D1','D2','D3','D4','D5','D6','D7'];
  const AN = ['A0','A1','A2','A3','A4','A5','A6','SP'];
  const SZ = ['.B','.W','.L'];

  // Decode effective address
  // Returns { str, extra (bytes consumed beyond opword), lvo? }
  function ea(mode, reg, sz, off, pc) {
    switch (mode) {
      case 0: return { str: DN[reg], extra: 0 };
      case 1: return { str: AN[reg], extra: 0 };
      case 2: return { str: `(${AN[reg]})`, extra: 0 };
      case 3: return { str: `(${AN[reg]})+`, extra: 0 };
      case 4: return { str: `-(${AN[reg]})`, extra: 0 };
      case 5: {
        const d = s16(off);
        const lvo = (reg === 6) ? d : undefined; // A6 = exec base by convention
        return { str: `(${d},${AN[reg]})`, extra: 2, lvo };
      }
      case 6: {
        const ext = u16(off);
        const da  = (ext>>15)&1, xr = (ext>>12)&7, wl = (ext>>11)&1;
        const d   = (ext&0x80) ? (ext&0xFF)-256 : (ext&0xFF);
        return { str: `(${d},${AN[reg]},${da?AN[xr]:DN[xr]}${wl?'.L':'.W'})`, extra: 2 };
      }
      case 7: switch (reg) {
        case 0: return { str: h16(u16(off))+'.W', extra: 2 };
        case 1: return { str: h32(u32(off))+'.L', extra: 4 };
        case 2: {
          const d = s16(off);
          return { str: `(${d},PC)`, extra: 2, pcRel: (pc + d) >>> 0 };
        }
        case 3: {
          const ext = u16(off);
          const da  = (ext>>15)&1, xr = (ext>>12)&7, wl = (ext>>11)&1;
          const d   = (ext&0x80) ? (ext&0xFF)-256 : (ext&0xFF);
          return { str: `(${d},PC,${da?AN[xr]:DN[xr]}${wl?'.L':'.W'})`, extra: 2 };
        }
        case 4: {
          let v, ex;
          if (sz===1){v=h8(u16(off)&0xFF);ex=2;}
          else if(sz===2){v=h16(u16(off));ex=2;}
          else{v=h32(u32(off));ex=4;}
          return { str: '#'+v, extra: ex };
        }
        default: return { str: '???', extra: 0 };
      }
      default: return { str: '???', extra: 0 };
    }
  }

  function regList(mask, predec) {
    const names = [];
    for (let i=0;i<8;i++) if ((predec ? (mask>>(7-i)) : (mask>>i))&1) names.push(DN[i]);
    for (let i=0;i<8;i++) if ((predec ? (mask>>(15-i)) : (mask>>(8+i)))&1) names.push(AN[i]);
    // Compact consecutive
    if (!names.length) return '';
    const out = [];
    let run = [names[0]];
    const rIdx = n => {
      const di = DN.indexOf(n), ai = AN.indexOf(n);
      return di>=0 ? di : (ai>=0 ? 8+ai : 99);
    };
    for (let i=1;i<names.length;i++) {
      if (rIdx(names[i]) === rIdx(run[run.length-1])+1) { run.push(names[i]); }
      else { out.push(run.length>2?`${run[0]}-${run[run.length-1]}`:run.join('/')); run=[names[i]]; }
    }
    out.push(run.length>2?`${run[0]}-${run[run.length-1]}`:run.join('/'));
    return out.join('/');
  }

  let off = startOffset;
  while (off + 1 < end) {
    const iOff = off;
    const iPC  = basePC + off;
    const iPC2 = iPC + 2; // PC value after opword fetch
    const w    = u16(off); off += 2;
    const top  = (w>>12)&0xF;

    let mnem = 'DC.W', ops = h16(w), comment = '', branchTarget, lvo;
    let valid = true;
    let wordBuf = [w];

    function peek16() { return off < end-1 ? u16(off) : 0; }
    function take16() { const v=u16(off); wordBuf.push(v); off+=2; return v; }
    function take32() { const v=u32(off); wordBuf.push(u16(off),u16(off+2)); off+=4; return v; }

    function eaAt(mode, reg, sz) {
      const r = ea(mode, reg, sz, off, iPC2 + (off - iOff - 2));
      for (let i=0;i<r.extra;i+=2) wordBuf.push(u16(off+i));
      off += r.extra;
      if (r.lvo !== undefined) lvo = r.lvo;
      return r;
    }

    try { // trap decode errors
    if (top === 0) {
      // ── Group 0: Bit / MOVEP / Immediate ─────────────
      const sm = (w>>3)&7, sr = w&7;
      const dynBit = (w>>8)&1, bitOp = (w>>6)&3;
      const BOPS = ['BTST','BCHG','BCLR','BSET'];

      if ((w&0xFF00)===0x003C){ const i=take16(); mnem='ORI.B'; ops=`#${h8(i)},CCR`; }
      else if((w&0xFF00)===0x007C){ const i=take16(); mnem='ORI.W'; ops=`#${h16(i)},SR`; }
      else if((w&0xFF00)===0x023C){ const i=take16(); mnem='ANDI.B'; ops=`#${h8(i)},CCR`; }
      else if((w&0xFF00)===0x027C){ const i=take16(); mnem='ANDI.W'; ops=`#${h16(i)},SR`; }
      else if((w&0xFF00)===0x0A3C){ const i=take16(); mnem='EORI.B'; ops=`#${h8(i)},CCR`; }
      else if((w&0xFF00)===0x0A7C){ const i=take16(); mnem='EORI.W'; ops=`#${h16(i)},SR`; }
      else if((w&0x0100)===0x0100 && (w&0x00F8)===0x0008) {
        // MOVEP
        const dr=(w>>9)&7, ar=w&7, toMem=(w>>7)&1, long=(w>>6)&1;
        const d=take16(); const ds=(d>=0x8000?d-0x10000:d);
        mnem=`MOVEP${long?'.L':'.W'}`;
        ops=toMem?`${DN[dr]},(${ds},${AN[ar]})`:`(${ds},${AN[ar]}),${DN[dr]}`;
      }
      else if((w&0x0100)===0x0100) {
        // Bit ops dynamic
        const dr=(w>>9)&7;
        const r=eaAt(sm,sr,1);
        mnem=BOPS[bitOp]; ops=`${DN[dr]},${r.str}`;
      }
      else if((w&0xF100)===0x0000) {
        const szB=(w>>6)&3;
        if(szB===3){valid=false;}
        else {
          const IMM_OPS=['ORI','ANDI','SUBI','ADDI',null,'EORI','CMPI'];
          const op=(w>>9)&7;
          const name=IMM_OPS[op];
          if(!name){valid=false;}
          else {
            const sz=[1,2,4][szB];
            const imm = szB===2 ? take32() : take16();
            const r=eaAt(sm,sr,sz);
            const iv=szB===0?h8(imm&0xFF):szB===1?h16(imm):h32(imm);
            mnem=name+SZ[szB]; ops=`#${iv},${r.str}`;
          }
        }
      }
      else if((w&0xF800)===0x0800) {
        // Static bit ops
        const bitNum=take16()&0xFF;
        const r=eaAt(sm,sr,1);
        mnem=BOPS[bitOp]; ops=`#${h8(bitNum)},${r.str}`;
      }
      else { valid=false; }
    }

    else if (top===1||top===2||top===3) {
      // ── MOVE ─────────────────────────────────────────
      const SZB=[null,1,4,2], SSF=[null,'.B','.L','.W'];
      const sz=SZB[top], sf=SSF[top];
      const dm=(w>>6)&7, dr=(w>>9)&7;
      const sm=(w>>3)&7,  sr=w&7;
      const src=eaAt(sm,sr,sz);
      const dst=eaAt(dm,dr,sz);
      mnem=(dm===1?'MOVEA':'MOVE')+sf; ops=`${src.str},${dst.str}`;
    }

    else if (top===4) {
      // ── Misc ─────────────────────────────────────────
      const sm=(w>>3)&7, sr=w&7;
      const sz2=(w>>6)&3;

      if(w===0x4AFC){mnem='ILLEGAL';}
      else if(w===0x4E70){mnem='RESET';}
      else if(w===0x4E71){mnem='NOP';}
      else if(w===0x4E72){const s=take16();mnem='STOP';ops=`#${h16(s)}`;}
      else if(w===0x4E73){mnem='RTE';}
      else if(w===0x4E74){const o=take16();mnem='RTD';ops=`#${o}`;}
      else if(w===0x4E75){mnem='RTS';}
      else if(w===0x4E76){mnem='TRAPV';}
      else if(w===0x4E77){mnem='RTR';}
      else if((w&0xFFF8)===0x4E58){mnem='UNLK';ops=AN[w&7];}
      else if((w&0xFFF8)===0x4E50){const d=take16();mnem='LINK';ops=`${AN[w&7]},#${d>=0x8000?d-0x10000:d}`;}
      else if((w&0xFFF8)===0x4E60){mnem='MOVE';ops=`${AN[w&7]},USP`;}
      else if((w&0xFFF8)===0x4E68){mnem='MOVE';ops=`USP,${AN[w&7]}`;}
      else if((w&0xFFF0)===0x4E40){mnem='TRAP';ops=`#${w&0xF}`;}
      else if((w&0xFFF8)===0x4880){mnem='EXT.W';ops=DN[w&7];}
      else if((w&0xFFF8)===0x48C0){mnem='EXT.L';ops=DN[w&7];}
      else if((w&0xFB80)===0x4880) {
        // MOVEM
        const toMem=!((w>>10)&1), sz=(w>>6)&1, predec=sm===4;
        const mask=take16();
        const r=eaAt(sm,sr,sz?4:2);
        mnem='MOVEM'+(sz?'.L':'.W');
        ops=toMem?`${regList(mask,predec)},${r.str}`:`${r.str},${regList(mask,false)}`;
      }
      else if((w&0xFFC0)===0x4840&&sm!==0&&sm!==1){const r=eaAt(sm,sr,4);mnem='PEA';ops=r.str;}
      else if((w&0xFFF8)===0x4840){mnem='SWAP';ops=DN[w&7];}
      else if((w&0xF1C0)===0x41C0){const ar=(w>>9)&7;const r=eaAt(sm,sr,4);mnem='LEA';ops=`${r.str},${AN[ar]}`;}
      else if((w&0xF1C0)===0x4100){const dr=(w>>9)&7;const r=eaAt(sm,sr,2);mnem='CHK.W';ops=`${r.str},${DN[dr]}`;}
      else if((w&0xFFC0)===0x4EC0){const r=eaAt(sm,sr,4);mnem='JMP';ops=r.str;if(r.lvo!==undefined)lvo=r.lvo;}
      else if((w&0xFFC0)===0x4E80){const r=eaAt(sm,sr,4);mnem='JSR';ops=r.str;if(r.lvo!==undefined)lvo=r.lvo;}
      else if((w&0xFFC0)===0x40C0){const r=eaAt(sm,sr,2);mnem='MOVE.W';ops=`SR,${r.str}`;}
      else if((w&0xFFC0)===0x44C0){const r=eaAt(sm,sr,2);mnem='MOVE.W';ops=`${r.str},CCR`;}
      else if((w&0xFFC0)===0x46C0){const r=eaAt(sm,sr,2);mnem='MOVE.W';ops=`${r.str},SR`;}
      else if((w&0xFFC0)===0x4AC0){const r=eaAt(sm,sr,1);mnem='TAS';ops=r.str;}
      else if((w&0xFF00)===0x4A00||(w&0xFF00)===0x4A40||(w&0xFF00)===0x4A80){
        const s=[1,2,4][sz2];const r=eaAt(sm,sr,s);mnem='TST'+SZ[sz2];ops=r.str;
      }
      else if((w&0xFF00)===0x4600||(w&0xFF00)===0x4640||(w&0xFF00)===0x4680){
        const s=[1,2,4][sz2];const r=eaAt(sm,sr,s);mnem='NOT'+SZ[sz2];ops=r.str;
      }
      else if((w&0xFF00)===0x4400||(w&0xFF00)===0x4440||(w&0xFF00)===0x4480){
        const s=[1,2,4][sz2];const r=eaAt(sm,sr,s);mnem='NEG'+SZ[sz2];ops=r.str;
      }
      else if((w&0xFF00)===0x4000||(w&0xFF00)===0x4040||(w&0xFF00)===0x4080){
        const s=[1,2,4][sz2];const r=eaAt(sm,sr,s);mnem='NEGX'+SZ[sz2];ops=r.str;
      }
      else if((w&0xFF00)===0x4200||(w&0xFF00)===0x4240||(w&0xFF00)===0x4280){
        const s=[1,2,4][sz2];const r=eaAt(sm,sr,s);mnem='CLR'+SZ[sz2];ops=r.str;
      }
      else if((w&0xFF00)===0x4800&& sz2===0){const r=eaAt(sm,sr,1);mnem='NBCD';ops=r.str;}
      else { valid=false; }
    }

    else if (top===5) {
      // ── ADDQ / SUBQ / Scc / DBcc ─────────────────────
      const CC=['T','F','HI','LS','CC','CS','NE','EQ','VC','VS','PL','MI','GE','LT','GT','LE'];
      const cond=(w>>8)&0xF, sm=(w>>3)&7, sr=w&7, szB=(w>>6)&3;
      if(szB===3) {
        if(sm===1){
          const d=take16(); const ds=d>=0x8000?d-0x10000:d;
          const t=(basePC+(iOff+2)+ds)>>>0;
          mnem=`DB${CC[cond]}`; ops=`${DN[sr]},${h32(t)}`; branchTarget=t;
        } else {
          const r=eaAt(sm,sr,1);
          mnem=`S${CC[cond]}`; ops=r.str;
        }
      } else {
        const imm=((w>>9)&7)||8;
        const isAdd=!((w>>8)&1);
        const sz=[1,2,4][szB];
        const r=eaAt(sm,sr,sz);
        mnem=(isAdd?'ADDQ':'SUBQ')+SZ[szB]; ops=`#${imm},${r.str}`;
      }
    }

    else if (top===6) {
      // ── Bcc / BRA / BSR ──────────────────────────────
      const CC=['RA','SR','HI','LS','CC','CS','NE','EQ','VC','VS','PL','MI','GE','LT','GT','LE'];
      const cond=(w>>8)&0xF;
      let d8=w&0xFF, tgt;
      if(d8===0){
        const d=take16(); const ds=d>=0x8000?d-0x10000:d;
        tgt=(basePC+(iOff+2)+ds)>>>0;
      } else {
        if(d8>=0x80)d8-=0x100;
        tgt=(basePC+(iOff+2)+d8)>>>0;
      }
      branchTarget=tgt;
      mnem=cond===0?'BRA':cond===1?'BSR':`B${CC[cond]}`;
      ops=h32(tgt);
    }

    else if (top===7) {
      // ── MOVEQ ─────────────────────────────────────────
      const dr=(w>>9)&7, imm=w&0xFF;
      const si=imm>=0x80?imm-0x100:imm;
      mnem='MOVEQ'; ops=`#${si},${DN[dr]}`;
    }

    else if (top===8) {
      // ── OR / DIVU / DIVS / SBCD ──────────────────────
      const dr=(w>>9)&7, om=(w>>6)&7, sm=(w>>3)&7, sr=w&7;
      if(om===3){const r=eaAt(sm,sr,2);mnem='DIVU.W';ops=`${r.str},${DN[dr]}`;}
      else if(om===7){const r=eaAt(sm,sr,2);mnem='DIVS.W';ops=`${r.str},${DN[dr]}`;}
      else if(om===4&&(sm===0||sm===4)){
        mnem='SBCD';ops=sm===4?`-(${AN[sr]}),-(${AN[dr]})`:`${DN[sr]},${DN[dr]}`;
      } else {
        const sz=[1,2,4][om&3], toR=!(om&4);
        const r=eaAt(sm,sr,sz);
        mnem='OR'+SZ[om&3]; ops=toR?`${r.str},${DN[dr]}`:`${DN[dr]},${r.str}`;
      }
    }

    else if (top===9) {
      // ── SUB / SUBX / SUBA ────────────────────────────
      const dr=(w>>9)&7, om=(w>>6)&7, sm=(w>>3)&7, sr=w&7;
      if(om===3||om===7){
        const r=eaAt(sm,sr,om===3?2:4);mnem=om===3?'SUBA.W':'SUBA.L';ops=`${r.str},${AN[dr]}`;
      } else if((om===4||om===5||om===6)&&(sm===0||sm===4)){
        mnem='SUBX'+SZ[om-4];ops=sm===4?`-(${AN[sr]}),-(${AN[dr]})`:`${DN[sr]},${DN[dr]}`;
      } else {
        const sz=[1,2,4][om&3], toR=!(om&4);
        const r=eaAt(sm,sr,sz);
        mnem='SUB'+SZ[om&3]; ops=toR?`${r.str},${DN[dr]}`:`${DN[dr]},${r.str}`;
      }
    }

    else if (top===0xA) {
      mnem='DC.W'; ops=h16(w); comment='LINEA (A-trap)';
    }

    else if (top===0xB) {
      // ── CMP / EOR / CMPA / CMPM ──────────────────────
      const dr=(w>>9)&7, om=(w>>6)&7, sm=(w>>3)&7, sr=w&7;
      if(om===3||om===7){
        const r=eaAt(sm,sr,om===3?2:4);mnem=om===3?'CMPA.W':'CMPA.L';ops=`${r.str},${AN[dr]}`;
      } else if((om===4||om===5||om===6)&&sm===1){
        mnem='CMPM'+SZ[om-4]; ops=`(${AN[sr]})+,(${AN[dr]})+`;
      } else if(om===4||om===5||om===6){
        const sz=[1,2,4][om-4];const r=eaAt(sm,sr,sz);
        mnem='EOR'+SZ[om-4]; ops=`${DN[dr]},${r.str}`;
      } else {
        const sz=[1,2,4][om&3];const r=eaAt(sm,sr,sz);
        mnem='CMP'+SZ[om&3]; ops=`${r.str},${DN[dr]}`;
      }
    }

    else if (top===0xC) {
      // ── AND / MUL / ABCD / EXG ───────────────────────
      const dr=(w>>9)&7, om=(w>>6)&7, sm=(w>>3)&7, sr=w&7;
      if(om===3){const r=eaAt(sm,sr,2);mnem='MULU.W';ops=`${r.str},${DN[dr]}`;}
      else if(om===7){const r=eaAt(sm,sr,2);mnem='MULS.W';ops=`${r.str},${DN[dr]}`;}
      else if(om===5&&(sm===0||sm===4)){
        mnem='ABCD';ops=sm===4?`-(${AN[sr]}),-(${AN[dr]})`:`${DN[sr]},${DN[dr]}`;
      }
      else if(om===4&&sm===0){mnem='EXG';ops=`${DN[dr]},${DN[sr]}`;}
      else if(om===4&&sm===1){mnem='EXG';ops=`${AN[dr]},${AN[sr]}`;}
      else if(om===6&&sm===1){mnem='EXG';ops=`${DN[dr]},${AN[sr]}`;}
      else {
        const sz=[1,2,4][om&3], toR=!(om&4);
        const r=eaAt(sm,sr,sz);
        mnem='AND'+SZ[om&3]; ops=toR?`${r.str},${DN[dr]}`:`${DN[dr]},${r.str}`;
      }
    }

    else if (top===0xD) {
      // ── ADD / ADDX / ADDA ────────────────────────────
      const dr=(w>>9)&7, om=(w>>6)&7, sm=(w>>3)&7, sr=w&7;
      if(om===3||om===7){
        const r=eaAt(sm,sr,om===3?2:4);mnem=om===3?'ADDA.W':'ADDA.L';ops=`${r.str},${AN[dr]}`;
      } else if((om===4||om===5||om===6)&&(sm===0||sm===4)){
        mnem='ADDX'+SZ[om-4];ops=sm===4?`-(${AN[sr]}),-(${AN[dr]})`:`${DN[sr]},${DN[dr]}`;
      } else {
        const sz=[1,2,4][om&3], toR=!(om&4);
        const r=eaAt(sm,sr,sz);
        mnem='ADD'+SZ[om&3]; ops=toR?`${r.str},${DN[dr]}`:`${DN[dr]},${r.str}`;
      }
    }

    else if (top===0xE) {
      // ── Shift / Rotate ───────────────────────────────
      const sm=(w>>3)&7, sr=w&7, szB=(w>>6)&3;
      const SOPS=['AS','LS','ROX','RO'];
      const dir=(w>>8)&1;
      if(szB===3) {
        const ot=(w>>9)&3;
        const r=eaAt(sm,sr,2);
        mnem=SOPS[ot]+(dir?'L':'R')+'.W'; ops=r.str;
      } else {
        const ot=(w>>3)&3, useReg=(w>>5)&1;
        const cnt=(w>>9)&7;
        const c=useReg?DN[cnt]:(cnt===0?'#8':'#'+cnt);
        mnem=SOPS[ot]+(dir?'L':'R')+SZ[szB]; ops=`${c},${DN[sr]}`;
      }
    }

    else if (top===0xF) {
      mnem='DC.W'; ops=h16(w); comment='LINEF (F-trap)';
    }

    } catch(e) { valid=false; }

    if (!valid) {
      off = iOff + 2;
      wordBuf = [w];
      mnem = 'DC.W'; ops = h16(w); comment='';
      branchTarget = undefined; lvo = undefined;
    }

    const rawBytes = wordBuf.map(ww =>
      ww.toString(16).toUpperCase().padStart(4,'0')).join(' ');

    result.push({ addr: iPC, offset: iOff, bytes: rawBytes, byteLen: off-iOff,
                  mnem, ops, comment, branchTarget, lvo });
  }

  return result;
}

// ════════════════════════════════════════════════════
//  FILE CONTENT TAB

// ────────────────────────────────────────────────────
// FILE CONTENT: BINARY VIEWER MODE TOGGLES (Binary / ASM / ASCII) + HEADER RAW BLOCKS
// ────────────────────────────────────────────────────
let _fcBinState = null;

window.fcBinSetMode = function(mode) {
  if (!_fcBinState) return;
  _fcBinState.mode = mode;
  renderFcBinaryMode();
};



function renderFcBinaryMode() {
  const st = _fcBinState;
  if (!st || !st.displayEl) return;
  const body = st.displayEl.querySelector('#fc-bin-body');
  if (!body) return;

  // Toggle active mode badges
  st.displayEl.querySelectorAll('.fc-bin-toggle[data-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === st.mode);
  });

  // Mode-specific body rendering
  if (st.mode === 'header') {
    body.style.display = 'block';
    body.style.overflow = 'auto';
    if (st.headerSector != null && diskData && diskView && ADF.IS_ADOS) {
      body.innerHTML = buildFileBlocksRawHtml(st.headerSector);
    } else {
      body.innerHTML = '<div class="fc-empty"><div class="fc-empty-icon">⚠️</div><div class="fc-empty-text">NO HEADER DATA</div></div>';
    }
    return;
  }
  if (st.mode === 'binary') {
    body.style.display = 'block';
    body.style.overflow = 'auto';
    body.innerHTML = buildHexDumpHtml(st.data);
    return;
  }
  if (st.mode === 'ascii') {
    body.style.display = 'block';
    body.style.overflow = 'auto';
    body.innerHTML = buildAsciiDumpHtml(st.data);
    return;
  }

  // ASM disassembly (MC68000) — async so UI can paint
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.minHeight = '0';
  body.style.overflow = 'hidden';
  body.innerHTML = '<div class="fc-empty" style="opacity:0.5"><div class="fc-empty-icon">⚙️</div><div class="fc-empty-text">DISASSEMBLING…</div></div>';

  setTimeout(() => {
    const LIMIT = 64 * 1024;
    const len = Math.min(st.data.length, LIMIT);
    const instrs = disasm68k(st.data, 0, len, 0);

    const targets = new Set([0]);
    for (const ins of instrs) {
      if (ins.branchTarget !== undefined) targets.add(ins.branchTarget);
    }
    const labelMap = new Map();
    for (const a of [...targets].sort((a,b)=>a-b)) {
      labelMap.set(a, a === 0 ? 'start' : `loc_${a.toString(16).toUpperCase().padStart(4,'0')}`);
    }

    const out = [];
    out.push(`
      <div class="disasm-toolbar">
        MC68000 DISASSEMBLY — FILE
        <div class="disasm-toolbar-info">
          Base PC: <span>$00000000</span>
          &nbsp; Size: <span>${len.toLocaleString()} bytes</span>
          &nbsp; Instructions: <span>${instrs.length.toLocaleString()}</span>
        </div>
      </div>
      <div class="disasm-listing" style="flex:1;min-height:0;overflow:auto">
        <table><tbody>
    `);

    for (const ins of instrs) {
      if (labelMap.has(ins.addr)) {
        out.push(`<tr class="disasm-label-row"><td colspan="5">${labelMap.get(ins.addr)}:</td></tr>`);
      }
      const mn = ins.mnem;
      let rowCls = '';
      if (mn === 'RTS' || mn === 'RTE') rowCls = 'is-rts';
      else if (mn === 'JMP' || mn === 'JRA') rowCls = 'is-jmp';
      else if (mn.startsWith('B') && mn !== 'BTST' && mn !== 'BSET' && mn !== 'BCLR' && mn !== 'BCHG') rowCls = 'is-branch';
      else if (mn === 'DC.W' || mn === 'DC.L') rowCls = 'is-dc';

      const opsHtml = colorizeOperands(ins.ops);
      let cmt = ins.comment || '';
      if (ins.branchTarget !== undefined && labelMap.has(ins.branchTarget)) {
        const lbl = labelMap.get(ins.branchTarget);
        cmt = cmt ? `${cmt} → ${lbl}` : `→ ${lbl}`;
      }
      const addrStr = ins.addr.toString(16).toUpperCase().padStart(8,'0');
      const cmtHtml = cmt ? `<span class="cmt-label">; ${safeHtml(cmt)}</span>` : '';

      out.push(`
        <tr class="disasm-row ${rowCls}">
          <td class="dc-addr">$${addrStr}</td>
          <td class="dc-bytes">${ins.bytes}</td>
          <td class="dc-mnem">${mn}</td>
          <td class="dc-ops">${opsHtml}</td>
          <td class="dc-comment">${cmtHtml}</td>
        </tr>
      `);
    }

    out.push('</tbody></table></div>');
    body.innerHTML = out.join('');
  }, 0);
}

function buildFileBlocksRawHtml(headerSector) {
  const chain = buildChainFromFileHeader(headerSector) || [];
  // Always include headerSector as first (in case chain builder fails)
  const sectors = [];
  const seen = new Set();
  const push = (sec, kind, label, chkOk) => {
    if (sec == null || sec <= 0 || sec >= ADF.TOTAL_SECTORS) return;
    if (seen.has(sec)) return;
    seen.add(sec);
    sectors.push({sec, kind, label, chkOk});
  };

  if (chain.length) {
    for (const e of chain) push(e.sector, e.kind, e.label, e.chkOk);
  } else {
    push(headerSector, 'head', 'HDR', blockChecksumValid[headerSector]);
  }

  const MAX_BLOCKS = 200;
  const shown = sectors.slice(0, MAX_BLOCKS);
  const truncated = sectors.length > MAX_BLOCKS;

  const out = [];
  out.push('<div class="fc-bin-blocks">');
  out.push(`<div style="padding:8px 14px;font-family:var(--font-title);font-size:9px;letter-spacing:2px;color:var(--wb-dim);text-transform:uppercase;border-bottom:1px solid var(--wb-border);">FILE BLOCKS (RAW 512B) — ${shown.length}${truncated?' / '+sectors.length+' (TRUNCATED)':''}</div>`);

  for (const b of shown) {
    const type = sectorTypes[b.sec] || 'data';
    const chk = (b.chkOk === false) ? '⚠ CHK' : (b.chkOk === true ? '✓ CHK' : '');
    out.push(`<div class="fc-bin-block">`);
    out.push(`<div class="fc-bin-block-title">${safeHtml(b.label || 'BLK')} <span class="meta">Sector ${b.sec} · ${type.toUpperCase()} ${chk}</span></div>`);
    out.push(`<div class="fc-bin-block-dump">${renderHexView(b.sec)}</div>`);
    out.push(`</div>`);
  }

  if (truncated) {
    out.push(`<div style="padding:10px 14px;color:var(--wb-dim);font-family:var(--font-mono);font-size:10px">Showing first ${MAX_BLOCKS} blocks. (Use Disk Map / Hex Viewer for the rest.)</div>`);
  }

  out.push('</div>');
  return out.join('');
}

function buildHexDumpHtml(data) {
  const MAX = 512 * 1024;
  const len = Math.min(data.length, MAX);
  const rows = Math.ceil(len / 16);
  const out = [];
  out.push('<div class="fc-hexdump">');
  for (let r = 0; r < rows; r++) {
    const off = r * 16;
    let bytes = '';
    let ascii = '';
    for (let i = 0; i < 16; i++) {
      const p = off + i;
      if (p >= len) { bytes += '   '; ascii += ' '; continue; }
      const b = data[p];
      bytes += b.toString(16).padStart(2,'0').toUpperCase() + ' ';
      const isPrint = (b >= 0x20 && b <= 0x7E) || b >= 0xA0;
      ascii += isPrint ? String.fromCharCode(b) : '·';
    }
    out.push(`<div class="hex-row">` +
      `<span class="hex-addr">$${off.toString(16).toUpperCase().padStart(8,'0')}</span>` +
      `<span class="hex-bytes" style="white-space:pre;display:inline-block">${bytes}</span>` +
      `<span class="hex-ascii">${ascii.replace(/</g,'&lt;')}</span>` +
      `</div>`);
  }
  if (data.length > MAX) {
    out.push(`<div style="margin-top:10px;color:var(--wb-dim);font-family:var(--font-mono);font-size:10px">[Truncated: showing first ${MAX.toLocaleString()} bytes of ${data.length.toLocaleString()}]</div>`);
  }
  out.push('</div>');
  return out.join('');
}

function buildAsciiDumpHtml(data) {
  const MAX = 512 * 1024;
  const len = Math.min(data.length, MAX);
  const rows = Math.ceil(len / 16);
  const lines = [];
  for (let r = 0; r < rows; r++) {
    const off = r * 16;
    let ascii = '';
    for (let i = 0; i < 16; i++) {
      const p = off + i;
      if (p >= len) { ascii += ' '; continue; }
      const b = data[p];
      const isPrint = (b >= 0x20 && b <= 0x7E) || b >= 0xA0;
      ascii += isPrint ? String.fromCharCode(b) : '·';
    }
    lines.push(`${off.toString(16).toUpperCase().padStart(8,'0')}  ${ascii}`);
  }
  const head = `<div style="font-family:var(--font-title);font-size:8px;letter-spacing:2px;color:var(--wb-dim);
    padding:4px 16px;background:var(--wb-panel2);border-bottom:1px solid var(--wb-border);flex-shrink:0">
    ${rows.toLocaleString()} LINES · ${len.toLocaleString()} BYTES${data.length>MAX?' · TRUNCATED':''}
  </div>`;

  return head + `<div class="fc-text-wrap">
    <div class="fc-text-content" style="color:var(--wb-amber)">${safeHtml(lines.join('\n'))}</div>
  </div>`;
}
// ════════════════════════════════════════════════════

let fcZoom = 1; // current zoom level for the image in File Content

function switchToFileContent() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="filecontent"]').classList.add('active');
  ['bootblock','bootcode','bitmaphex','filecontent'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.style.display = t === 'filecontent' ? 'flex' : 'none';
  });
  document.getElementById('hex-controls').style.display = 'none';
}

function switchToBitmapHex(sector) {
  if (sector !== undefined) selectFileSector(sector);
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="bitmaphex"]').classList.add('active');
  ['bootblock','bootcode','bitmaphex','filecontent'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.style.display = t === 'bitmaphex' ? 'flex' : 'none';
  });
  document.getElementById('hex-controls').style.display = 'flex';
}

function openFileContent(sector, name, size) {
  _fcHeaderViewActive = false;
  _fcSavedBodyNodes = null;
  window._fcCurrentHeaderSector = sector;
  if (!diskData) return;
  // Stop any playing MOD
  if (modPlayerState) { modPlayerState.stop(); modPlayerState = null; }

  switchToFileContent();
  selectFileSector(sector);             // highlight chain in bitmap

  const display = document.getElementById('file-content-display');
  display.innerHTML = `<div class="fc-empty"><div class="fc-empty-icon">⏳</div><div class="fc-empty-text">READING…</div></div>`;

  // Defer so the UI repaints before the (possibly heavy) decode
  setTimeout(() => {
    try {
      const data = readFileData(sector, size);
      renderFileContent(display, name, size, data);
    } catch(err) {
      display.innerHTML = fcError(name, size, `Read error: ${safeHtml(String(err.message||err))}`);
    }
  }, 0);
}

function renderFileContent(display, name, size, data) {
  _fcBinState = null;
  const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  const sizeStr = formatSize(size);

  // ── PowerPacker PP20? ──────────────────────────────
  if (data.length >= 12 && data[0]===0x50 && data[1]===0x50 &&
      data[2]===0x32 && data[3]===0x30) {
    let unpacked;
    try { unpacked = decompressPP20(data); } catch(e) { console.error('PP20 decrunch error:', e); }
    if (unpacked && unpacked.length > 0) {
      // Re-route through renderFileContent with decompressed data
      renderFileContentPP20(display, name, size, data, unpacked);
      return;
    } else {
      display.innerHTML = fcError(name, size, 'PP20 decompression failed — file may be corrupt');
      return;
    }
  }

  // ── IFF? ──────────────────────────────────────────
  const isIFF = data.length >= 8 &&
    String.fromCharCode(data[0],data[1],data[2],data[3]) === 'FORM';

  if (isIFF) {
    const topChunks = parseIFF(data);
    const formType  = topChunks[0]?.subType || '????';

    if (formType === 'ILBM') {
      renderILBMContent(display, name, sizeStr, data, topChunks);
      return;
    }
    if (formType === 'ANIM') {
      renderANIMContent(display, name, sizeStr, data, topChunks);
      return;
    }
    if (formType === '8SVX') {
      render8SVXContent(display, name, sizeStr, data, topChunks);
      return;
    }
    // Generic IFF — show chunk tree
    renderGenericIFF(display, name, sizeStr, data, topChunks, formType);
    return;
  }

  // ── Tracker MOD? ────────────────────────────────
  if (isModFile(data, name, size)) {
    renderModContent(display, name, sizeStr, data);
    return;
  }

  // ── Text? ─────────────────────────────────────────
  if (isTextData(data)) {
    renderTextContent(display, name, sizeStr, data);
    return;
  }

  // ── Binary fallback — hex dump ────────────────────
  renderBinaryContent(display, name, sizeStr, data, ext);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fcHeader(name, typeLabel, sizeStr, badgeClass) {
  const hasHeader = window._fcCurrentHeaderSector != null && diskData && diskView && ADF.IS_ADOS;
  const hdrBtn = hasHeader
    ? `<span class="fc-badge fc-bin-toggle" id="fc-global-header-toggle" onclick="fcToggleHeaderView()">HEADER</span>`
    : '';
  return `<div class="fc-header">
    <span class="fc-filename" title="${safeHtml(name)}">${safeHtml(name)}</span>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${hdrBtn}
      <span class="fc-badge ${badgeClass||''}">${typeLabel}</span>
    </div>
    <span class="fc-badge">${sizeStr}</span>
  </div>`;
}

function fcError(name, size, msg) {
  return `${fcHeader(name,'ERROR',formatSize(size),'bin')}
  <div class="fc-empty">
    <div class="fc-empty-icon">⚠️</div>
    <div class="fc-empty-text" style="color:var(--wb-red)">${msg}</div>
  </div>`;
}

// ── Global HEADER toggle for all non-binary file content views ───────────────
let _fcHeaderViewActive = false;
let _fcSavedBodyNodes = null;

window.fcToggleHeaderView = function() {
  const display = document.getElementById('file-content-display');
  if (!display) return;

  const hdrBtn = display.querySelector('#fc-global-header-toggle');

  if (!_fcHeaderViewActive) {
    // Save current body content (everything after fc-header)
    const header = display.querySelector('.fc-header');
    if (!header) return;
    _fcSavedBodyNodes = [];
    while (header.nextSibling) {
      _fcSavedBodyNodes.push(header.nextSibling);
      display.removeChild(header.nextSibling);
    }
    // Render blocks view
    const blocksDiv = document.createElement('div');
    blocksDiv.id = 'fc-global-header-body';
    blocksDiv.style.cssText = 'flex:1;min-height:0;overflow:auto';
    const sector = window._fcCurrentHeaderSector;
    if (sector != null && diskData && diskView && ADF.IS_ADOS) {
      blocksDiv.innerHTML = buildFileBlocksRawHtml(sector);
    }
    display.appendChild(blocksDiv);
    _fcHeaderViewActive = true;
    if (hdrBtn) hdrBtn.classList.add('active');
  } else {
    // Restore saved body content
    const blocksDiv = display.querySelector('#fc-global-header-body');
    if (blocksDiv) display.removeChild(blocksDiv);
    if (_fcSavedBodyNodes) {
      for (const node of _fcSavedBodyNodes) display.appendChild(node);
    }
    _fcSavedBodyNodes = null;
    _fcHeaderViewActive = false;
    if (hdrBtn) hdrBtn.classList.remove('active');
  }
};

// ════════════════════════════════════════════════════
//  POWERPACKER (PP20) DECOMPRESSOR
// ════════════════════════════════════════════════════

function decompressPP20(data) {
  // Validate header
  if (data.length < 12) return null;
  if (data[0]!==0x50||data[1]!==0x50||data[2]!==0x32||data[3]!==0x30) return null;

  // Efficiency table: 4 bytes controlling literal run-length coding
  const eff = [data[4], data[5], data[6], data[7]];

  // Last 4 bytes: decompressed size (24-bit BE) + skip bits (8-bit)
  const n = data.length;
  const outLen = (data[n-4] << 16) | (data[n-3] << 8) | data[n-2];
  const skipBits = data[n-1];

  if (outLen <= 0 || outLen > 10 * 1024 * 1024) return null; // sanity check

  const out = new Uint8Array(outLen);
  let dst = outLen;
  let srcIdx = n - 5; // start reading from byte before the 4-byte trailer

  // Bit buffer — reads bytes backwards from end of compressed data,
  // extracts bits LSB-first (matching Amiga PowerPacker convention)
  let bits = 0, bitCnt = 0;

  function readBit() {
    if (bitCnt === 0) {
      if (srcIdx < 8) return 0; // past header
      bits = data[srcIdx--];
      bitCnt = 8;
    }
    const bit = bits & 1;
    bits >>= 1;
    bitCnt--;
    return bit;
  }

  function readBits(count) {
    let val = 0;
    for (let i = 0; i < count; i++) {
      val |= readBit() << i;
    }
    return val;
  }

  // Skip initial alignment bits
  for (let i = 0; i < skipBits; i++) readBit();

  // Main decompression loop — works backwards from end of output
  while (dst > 0) {
    // Check literal flag
    if (readBit()) {
      // Literal byte run: read efficiency-coded count, then that many raw bytes
      const idx = readBits(2);
      let cnt = readBits(eff[idx]) + 1;
      while (cnt-- > 0 && dst > 0) {
        out[--dst] = readBits(8);
      }
    }
    if (dst <= 0) break;

    // Copy from already-decompressed data (LZ77-style back-reference)
    const code = readBits(2);
    let offset, length;

    switch (code) {
      case 0: offset = readBits(8);  length = 2; break;
      case 1: offset = readBits(10); length = 3; break;
      case 2: offset = readBits(12); length = 4; break;
      case 3:
        offset = readBits(12);
        length = readBits(3) + 5;
        if (length === 12) { // 5+7 = 12 → extended length
          length = readBits(8) + 12;
        }
        break;
    }

    // Copy bytes from output[dst + 1 + offset] backwards
    while (length-- > 0 && dst > 0) {
      dst--;
      const srcOff = dst + 1 + offset;
      out[dst] = srcOff < outLen ? out[srcOff] : 0;
    }
  }

  return out;
}

// ── PP20 Wrapper Renderer ───────────────────────────────────────────────────
// Shows a PP20 info banner, then delegates to the normal content renderer
// for the decompressed inner data.

function renderFileContentPP20(display, name, size, packed, unpacked) {
  const packedSize = packed.length;
  const unpackedSize = unpacked.length;
  const ratio = ((1 - packedSize / unpackedSize) * 100).toFixed(1);

  // Identify what the inner data is
  let innerType = 'BINARY';
  let innerIcon = '📦';
  const innerSig4 = unpackedSize >= 4
    ? String.fromCharCode(unpacked[0], unpacked[1], unpacked[2], unpacked[3]) : '';
  if (innerSig4 === 'FORM' && unpackedSize >= 12) {
    const ft = String.fromCharCode(unpacked[8], unpacked[9], unpacked[10], unpacked[11]);
    innerType = `IFF/${ft}`;
    if (ft === 'ILBM') innerIcon = '🖼️';
    else if (ft === 'ANIM') innerIcon = '🎞️';
    else if (ft === '8SVX') innerIcon = '🔊';
    else innerIcon = '📦';
  } else if (isModFile(unpacked, name, unpackedSize)) {
    innerType = 'MOD';
    innerIcon = '🎵';
  } else if (isTextData(unpacked)) {
    innerType = 'TEXT';
    innerIcon = '📄';
  } else {
    // Check for hunk executable
    if (unpackedSize >= 4 && unpacked[0]===0x00 && unpacked[1]===0x00 && unpacked[2]===0x03 && unpacked[3]===0xF3) {
      innerType = 'HUNK EXE';
      innerIcon = '⚙️';
    }
  }

  // Build the PP20 info banner
  const pp20Banner = `<div class="fc-header" style="border-bottom:1px solid rgba(255,136,0,0.3);background:linear-gradient(90deg,rgba(255,136,0,0.08) 0%,rgba(0,10,30,0.9) 100%)">
    <span class="fc-filename" title="${safeHtml(name)}">
      ${innerIcon} ${safeHtml(name)}
    </span>
    <span class="fc-badge" style="border-color:var(--wb-orange);color:var(--wb-orange);background:rgba(255,136,0,0.1)">PP20</span>
    <span class="fc-badge">${formatSize(packedSize)}</span>
    <span style="font-family:var(--font-mono);font-size:10px;color:var(--wb-dim)">→</span>
    <span class="fc-badge" style="border-color:var(--wb-green);color:var(--wb-green);background:rgba(0,255,136,0.06)">${formatSize(unpackedSize)}</span>
    <span style="font-family:var(--font-mono);font-size:9px;color:var(--wb-dim);letter-spacing:1px">
      ${ratio}% SAVED
    </span>
    <span class="fc-badge" style="border-color:var(--wb-blue);color:#88aaff;background:rgba(0,85,170,0.1)">${innerType}</span>
  </div>`;

  // Create a wrapper with the PP20 banner, then render inner content below it
  const innerDisplay = document.createElement('div');
  innerDisplay.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden';

  display.innerHTML = '';
  display.insertAdjacentHTML('beforeend', pp20Banner);
  // PP20 compression info bar
  display.insertAdjacentHTML('beforeend', `<div style="
    display:flex;align-items:center;gap:12px;padding:5px 16px;flex-shrink:0;flex-wrap:wrap;
    background:rgba(0,0,0,0.3);border-bottom:1px solid var(--wb-border);
    font-family:var(--font-mono);font-size:10px;color:var(--wb-dim)">
    <span>Packed by <span style="color:var(--wb-orange)">PowerPacker</span></span>
    <span>Efficiency: <span style="color:var(--wb-text)">${packed[4]} ${packed[5]} ${packed[6]} ${packed[7]}</span></span>
    <span>Packed: <span style="color:var(--wb-text)">${packedSize.toLocaleString()} B</span></span>
    <span>Unpacked: <span style="color:var(--wb-green)">${unpackedSize.toLocaleString()} B</span></span>
    <span>Ratio: <span style="color:var(--wb-amber)">${ratio}%</span></span>
  </div>`);
  display.appendChild(innerDisplay);

  // Now render the decompressed content into the inner display
  // We need to pass this through a slightly modified flow that skips the outer header
  renderFileContentInner(innerDisplay, name, unpackedSize, unpacked);
}

// Renders file content WITHOUT the outer header bar (used by PP20 wrapper)
function renderFileContentInner(display, name, size, data) {
  const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  const sizeStr = formatSize(size);

  // IFF?
  const isIFF = data.length >= 8 &&
    String.fromCharCode(data[0],data[1],data[2],data[3]) === 'FORM';

  if (isIFF) {
    const topChunks = parseIFF(data);
    const formType  = topChunks[0]?.subType || '????';

    if (formType === 'ILBM') {
      renderILBMContentInner(display, name, sizeStr, data, topChunks);
      return;
    }
    if (formType === 'ANIM') {
      renderANIMContent(display, name, sizeStr, data, topChunks);
      return;
    }
    if (formType === '8SVX') {
      render8SVXContent(display, name, sizeStr, data, topChunks);
      return;
    }
    renderGenericIFF(display, name, sizeStr, data, topChunks, formType);
    return;
  }

  // Tracker MOD?
  if (isModFile(data, name, size)) {
    renderModContent(display, name, sizeStr, data);
    return;
  }

  // Text?
  if (isTextData(data)) {
    renderTextContent(display, name, sizeStr, data);
    return;
  }

  // Binary fallback
  renderBinaryContent(display, name, sizeStr, data, ext);
}

// ILBM renderer without the outer fc-header (for PP20 wrapped files)
function renderILBMContentInner(display, name, sizeStr, data, topChunks) {
  const innerChunks = topChunks[0]?.children || topChunks;
  let ilbm;
  try { ilbm = decodeILBM(data, innerChunks); } catch(e) { console.error(e); }
  if (!ilbm) {
    display.innerHTML = `<div class="fc-empty"><div class="fc-empty-icon">⚠️</div>
      <div class="fc-empty-text" style="color:var(--wb-red)">ILBM decode failed</div></div>`;
    return;
  }

  fcZoom = computeDefaultZoom(ilbm.width, ilbm.height);

  const modes = [
    ilbm.isHAM ? (ilbm.isHAM8 ? 'HAM-8' : 'HAM-6') : '',
    ilbm.isEHB ? 'EHB' : '',
    ilbm.isHires ? 'Hires' : '',
    ilbm.isInterlace ? 'Interlace' : ''
  ].filter(Boolean).join(' · ') || 'Normal';

  display.innerHTML =
    `<div class="fc-image-outer">
      <div class="fc-image-canvas-area" id="fc-canvas-area">
        <canvas id="fc-canvas"></canvas>
      </div>
      <div class="fc-image-toolbar">
        <button class="fc-zoom-btn" onclick="fcZoomBy(2)">+</button>
        <button class="fc-zoom-btn" onclick="fcZoomBy(0.5)">−</button>
        <button class="fc-zoom-btn" onclick="fcZoomFit()" title="Fit to view" style="font-size:10px;width:auto;padding:0 6px">Fit</button>
        <button class="fc-zoom-btn" onclick="fcZoomSet(1)" title="Actual pixels" style="font-size:10px;width:auto;padding:0 6px">1×</button>
        <button class="fc-zoom-btn" onclick="fcZoomSet(2)" style="font-size:10px;width:auto;padding:0 6px">2×</button>
        <span class="fc-toolbar-sep">|</span>
        <span class="fc-toolbar-stat"><span id="fc-zoom-label">${fcZoom}×</span></span>
        <span class="fc-toolbar-sep">|</span>
        <span class="fc-toolbar-stat">Size: <span>${ilbm.width} × ${ilbm.height}</span></span>
        <span class="fc-toolbar-stat">Planes: <span>${ilbm.nPlanes}</span></span>
        <span class="fc-toolbar-stat">Colors: <span>${ilbm.isHAM ? '4096+' : (1<<ilbm.nPlanes)}</span></span>
        <span class="fc-toolbar-stat">Mode: <span>${modes}</span></span>
        <span class="fc-toolbar-stat">Compression: <span>${ilbm.compress ? 'ByteRun1' : 'None'}</span></span>
      </div>
    </div>
    ${buildILBMPropsPanel(data, innerChunks, ilbm)}`;

  const canvas = document.getElementById('fc-canvas');
  canvas.width  = ilbm.width;
  canvas.height = ilbm.height;
  canvas.getContext('2d').putImageData(new ImageData(ilbm.pixels, ilbm.width, ilbm.height), 0, 0);
  fcApplyZoom();

  activateFCPropsTab('bmhd');
}

// ── TEXT ─────────────────────────────────────────────────────────────────────

function renderTextContent(display, name, sizeStr, data) {
  // Decode using ISO-8859-1 (Amiga charset for chars > 0x7F)
  let text = '';
  const maxBytes = 256 * 1024; // 256 KB
  const limit = Math.min(data.length, maxBytes);
  for (let i = 0; i < limit; i++) {
    const c = data[i];
    if (c === 0) { text += ' '; continue; } // NUL → space (C string padding)
    if (c === 0x0A) { text += '\n'; continue; }
    if (c === 0x0D) { // CR — skip bare CR, keep CRLF as LF
      if (i + 1 < limit && data[i+1] === 0x0A) continue;
      text += '\n'; continue;
    }
    if (c === 0x09) { text += '\t'; continue; }
    if (c < 0x20) continue; // skip other control chars
    text += String.fromCharCode(c); // works for both ASCII and Latin-1
  }
  const truncated = data.length > maxBytes;
  if (truncated) text += `\n[… ${(data.length - maxBytes).toLocaleString()} more bytes not shown]`;

  const lines = text.split('\n');
  const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  const lineCount = lines.length;
  const charCount = text.length.toLocaleString();

  display.innerHTML = fcHeader(name, ext.toUpperCase() || 'TEXT', sizeStr, 'text') +
    `<div style="font-family:var(--font-title);font-size:8px;letter-spacing:2px;color:var(--wb-dim);
       padding:4px 16px;background:var(--wb-panel2);border-bottom:1px solid var(--wb-border);flex-shrink:0">
       ${lineCount.toLocaleString()} LINES · ${charCount} CHARS${truncated ? ' · TRUNCATED' : ''}
    </div>
    <div class="fc-text-wrap">
      <div class="fc-text-content">${safeHtml(text)}</div>
    </div>`;
}

// ── ILBM ─────────────────────────────────────────────────────────────────────

function renderILBMContent(display, name, sizeStr, data, topChunks) {
  const innerChunks = topChunks[0]?.children || topChunks;
  let ilbm;
  try { ilbm = decodeILBM(data, innerChunks); } catch(e) { console.error(e); }
  if (!ilbm) {
    display.innerHTML = fcError(name, 0, 'ILBM decode failed — file may be corrupt');
    return;
  }

  fcZoom = computeDefaultZoom(ilbm.width, ilbm.height);

  const modes = [
    ilbm.isHAM ? (ilbm.isHAM8 ? 'HAM-8' : 'HAM-6') : '',
    ilbm.isEHB ? 'EHB' : '',
    ilbm.isHires ? 'Hires' : '',
    ilbm.isInterlace ? 'Interlace' : ''
  ].filter(Boolean).join(' · ') || 'Normal';

  display.innerHTML = fcHeader(name, 'IFF/ILBM', sizeStr, 'iff') +
    `<div class="fc-image-outer">
      <div class="fc-image-canvas-area" id="fc-canvas-area">
        <canvas id="fc-canvas"></canvas>
      </div>
      <div class="fc-image-toolbar">
        <button class="fc-zoom-btn" onclick="fcZoomBy(2)">+</button>
        <button class="fc-zoom-btn" onclick="fcZoomBy(0.5)">−</button>
        <button class="fc-zoom-btn" onclick="fcZoomFit()" title="Fit to view" style="font-size:10px;width:auto;padding:0 6px">Fit</button>
        <button class="fc-zoom-btn" onclick="fcZoomSet(1)" title="Actual pixels" style="font-size:10px;width:auto;padding:0 6px">1×</button>
        <button class="fc-zoom-btn" onclick="fcZoomSet(2)" style="font-size:10px;width:auto;padding:0 6px">2×</button>
        <span class="fc-toolbar-sep">|</span>
        <span class="fc-toolbar-stat"><span id="fc-zoom-label">${fcZoom}×</span></span>
        <span class="fc-toolbar-sep">|</span>
        <span class="fc-toolbar-stat">Size: <span>${ilbm.width} × ${ilbm.height}</span></span>
        <span class="fc-toolbar-stat">Planes: <span>${ilbm.nPlanes}</span></span>
        <span class="fc-toolbar-stat">Colors: <span>${ilbm.isHAM ? '4096+' : (1<<ilbm.nPlanes)}</span></span>
        <span class="fc-toolbar-stat">Mode: <span>${modes}</span></span>
        <span class="fc-toolbar-stat">Compression: <span>${ilbm.compress ? 'ByteRun1' : 'None'}</span></span>
      </div>
    </div>
    ${buildILBMPropsPanel(data, innerChunks, ilbm)}`;

  // Draw to canvas
  const canvas = document.getElementById('fc-canvas');
  canvas.width  = ilbm.width;
  canvas.height = ilbm.height;
  canvas.getContext('2d').putImageData(new ImageData(ilbm.pixels, ilbm.width, ilbm.height), 0, 0);
  fcApplyZoom();

  // Activate first props tab
  activateFCPropsTab('bmhd');
}

function buildILBMPropsPanel(data, chunks, ilbm) {
  const bv        = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const bmhdChunk = findChunk(chunks, 'BMHD');
  const cmapChunk = findChunk(chunks, 'CMAP');
  const bodyChunk = findChunk(chunks, 'BODY');
  const camgChunk = findChunk(chunks, 'CAMG');

  // BMHD tab
  let bmhdContent = '<div style="color:var(--wb-dim);font-family:var(--font-mono);font-size:11px;padding:4px">No BMHD chunk</div>';
  if (bmhdChunk) {
    const b = bmhdChunk.dataStart;
    const camg = camgChunk ? bv.getUint32(camgChunk.dataStart, false) : 0;
    const maskNames = ['None','Has mask plane','Transparent color','Lasso'];
    const compNames = ['None — uncompressed','ByteRun1 (PackBits RLE)'];
    bmhdContent = `<div class="kv-grid">
      <div class="kv-key">Width × Height</div><div class="kv-val highlight">${bv.getUint16(b,false)} × ${bv.getUint16(b+2,false)} px</div>
      <div class="kv-key">Origin x, y</div><div class="kv-val">${bv.getInt16(b+4,false)}, ${bv.getInt16(b+6,false)}</div>
      <div class="kv-key">nPlanes</div><div class="kv-val">${data[b+8]} → ${(1<<data[b+8]).toLocaleString()} palette entries</div>
      <div class="kv-key">Masking</div><div class="kv-val">${maskNames[data[b+9]]||'Unknown ('+data[b+9]+')'}</div>
      <div class="kv-key">Compression</div><div class="kv-val ${data[b+10]?'highlight':'warn'}">${compNames[data[b+10]]||'Unknown ('+data[b+10]+')'}</div>
      <div class="kv-key">Transparent idx</div><div class="kv-val">${bv.getUint16(b+12,false)}</div>
      <div class="kv-key">Pixel aspect</div><div class="kv-val">${data[b+14]} : ${data[b+15]}</div>
      <div class="kv-key">Page size</div><div class="kv-val">${bv.getInt16(b+16,false)} × ${bv.getInt16(b+18,false)} px</div>
      ${camgChunk ? `<div class="kv-key">CAMG flags</div><div class="kv-val info">0x${camg.toString(16).toUpperCase().padStart(8,'0')}</div>` : ''}
      ${camg&0x0800 ? '<div class="kv-key">HAM</div><div class="kv-val amber">Hold-And-Modify</div>' : ''}
      ${camg&0x0080 ? '<div class="kv-key">EHB</div><div class="kv-val amber">Extra Half-Brite (64 colors)</div>' : ''}
      ${camg&0x8000 ? '<div class="kv-key">Hires</div><div class="kv-val">640 px wide</div>' : ''}
      ${camg&0x0004 ? '<div class="kv-key">Interlace</div><div class="kv-val">Double vertical resolution</div>' : ''}
    </div>`;
    if (bodyChunk) {
      const compressed = data[b+10] === 1;
      const rawBpr = Math.floor((bv.getUint16(b,false)+15)/16)*2;
      const rawUnpacked = rawBpr * bv.getUint16(b+2,false) * (data[b+8] + (data[b+9]===1?1:0));
      bmhdContent += `<div class="analysis-section" style="margin-top:12px">
        <div class="analysis-title">BODY chunk</div>
        <div class="kv-grid">
          <div class="kv-key">Stored size</div><div class="kv-val">${bodyChunk.size.toLocaleString()} bytes</div>
          <div class="kv-key">Compression</div><div class="kv-val ${compressed?'highlight':'warn'}">${compressed?'ByteRun1 (PackBits RLE)':'None'}</div>
          ${compressed?`<div class="kv-key">Unpacked size</div><div class="kv-val">${rawUnpacked.toLocaleString()} bytes</div>`:''}
          ${compressed?`<div class="kv-key">Compression ratio</div><div class="kv-val">${(100-bodyChunk.size/rawUnpacked*100).toFixed(1)}% saved</div>`:''}
        </div>
      </div>`;
    }
  }

  // CMAP tab
  let cmapContent = '<div style="color:var(--wb-dim);font-family:var(--font-mono);font-size:11px;padding:4px">No CMAP chunk</div>';
  if (cmapChunk) {
    const numColors = Math.floor(cmapChunk.size / 3);
    let swatches = '';
    let rows = '';
    for (let i = 0; i < numColors; i++) {
      const ci = cmapChunk.dataStart + i * 3;
      const r = data[ci], g = data[ci+1], b2 = data[ci+2];
      const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b2.toString(16).padStart(2,'0')}`.toUpperCase();
      swatches += `<div class="fc-pal-swatch" style="background:${hex}" title="#${i}: ${hex}  R:${r} G:${g} B:${b2}"></div>`;
      rows += `<div class="fc-pal-row">
        <span class="fc-pal-idx">${i}</span>
        <span class="fc-pal-dot" style="background:${hex}"></span>
        <span class="fc-pal-hex">${hex}</span>
        <span class="fc-pal-rgb"><span class="r">R${r}</span> <span class="g">G${g}</span> <span class="b">B${b2}</span></span>
      </div>`;
    }
    cmapContent = `<div style="margin-bottom:6px;font-family:var(--font-mono);font-size:10px;color:var(--wb-dim)">${numColors} colors</div>
      <div class="fc-palette-grid">${swatches}</div>
      <div class="fc-palette-list">${rows}</div>`;
  }

  const tabs = [
    { id:'bmhd', label:'BMHD', content: bmhdContent },
    { id:'cmap', label:'CMAP', content: cmapContent },
  ];

  const tabHtml  = tabs.map(t => `<div class="fc-props-tab" data-pane="${t.id}" onclick="activateFCPropsTab('${t.id}')">${t.label}</div>`).join('');
  const paneHtml = tabs.map(t => `<div class="fc-props-pane" id="fc-pane-${t.id}">${t.content}</div>`).join('');

  return `<div class="fc-props-panel">
    <div class="fc-props-tabs">${tabHtml}</div>
    ${paneHtml}
  </div>`;
}

function activateFCPropsTab(id) {
  document.querySelectorAll('.fc-props-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.pane === id);
  });
  document.querySelectorAll('.fc-props-pane').forEach(p => {
    p.classList.toggle('active', p.id === 'fc-pane-' + id);
  });
}

function computeDefaultZoom(w, h) {
  const area = document.getElementById('fc-canvas-area');
  if (!area) return 1;
  const aw = area.clientWidth  || 600;
  const ah = area.clientHeight || 400;
  const z = Math.min(aw / w, ah / h, 4);
  return Math.max(0.25, z < 1 ? 1 : Math.floor(z)); // snap to integer zoom ≥1
}

function fcApplyZoom() {
  const canvas = document.getElementById('fc-canvas');
  const label  = document.getElementById('fc-zoom-label');
  if (!canvas) return;
  canvas.style.width  = (canvas.width  * fcZoom) + 'px';
  canvas.style.height = (canvas.height * fcZoom) + 'px';
  if (label) label.textContent = fcZoom + '×';
}

function fcZoomBy(factor) {
  fcZoom = Math.max(0.25, Math.min(16, fcZoom * factor));
  // Round to sensible snap points
  if (fcZoom > 1) fcZoom = Math.round(fcZoom);
  else fcZoom = Math.round(fcZoom * 4) / 4;
  fcApplyZoom();
}
function fcZoomSet(z) { fcZoom = z; fcApplyZoom(); }
function fcZoomFit() {
  const canvas = document.getElementById('fc-canvas');
  if (!canvas) return;
  const area = document.getElementById('fc-canvas-area');
  const aw = area.clientWidth - 40, ah = area.clientHeight - 40;
  fcZoom = Math.max(0.25, Math.min(aw / canvas.width, ah / canvas.height));
  fcZoom = Math.round(fcZoom * 4) / 4;
  fcApplyZoom();
}

// ── ANIM ─────────────────────────────────────────────────────────────────────

function renderANIMContent(display, name, sizeStr, data, topChunks) {
  let anim;
  try { anim = decodeANIM(data, topChunks); } catch(e) { console.error(e); }
  if (!anim || !anim.count) {
    display.innerHTML = fcError(name, 0, 'ANIM decode failed or no frames found');
    return;
  }
  fcZoom = 1;
  display.innerHTML = fcHeader(name, 'IFF/ANIM', sizeStr, 'iff') +
    `<div class="fc-image-outer">
      <div class="fc-image-canvas-area" id="fc-canvas-area">
        <canvas id="fc-canvas"></canvas>
      </div>
      <div class="fc-image-toolbar">
        <button class="fc-zoom-btn" onclick="fcZoomBy(2)">+</button>
        <button class="fc-zoom-btn" onclick="fcZoomBy(0.5)">−</button>
        <button class="fc-zoom-btn" onclick="fcZoomFit()" style="font-size:10px;width:auto;padding:0 6px">Fit</button>
        <span class="fc-toolbar-sep">|</span>
        <span class="fc-toolbar-stat">Frame: <span id="fc-anim-counter">1/${anim.count}</span></span>
        <span class="fc-toolbar-stat">${anim.ilbm.width} × ${anim.ilbm.height}</span>
        <span class="fc-toolbar-stat">${anim.ilbm.nPlanes} planes</span>
        <span class="fc-toolbar-sep">|</span>
        <button class="fc-zoom-btn" id="fc-anim-play" onclick="fcAnimToggle()" style="width:auto;padding:0 8px;font-size:10px">⏸ PAUSE</button>
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--wb-dim)">FPS</span>
        <input type="range" id="fc-anim-fps" min="1" max="25" value="10"
          style="width:60px;accent-color:var(--wb-orange)" oninput="fcAnimSetFps(+this.value)">
        <span id="fc-anim-fps-val" style="font-family:var(--font-mono);font-size:10px;color:var(--wb-text)">10</span>
      </div>
    </div>`;

  const canvas = document.getElementById('fc-canvas');
  canvas.width  = anim.ilbm.width;
  canvas.height = anim.ilbm.height;
  fcApplyZoom();

  // Kick off animation loop
  window._fcAnim = { anim, frame: 0, fps: 10, playing: true, timer: null };
  function drawFrame(idx) {
    canvas.getContext('2d').putImageData(new ImageData(anim.frames[idx], anim.ilbm.width, anim.ilbm.height), 0, 0);
    const counter = document.getElementById('fc-anim-counter');
    if (counter) counter.textContent = `${idx+1}/${anim.count}`;
  }
  function tick() {
    const state = window._fcAnim;
    if (!state || !state.playing) return;
    state.frame = (state.frame + 1) % anim.count;
    drawFrame(state.frame);
    state.timer = setTimeout(tick, 1000 / state.fps);
  }
  drawFrame(0);
  window._fcAnim.timer = setTimeout(tick, 1000 / 10);
}

window.fcAnimToggle = function() {
  const state = window._fcAnim;
  if (!state) return;
  state.playing = !state.playing;
  const btn = document.getElementById('fc-anim-play');
  if (btn) btn.textContent = state.playing ? '⏸ PAUSE' : '▶ PLAY';
  if (state.playing) {
    const anim = state.anim;
    const canvas = document.getElementById('fc-canvas');
    function tick() {
      if (!state.playing || !canvas.isConnected) return;
      state.frame = (state.frame + 1) % anim.count;
      canvas.getContext('2d').putImageData(new ImageData(anim.frames[state.frame], anim.ilbm.width, anim.ilbm.height), 0, 0);
      const counter = document.getElementById('fc-anim-counter');
      if (counter) counter.textContent = `${state.frame+1}/${anim.count}`;
      state.timer = setTimeout(tick, 1000 / state.fps);
    }
    state.timer = setTimeout(tick, 1000 / state.fps);
  } else {
    clearTimeout(state.timer);
  }
};
window.fcAnimSetFps = function(v) {
  if (window._fcAnim) window._fcAnim.fps = v;
  const lbl = document.getElementById('fc-anim-fps-val');
  if (lbl) lbl.textContent = v;
};

// ── 8SVX ─────────────────────────────────────────────────────────────────────

function render8SVXContent(display, name, sizeStr, data, topChunks) {
  const innerChunks = topChunks[0]?.children || topChunks;
  let audio;
  try { audio = decode8SVX(data, innerChunks); } catch(e) { console.error(e); }
  if (!audio) {
    display.innerHTML = fcError(name, 0, '8SVX decode failed');
    return;
  }
  const dur = (audio.floatSamples.length / audio.sampleRate).toFixed(3);
  display.innerHTML = fcHeader(name, 'IFF/8SVX', sizeStr, 'iff') +
    `<div style="flex:1;display:flex;flex-direction:column;gap:0">
      <canvas id="fc-wave-canvas" style="width:100%;height:120px;display:block;background:#0a0e1a;flex-shrink:0"></canvas>
      <div style="flex:1;padding:16px;overflow-y:auto">
        <div class="kv-grid" style="max-width:480px">
          <div class="kv-key">Sample Rate</div><div class="kv-val highlight">${audio.sampleRate.toLocaleString()} Hz</div>
          <div class="kv-key">Duration</div><div class="kv-val">${dur} s</div>
          <div class="kv-key">Samples</div><div class="kv-val">${audio.floatSamples.length.toLocaleString()}</div>
          <div class="kv-key">One-shot</div><div class="kv-val">${audio.oneShotSamples.toLocaleString()}</div>
          <div class="kv-key">Repeat</div><div class="kv-val">${audio.repeatSamples.toLocaleString()}</div>
          <div class="kv-key">Octaves</div><div class="kv-val">${audio.octaves}</div>
          <div class="kv-key">Compression</div><div class="kv-val ${audio.compression?'warn':'highlight'}">${audio.compression===1?'Fibonacci Delta (4-bit)':'None — raw 8-bit PCM'}</div>
          <div class="kv-key">Volume</div><div class="kv-val">${audio.volume.toLocaleString()} / 65536 (${((audio.volume/65536)*100).toFixed(1)}%)</div>
          ${audio.name?`<div class="kv-key">Name</div><div class="kv-val amber">${safeHtml(audio.name)}</div>`:''}
        </div>
      </div>
    </div>`;

  // Draw waveform
  requestAnimationFrame(() => {
    const cv = document.getElementById('fc-wave-canvas');
    if (!cv) return;
    cv.width  = cv.offsetWidth  || 800;
    cv.height = cv.offsetHeight || 120;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const samples = audio.floatSamples;
    const step = Math.max(1, Math.floor(samples.length / cv.width));
    const mid = cv.height / 2;
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    for (let x = 0; x < cv.width; x++) {
      const si = x * step;
      let min = 1, max = -1;
      for (let j = 0; j < step && si+j < samples.length; j++) {
        const v = samples[si+j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const y1 = mid + min * (mid - 2);
      const y2 = mid + max * (mid - 2);
      if (x === 0) ctx.moveTo(x, y1);
      ctx.lineTo(x, y1);
      ctx.lineTo(x, y2);
    }
    ctx.stroke();
    // centre line
    ctx.strokeStyle = 'rgba(0,255,136,0.2)';
    ctx.beginPath(); ctx.moveTo(0,mid); ctx.lineTo(cv.width,mid); ctx.stroke();
  });
}

// ── Generic IFF ───────────────────────────────────────────────────────────────

function renderGenericIFF(display, name, sizeStr, data, topChunks, formType) {
  display.innerHTML = fcHeader(name, `IFF/${formType}`, sizeStr, 'iff') +
    `<div style="flex:1;overflow-y:auto;padding:12px">
       <div style="font-family:var(--font-title);font-size:9px;letter-spacing:2px;color:var(--wb-dim);margin-bottom:8px;text-transform:uppercase">IFF Chunk Structure</div>
       <div id="fc-chunk-tree"></div>
     </div>`;
  document.getElementById('fc-chunk-tree').innerHTML = renderChunkTree(topChunks, data);
}

// ── Binary hex dump ────────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════
//  MOD TRACKER PLAYER
// ════════════════════════════════════════════════════

const MOD_PERIOD_TABLE = [
  // Tuning 0 (C-1 to B-3 = 36 notes)
  856,808,762,720,678,640,604,570,538,508,480,453,
  428,404,381,360,339,320,302,285,269,254,240,226,
  214,202,190,180,170,160,151,143,135,127,120,113
];

const MOD_NOTE_NAMES = [
  'C-1','C#1','D-1','D#1','E-1','F-1','F#1','G-1','G#1','A-1','A#1','B-1',
  'C-2','C#2','D-2','D#2','E-2','F-2','F#2','G-2','G#2','A-2','A#2','B-2',
  'C-3','C#3','D-3','D#3','E-3','F-3','F#3','G-3','G#3','A-3','A#3','B-3'
];

function periodToNote(period) {
  if (!period) return '···';
  let best = 0, bestDist = 99999;
  for (let i = 0; i < 36; i++) {
    const d = Math.abs(MOD_PERIOD_TABLE[i] - period);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return bestDist < 30 ? MOD_NOTE_NAMES[best] : '???';
}

const MOD_SIGNATURES = {
  'M.K.':4, 'M!K!':4, 'FLT4':4, 'FLT8':8,
  '4CHN':4, '6CHN':6, '8CHN':8, '2CHN':2,
  'OCTA':8, 'CD81':8, 'TDZ1':1, 'TDZ2':2, 'TDZ3':3,
  '5CHN':5, '7CHN':7, '9CHN':9,
  '10CH':10, '11CH':11, '12CH':12, '13CH':13,
  '14CH':14, '15CH':15, '16CH':16,
  '18CH':18, '20CH':20, '22CH':22, '24CH':24, '26CH':26,
  '28CH':28, '30CH':30, '32CH':32,
  '10CN':10, '12CN':12, '14CN':14, '16CN':16,
};

function isModFile(data, name, size) {
  if (size < 1084) return false;
  // Check for known signature at offset 1080
  const sig = String.fromCharCode(data[1080], data[1081], data[1082], data[1083]);
  if (MOD_SIGNATURES[sig]) return true;
  // Check nCHN / nnCH pattern
  if (/^\d\dCH$/.test(sig) || /^\d\dCN$/.test(sig) || /^\dCHN$/.test(sig)) return true;
  // Also check by name prefixes common on Amiga
  const nl = name.toLowerCase();
  if (nl.startsWith('mod.') || nl.startsWith('pt.') || nl.startsWith('st-') ||
      nl.startsWith('ft.') || nl.startsWith('nt.') || nl.startsWith('smod.')) {
    // Validate: check if sample data makes sense
    if (data.length >= 1084) return true;
  }
  // Extension
  const ext = nl.includes('.') ? nl.split('.').pop() : '';
  if (ext === 'mod' || ext === 'nst' || ext === 'stk' || ext === 'wow' || ext === 'pt') {
    if (data.length >= 1084) return true;
  }
  return false;
}

function parseMod(data) {
  const d = data;
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);

  // Title (20 bytes)
  let title = '';
  for (let i = 0; i < 20; i++) {
    const c = d[i];
    title += (c >= 0x20 && c < 0x7f) ? String.fromCharCode(c) : '';
  }
  title = title.trim();

  // Signature at 1080
  const sig = String.fromCharCode(d[1080], d[1081], d[1082], d[1083]);
  let numChannels = MOD_SIGNATURES[sig] || 4;
  let numSamples = 31;

  // 31 samples
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const off = 20 + i * 30;
    let name = '';
    for (let j = 0; j < 22; j++) {
      const c = d[off + j];
      name += (c >= 0x20 && c < 0x7f) ? String.fromCharCode(c) : '';
    }
    const length   = dv.getUint16(off + 22, false) * 2;
    const finetune = d[off + 24] & 0x0F;
    const volume   = Math.min(d[off + 25], 64);
    const loopStart  = dv.getUint16(off + 26, false) * 2;
    const loopLength = dv.getUint16(off + 28, false) * 2;
    samples.push({ name: name.trim(), length, finetune, volume, loopStart, loopLength });
  }

  // Song length & pattern order
  const songLength = d[950];
  const restartPos = d[951];
  const order = [];
  let maxPattern = 0;
  for (let i = 0; i < 128; i++) {
    const p = d[952 + i];
    order.push(p);
    if (p > maxPattern) maxPattern = p;
  }
  const numPatterns = maxPattern + 1;

  // Parse patterns
  const patternDataStart = 1084;
  const patterns = [];
  const bytesPerRow = numChannels * 4;
  const bytesPerPattern = 64 * bytesPerRow;

  for (let p = 0; p < numPatterns; p++) {
    const pat = [];
    const pOff = patternDataStart + p * bytesPerPattern;
    for (let row = 0; row < 64; row++) {
      const channels = [];
      for (let ch = 0; ch < numChannels; ch++) {
        const off = pOff + row * bytesPerRow + ch * 4;
        if (off + 3 >= d.length) { channels.push({ period:0, sample:0, effect:0, param:0 }); continue; }
        const b0 = d[off], b1 = d[off+1], b2 = d[off+2], b3 = d[off+3];
        const sample = (b0 & 0xF0) | ((b2 & 0xF0) >> 4);
        const period = ((b0 & 0x0F) << 8) | b1;
        const effect = b2 & 0x0F;
        const param  = b3;
        channels.push({ period, sample, effect, param });
      }
      pat.push(channels);
    }
    patterns.push(pat);
  }

  // Extract sample audio data
  let sampleDataOffset = patternDataStart + numPatterns * bytesPerPattern;
  for (const smp of samples) {
    if (smp.length > 0 && sampleDataOffset + smp.length <= d.length) {
      smp.data = new Int8Array(d.buffer, d.byteOffset + sampleDataOffset, smp.length);
    } else {
      smp.data = new Int8Array(0);
    }
    sampleDataOffset += smp.length;
  }

  return { title, sig, numChannels, numSamples, samples, songLength, restartPos, order, numPatterns, patterns };
}

// ── MOD Playback Engine ─────────────────────────────────────────────────────

let modPlayerState = null;

function createModPlayer(mod, audioCtx) {
  const PAULA_CLOCK = 3546895; // PAL Amiga clock

  const state = {
    mod,
    audioCtx,
    playing: false,
    masterVolume: 0.5,
    sampleRate: audioCtx.sampleRate,
    speed: 6,
    tempo: 125,
    tick: 0,
    row: 0,
    position: 0,
    patternDelay: 0,
    samplesPerTick: 0,
    tickSampleCounter: 0,
    channels: [],
    scriptNode: null,
    animFrame: null,
  };

  // Compute samples per tick
  function updateSamplesPerTick() {
    state.samplesPerTick = Math.round((state.sampleRate * 2.5) / state.tempo);
  }
  updateSamplesPerTick();

  // Init channels
  for (let i = 0; i < mod.numChannels; i++) {
    state.channels.push({
      sample: 0,
      period: 0,
      volume: 0,
      pan: (i === 0 || i === 3) ? 0.3 : 0.7, // LRRL panning
      samplePos: 0,
      sampleInc: 0,
      // Effect state
      portaTarget: 0,
      portaSpeed: 0,
      vibratoPos: 0,
      vibratoSpeed: 0,
      vibratoDepth: 0,
      tremoloPos: 0,
      tremoloSpeed: 0,
      tremoloDepth: 0,
      arpeggioNote: 0,
      retrigCount: 0,
      // For scope display
      scopeBuf: new Float32Array(256),
      scopeIdx: 0,
      lastNote: '',
    });
  }

  function setSampleInc(ch) {
    if (ch.period > 0) {
      ch.sampleInc = PAULA_CLOCK / (ch.period * state.sampleRate);
    } else {
      ch.sampleInc = 0;
    }
  }

  function processRow() {
    const pat = mod.patterns[mod.order[state.position]];
    if (!pat) return;
    const row = pat[state.row];
    if (!row) return;

    for (let c = 0; c < mod.numChannels; c++) {
      const note = row[c];
      const ch = state.channels[c];

      // Sample trigger
      if (note.sample > 0 && note.sample <= mod.numSamples) {
        const smp = mod.samples[note.sample - 1];
        ch.sample = note.sample;
        ch.volume = smp.volume;
      }

      // Period (note) trigger
      if (note.period > 0 && note.effect !== 3 && note.effect !== 5) {
        ch.period = note.period;
        ch.samplePos = 0;
        ch.lastNote = periodToNote(note.period);
        setSampleInc(ch);
        ch.vibratoPos = 0;
      }

      // Effect setup on tick 0
      const fx = note.effect;
      const px = note.param;
      const pHi = (px >> 4) & 0x0F;
      const pLo = px & 0x0F;

      switch(fx) {
        case 0x3: // Porta to note
          if (note.period > 0) ch.portaTarget = note.period;
          if (px) ch.portaSpeed = px;
          break;
        case 0x4: // Vibrato
          if (pHi) ch.vibratoSpeed = pHi;
          if (pLo) ch.vibratoDepth = pLo;
          break;
        case 0x7: // Tremolo
          if (pHi) ch.tremoloSpeed = pHi;
          if (pLo) ch.tremoloDepth = pLo;
          break;
        case 0x9: // Sample offset
          if (px) ch.samplePos = px * 256;
          break;
        case 0xB: // Position jump
          state.position = px;
          if (state.position >= mod.songLength) state.position = 0;
          state.row = -1; // will be incremented
          break;
        case 0xC: // Set volume
          ch.volume = Math.min(px, 64);
          break;
        case 0xD: // Pattern break
          state.row = pHi * 10 + pLo - 1;
          state.position++;
          if (state.position >= mod.songLength) state.position = 0;
          break;
        case 0xF: // Set speed/tempo
          if (px > 0 && px < 32) state.speed = px;
          else if (px >= 32) { state.tempo = px; updateSamplesPerTick(); }
          break;
        case 0xE: // Extended
          switch(pHi) {
            case 0x1: // Fine porta up
              ch.period = Math.max(113, ch.period - pLo);
              setSampleInc(ch);
              break;
            case 0x2: // Fine porta down
              ch.period = Math.min(856, ch.period + pLo);
              setSampleInc(ch);
              break;
            case 0x6: // Pattern loop
              // simplified — skip
              break;
            case 0x9: // Retrigger
              ch.retrigCount = pLo;
              break;
            case 0xA: // Fine vol up
              ch.volume = Math.min(64, ch.volume + pLo);
              break;
            case 0xB: // Fine vol down
              ch.volume = Math.max(0, ch.volume - pLo);
              break;
            case 0xC: // Note cut
              // handled in processTick
              break;
            case 0xD: // Note delay
              // simplified
              break;
          }
          break;
      }
    }
  }

  function processTick() {
    const pat = mod.patterns[mod.order[state.position]];
    if (!pat) return;
    const row = pat[state.row];
    if (!row) return;

    for (let c = 0; c < mod.numChannels; c++) {
      const note = row[c];
      const ch = state.channels[c];
      const fx = note.effect;
      const px = note.param;
      const pHi = (px >> 4) & 0x0F;
      const pLo = px & 0x0F;

      switch(fx) {
        case 0x0: // Arpeggio
          if (px) {
            const tick3 = state.tick % 3;
            const basePeriod = ch.period;
            if (tick3 === 1 && pHi) {
              ch.arpeggioNote = pHi;
            } else if (tick3 === 2 && pLo) {
              ch.arpeggioNote = pLo;
            } else {
              ch.arpeggioNote = 0;
            }
            if (basePeriod > 0) {
              const arpPeriod = basePeriod / Math.pow(2, ch.arpeggioNote / 12);
              ch.sampleInc = PAULA_CLOCK / (arpPeriod * state.sampleRate);
            }
          }
          break;
        case 0x1: // Porta up
          ch.period = Math.max(113, ch.period - px);
          setSampleInc(ch);
          break;
        case 0x2: // Porta down
          ch.period = Math.min(856, ch.period + px);
          setSampleInc(ch);
          break;
        case 0x3: // Tone porta
        case 0x5: // Tone porta + vol slide
          if (ch.portaTarget && ch.period) {
            if (ch.period < ch.portaTarget) {
              ch.period = Math.min(ch.period + ch.portaSpeed, ch.portaTarget);
            } else if (ch.period > ch.portaTarget) {
              ch.period = Math.max(ch.period - ch.portaSpeed, ch.portaTarget);
            }
            setSampleInc(ch);
          }
          if (fx === 5) { // + vol slide
            ch.volume = Math.max(0, Math.min(64, ch.volume + (pHi ? pHi : -pLo)));
          }
          break;
        case 0x4: // Vibrato
        case 0x6: // Vibrato + vol slide
          {
            const vibVal = Math.sin(ch.vibratoPos * Math.PI / 32) * ch.vibratoDepth;
            const vibPeriod = ch.period + vibVal * 4;
            if (vibPeriod > 0) ch.sampleInc = PAULA_CLOCK / (vibPeriod * state.sampleRate);
            ch.vibratoPos = (ch.vibratoPos + ch.vibratoSpeed) & 63;
          }
          if (fx === 6) {
            ch.volume = Math.max(0, Math.min(64, ch.volume + (pHi ? pHi : -pLo)));
          }
          break;
        case 0x7: // Tremolo
          {
            const tremVal = Math.sin(ch.tremoloPos * Math.PI / 32) * ch.tremoloDepth;
            ch.tremoloPos = (ch.tremoloPos + ch.tremoloSpeed) & 63;
            // Applied during mixing via volume modulation — simplified here
          }
          break;
        case 0xA: // Volume slide
          if (pHi) ch.volume = Math.min(64, ch.volume + pHi);
          else ch.volume = Math.max(0, ch.volume - pLo);
          break;
        case 0xE:
          if (pHi === 0x9 && ch.retrigCount > 0) { // Retrigger
            if (state.tick % ch.retrigCount === 0) ch.samplePos = 0;
          }
          if (pHi === 0xC && state.tick === pLo) { // Note cut
            ch.volume = 0;
          }
          break;
      }
    }
  }

  function mixSample(outputL, outputR, length) {
    for (let i = 0; i < length; i++) {
      let mixL = 0, mixR = 0;

      for (let c = 0; c < mod.numChannels; c++) {
        const ch = state.channels[c];
        if (!ch.sample || ch.sampleInc <= 0) continue;

        const smp = mod.samples[ch.sample - 1];
        if (!smp || !smp.data || smp.data.length === 0) continue;

        let pos = ch.samplePos;
        let val = 0;

        if (pos >= 0 && pos < smp.data.length) {
          // Linear interpolation
          const idx = Math.floor(pos);
          const frac = pos - idx;
          const s0 = smp.data[idx] / 128;
          const s1 = (idx + 1 < smp.data.length) ? smp.data[idx + 1] / 128 : s0;
          val = s0 + (s1 - s0) * frac;
        }

        val *= ch.volume / 64;
        mixL += val * (1 - ch.pan);
        mixR += val * ch.pan;

        // Scope buffer
        ch.scopeBuf[ch.scopeIdx & 255] = val;
        ch.scopeIdx++;

        // Advance position
        ch.samplePos += ch.sampleInc;

        // Loop handling
        if (smp.loopLength > 2) {
          const loopEnd = smp.loopStart + smp.loopLength;
          if (ch.samplePos >= loopEnd) {
            ch.samplePos = smp.loopStart + ((ch.samplePos - smp.loopStart) % smp.loopLength);
          }
        } else if (ch.samplePos >= smp.data.length) {
          ch.sampleInc = 0; // stop
        }
      }

      outputL[i] = mixL * state.masterVolume;
      outputR[i] = mixR * state.masterVolume;

      // Advance tick counter
      state.tickSampleCounter++;
      if (state.tickSampleCounter >= state.samplesPerTick) {
        state.tickSampleCounter = 0;
        state.tick++;
        if (state.tick >= state.speed) {
          state.tick = 0;
          state.row++;
          if (state.row >= 64) {
            state.row = 0;
            state.position++;
            if (state.position >= mod.songLength) state.position = 0;
          }
          processRow();
        } else {
          processTick();
        }
      }
    }
  }

  function start() {
    if (state.playing) return;
    state.playing = true;

    // Reset playback state
    state.tick = 0;
    state.row = 0;
    state.position = 0;
    state.speed = 6;
    state.tempo = 125;
    state.tickSampleCounter = 0;
    updateSamplesPerTick();
    for (const ch of state.channels) {
      ch.samplePos = 0;
      ch.sampleInc = 0;
      ch.period = 0;
      ch.volume = 0;
      ch.sample = 0;
      ch.lastNote = '';
      ch.vibratoPos = 0;
      ch.tremoloPos = 0;
      ch.arpeggioNote = 0;
      ch.scopeIdx = 0;
      ch.scopeBuf.fill(0);
    }
    processRow();

    const bufSize = 4096;
    state.scriptNode = audioCtx.createScriptProcessor(bufSize, 0, 2);
    state.scriptNode.onaudioprocess = function(e) {
      if (!state.playing) return;
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      mixSample(outL, outR, bufSize);
    };
    state.scriptNode.connect(audioCtx.destination);
  }

  function stop() {
    state.playing = false;
    if (state.scriptNode) {
      state.scriptNode.disconnect();
      state.scriptNode = null;
    }
    if (state.animFrame) {
      cancelAnimationFrame(state.animFrame);
      state.animFrame = null;
    }
  }

  state.start = start;
  state.stop = stop;
  state.setSampleInc = setSampleInc;
  return state;
}

// ── MOD UI Renderer ─────────────────────────────────────────────────────────

function renderModContent(display, name, sizeStr, data) {
  // Stop any existing player
  if (modPlayerState) { modPlayerState.stop(); modPlayerState = null; }

  let mod;
  try { mod = parseMod(data); } catch(e) {
    console.error('MOD parse error:', e);
    display.innerHTML = fcError(name, data.length, `MOD parse error: ${safeHtml(String(e.message||e))}`);
    return;
  }

  const chanCount = mod.numChannels;
  const channelHeaders = Array.from({length: chanCount}, (_,i) => `<div class="mod-ph-ch">CH ${i+1}</div>`).join('');
  const scopeCanvases = Array.from({length: chanCount}, (_,i) =>
    `<div class="mod-scope">
      <canvas id="mod-scope-${i}"></canvas>
      <div class="mod-scope-label">CH${i+1}</div>
      <div class="mod-scope-note" id="mod-scope-note-${i}"></div>
    </div>`
  ).join('');

  // Build sample list
  let sampleRows = '';
  for (let i = 0; i < mod.numSamples; i++) {
    const s = mod.samples[i];
    if (!s.length && !s.name) continue;
    const ftVal = s.finetune > 7 ? s.finetune - 16 : s.finetune;
    const hasLoop = s.loopLength > 2;
    sampleRows += `<tr>
      <td class="smp-idx">${(i+1).toString().padStart(2,'0')}</td>
      <td class="smp-name">${safeHtml(s.name) || '—'}</td>
      <td class="smp-len">${s.length.toLocaleString()}</td>
      <td class="smp-vol" style="color:${s.volume>0?'var(--wb-green)':'var(--wb-dim)'}">${s.volume}</td>
      <td class="smp-ft">${ftVal !== 0 ? ftVal : '·'}</td>
      <td class="smp-loop">${hasLoop ? `${s.loopStart}→${s.loopStart+s.loopLength}` : '—'}</td>
    </tr>`;
  }

  // Render initial pattern
  const firstPat = mod.patterns[mod.order[0]] || mod.patterns[0];
  const patternHtml = renderModPattern(firstPat, chanCount, 0);

  display.innerHTML = fcHeader(name, `MOD · ${chanCount}CH`, sizeStr, 'iff') +
    `<div class="mod-player">
      <div class="mod-controls">
        <button class="mod-play-btn" id="mod-play-btn" onclick="modTogglePlay()">▶ PLAY</button>
        <button class="mod-stop-btn" onclick="modStop()">■ STOP</button>
        <div class="mod-position-info">
          <div>Title: <span style="color:var(--wb-amber)">${safeHtml(mod.title) || '(untitled)'}</span></div>
          <div>Sig: <span>${safeHtml(mod.sig)}</span></div>
          <div>Patterns: <span>${mod.numPatterns}</span></div>
          <div>Length: <span>${mod.songLength}</span></div>
          <div id="mod-pos-display">Pos: <span>0</span> Row: <span>0</span> Spd: <span>6</span> BPM: <span>125</span></div>
        </div>
        <div class="mod-volume-wrap">
          🔊
          <input type="range" id="mod-vol-slider" min="0" max="100" value="50"
            oninput="modSetVolume(this.value)">
        </div>
      </div>

      <div class="mod-scopes" id="mod-scopes">${scopeCanvases}</div>

      <div class="mod-pattern-wrap">
        <div class="mod-pattern-header">
          <div class="mod-ph-row">Row</div>
          ${channelHeaders}
        </div>
        <div class="mod-pattern-view" id="mod-pattern-view">${patternHtml}</div>
      </div>

      <div class="mod-bottom-tabs">
        <div class="mod-bottom-tab active" onclick="modSwitchTab('samples',this)">Samples</div>
        <div class="mod-bottom-tab" onclick="modSwitchTab('orders',this)">Orders</div>
      </div>
      <div class="mod-bottom-pane active" id="mod-pane-samples">
        <table class="mod-sample-table">
          <thead><tr>
            <th>#</th><th>Name</th><th>Length</th><th>Vol</th><th>FT</th><th>Loop</th>
          </tr></thead>
          <tbody>${sampleRows}</tbody>
        </table>
      </div>
      <div class="mod-bottom-pane" id="mod-pane-orders">
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--wb-text);line-height:1.8">
          ${mod.order.slice(0, mod.songLength).map((p,i) =>
            `<span style="color:var(--wb-dim)">${i.toString().padStart(2,'0')}:</span><span style="color:var(--wb-amber)">${p.toString().padStart(2,'0')}</span>`
          ).join('  ')}
        </div>
      </div>
    </div>`;

  // Store mod data for playback
  window._modData = mod;

  // Init scope canvases
  requestAnimationFrame(() => {
    for (let i = 0; i < chanCount; i++) {
      const cv = document.getElementById(`mod-scope-${i}`);
      if (cv) { cv.width = cv.offsetWidth || 120; cv.height = cv.offsetHeight || 64; }
    }
  });
}

function renderModPattern(pattern, numChannels, currentRow) {
  if (!pattern) return '';
  let html = '';
  for (let row = 0; row < 64; row++) {
    const isCurrent = row === currentRow;
    html += `<div class="mod-pv-row${isCurrent ? ' current-row' : ''}" id="mod-row-${row}">`;
    html += `<div class="mod-pv-rownum">${row.toString(16).toUpperCase().padStart(2,'0')}</div>`;
    for (let ch = 0; ch < numChannels; ch++) {
      const n = pattern[row][ch];
      const noteStr = n.period ? periodToNote(n.period) : '···';
      const smpStr  = n.sample ? n.sample.toString(16).toUpperCase().padStart(2,'0') : '··';
      const fxStr   = n.effect.toString(16).toUpperCase();
      const pmStr   = n.param.toString(16).toUpperCase().padStart(2,'0');
      const noteClass = n.period ? 'note' : 'empty';
      const smpClass  = n.sample ? 'smp' : 'empty';
      const fxClass   = (n.effect || n.param) ? 'fx-active' : 'fx';
      html += `<div class="mod-pv-cell">`;
      html += `<span class="${noteClass}">${noteStr}</span> `;
      html += `<span class="${smpClass}">${smpStr}</span> `;
      html += `<span class="${fxClass}">${fxStr}${pmStr}</span>`;
      html += `</div>`;
    }
    html += `</div>`;
  }
  return html;
}

function modSwitchTab(tabId, el) {
  document.querySelectorAll('.mod-bottom-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.mod-bottom-pane').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const pane = document.getElementById(`mod-pane-${tabId}`);
  if (pane) pane.classList.add('active');
}

function modTogglePlay() {
  if (!window._modData) return;

  if (modPlayerState && modPlayerState.playing) {
    modPlayerState.stop();
    document.getElementById('mod-play-btn').textContent = '▶ PLAY';
    document.getElementById('mod-play-btn').classList.remove('playing');
    if (modPlayerState.animFrame) cancelAnimationFrame(modPlayerState.animFrame);
    return;
  }

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  modPlayerState = createModPlayer(window._modData, ctx);
  modPlayerState.start();

  document.getElementById('mod-play-btn').textContent = '⏸ PAUSE';
  document.getElementById('mod-play-btn').classList.add('playing');

  // Start UI update loop
  let lastRow = -1, lastPos = -1;
  function updateUI() {
    if (!modPlayerState || !modPlayerState.playing) return;
    const s = modPlayerState;

    // Position display
    const posEl = document.getElementById('mod-pos-display');
    if (posEl) {
      posEl.innerHTML = `Pos: <span>${s.position}</span> Row: <span>${s.row}</span> Spd: <span>${s.speed}</span> BPM: <span>${s.tempo}</span>`;
    }

    // Update pattern view if row/position changed
    if (s.row !== lastRow || s.position !== lastPos) {
      if (s.position !== lastPos) {
        // Rerender pattern
        const pat = s.mod.patterns[s.mod.order[s.position]];
        const pv = document.getElementById('mod-pattern-view');
        if (pv && pat) pv.innerHTML = renderModPattern(pat, s.mod.numChannels, s.row);
      } else {
        // Just move highlight
        const prev = document.getElementById(`mod-row-${lastRow}`);
        const curr = document.getElementById(`mod-row-${s.row}`);
        if (prev) prev.classList.remove('current-row');
        if (curr) {
          curr.classList.add('current-row');
          curr.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
      }
      lastRow = s.row;
      lastPos = s.position;
    }

    // Scopes
    for (let c = 0; c < s.mod.numChannels; c++) {
      const cv = document.getElementById(`mod-scope-${c}`);
      if (!cv) continue;
      const ctx2d = cv.getContext('2d');
      const w = cv.width, h = cv.height;
      ctx2d.fillStyle = '#0a0e1a';
      ctx2d.fillRect(0, 0, w, h);

      const ch = s.channels[c];
      const mid = h / 2;

      // Center line
      ctx2d.strokeStyle = 'rgba(0,85,170,0.2)';
      ctx2d.beginPath();
      ctx2d.moveTo(0, mid);
      ctx2d.lineTo(w, mid);
      ctx2d.stroke();

      // Waveform
      ctx2d.strokeStyle = ch.sampleInc > 0 ? '#00ff88' : '#224433';
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      const startIdx = ch.scopeIdx - w;
      for (let x = 0; x < w; x++) {
        const val = ch.scopeBuf[(startIdx + x) & 255];
        const y = mid - val * (mid - 2);
        if (x === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();

      // Note display
      const noteEl = document.getElementById(`mod-scope-note-${c}`);
      if (noteEl) noteEl.textContent = ch.lastNote || '';
    }

    s.animFrame = requestAnimationFrame(updateUI);
  }
  modPlayerState.animFrame = requestAnimationFrame(updateUI);
}

function modStop() {
  if (modPlayerState) {
    modPlayerState.stop();
    modPlayerState = null;
  }
  const btn = document.getElementById('mod-play-btn');
  if (btn) { btn.textContent = '▶ PLAY'; btn.classList.remove('playing'); }

  // Clear scopes
  if (window._modData) {
    for (let c = 0; c < window._modData.numChannels; c++) {
      const cv = document.getElementById(`mod-scope-${c}`);
      if (cv) {
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#0a0e1a';
        ctx.fillRect(0, 0, cv.width, cv.height);
      }
    }
  }

  // Reset position display
  const posEl = document.getElementById('mod-pos-display');
  if (posEl) posEl.innerHTML = `Pos: <span>0</span> Row: <span>0</span> Spd: <span>6</span> BPM: <span>125</span>`;
}

function modSetVolume(val) {
  if (modPlayerState) modPlayerState.masterVolume = val / 100;
}

// Stop MOD player when switching tabs or loading new files
(function() {
  const origSwitchToFileContent = window.switchToFileContent;
  // Hook into tab switching to stop playback
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab !== 'filecontent' && modPlayerState) {
        modPlayerState.stop();
        modPlayerState = null;
      }
    });
  });
})();



function renderBinaryContent(display, name, sizeStr, data, ext) {
  _fcBinState = null;

  const typeLabel = (ext ? ext.toUpperCase() : 'BIN');
  const headerSector = (window._fcCurrentHeaderSector !== undefined) ? window._fcCurrentHeaderSector : null;

  const header = `
    <div class="fc-header">
      <span class="fc-filename" title="${safeHtml(name)}">${safeHtml(name)}</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="fc-badge fc-bin-toggle active" data-mode="binary" onclick="fcBinSetMode('binary')">BINARY</span>
        <span class="fc-badge fc-bin-toggle" data-mode="asm" onclick="fcBinSetMode('asm')">ASM</span>
        <span class="fc-badge fc-bin-toggle" data-mode="ascii" onclick="fcBinSetMode('ascii')">ASCII</span>
        <span class="fc-badge fc-bin-toggle" data-mode="header" onclick="fcBinSetMode('header')">HEADER</span>
        <span class="fc-badge bin">${typeLabel}</span>
      </div>
      <span class="fc-badge">${sizeStr}</span>
    </div>
  `;

  display.innerHTML = header + `
    <div id="fc-bin-body" style="flex:1;min-height:0;overflow:auto"></div>
  `;

  _fcBinState = {
    displayEl: display,
    name,
    sizeStr,
    data,
    ext,
    mode: 'binary',
    headerSector
  };

  renderFcBinaryMode();
}


function isTextData(data) {
  if (data.length === 0) return false;
  const check = Math.min(data.length, 1024);
  let printable = 0;
  let hasNonPrint = 0;
  for (let i = 0; i < check; i++) {
    const c = data[i];
    // Accept: printable ASCII, tab, LF, CR, and Latin-1 extended (Amiga charset)
    if ((c >= 0x20 && c <= 0x7E) || c === 0x09 || c === 0x0A || c === 0x0D || c >= 0xA0) {
      printable++;
    } else if (c === 0x00) {
      // NUL bytes are common in C string padding but otherwise signal binary
      if (i < 4) return false; // NUL in first 4 bytes → binary magic number
      hasNonPrint++;
    } else {
      hasNonPrint++;
    }
  }
  return printable / check > 0.80 && hasNonPrint / check < 0.05;
}

// ════════════════════════════════════════════════════
//  FILE EXTRACTION FROM ADF
// ════════════════════════════════════════════════════

function isFFS() {
  // Check filesystem flag from boot block
  return (u8(0,3) & 1) === 1;
}

function readFileData(headerSector, fileSize) {
  // Bug fix: validate fileSize before allocating
  if (fileSize < 0 || fileSize > ADF.DISK_SIZE) {
    console.warn(`readFileData: suspicious fileSize=${fileSize}, clamping`);
    fileSize = Math.max(0, Math.min(fileSize, ADF.DISK_SIZE));
  }
  const ffs = isFFS();
  const result = new Uint8Array(fileSize);
  let written = 0;
  const visitedBlocks = new Set(); // Bug fix: guard against circular extension chains

  function processBlock(sector) {
    if (!sector || sector <= 0 || sector >= ADF.TOTAL_SECTORS) return;
    if (visitedBlocks.has(sector)) return; // Bug fix: break cycles
    visitedBlocks.add(sector);

    const highSeq = u32be(sector, 8);
    const maxSlots = (ADF.SECTOR_SIZE / 4) - 56; // 72 for BSIZE=512
    const safeSeq = Math.min(highSeq, maxSlots);
    // Data block ptrs stored REVERSED: first block at data_blocks[maxSlots-1] (BSIZE-204)
    for (let i = 0; i < safeSeq && written < fileSize; i++) {
      const blk = u32be(sector, 24 + (maxSlots - 1 - i) * 4);
      if (!blk || blk >= ADF.TOTAL_SECTORS) continue;
      const base = blk * ADF.SECTOR_SIZE;
      if (ffs) {
        const toCopy = Math.min(ADF.SECTOR_SIZE, fileSize - written);
        for (let j = 0; j < toCopy; j++) result[written++] = diskView.getUint8(base + j);
      } else {
        // OFS: data at offset 24, size at offset 12
        const dataSize = Math.min(u32be(blk, 12), ADF.SECTOR_SIZE - 24);
        const toCopy = Math.min(dataSize, fileSize - written);
        for (let j = 0; j < toCopy; j++) result[written++] = diskView.getUint8(base + 24 + j);
      }
    }
    // Extension block?
    const ext = u32be(sector, ADF.SECTOR_SIZE - 8);
    if (ext && ext !== sector) processBlock(ext);
  }

  processBlock(headerSector);
  return result;
}

// ════════════════════════════════════════════════════
//  IFF PARSER
// ════════════════════════════════════════════════════

function parseIFF(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const chunks = [];

  function readID(offset) {
    return String.fromCharCode(data[offset], data[offset+1], data[offset+2], data[offset+3]);
  }
  function readU32(offset) {
    return view.getUint32(offset, false);
  }

  function parseChunks(start, end, depth) {
    // Bug fix: depth limit prevents stack overflow on malformed nested containers
    if (depth > 16) return [];
    // Bug fix: clamp end to actual buffer to prevent OOB on corrupt size fields
    end = Math.min(end, data.byteLength);
    let pos = start;
    const result = [];
    while (pos + 8 <= end) {
      const id = readID(pos);
      const size = readU32(pos + 4);
      // Bug fix: clamp chunk size to remaining buffer
      const safeSize = Math.min(size, end - pos - 8);
      const dataStart = pos + 8;
      const dataEnd = dataStart + safeSize;
      const paddedEnd = Math.min(dataEnd + (safeSize & 1), end);

      const chunk = { id, size: safeSize, dataStart, dataEnd, depth, children: null };

      if ((id === 'FORM' || id === 'LIST' || id === 'CAT ' || id === 'PROP') && safeSize >= 4) {
        const subType = dataStart + 4 <= data.byteLength ? readID(dataStart) : '????';
        chunk.subType = subType;
        chunk.children = parseChunks(dataStart + 4, dataEnd, depth + 1);
      }

      result.push(chunk);
      if (paddedEnd <= pos) break; // Bug fix: prevent zero-advance infinite loop
      pos = paddedEnd;
    }
    return result;
  }

  return parseChunks(0, data.byteLength, 0);
}

function findChunk(chunks, id, recursive = true) {
  for (const c of chunks) {
    if (c.id === id) return c;
    if (recursive && c.children) {
      const found = findChunk(c.children, id, true);
      if (found) return found;
    }
  }
  return null;
}

function allChunksOfId(chunks, id, result = []) {
  for (const c of chunks) {
    if (c.id === id) result.push(c);
    if (c.children) allChunksOfId(c.children, id, result);
  }
  return result;
}

function chunkBytes(data, chunk) {
  return data.slice(chunk.dataStart, chunk.dataEnd);
}

// ════════════════════════════════════════════════════
//  BYTERUN1 DECOMPRESSOR
// ════════════════════════════════════════════════════

function decompressByteRun1(src, unpackedSize) {
  const dst = new Uint8Array(unpackedSize);
  let si = 0, di = 0;
  while (si < src.length && di < unpackedSize) {
    const n = src[si++];
    if (n <= 127) {
      // Copy next n+1 bytes literally
      const count = n + 1;
      // Bug fix: also guard si inside inner loop
      for (let i = 0; i < count && di < unpackedSize && si < src.length; i++) {
        dst[di++] = src[si++];
      }
    } else if (n !== 128) {
      // Repeat next byte (257-n) times
      const count = 257 - n;
      if (si >= src.length) break; // Bug fix: guard before reading repeat byte
      const byte = src[si++];
      for (let i = 0; i < count && di < unpackedSize; i++) {
        dst[di++] = byte;
      }
    }
    // n == 128: NOP
  }
  return dst;
}

// ════════════════════════════════════════════════════
//  ILBM DECODER
// ════════════════════════════════════════════════════

function decodeILBM(data, chunks) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // BMHD
  const bmhdChunk = findChunk(chunks, 'BMHD');
  if (!bmhdChunk) return null;
  const b = bmhdChunk.dataStart;
  if (b + 16 > data.byteLength) return null; // B2: BMHD too short
  const w        = view.getUint16(b + 0, false);
  const h        = view.getUint16(b + 2, false);
  const nPlanes  = data[b + 8];
  const masking  = data[b + 9];
  const compress = data[b + 10];
  const transpColor = view.getUint16(b + 12, false);
  const xAspect  = data[b + 14];
  const yAspect  = data[b + 15];

  // B2: Validate dimensions before any allocation
  if (w === 0 || h === 0 || nPlanes === 0 || nPlanes > 24) {
    console.warn(`decodeILBM: invalid dimensions w=${w} h=${h} nPlanes=${nPlanes}`);
    return null;
  }
  const MAX_PIX = 4096 * 4096;
  if (w * h > MAX_PIX) {
    console.warn(`decodeILBM: image too large ${w}x${h}`);
    return null;
  }

  // CMAP
  const cmapChunk = findChunk(chunks, 'CMAP');
  const palette = [];
  if (cmapChunk) {
    const numColors = Math.floor(cmapChunk.size / 3);
    for (let i = 0; i < numColors; i++) {
      const ci = cmapChunk.dataStart + i * 3;
      palette.push([data[ci], data[ci+1], data[ci+2]]);
    }
  }
  // Fill palette to 256 if needed
  while (palette.length < 256) palette.push([0,0,0]);

  // CAMG (viewport mode)
  const camgChunk = findChunk(chunks, 'CAMG');
  let camg = 0;
  if (camgChunk) camg = view.getUint32(camgChunk.dataStart, false);
  const isHAM  = !!(camg & 0x0800);
  const isEHB  = !!(camg & 0x0080);
  const isHires = !!(camg & 0x8000);
  const isInterlace = !!(camg & 0x0004);
  const isHAM8 = isHAM && nPlanes === 8;

  // Extra Half-Brite: add 32 dim copies
  if (isEHB && !isHAM) {
    for (let i = 0; i < 32; i++) {
      const c = palette[i] || [0,0,0];
      palette[i + 32] = [c[0] >> 1, c[1] >> 1, c[2] >> 1];
    }
  }

  // BODY
  const bodyChunk = findChunk(chunks, 'BODY');
  if (!bodyChunk) return null;

  const bytesPerRow = Math.floor((w + 15) / 16) * 2;
  const totalPlanes = nPlanes + (masking === 1 ? 1 : 0);
  const unpackedSize = h * totalPlanes * bytesPerRow;

  let bodyData = chunkBytes(data, bodyChunk);
  if (compress === 1) {
    bodyData = decompressByteRun1(bodyData, unpackedSize);
  }

  // Render to RGBA
  const pixels = new Uint8ClampedArray(w * h * 4);
  let srcPos = 0;

  for (let y = 0; y < h; y++) {
    // Read all plane rows for this scanline
    const planeData = [];
    for (let p = 0; p < totalPlanes; p++) {
      planeData.push(bodyData.slice(srcPos, srcPos + bytesPerRow));
      srcPos += bytesPerRow;
    }

    let holdR = 0, holdG = 0, holdB = 0; // HAM hold registers

    for (let x = 0; x < w; x++) {
      // Extract pixel index from bitplanes
      let colorIdx = 0;
      for (let p = 0; p < nPlanes; p++) {
        const byteIdx = x >> 3;
        const bitMask = 0x80 >> (x & 7);
        if (planeData[p][byteIdx] & bitMask) {
          colorIdx |= (1 << p);
        }
      }

      let r, g, b;

      if (isHAM8) {
        const ctrl = (colorIdx >> 6) & 3;
        const val  = (colorIdx & 63) << 2; // scale 6-bit to 8-bit approx
        if (ctrl === 0) { [r,g,b] = palette[colorIdx & 63] || [0,0,0]; holdR=r; holdG=g; holdB=b; }
        else if (ctrl === 1) { r=holdR; g=holdG; b=val; holdB=b; }
        else if (ctrl === 2) { b=holdB; g=holdG; r=val; holdR=r; }
        else                 { r=holdR; b=holdB; g=val; holdG=g; }
      } else if (isHAM) {
        // HAM6: 6 planes, upper 2 bits = control, lower 4 bits = value/index
        const ctrl = (colorIdx >> 4) & 3;
        const val  = (colorIdx & 0xF) * 17; // scale 4-bit to 8-bit
        // B5 fix: for ctrl=0, palette index is only the lower 4 bits (16-color palette)
        if (ctrl === 0) { [r,g,b] = palette[colorIdx & 0x0F] || [0,0,0]; holdR=r; holdG=g; holdB=b; }
        else if (ctrl === 1) { r=holdR; g=holdG; b=val; holdB=b; }
        else if (ctrl === 2) { b=holdB; g=holdG; r=val; holdR=r; }
        else                 { r=holdR; b=holdB; g=val; holdG=g; }
      } else {
        [r,g,b] = palette[colorIdx] || [0,0,0];
      }

      // Masking transparency
      let a = 255;
      if (masking === 2 && colorIdx === transpColor) a = 0;
      if (masking === 1 && planeData[nPlanes]) {
        const byteIdx = x >> 3;
        const bitMask = 0x80 >> (x & 7);
        if (!(planeData[nPlanes][byteIdx] & bitMask)) a = 0;
      }

      const i = (y * w + x) * 4;
      pixels[i]   = r;
      pixels[i+1] = g;
      pixels[i+2] = b;
      pixels[i+3] = a;
    }
  }

  return {
    width: w, height: h, pixels,
    nPlanes, palette, masking, compress, transpColor,
    xAspect, yAspect, isHAM, isEHB, isHires, isInterlace, isHAM8,
    camg
  };
}

// ════════════════════════════════════════════════════
//  ANIM DECODER (ANIM-5 XOR delta)
// ════════════════════════════════════════════════════

function decodeANIM(data, topChunks) {
  const animForm = topChunks.find(c => c.id === 'FORM' && c.subType === 'ANIM');
  if (!animForm) return null;

  const frames = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Collect all FORM ILBM sub-chunks inside the ANIM
  let pos = animForm.dataStart + 4; // skip 'ANIM' type tag
  while (pos + 8 <= animForm.dataEnd) {
    const id   = String.fromCharCode(data[pos], data[pos+1], data[pos+2], data[pos+3]);
    const size = view.getUint32(pos + 4, false);
    const safeSize = Math.min(size, animForm.dataEnd - pos - 8);
    const chunkDataStart = pos + 8;
    const chunkDataEnd   = chunkDataStart + safeSize;

    if (id === 'FORM' && safeSize >= 4) {
      const subType = String.fromCharCode(
        data[chunkDataStart], data[chunkDataStart+1],
        data[chunkDataStart+2], data[chunkDataStart+3]);
      if (subType === 'ILBM') {
        // Parse chunks relative to the slice we hand to parseIFF
        const sliceStart = pos;
        const sliceLen   = 8 + safeSize;
        const frameSlice = data.slice(sliceStart, sliceStart + sliceLen);
        const frameChunks = parseIFF(frameSlice);
        // Inner ILBM chunks are children of the FORM
        const innerChunks = frameChunks[0]?.children || frameChunks;
        frames.push({
          sliceStart,      // absolute offset of FORM header in data
          innerData: data.slice(chunkDataStart + 4, chunkDataEnd), // ILBM body (after subType)
          innerChunks,     // already relative to innerData (offset adjusted below)
          rawChunks: frameChunks,
        });
      }
    }
    const advance = safeSize + (safeSize & 1) + 8;
    if (advance <= 0) break;
    pos += advance;
  }

  if (frames.length === 0) return null;

  // ── Decode first frame as base ILBM to get palette/dimensions ──────────────
  // The first frame's innerChunks have dataStart values relative to frameSlice,
  // which starts at sliceStart. innerData starts at sliceStart+8+4 = chunkDataStart+4.
  // We need chunks whose dataStart is relative to innerData.
  // Easiest: re-parse just the ILBM body portion.
  const frame0 = frames[0];
  const base = frame0.innerData;
  // Re-parse the base frame inner chunks so offsets are relative to `base`
  const baseChunks = parseIFF(base);
  const baseILBM = decodeILBM(base, baseChunks);
  if (!baseILBM) return null;

  const { width, height, nPlanes, palette, isHAM, isHAM8, isEHB } = baseILBM;
  const bytesPerRow = Math.floor((width + 15) / 16) * 2;
  const planeSize   = bytesPerRow * height;

  // B6 fix: Keep state as bitplane arrays, never convert back from RGBA
  // This avoids the O(W×H×256) nearest-neighbour reverse that froze the browser.
  // Parse bitplanes directly for all frames
  function parseBitplanesFromILBM(innerData) {
    const chunks = parseIFF(innerData);
    const bmhdC  = findChunk(chunks, 'BMHD');
    const bodyC  = findChunk(chunks, 'BODY');
    if (!bmhdC || !bodyC) return null;
    const bv = new DataView(innerData.buffer, innerData.byteOffset, innerData.byteLength);
    const fw = bv.getUint16(bmhdC.dataStart, false);
    const fh = bv.getUint16(bmhdC.dataStart + 2, false);
    if (fw !== width || fh !== height) return null;
    const compress = innerData[bmhdC.dataStart + 10];
    const mask     = innerData[bmhdC.dataStart + 9];
    const totalP   = nPlanes + (mask === 1 ? 1 : 0);
    const unpackedSize = height * totalP * bytesPerRow;
    let bodyData = innerData.slice(bodyC.dataStart, bodyC.dataEnd);
    if (compress === 1) bodyData = decompressByteRun1(bodyData, unpackedSize);
    const planes = [];
    let srcPos = 0;
    for (let p = 0; p < totalP; p++) {
      planes.push(bodyData.slice(srcPos, srcPos + height * bytesPerRow));
      srcPos += height * bytesPerRow;
      // Note: ILBM stores interleaved rows, not contiguous planes.
      // Re-arrange: for each row, plane p's row is at srcPos (interleaved).
    }
    // Re-parse interleaved format correctly: rows are interleaved per scanline
    const planes2 = Array.from({length: totalP}, () => new Uint8Array(planeSize));
    srcPos = 0;
    for (let y = 0; y < height; y++) {
      for (let p = 0; p < totalP; p++) {
        for (let bpr = 0; bpr < bytesPerRow; bpr++) {
          planes2[p][y * bytesPerRow + bpr] = srcPos < bodyData.length ? bodyData[srcPos] : 0;
          srcPos++;
        }
      }
    }
    return planes2;
  }

  // Render bitplanes to RGBA (HAM-aware)
  function bitplanesToRGBA(planes) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      let holdR = 0, holdG = 0, holdB = 0;
      for (let x = 0; x < width; x++) {
        let colorIdx = 0;
        for (let p = 0; p < nPlanes; p++) {
          if (planes[p][y * bytesPerRow + (x >> 3)] & (0x80 >> (x & 7))) {
            colorIdx |= (1 << p);
          }
        }
        let r, g, b;
        if (isHAM8) {
          const ctrl = (colorIdx >> 6) & 3;
          const val  = (colorIdx & 63) << 2;
          if (ctrl === 0) { [r,g,b] = palette[colorIdx & 63] || [0,0,0]; holdR=r; holdG=g; holdB=b; }
          else if (ctrl === 1) { r=holdR; g=holdG; b=val; holdB=b; }
          else if (ctrl === 2) { b=holdB; g=holdG; r=val; holdR=r; }
          else                 { r=holdR; b=holdB; g=val; holdG=g; }
        } else if (isHAM) {
          const ctrl = (colorIdx >> 4) & 3;
          const val  = (colorIdx & 0xF) * 17;
          // B5 fix applied here too
          if (ctrl === 0) { [r,g,b] = palette[colorIdx & 0x0F] || [0,0,0]; holdR=r; holdG=g; holdB=b; }
          else if (ctrl === 1) { r=holdR; g=holdG; b=val; holdB=b; }
          else if (ctrl === 2) { b=holdB; g=holdG; r=val; holdR=r; }
          else                 { r=holdR; b=holdB; g=val; holdG=g; }
        } else {
          [r,g,b] = palette[colorIdx] || [0,0,0];
        }
        const i = (y * width + x) * 4;
        pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = 255;
      }
    }
    return pixels;
  }

  // Build per-frame bitplane state
  let curPlanes = parseBitplanesFromILBM(base);
  if (!curPlanes) {
    // Fallback: extract from already-decoded base ILBM pixels via base decode
    curPlanes = parseBitplanesFromILBM(frames[0].innerData);
    if (!curPlanes) return null;
  }

  const framePixels = [bitplanesToRGBA(curPlanes)];
  const frameDelays = [0];

  for (let fi = 1; fi < frames.length; fi++) {
    const innerData = frames[fi].innerData;
    // Re-parse chunks relative to innerData
    const fChunks = parseIFF(innerData);

    // B7 fix: ANHD dataStart is now relative to innerData (re-parsed correctly)
    const anhdChunk = findChunk(fChunks, 'ANHD');
    let relTime = 2;
    if (anhdChunk && anhdChunk.dataStart + 10 <= innerData.byteLength) {
      const anhdView = new DataView(innerData.buffer, innerData.byteOffset + anhdChunk.dataStart, anhdChunk.size);
      relTime = anhdView.getUint16(8, false) || 2;
    }
    frameDelays.push(Math.max(1, relTime) * 20);

    const dltaChunk = findChunk(fChunks, 'DLTA');
    if (dltaChunk) {
      // B6 fix: Apply ANIM-5 XOR delta directly to bitplanes (no RGB roundtrip)
      const dltaData = innerData.slice(dltaChunk.dataStart, dltaChunk.dataEnd);
      // Clone current planes then XOR-delta in-place
      const newPlanes = curPlanes.map(p => new Uint8Array(p));
      applyANIM5DeltaToBitplanes(dltaData, newPlanes, nPlanes, bytesPerRow, height);
      curPlanes = newPlanes;
    } else {
      // Full fresh frame
      const freshPlanes = parseBitplanesFromILBM(innerData);
      if (freshPlanes) curPlanes = freshPlanes;
    }
    framePixels.push(bitplanesToRGBA(curPlanes));
  }

  return { frames: framePixels, frameDelays, ilbm: baseILBM, count: framePixels.length };
}

// B6 fix: Apply ANIM-5 XOR delta directly to bitplane arrays — O(delta_bytes) not O(W×H×colors)
function applyANIM5DeltaToBitplanes(deltaData, planes, nPlanes, bytesPerRow, height) {
  const view = new DataView(deltaData.buffer, deltaData.byteOffset, deltaData.byteLength);
  for (let p = 0; p < nPlanes; p++) {
    if (p * 4 + 4 > deltaData.byteLength) break;
    const planeOffset = view.getUint32(p * 4, false);
    if (!planeOffset || planeOffset >= deltaData.byteLength) continue;

    let pos = planeOffset;
    for (let col = 0; col < bytesPerRow && pos < deltaData.byteLength; col++) {
      let row = 0;
      while (row < height && pos < deltaData.byteLength) {
        const count = deltaData[pos++];
        if (count === 0) break; // end of column
        if (count & 0x80) {
          row += count & 0x7F; // skip rows
        } else {
          // XOR next `count` bytes into column
          for (let i = 0; i < count && row < height && pos < deltaData.byteLength; i++, row++) {
            planes[p][row * bytesPerRow + col] ^= deltaData[pos++];
          }
        }
      }
    }
  }
}

// Keep old applyANIM5Delta name pointing to the new function for backwards compat
// ════════════════════════════════════════════════════
//  8SVX AUDIO DECODER
// ════════════════════════════════════════════════════

function decode8SVX(data, chunks) {
  const vhdrChunk = findChunk(chunks, 'VHDR');
  if (!vhdrChunk) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const b = vhdrChunk.dataStart;
  const oneShotSamples = view.getUint32(b + 0, false);
  const repeatSamples  = view.getUint32(b + 4, false);
  const samplesPerCycle = view.getUint32(b + 8, false);
  const samplesPerSec  = view.getUint16(b + 12, false);
  const octaves        = data[b + 14];
  const compression    = data[b + 15];
  const volume         = view.getInt32(b + 16, false);

  const bodyChunk = findChunk(chunks, 'BODY');
  if (!bodyChunk) return null;
  let bodyData = chunkBytes(data, bodyChunk);

  // Decompress Fibonacci delta if needed
  if (compression === 1) {
    bodyData = decompressFibonacci(bodyData);
  }

  // Convert signed 8-bit to float32
  const sampleRate = samplesPerSec || 8363;
  const floatSamples = new Float32Array(bodyData.length);
  for (let i = 0; i < bodyData.length; i++) {
    // Uint8 to signed: values >= 128 are negative
    const s = bodyData[i] >= 128 ? bodyData[i] - 256 : bodyData[i];
    floatSamples[i] = s / 128.0;
  }

  const nameChunk = findChunk(chunks, 'NAME');
  let name = '';
  if (nameChunk) {
    for (let i = nameChunk.dataStart; i < nameChunk.dataEnd && data[i]; i++) {
      name += String.fromCharCode(data[i]);
    }
  }

  return { floatSamples, sampleRate, oneShotSamples, repeatSamples,
    samplesPerCycle, octaves, compression, volume, name };
}

function decompressFibonacci(src) {
  const FIB = [-34,-21,-13,-8,-5,-3,-2,-1,0,1,2,3,5,8,13,21];
  const dst = new Uint8Array(src.length * 2);
  if (src.length === 0) return dst;
  let prev = (src[0] >= 128) ? src[0] - 256 : src[0];
  let di = 0;
  dst[di++] = prev & 0xFF;
  for (let i = 1; i < src.length; i++) {
    const byte = src[i];
    const hi = (byte >> 4) & 0xF;
    const lo = byte & 0xF;
    prev = Math.max(-128, Math.min(127, prev + FIB[hi]));
    dst[di++] = prev & 0xFF;
    prev = Math.max(-128, Math.min(127, prev + FIB[lo]));
    dst[di++] = prev & 0xFF;
  }
  return dst.slice(0, di);
}

// ════════════════════════════════════════════════════
//  IFF VIEWER STATE
// ════════════════════════════════════════════════════

let iffState = {
  data: null, chunks: null, type: null,
  ilbm: null, anim: null, audio: null,
  currentFrame: 0, animTimer: null, animFps: 10, animPlaying: false,
  zoom: 1, audioCtx: null, audioSource: null, audioStartTime: 0,
  audioBuffer: null, isAudioPlaying: false, audioAnimFrame: null,
  currentFilename: ''
};

function openFileViewer(sector, name, size) {
  if (!diskData) return;
  const data = readFileData(sector, size);

  // Detect IFF
  if (data.length < 12 || String.fromCharCode(data[0],data[1],data[2],data[3]) !== 'FORM') {
    // Show in Bitmap & Hex view
    selectSector(sector);
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-tab="bitmaphex"]').classList.add('active');
    ['bootblock','bootcode','bitmaphex','filecontent'].forEach(t => {
      const el = document.getElementById(`tab-${t}`);
      if (el) el.style.display = t === 'bitmaphex' ? 'flex' : 'none';
    });
    document.getElementById('hex-controls').style.display = 'flex';
    return;
  }

  iffState.data = data;
  iffState.currentFilename = name;
  const topChunks = parseIFF(data);
  iffState.chunks = topChunks;

  const formType = topChunks[0]?.subType || '????';
  iffState.type = formType;

  // Stop any existing animation/audio
  stopAnimation();
  stopAudio();

  document.getElementById('iff-filename').textContent = name;
  document.getElementById('iff-type-badge').textContent = formType;

  // Render chunk tree always
  document.getElementById('iff-view-chunks').innerHTML = renderChunkTree(topChunks, data);

  // Properties
  document.getElementById('iff-props-content').innerHTML = renderIFFProps(topChunks, data, formType);

  // Preview — wrap so any decode error shows a friendly message instead of crashing
  try {
    renderIFFPreview(topChunks, data, formType);
  } catch(err) {
    console.error('IFF render error:', err);
    document.getElementById('iff-view-generic').style.display = 'flex';
    document.getElementById('iff-generic-type').textContent = `${formType} — render error`;
    document.getElementById('iff-canvas').style.display = 'none';
  }

  document.getElementById('iff-modal').classList.add('open');

  // Reset to preview tab
  document.querySelectorAll('.iff-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-iff-tab="preview"]').classList.add('active');
  showIFFTab('preview');
}

function renderIFFPreview(chunks, data, formType) {
  const canvasWrap = document.getElementById('iff-canvas-wrap');
  // Hide everything first
  document.getElementById('iff-canvas').style.display = 'none';
  document.getElementById('iff-anim-overlay').style.display = 'none';
  document.getElementById('iff-view-audio').style.display = 'none';
  document.getElementById('iff-view-generic').style.display = 'none';
  document.getElementById('iff-palette').style.display = 'none';
  document.getElementById('iff-image-info').style.display = 'none';

  if (formType === 'ILBM') {
    const innerChunks = chunks[0]?.children || chunks;
    const ilbm = decodeILBM(data, innerChunks);
    if (!ilbm) {
      document.getElementById('iff-view-generic').style.display = 'flex';
      return;
    }
    iffState.ilbm = ilbm;
    iffState.zoom = 1;
    drawILBMToCanvas(ilbm.pixels, ilbm.width, ilbm.height);
    document.getElementById('iff-canvas').style.display = 'block';
    showImageInfo(ilbm);
    showPalette(ilbm.palette, 1 << ilbm.nPlanes);

  } else if (formType === 'ANIM') {
    const anim = decodeANIM(data, chunks);
    if (!anim) {
      document.getElementById('iff-view-generic').style.display = 'flex';
      document.getElementById('iff-generic-type').textContent = 'ANIM (no frames)';
      return;
    }
    iffState.anim = anim;
    iffState.ilbm = anim.ilbm;
    iffState.currentFrame = 0;
    iffState.zoom = 1;
    drawFrameToCanvas(0);
    document.getElementById('iff-canvas').style.display = 'block';
    document.getElementById('iff-anim-overlay').style.display = 'flex';
    document.getElementById('anim-frame-counter').textContent = `1 / ${anim.count}`;
    document.getElementById('anim-fps-val').textContent = iffState.animFps;
    showImageInfo(anim.ilbm);
    showPalette(anim.ilbm.palette, 1 << anim.ilbm.nPlanes);
    startAnimation();

  } else if (formType === '8SVX') {
    const innerChunks = chunks[0]?.children || chunks;
    const audio = decode8SVX(data, innerChunks);
    if (!audio) {
      document.getElementById('iff-view-generic').style.display = 'flex';
      document.getElementById('iff-generic-type').textContent = '8SVX (invalid)';
      return;
    }
    iffState.audio = audio;
    document.getElementById('iff-view-audio').style.display = 'flex';
    drawWaveform(audio.floatSamples);
    document.getElementById('audio-info-grid').innerHTML = `
      <div class="kv-key">Sample Rate</div><div class="kv-val info">${audio.sampleRate} Hz</div>
      <div class="kv-key">Duration</div><div class="kv-val">${(audio.floatSamples.length / audio.sampleRate).toFixed(3)}s</div>
      <div class="kv-key">Samples</div><div class="kv-val">${audio.floatSamples.length.toLocaleString()}</div>
      <div class="kv-key">Compression</div><div class="kv-val ${audio.compression ? 'warn' : 'highlight'}">${audio.compression === 1 ? 'Fibonacci Delta' : 'None (PCM)'}</div>
      <div class="kv-key">One-shot</div><div class="kv-val">${audio.oneShotSamples}</div>
      <div class="kv-key">Repeat</div><div class="kv-val">${audio.repeatSamples}</div>
      <div class="kv-key">Volume</div><div class="kv-val">${((audio.volume / 65536) * 100).toFixed(1)}%</div>
      ${audio.name ? `<div class="kv-key">Name</div><div class="kv-val">${audio.name}</div>` : ''}
    `;
    buildVUMeter();

  } else {
    document.getElementById('iff-view-generic').style.display = 'flex';
    document.getElementById('iff-generic-type').textContent = formType;
  }
}

function drawILBMToCanvas(pixels, width, height) {
  const canvas = document.getElementById('iff-canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imgData = new ImageData(pixels, width, height);
  ctx.putImageData(imgData, 0, 0);
  applyCanvasZoom();
}

function drawFrameToCanvas(frameIdx) {
  const { anim } = iffState;
  if (!anim || frameIdx >= anim.count) return;
  const { ilbm } = anim;
  drawILBMToCanvas(anim.frames[frameIdx], ilbm.width, ilbm.height);
  document.getElementById('anim-frame-counter').textContent = `${frameIdx + 1} / ${anim.count}`;
}

function applyCanvasZoom() {
  const canvas = document.getElementById('iff-canvas');
  const ilbm = iffState.ilbm;
  if (!ilbm) return;
  const { zoom } = iffState;
  if (zoom === 0) {
    // Fit mode
    canvas.style.width = '';
    canvas.style.height = '';
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';
  } else {
    canvas.style.width = (ilbm.width * zoom) + 'px';
    canvas.style.height = (ilbm.height * zoom) + 'px';
    canvas.style.maxWidth = 'none';
    canvas.style.maxHeight = 'none';
  }
  document.getElementById('iff-zoom-label').textContent =
    zoom === 0 ? 'fit' : zoom + '×';
}

function iffZoom(factor) {
  if (factor === 0) { iffState.zoom = 0; }
  else { iffState.zoom = Math.max(0.25, Math.min(8, (iffState.zoom || 1) * factor)); }
  applyCanvasZoom();
}

function showImageInfo(ilbm) {
  document.getElementById('iff-image-info').style.display = 'flex';
  document.getElementById('img-size-val').textContent = `${ilbm.width} × ${ilbm.height}`;
  document.getElementById('img-depth-val').textContent = `${ilbm.nPlanes} bitplanes`;
  document.getElementById('img-colors-val').textContent = `${Math.min(1 << ilbm.nPlanes, 256)}`;
  const modes = [];
  if (ilbm.isHAM) modes.push(ilbm.isHAM8 ? 'HAM8' : 'HAM6');
  if (ilbm.isEHB) modes.push('EHB');
  if (ilbm.isHires) modes.push('Hires');
  if (ilbm.isInterlace) modes.push('Interlace');
  document.getElementById('img-mode-val').textContent = modes.length ? modes.join('+') : 'Normal';
  document.getElementById('img-comp-val').textContent = ilbm.compress ? 'ByteRun1' : 'None';
  document.getElementById('img-aspect-val').textContent = `${ilbm.xAspect}:${ilbm.yAspect}`;
}

function showPalette(palette, numColors) {
  const el = document.getElementById('iff-palette');
  el.style.display = 'flex';
  let html = '';
  for (let i = 0; i < Math.min(numColors, 256); i++) {
    const [r,g,b] = palette[i] || [0,0,0];
    html += `<div class="pal-swatch" style="background:rgb(${r},${g},${b})"
      title="Index ${i}: #${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')} (${r},${g},${b})"></div>`;
  }
  el.innerHTML = html;
}

// ════════════════════════════════════════════════════
//  ANIMATION CONTROL
// ════════════════════════════════════════════════════

function startAnimation() {
  iffState.animPlaying = true;
  document.getElementById('anim-play-btn').textContent = '⏸';
  document.getElementById('anim-play-btn').classList.add('active');
  scheduleNextFrame();
}

function scheduleNextFrame() {
  const { anim, animFps } = iffState;
  if (!iffState.animPlaying || !anim) return;
  const delay = anim.frameDelays[iffState.currentFrame] || Math.round(1000 / animFps);
  iffState.animTimer = setTimeout(() => {
    iffState.currentFrame = (iffState.currentFrame + 1) % anim.count;
    drawFrameToCanvas(iffState.currentFrame);
    scheduleNextFrame();
  }, delay);
}

function stopAnimation() {
  iffState.animPlaying = false;
  if (iffState.animTimer) clearTimeout(iffState.animTimer);
  const btn = document.getElementById('anim-play-btn');
  if (btn) { btn.textContent = '▶'; btn.classList.remove('active'); }
}

function animToggle() {
  if (iffState.animPlaying) stopAnimation();
  else startAnimation();
}

function animStep(dir) {
  stopAnimation();
  const { anim } = iffState;
  if (!anim) return;
  iffState.currentFrame = (iffState.currentFrame + dir + anim.count) % anim.count;
  drawFrameToCanvas(iffState.currentFrame);
}

function animSetFps(val) {
  iffState.animFps = parseInt(val);
  document.getElementById('anim-fps-val').textContent = val;
}

// ════════════════════════════════════════════════════
//  AUDIO CONTROL
// ════════════════════════════════════════════════════

function drawWaveform(samples) {
  const canvas = document.getElementById('iff-waveform-canvas');
  const W = canvas.offsetWidth || 700;
  const H = 120;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, W, H);

  // Draw waveform
  const step = Math.max(1, Math.floor(samples.length / W));
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1;
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur = 3;
  ctx.beginPath();
  for (let x = 0; x < W; x++) {
    const idx = Math.floor(x * samples.length / W);
    let min = 0, max = 0;
    for (let j = 0; j < step && idx+j < samples.length; j++) {
      const v = samples[idx+j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const yMin = H/2 + min * (H/2 - 2);
    const yMax = H/2 + max * (H/2 - 2);
    if (x === 0) ctx.moveTo(x, H/2);
    ctx.lineTo(x, yMin);
    ctx.lineTo(x, yMax);
  }
  ctx.stroke();

  // Center line
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(0,255,136,0.2)';
  ctx.beginPath();
  ctx.moveTo(0, H/2); ctx.lineTo(W, H/2);
  ctx.stroke();
}

function buildVUMeter() {
  const el = document.getElementById('vu-meter');
  let html = '';
  for (let i = 0; i < 12; i++) html += `<div class="vu-bar" id="vu-${i}" style="height:${(i+1)*2}px"></div>`;
  el.innerHTML = html;
}

function audioToggle() {
  if (iffState.isAudioPlaying) stopAudio();
  else playAudio();
}

function playAudio() {
  const { audio } = iffState;
  if (!audio) return;

  if (!iffState.audioCtx) iffState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const ctx = iffState.audioCtx;

  const buf = ctx.createBuffer(1, audio.floatSamples.length, audio.sampleRate);
  buf.getChannelData(0).set(audio.floatSamples);
  iffState.audioBuffer = buf;

  if (iffState.audioSource) try { iffState.audioSource.stop(); } catch(e) {}
  const source = ctx.createBufferSource();
  source.buffer = buf;

  // Create analyser for VU meter
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  analyser.connect(ctx.destination);
  iffState.analyser = analyser;

  source.start();
  iffState.audioSource = source;
  iffState.audioStartTime = ctx.currentTime;
  iffState.isAudioPlaying = true;
  source.onended = () => { iffState.isAudioPlaying = false; updateAudioBtn(); };

  updateAudioBtn();
  animateAudioProgress();
}

function stopAudio() {
  if (iffState.audioSource) {
    try { iffState.audioSource.stop(); } catch(e) {}
    iffState.audioSource = null;
  }
  iffState.isAudioPlaying = false;
  updateAudioBtn();
  if (iffState.audioAnimFrame) cancelAnimationFrame(iffState.audioAnimFrame);
  document.getElementById('audio-progress-fill').style.width = '0%';
  document.getElementById('audio-time-display').textContent = '0.00s';
}

function updateAudioBtn() {
  const btn = document.getElementById('audio-play-btn');
  if (!btn) return;
  btn.textContent = iffState.isAudioPlaying ? '■ STOP' : '▶ PLAY';
  btn.className = 'audio-play-btn' + (iffState.isAudioPlaying ? ' playing' : '');
}

function animateAudioProgress() {
  const { audio, audioCtx, audioStartTime, isAudioPlaying, analyser } = iffState;
  if (!isAudioPlaying || !audio) return;

  const elapsed = audioCtx.currentTime - audioStartTime;
  const duration = audio.floatSamples.length / audio.sampleRate;
  const pct = Math.min(100, (elapsed / duration) * 100);
  document.getElementById('audio-progress-fill').style.width = pct + '%';
  document.getElementById('audio-time-display').textContent = elapsed.toFixed(2) + 's';

  // VU meter
  if (analyser) {
    const buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buf);
    for (let i = 0; i < 12; i++) {
      const avg = buf.slice(i*4, i*4+4).reduce((a,b)=>a+b,0)/4;
      const h = Math.max(2, (avg / 255) * 22);
      const el = document.getElementById(`vu-${i}`);
      if (el) el.style.height = h + 'px';
    }
  }

  iffState.audioAnimFrame = requestAnimationFrame(animateAudioProgress);
}

// ════════════════════════════════════════════════════
//  CHUNK TREE RENDERER
// ════════════════════════════════════════════════════

const CHUNK_DESCS = {
  FORM:'Container', LIST:'List', CAT:'Concatenation',
  BMHD:'Bitmap Header', CMAP:'Color Map', BODY:'Image/Sample Data',
  CAMG:'Amiga Viewport Mode', GRAB:'Hotspot', DEST:'Destination Merge',
  SPRT:'Sprite', CRNG:'Color Range / Cycling', CCRT:'Color Cycle',
  VHDR:'Voice Header', ATCK:'Attack', RLSE:'Release',
  NAME:'Name', AUTH:'Author', COPYRIGHT:'Copyright', ANNO:'Annotation',
  TEXT:'Text', FVER:'File Version',
  ANHD:'Animation Header', DLTA:'Delta Frame',
  MHDR:'Music Header', FORM:'IFF Container',
};

function renderChunkTree(chunks, data) {
  function renderChunk(c, depth) {
    const indent = depth * 16;
    const desc = CHUNK_DESCS[c.id] || (c.subType ? `${c.subType} container` : '');
    const isContainer = c.children !== null;
    const hexPreview = !isContainer && c.size > 0
      ? Array.from(data.slice(c.dataStart, Math.min(c.dataStart + 8, c.dataEnd)))
          .map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')
      : '';
    const sizeStr = c.size >= 1024 ? (c.size/1024).toFixed(1)+'K' : c.size+'B';

    let html = `<div class="chunk-node">
      <div class="chunk-header" style="padding-left:${8+indent}px">
        <span class="chunk-id">${c.id}</span>
        ${c.subType ? `<span class="iff-badge" style="font-size:9px">${c.subType}</span>` : ''}
        <span class="chunk-size">${sizeStr}</span>
        <span class="chunk-desc">${desc}</span>
        ${hexPreview ? `<span class="chunk-hex">${hexPreview}…</span>` : ''}
      </div>`;
    if (c.children && c.children.length > 0) {
      html += `<div class="chunk-children">`;
      for (const child of c.children) html += renderChunk(child, depth + 1);
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }
  return chunks.map(c => renderChunk(c, 0)).join('');
}

function renderIFFProps(chunks, data, formType) {
  const sections = [];
  if (formType === 'ILBM' || formType === 'ANIM') {
    const bmhdChunk = findChunk(chunks, 'BMHD');
    const camgChunk = findChunk(chunks, 'CAMG');
    const cmapChunk = findChunk(chunks, 'CMAP');
    if (bmhdChunk) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const b = bmhdChunk.dataStart;
      const camg = camgChunk ? view.getUint32(camgChunk.dataStart, false) : 0;
      sections.push(`<div class="analysis-section">
        <div class="analysis-title">Bitmap Header</div>
        <div class="kv-grid">
          <div class="kv-key">Dimensions</div><div class="kv-val highlight">${view.getUint16(b,false)} × ${view.getUint16(b+2,false)} px</div>
          <div class="kv-key">Bitplanes</div><div class="kv-val">${data[b+8]}</div>
          <div class="kv-key">Colors</div><div class="kv-val">${1 << data[b+8]}</div>
          <div class="kv-key">Masking</div><div class="kv-val">${['None','Has Mask','Transparent Color','Lasso'][data[b+9]]||data[b+9]}</div>
          <div class="kv-key">Compression</div><div class="kv-val ${data[b+10]?'highlight':'warn'}">${data[b+10]?'ByteRun1':'None'}</div>
          <div class="kv-key">Pixel Aspect</div><div class="kv-val">${data[b+14]}:${data[b+15]}</div>
          <div class="kv-key">Page Size</div><div class="kv-val">${view.getInt16(b+16,false)} × ${view.getInt16(b+18,false)}</div>
          ${camgChunk?`<div class="kv-key">CAMG Flags</div><div class="kv-val info">0x${camg.toString(16).toUpperCase().padStart(8,'0')}</div>`:''}
          ${camg&0x0800?'<div class="kv-key">HAM Mode</div><div class="kv-val amber">Hold And Modify</div>':''}
          ${camg&0x0080?'<div class="kv-key">EHB Mode</div><div class="kv-val amber">Extra Half-Brite</div>':''}
          ${camg&0x8000?'<div class="kv-key">Resolution</div><div class="kv-val">Hires</div>':''}
          ${camg&0x0004?'<div class="kv-key">Scan</div><div class="kv-val">Interlaced</div>':''}
        </div>
      </div>`);
    }
    if (cmapChunk) {
      const numColors = Math.floor(cmapChunk.size / 3);
      sections.push(`<div class="analysis-section">
        <div class="analysis-title">Color Map</div>
        <div class="kv-grid">
          <div class="kv-key">Palette Size</div><div class="kv-val">${numColors} colors</div>
        </div>
      </div>`);
    }
  }
  if (formType === '8SVX') {
    const audio = iffState.audio;
    if (audio) {
      sections.push(`<div class="analysis-section">
        <div class="analysis-title">Voice Header</div>
        <div class="kv-grid">
          <div class="kv-key">Sample Rate</div><div class="kv-val highlight">${audio.sampleRate} Hz</div>
          <div class="kv-key">Duration</div><div class="kv-val">${(audio.floatSamples.length/audio.sampleRate).toFixed(3)} seconds</div>
          <div class="kv-key">Total Samples</div><div class="kv-val">${audio.floatSamples.length.toLocaleString()}</div>
          <div class="kv-key">One-shot</div><div class="kv-val">${audio.oneShotSamples}</div>
          <div class="kv-key">Repeat</div><div class="kv-val">${audio.repeatSamples}</div>
          <div class="kv-key">Octaves</div><div class="kv-val">${audio.octaves}</div>
          <div class="kv-key">Compression</div><div class="kv-val ${audio.compression?'warn':'highlight'}">${audio.compression===1?'Fibonacci Delta':'None (raw PCM)'}</div>
          <div class="kv-key">Volume</div><div class="kv-val">${audio.volume} (${((audio.volume/65536)*100).toFixed(1)}%)</div>
        </div>
      </div>`);
    }
  }
  // Generic info from chunks
  ['NAME','AUTH','COPYRIGHT','ANNO','TEXT'].forEach(id => {
    const c = findChunk(chunks, id);
    if (!c) return;
    let txt = '';
    for (let i = c.dataStart; i < c.dataEnd && data[i]; i++) txt += String.fromCharCode(data[i]);
    if (txt) sections.push(`<div class="analysis-section">
      <div class="analysis-title">${CHUNK_DESCS[id]||id}</div>
      <div class="kv-grid"><div class="kv-key">${id}</div><div class="kv-val">${txt}</div></div>
    </div>`);
  });
  return sections.join('') || '<div style="padding:20px;font-family:var(--font-mono);font-size:12px;color:var(--wb-dim);text-align:center">No properties available</div>';
}

// ════════════════════════════════════════════════════
//  IFF MODAL UI
// ════════════════════════════════════════════════════

function closeIFF() {
  stopAnimation();
  stopAudio();
  document.getElementById('iff-modal').classList.remove('open');
  iffState.ilbm = null;
  iffState.anim = null;
  iffState.audio = null;
}

function showIFFTab(name) {
  const tabMap = { 'preview': 'iff-view-preview', 'chunks': 'iff-view-chunks', 'info': 'iff-view-info' };
  Object.entries(tabMap).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = key === name ? (key === 'preview' ? 'flex' : 'block') : 'none';
  });
}

document.querySelectorAll('.iff-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.iff-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    showIFFTab(tab.dataset.iffTab);
  });
});

// Close on backdrop click
document.getElementById('iff-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('iff-modal')) closeIFF();
});

// Draggable window
(function() {
  const win = document.getElementById('iff-window');
  const bar = document.getElementById('iff-titlebar');
  let dragging = false, ox = 0, oy = 0;
  bar.addEventListener('mousedown', e => {
    dragging = true;
    ox = e.clientX - win.offsetLeft;
    oy = e.clientY - win.offsetTop;
    win.style.position = 'absolute';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    win.style.left = (e.clientX - ox) + 'px';
    win.style.top  = (e.clientY - oy) + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });
})();

// ════════════════════════════════════════════════════
//  FILE / DIRECTORY INFORMATION PANEL
// ════════════════════════════════════════════════════

function updateFileInfoPanel(sector) {
  const container = document.getElementById('file-info-container');
  if (!container) return;

  // Find the entry from loaded entries
  const entry = loadedAllEntries.find(e => e.sector === sector);
  if (!entry) {
    container.style.display = 'none';
    return;
  }

  const isDir = entry.stType === 2;
  const isFile = entry.stType === -3;
  const typeLabel = isDir ? 'Directory' : isFile ? 'File' : 'Entry';
  const typeIcon = isDir ? '📁' : '📄';

  // Identify file type badge
  let fileTypeInfo = '';
  if (isFile) {
    const { icon, badge } = identifyFile(entry.name, entry.sector, entry.size);
    if (badge) {
      fileTypeInfo = `<div class="stat-row">
        <span class="stat-label">Type badge</span>
        <span class="stat-value orange">${badge}</span>
      </div>`;
    }
  }

  // Count children for directories
  let dirContentsInfo = '';
  if (isDir) {
    const childPath = entry.path + '/';
    const children = loadedAllEntries.filter(e => {
      if (!e.path.startsWith(childPath)) return false;
      // Only direct children (no further slashes after the prefix)
      const remainder = e.path.substring(childPath.length);
      return remainder.indexOf('/') === -1;
    });
    const childDirs = children.filter(e => e.stType === 2).length;
    const childFiles = children.filter(e => e.stType === -3).length;
    const totalSize = children.filter(e => e.stType === -3).reduce((sum, e) => sum + e.size, 0);
    dirContentsInfo = `
      <div class="stat-row">
        <span class="stat-label">Sub-dirs</span>
        <span class="stat-value amber">${childDirs}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Files</span>
        <span class="stat-value">${childFiles}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Files size</span>
        <span class="stat-value">${formatSize(totalSize)}</span>
      </div>`;
  }

  // Protection bits — expand to readable format
  let protInfo = '';
  if (entry.prot !== undefined) {
    const prot = entry.prot || 0;
    const protHtml = protToTreeStr(prot);
    const readable = [];
    if (prot & 0x80) readable.push('Hidden');
    if (prot & 0x40) readable.push('Script');
    if (prot & 0x20) readable.push('Pure');
    if (prot & 0x10) readable.push('Archived');
    // RWED bits are active-low
    if (!(prot & 0x08)) readable.push('Read');
    if (!(prot & 0x04)) readable.push('Write');
    if (!(prot & 0x02)) readable.push('Execute');
    if (!(prot & 0x01)) readable.push('Delete');
    protInfo = `
      <div class="stat-row">
        <span class="stat-label">Protection</span>
        <span class="stat-value" style="font-family:var(--font-mono);font-size:11px;letter-spacing:1px">${protHtml}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Flags</span>
        <span class="stat-value" style="font-size:10px;color:var(--wb-dim)">${readable.join(', ') || 'None'}</span>
      </div>`;
  }

  // Read comment from the block header (ADF stores at offset -184, BCPL string)
  let commentInfo = '';
  if (diskData && ADF.IS_ADOS) {
    try {
      const cmt = bcplStr(sector, ADF.SECTOR_SIZE - 184);
      if (cmt) {
        commentInfo = `<div class="stat-row">
          <span class="stat-label">Comment</span>
          <span class="stat-value" style="color:var(--wb-green);font-size:11px">${safeHtml(cmt)}</span>
        </div>`;
      }
    } catch(e) {}
  }

  // Data block count for files
  let blockInfo = '';
  if (isFile && entry.size > 0) {
    const dataPerBlock = ADF.IS_FFS ? ADF.SECTOR_SIZE : (ADF.SECTOR_SIZE - 24);
    const dataBlocks = Math.ceil(entry.size / dataPerBlock);
    const headerBlocks = 1 + Math.max(0, Math.ceil((dataBlocks - 72) / 72));
    blockInfo = `
      <div class="stat-row">
        <span class="stat-label">Data blocks</span>
        <span class="stat-value">${dataBlocks}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Header blocks</span>
        <span class="stat-value">${headerBlocks}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Header sector</span>
        <span class="stat-value info" style="color:#88aaff">${sector}</span>
      </div>`;
  } else if (isDir) {
    blockInfo = `<div class="stat-row">
      <span class="stat-label">Dir sector</span>
      <span class="stat-value info" style="color:#88aaff">${sector}</span>
    </div>`;
  }

  container.style.display = 'block';
  container.innerHTML = `
    <div class="info-block fade-in" style="margin:0;border:none;border-radius:0">
      <div class="info-block-header" style="background:rgba(255,136,0,0.12);border-bottom:1px solid rgba(255,136,0,0.3)">
        <span style="margin-right:4px">${typeIcon}</span> ${typeLabel} Information
      </div>
      <div class="info-block-body">
        <div class="stat-row">
          <span class="stat-label">Name</span>
          <span class="stat-value amber" style="font-size:12px">${safeHtml(entry.name)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Full path</span>
          <span class="stat-value" style="font-size:10px;word-break:break-all">${safeHtml(entry.path)}</span>
        </div>
        ${isFile ? `<div class="stat-row">
          <span class="stat-label">Size</span>
          <span class="stat-value green">${formatSize(entry.size)} <span style="color:var(--wb-dim);font-size:10px">(${entry.size.toLocaleString()} bytes)</span></span>
        </div>` : ''}
        ${fileTypeInfo}
        ${dirContentsInfo}
        <div class="stat-row">
          <span class="stat-label">Modified</span>
          <span class="stat-value" style="font-size:11px">${entry.date || '—'}</span>
        </div>
        ${protInfo}
        ${commentInfo}
        ${blockInfo}
      </div>
    </div>`;
}


// ════════════════════════════════════════════════════
//  RESIZABLE LEFT PANEL
// ════════════════════════════════════════════════════

(function() {
  const handle = document.getElementById('resize-handle');
  const main = document.getElementById('main');
  let resizing = false;

  handle.addEventListener('mousedown', e => {
    resizing = true;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    const mainRect = main.getBoundingClientRect();
    const newWidth = Math.max(180, Math.min(e.clientX - mainRect.left, mainRect.width - 400));
    main.style.setProperty('--left-panel-width', newWidth + 'px');
  });

  document.addEventListener('mouseup', () => {
    if (resizing) {
      resizing = false;
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
})();
