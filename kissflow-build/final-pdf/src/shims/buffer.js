// Buffer stand-in for the two calls sync/pdf.mjs makes. They get latin-1 strings only (winAnsi and the octal escapes
// leave no character above 0xff), so a string's byte length is its length and each byte is its char code.
export const Buffer = {
  byteLength: (s) => String(s).length,
  from: (s) => {
    const text = String(s);
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
    return out;
  },
};
