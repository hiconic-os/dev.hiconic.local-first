import CryptoJS from "crypto-js";
import { ManagedEntitiesSecurity } from "./managed-entities";

// 1. Funktion zur Erzeugung eines symmetrischen Schlüssels
export function generateSymmetricKey(): string {
  // Generates a random 256-bit key (32 Bytes)
  const key = CryptoJS.lib.WordArray.random(32);
  return key.toString(CryptoJS.enc.Hex);
}

export function deriveSymmetricKey(passphrase: string): string {
  const salt = "unique-app-salt";
  const key = CryptoJS.PBKDF2(passphrase, salt, {
    keySize: 256 / 32, // 256-bit key
    iterations: 10000, // high iterations for better security
  });
  return key.toString(CryptoJS.enc.Hex);
}

export function encryptString(data: string, key: string): string {
  const keyHex = CryptoJS.enc.Hex.parse(key);
  const iv = CryptoJS.lib.WordArray.random(16); // 128-Bit-IV

  // encrypt with AES
  const encrypted = CryptoJS.AES.encrypt(data, keyHex, { iv });
  const result = {
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64), // Chiffriertext
    iv: iv.toString(CryptoJS.enc.Hex), // IV
  };

  return JSON.stringify(result);
}

export function decryptString(encryptedData: string, key: string): string {
  const keyHex = CryptoJS.enc.Hex.parse(key);

  // parse encrypted data
  const { ciphertext, iv } = JSON.parse(encryptedData);

  // parse ciphered text and IV from Base64 and hex
  const encryptedCiphertext = CryptoJS.enc.Base64.parse(ciphertext);
  const ivHex = CryptoJS.enc.Hex.parse(iv);

  // decrypt with AES
  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: encryptedCiphertext } as any,
    keyHex,
    { iv: ivHex }
  );

  return decrypted.toString(CryptoJS.enc.Utf8); // Entschlüsselte Zeichenkette zurückgeben
}
    
export class MockSignatureService implements ManagedEntitiesSecurity {
  private readonly keysByAddress = new Map<string, string>();

  private getKey(address: string): string {
    let key = this.keysByAddress.get(address);

    if (!key) {
      key = generateSymmetricKey();
      this.keysByAddress.set(address, key);
    }

    return key;
  }

  async sign(data: string, signerAddress: string): Promise<string> {
    // Einfacher MD5-Hash des Datenstrings
    return this.hash(signerAddress + ":" + data);
  }

  async verify(data: string, signature: string, signerAddress: string): Promise<boolean> {
    // Erzeugt denselben MD5-Hash und vergleicht ihn
    const expectedHash = this.hash(signerAddress + ":" + data);
    return signature === expectedHash;
  }

  hash(data: string): string {
    return CryptoJS.MD5(data).toString(CryptoJS.enc.Hex);
  }

  async decrypt(data: string, signerAddress: string): Promise<string> {
    return decryptString(data, this.getKey(signerAddress));
  }

  async encrypt(data: string, signerAddress: string): Promise<string> {
    return encryptString(data, this.getKey(signerAddress));
  }
}
