import { describe, it, expect } from "vitest";
import { decryptString, encryptString, generateSymmetricKey } from "../src/crypto.js"

describe("crypto", () => {
    it("creates entities and accesses an entity by globalId", async () => {
        const symmetricKey = generateSymmetricKey();
        console.log("Symmetric Key:", symmetricKey);
        
        const plaintext = "Hello, World!";
        const encryptedData = encryptString(plaintext, symmetricKey);
        console.log("Encrypted Data:", encryptedData);
        
        const decryptedData = decryptString(encryptedData, symmetricKey);
        console.log("Decrypted Data:", decryptedData);
        
        expect(decryptedData).toBe(plaintext);
    });
});



