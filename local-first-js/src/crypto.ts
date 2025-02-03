import CryptoJS from "crypto-js";
import { ManagedEntitiesAuth, ManagedEntitiesEncryption } from "./managed-entities.js";

// 1. Funktion zur Erzeugung eines symmetrischen Schlüssels
export function generateSymmetricKey(): string {
  // Generates a random 256-bit key (32 Bytes)
  const key = CryptoJS.lib.WordArray.random(32);
  return key.toString(CryptoJS.enc.Hex);
}

// Generate a cryptographic salt
function generateSalt(bytes = 16): CryptoJS.lib.WordArray {
  return CryptoJS.lib.WordArray.random(bytes);
}

export function generateSymmetricKeyFromPassphrase(saltOrHexSalt: string | CryptoJS.lib.WordArray, passphrase: string): CryptoJS.lib.WordArray {
  // Define the number of iterations and key size (256 bits = 32 bytes)
  const iterations = 1000;
  const keySize = 256 / 32; // Key size in words

  const salt = typeof saltOrHexSalt === "string"?
    CryptoJS.enc.Hex.parse(saltOrHexSalt):
    saltOrHexSalt as CryptoJS.lib.WordArray;

  // Use PBKDF2 to derive the key from the passphrase
  const key = CryptoJS.PBKDF2(passphrase, salt, {
    keySize,
    iterations,
  });

  return key;
}

export function deriveSymmetricKey(passphrase: string): [key: CryptoJS.lib.WordArray, salt: CryptoJS.lib.WordArray] {
  const salt = generateSalt();
  return [generateSymmetricKeyFromPassphrase(salt, passphrase), salt];
}

export function encryptString(data: string, passphrase: string): string {
  const [key, salt] = deriveSymmetricKey(passphrase);
  const iv = CryptoJS.lib.WordArray.random(16); // 128-Bit-IV

  // encrypt with AES
  const encrypted = CryptoJS.AES.encrypt(data, key, { iv });
  const result = {
    iv: iv.toString(CryptoJS.enc.Hex),
    salt: salt.toString(CryptoJS.enc.Hex),
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
  };

  return JSON.stringify(result);
}

export function decryptString(encryptedData: string, passphrase: string, fallbackSalt?: string): string {
  // parse encrypted data
  try { 
    const { ciphertext, iv, salt } = JSON.parse(encryptedData);

    // fallbackSalt is used as backwardscompatibility for json records that were historically not equipped with a salt
    const sanitizedSalt = salt || fallbackSalt;

    const key = generateSymmetricKeyFromPassphrase(sanitizedSalt, passphrase);
    //const key = CryptoJS.enc.Hex.parse(keyHex); // Convert to WordArray

    // parse ciphered text and IV from Base64 and hex
    const binaryCiphertext = CryptoJS.enc.Base64.parse(ciphertext);
    const ivBinary = CryptoJS.enc.Hex.parse(iv);

  
    // decrypt with AES
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: binaryCiphertext } as any,
      key,
      { iv: ivBinary }
    );
  
    return decrypted.toString(CryptoJS.enc.Utf8); // Entschlüsselte Zeichenkette zurückgeben
    }
  catch (error) {
    return "";
  }
}

// generates SHA256 a hash for a string content
export function hashSha256(content: string): string {
  return CryptoJS.SHA256(content).toString(CryptoJS.enc.Hex);
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

  getSigningContextName(): string {
    return "MockApp";
  }
}

export class ManagedEntityEncryption implements ManagedEntitiesEncryption {
  private readonly passphraseProvider: () => string;
  private readonly fallbackSalt;

  constructor(fallbackSalt: string, passphraseProvider: () => string) {
    this.fallbackSalt = fallbackSalt;
    this.passphraseProvider = passphraseProvider;
  }

  async decrypt(data: string): Promise<string> {
    return decryptString(data, this.passphraseProvider(), this.fallbackSalt);
  }

  async encrypt(data: string): Promise<string> {
    return encryptString(data, this.passphraseProvider());
  }

  decryptWithPassphrase(data: string, passphrase: string): string {
    return decryptString(data, passphrase, this.fallbackSalt);
  }

  encryptWithPassphrase(data: string, passphrase: string): string {
    return encryptString(data, passphrase);
  }
}
