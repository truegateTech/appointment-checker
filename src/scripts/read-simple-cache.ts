import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = path.resolve("user-data/user-data/Default/Cache/Cache_Data");

const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith("_0"));
console.log(`Analyzing ${files.length} cache files...`);

for (const file of files) {
  const buf = fs.readFileSync(path.join(CACHE_DIR, file));
  // In Chromium Simple Cache:
  // SimpleFileHeader:
  // uint64 initial_magic_number (0xfcfb6d1ba772be1a)
  // uint32 version (9)
  // uint32 key_length
  // uint32 key_crc
  const magic = buf.readBigUInt64LE(0);
  const version = buf.readUInt32LE(8);
  const keyLen = buf.readUInt32LE(12);
  const keyCrc = buf.readUInt32LE(16);
  
  // EOF record is at the end of the file:
  // SimpleFileEOF:
  // uint64 final_magic_number (0xfcfb6d1ba772be1b)
  // uint32 flags
  // uint32 data_crc
  // uint32 stream_size
  
  // The key itself is usually stored right after the header or at the end before EOF record!
  // Let's check where the key is located:
  let key = "";
  // Check after header (offset 24):
  const cand1 = buf.subarray(24, 24 + keyLen).toString("utf8");
  if (cand1.startsWith("http://") || cand1.startsWith("https://")) {
    key = cand1;
  } else {
    // Check EOF record (last 24 bytes):
    // Key might be placed before EOF record:
    const cand2 = buf.subarray(buf.length - 24 - keyLen, buf.length - 24).toString("utf8");
    if (cand2.startsWith("http://") || cand2.startsWith("https://")) {
      key = cand2;
    } else {
      // Find 'https://' or 'http://' in the buffer
      const str = buf.toString("latin1");
      const m = str.match(/https?:\/\/[a-zA-Z0-9_\-\.\/:\?#&=%@\+;,~]+/);
      if (m) key = m[0];
    }
  }

  // Extract HTTP response headers:
  const text = buf.toString("latin1");
  const httpIdx = text.indexOf("HTTP/1.");
  let statusLine = "";
  let contentType = "";
  if (httpIdx !== -1) {
    const headerBlock = text.slice(httpIdx, httpIdx + 1500);
    const lines = headerBlock.split("\0");
    statusLine = lines[0];
    const ctLine = lines.find(l => /^content-type:/i.test(l));
    if (ctLine) contentType = ctLine;
  }

  console.log(`[${buf.length} B] Key: ${key} | Status: ${statusLine} | ${contentType}`);
}
