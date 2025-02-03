import { describe, it, expect } from "vitest";
import { decryptString, encryptString } from "../src/crypto.js"

describe("crypto", () => {
    it("encryption roundtrip", async () => {
        const passphrase = "sesame open";

        const plaintext = "Hello, World!";
        const encryptedData = encryptString(plaintext, passphrase);
        console.log("Encrypted Data:", encryptedData);
        
        const decryptedData = decryptString(encryptedData, passphrase);
        console.log("Decrypted Data:", decryptedData);
        
        expect(decryptedData).toBe(plaintext);
    });

    it("salt fallback", async () => {
        const passphrase = "sesame open";

        const salt = "THE_SALT";

        const plaintext = "Hello, World!";
        const encryptedData = encryptString(plaintext, passphrase, salt, true);
        console.log("Encrypted Data:", encryptedData);
        
        const decryptedData = decryptString(encryptedData, passphrase, salt);
        console.log("Decrypted Data:", decryptedData);
        
        expect(decryptedData).toBe(plaintext);
    });
});



