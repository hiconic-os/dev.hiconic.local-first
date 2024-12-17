import { Resource } from "@dev.hiconic/gm_resource-model";
import { GmMetaModel } from "@dev.hiconic/gm_meta-model";
import { describe, it, expect } from "vitest";


type Keys<T> = Exclude<{
    [K in keyof T]: K extends string ? K : never;
}[keyof T], never>;

class Base {
    constructor() {
        Object.defineProperty(this, "name", {
            set: function (v) { this["'name"] = v; },
            get: function () { return this["'name"]; }, 
            enumerable: true
        });
        
        Object.defineProperty(this, "'name", {
            writable: true,
            enumerable: false
        });
               
    }
}



class Derived extends Base {
    constructor() {
        super();
    }
}

function hideProperties<T extends object>(clazz: new (...args: any[]) => T, ...keys: Keys<T>[]) {

}

describe("property hiding", () => {
    it("shows GE properties", async () => {
        const b = new Base();

        (b as any).name = "foobar";

        for (const key of Object.keys(b)) {
            console.log(key);
        }

        console.log(JSON.stringify(b));
    });
});
