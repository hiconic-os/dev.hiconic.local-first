import CryptoJS from "crypto-js";
import { ManagedEntitiesAuth, ManagedEntitiesEncryption } from "./managed-entities.js";

// 1. Funktion zur Erzeugung eines symmetrischen Schlüssels
export function generateSymmetricKey(): string {
  // Generates a random 256-bit key (32 Bytes)
  const key = CryptoJS.lib.WordArray.random(32);
  return key.toString(CryptoJS.enc.Hex);
}

export function generateSymmetricKeyFromPassphrase(utfSalt: string, passphrase: string): string {
  // Define a static salt
  const salt = CryptoJS.enc.Utf8.parse(utfSalt); // UTF-8 encoded salt
  // Define the number of iterations and key size (256 bits = 32 bytes)
  const iterations = 1000;
  const keySize = 256 / 32; // Key size in words

  // Use PBKDF2 to derive the key from the passphrase
  const key = CryptoJS.PBKDF2(passphrase, salt, {
    keySize,
    iterations,
  });

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
  const binaryCiphertext = CryptoJS.enc.Base64.parse(ciphertext);
  const ivHex = CryptoJS.enc.Hex.parse(iv);

  // decrypt with AES
  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: binaryCiphertext } as any,
    keyHex,
    { iv: ivHex }
  );

  return decrypted.toString(CryptoJS.enc.Utf8); // Entschlüsselte Zeichenkette zurückgeben
}
    
export class MockManagedEntityAuth implements ManagedEntitiesAuth {
  async sign(data: string, signerAddress: string): Promise<string> {
    // Einfacher MD5-Hash des Datenstrings
    return this.hash(signerAddress + ":" + data);
  }

  async verify(data: string, signature: string, signerAddress: string): Promise<boolean> {
    // Erzeugt denselben MD5-Hash und vergleicht ihn
    const expectedHash = await this.hash(signerAddress + ":" + data);
    return signature === expectedHash;
  }

  async hash(data: string): Promise<string> {
    return CryptoJS.MD5(data).toString(CryptoJS.enc.Hex);
  }
}

export class ManagedEntityEncryption implements ManagedEntitiesEncryption {
  private key?: string;
  private prevPassphrase?: string;
  private readonly passphraseProvider: () => string;
  private readonly salt: string;

  constructor(salt: string, passphraseProvider: () => string) {
    this.passphraseProvider = passphraseProvider;
    this.salt = salt;
  }

  private getKey(): string {
    const passphrase = this.passphraseProvider();

    if (!this.key || this.prevPassphrase !== passphrase) {
      this.key = this.getKeyForPassphrase(passphrase);
      this.prevPassphrase = passphrase;
    }

    return this.key;
  }

  private getKeyForPassphrase(passphrase: string): string {
      return generateSymmetricKeyFromPassphrase(this.salt, passphrase);
  }

  async decrypt(data: string): Promise<string> {
    return decryptString(data, this.getKey());
  }

  async encrypt(data: string): Promise<string> {
    return encryptString(data, this.getKey());
  }

  decryptWithPassphrase(data: string, passphrase: string): string {
    return decryptString(data, this.getKeyForPassphrase(passphrase));
  }

  encryptWithPassphrase(data: string, passphrase: string): string {
    return encryptString(data, this.getKeyForPassphrase(passphrase));
  }
}
