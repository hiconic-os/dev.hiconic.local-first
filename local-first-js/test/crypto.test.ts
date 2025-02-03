import { describe, it, expect } from "vitest";
import { decryptString, encryptString } from "../src/crypto.js"

describe("crypto", () => {
    it("creates entities and accesses an entity by globalId", async () => {
        const passphrase = "sesame open";

        const plaintext = "Hello, World!";
        const encryptedData = encryptString(plaintext, passphrase);
        console.log("Encrypted Data:", encryptedData);
        
        const decryptedData = decryptString(encryptedData, passphrase);
        console.log("Decrypted Data:", decryptedData);
        
        expect(decryptedData).toBe(plaintext);
    });
});



