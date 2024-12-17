class X {
    name?: string;
}

class Y extends X {
    constructor() {
        super();
    }
}

const x = new X();

for (const name of Object.keys(x)) {
    console.log(name);
}