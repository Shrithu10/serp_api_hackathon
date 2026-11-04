/* PocketMonitor end-to-end crypto. Works unchanged in browsers and Node >= 18 (WebCrypto).
 *
 *  - P-256 ECDH between the laptop's long-term key and the phone's key (exchanged at pairing).
 *  - HKDF-SHA256 -> AES-256-GCM key ("enc") and a 32-byte relay auth token ("auth").
 *  - Every message: random 96-bit IV || ciphertext, with direction bound as AAD.
 * The relay only ever sees the SHA-256 of the auth token and opaque ciphertext.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('crypto').webcrypto);
  else root.PMCrypto = factory(root.crypto);
})(typeof self !== 'undefined' ? self : this, function (webcrypto) {
  'use strict';
  const subtle = webcrypto.subtle;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const SALT = enc.encode('pocketmonitor/v1');

  function toB64(bytes) {
    let s = ''; const b = new Uint8Array(bytes);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(str) { const s = atob(str); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
  const b64u = (bytes) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = (s) => fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const hex = (bytes) => Array.from(new Uint8Array(bytes), (x) => x.toString(16).padStart(2, '0')).join('');
  const randomBytes = (n) => webcrypto.getRandomValues(new Uint8Array(n));
  const sha256hex = async (data) => hex(await subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));

  /** extractable=true for the laptop (persisted, protected by OS storage); false for the phone. */
  async function generateKeyPair(extractable) {
    const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, !!extractable, ['deriveBits']);
    const pubRaw = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
    return { priv: kp.privateKey, pubRaw };
  }
  const exportPrivate = async (priv) => subtle.exportKey('jwk', priv);
  const importPrivate = (jwk) => subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);

  async function deriveSession(priv, peerPubRaw) {
    const peer = await subtle.importKey('raw', peerPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = await subtle.deriveBits({ name: 'ECDH', public: peer }, priv, 256);
    const ikm = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits', 'deriveKey']);
    const encKey = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc.encode('enc') }, ikm,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const auth = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc.encode('auth') }, ikm, 256);
    return { encKey, authHex: hex(auth) };
  }

  const aad = (dir) => enc.encode('pm1|' + dir);
  /** dir: 'l2p' | 'p2l' | 'l2p-frame'. Returns IV||ciphertext as Uint8Array. */
  async function encryptBytes(key, dir, bytes) {
    const iv = randomBytes(12);
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(dir) }, key, bytes));
    const out = new Uint8Array(12 + ct.length); out.set(iv, 0); out.set(ct, 12); return out;
  }
  async function decryptBytes(key, dir, data) {
    const b = new Uint8Array(data);
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12), additionalData: aad(dir) }, key, b.subarray(12)));
  }
  const encryptJSON = async (key, dir, obj) => toB64(await encryptBytes(key, dir, enc.encode(JSON.stringify(obj))));
  const decryptJSON = async (key, dir, b64) => JSON.parse(dec.decode(await decryptBytes(key, dir, fromB64(b64))));

  return { b64u, unb64u, toB64, fromB64, hex, randomBytes, sha256hex, generateKeyPair, exportPrivate, importPrivate,
    deriveSession, encryptBytes, decryptBytes, encryptJSON, decryptJSON };
});
