// src/util/base64.ts
var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function toBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const remaining = bytes.length - i;
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[(b0 & 3) << 4 | b1 >> 4];
    out += remaining > 1 ? ALPHABET[(b1 & 15) << 2 | b2 >> 6] : "=";
    out += remaining > 2 ? ALPHABET[b2 & 63] : "=";
  }
  return out;
}
function fromBase64(text) {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const length = Math.floor(clean.length * 3 / 4);
  const out = new Uint8Array(length);
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of clean) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) continue;
    buffer = buffer << 6 | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = buffer >> bits & 255;
    }
  }
  return index === length ? out : out.subarray(0, index);
}
function utf8Encode(text) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
  const out = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 55296 && code <= 56319 && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 56320 && next <= 57343) {
        code = 65536 + (code - 55296 << 10) + (next - 56320);
        i++;
      }
    }
    if (code < 128) out.push(code);
    else if (code < 2048) out.push(192 | code >> 6, 128 | code & 63);
    else if (code < 65536) {
      out.push(224 | code >> 12, 128 | code >> 6 & 63, 128 | code & 63);
    } else {
      out.push(
        240 | code >> 18,
        128 | code >> 12 & 63,
        128 | code >> 6 & 63,
        128 | code & 63
      );
    }
  }
  return new Uint8Array(out);
}
function utf8Decode(bytes) {
  if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b0 = bytes[i++] ?? 0;
    let code;
    if (b0 < 128) code = b0;
    else if (b0 < 224) code = (b0 & 31) << 6 | (bytes[i++] ?? 0) & 63;
    else if (b0 < 240) {
      code = (b0 & 15) << 12 | ((bytes[i++] ?? 0) & 63) << 6 | (bytes[i++] ?? 0) & 63;
    } else {
      code = (b0 & 7) << 18 | ((bytes[i++] ?? 0) & 63) << 12 | ((bytes[i++] ?? 0) & 63) << 6 | (bytes[i++] ?? 0) & 63;
    }
    if (code > 65535) {
      code -= 65536;
      out += String.fromCharCode(55296 + (code >> 10), 56320 + (code & 1023));
    } else out += String.fromCharCode(code);
  }
  return out;
}

export {
  toBase64,
  fromBase64,
  utf8Encode,
  utf8Decode
};
