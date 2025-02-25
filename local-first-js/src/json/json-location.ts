
export class JsonLocation {
    readonly lineNr: number;
    readonly columnNr: number;

    constructor(lineNr: number, columnNr: number) {
        this.lineNr = lineNr;
        this.columnNr = columnNr;
    }

    toString(): string {
        return "(line: " + this.lineNr+", pos: "+this.columnNr+")";
    }
}

