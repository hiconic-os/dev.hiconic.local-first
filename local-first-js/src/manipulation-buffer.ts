import { session } from "@dev.hiconic/tf.js_hc-js-api";
import * as mM from "@dev.hiconic/gm_manipulation-model";
import { GenericEntity } from "@dev.hiconic/gm_root-model"
import { LocalEntityProperty } from "@dev.hiconic/gm_owner-model"

export type ManipulationBufferUpdateListener = (buffer: ManipulationBuffer) => void;

export interface ManipulationBuffer {
    /** True if there is at least one manipulation that can be undone */
    canUndo(): boolean;
    /** True if there is at least one manipulation that can be redone */
    canRedo(): boolean;

    /** Redo the latest manipulation */    
    redo(): void;

    /** Undo the latest manipulation */    
    undo(): void;

    /** True if the manpulation buffer is currently undoing manipulations */
    isUndoing(): boolean;

    /** True if the manpulation buffer is currently redoing manipulations */
    isRedoing(): boolean;

    /** True whenever replicating operations are running (e.g {@link redo()}, {@link undo()}, initializing, loading) */
    isReplicating(): boolean

    /** The amount of manipulations in the buffer including all undo/redo manipulations */
    totalCount(): number;

    /** The amount of committable manipulations in the buffer */
    headCount(): number;

    /** The amount of undone manipulations */
    tailCount(): number;

    /** Adds a listener that will be notified whenever the internal state of the buffer changes */
    addBufferUpdateListener(listener: ManipulationBufferUpdateListener): void;

    /** Removes a listener that was previously {@link ManipulationBuffer.addBufferUpdateListener added} */
    removeBufferUpdateListener(listener: ManipulationBufferUpdateListener): void;

    openNestedFrame(extendOn?: mM.Manipulation): ManipulationFrame;

    /**
     * Returns the manipulations in order that currently would be subject for a commit. The are identical to the manipulations than can be undone.
     */
    getCommitManipulations(): mM.Manipulation[];

    getCommitManipulationIndex(): Map<GenericEntity, Set<mM.Manipulation>>;

    isPartOfCommit(entity: GenericEntity): boolean;
}

export interface ManipulationFrame {
    run<R>(manipulator: () => R): R
    runAsync<R>(manipulator: () => Promise<R>): Promise<R>
    close(): void;
}



interface TrackingFrame {
    record(manipulation: mM.Manipulation): void
    replace(manipulation: mM.Manipulation, substitude: mM.Manipulation): void;
    getManipulations(): mM.Manipulation[];
    getExtendOn(): mM.Manipulation | undefined;
}

class NestedTrackingFrame implements TrackingFrame {
    private readonly extendOn?: mM.Manipulation;
    private readonly manipulations = new Array<mM.Manipulation>();

    constructor(extendOn?: mM.Manipulation) {
        this.extendOn = extendOn;

        if (extendOn)
            this.manipulations.push(extendOn);
    }

    getExtendOn(): mM.Manipulation | undefined {
        return this.extendOn;
    }
    
    record(manipulation: mM.Manipulation): void {
        this.manipulations.push(manipulation);
    }

    replace(manipulation: mM.Manipulation, substitude: mM.Manipulation): void {
        const index = this.manipulations.findLastIndex(m => m == manipulation);

        if (index != -1) {
            this.manipulations[index] = substitude;
        }
    }

    getManipulations(): mM.Manipulation[] {
        return this.manipulations;
    }
}

export class SessionManipulationBuffer implements ManipulationBuffer, TrackingFrame {
    private readonly session: session.ManagedGmSession;
    private readonly manipulations = new Array<mM.Manipulation>();
    private readonly outerFrames = new Array<TrackingFrame>();
    private currentFrame: TrackingFrame = this;
    private readonly listeners = new Array<ManipulationBufferUpdateListener>();
    private index = 0;
    private suspendTrackingCount = 0;
    private undoing = false;
    private redoing = false;
    private readonly commitManipulationIndex = new Map<GenericEntity, Set<mM.Manipulation>>();
    private runAfterNextManipulation?: () => void;

    constructor(session: session.ManagedGmSession) {
        this.session = session;
        this.session.listeners().prioritized().add({onMan: m => this.onMan(m)});
    }

    suspendTracking(): void {
        this.suspendTrackingCount++;
    }

    resumeTracking(): void {
        this.suspendTrackingCount--;
    }

    canRedo(): boolean {
        return this.tailCount() > 0;
    }

    canUndo(): boolean {
        return this.headCount() > 0;
    }

    redo(): void {
        if (!this.canRedo())
            return;
        
        const m = this.manipulations[this.index++];

        this.redoing = true;
        try {
            this.traverseManipulation(m, (atomicManipulation) => {
                this.runAfterNextManipulation = () => this.addToIndex(atomicManipulation);
                this.applyManipulationUntracked(atomicManipulation);
            });
        }
        finally {
            this.redoing = false;
        }

        this.notifyListeners();
    }

    undo(): void {
        if (!this.canUndo())
            return;

        const m = this.manipulations[--this.index];

        this.undoing = true;
        try {
            this.traverseManipulation(m.inverseManipulation!, (atomicManipulation) => {
                this.runAfterNextManipulation = () => this.removeFromIndex(atomicManipulation.inverseManipulation!);
                this.applyManipulationUntracked(atomicManipulation);
            });
        }
        finally {
            this.undoing = false;
        }

        this.notifyListeners();
    }

    private traverseManipulation(manipulation: mM.Manipulation, visitor: (m: mM.AtomicManipulation) => void) {
        if (mM.CompoundManipulation.isInstance(manipulation)) {
            const compound = manipulation as mM.CompoundManipulation;
            for (const m of compound.compoundManipulationList) {
                this.traverseManipulation(m, visitor);
            }
        }
        else {
            visitor(manipulation as mM.AtomicManipulation);
        }
    }

    isUndoing(): boolean {
        return this.undoing;
    }

    isRedoing(): boolean {
        return this.redoing;
    }

    isReplicating(): boolean {
        return this.suspendTrackingCount > 0
    }

    clear(): void {
        this.manipulations.length = 0;
        this.index = 0;
        this.commitManipulationIndex.clear();
        this.notifyListeners();
    }

    getCommitManipulations(): mM.Manipulation[] {
        return this.manipulations.slice(0, this.headCount());
    }

    private applyManipulationUntracked(m: mM.Manipulation): void {
        this.suspendTracking();
        try {
            this.session.manipulate().mode(session.ManipulationMode.LOCAL).apply(m);
        }
        finally {
            this.resumeTracking();
        }
    }

    totalCount(): number {
        return this.manipulations.length;
    }

    headCount(): number {
        return this.index;
    }

    tailCount(): number {
        return this.totalCount() - this.headCount();
    }

    addBufferUpdateListener(listener: ManipulationBufferUpdateListener): void {
        this.listeners.push(listener);
    }
    
    removeBufferUpdateListener(listener: ManipulationBufferUpdateListener): void {
        const index = this.listeners.indexOf(listener);
        if (index > -1)
            this.listeners.splice(index, 1);
    }

    private addToIndex(manipulation: mM.Manipulation) {
        const entity = this.extractRelatedEntity(manipulation);

        if (!entity)
            return;

        let manipulations = this.commitManipulationIndex.get(entity);
        if (!manipulations) {
            manipulations = new Set<mM.Manipulation>();
            this.commitManipulationIndex.set(entity, manipulations);
        }
        manipulations.add(manipulation);
    }

    private removeFromIndex(manipulation: mM.Manipulation) {
        const entity = this.extractRelatedEntity(manipulation);

        if (!entity)
            return;
        let manipulations = this.commitManipulationIndex.get(entity);
        if (!manipulations)
            return;

        manipulations.delete(manipulation);

        if (manipulations.size == 0)
            this.commitManipulationIndex.delete(entity);
    }

    getCommitManipulationIndex(): Map<GenericEntity, Set<mM.Manipulation>> {
        return this.commitManipulationIndex;
    }

    isPartOfCommit(entity: GenericEntity): boolean {
        return this.commitManipulationIndex.has(entity);
    }

    private onMan(manipulation: mM.Manipulation): void {
        if (this.runAfterNextManipulation) {
            this.runAfterNextManipulation();
            this.runAfterNextManipulation = undefined;
        }

        if (this.isReplicating())
            return;

        this.addToIndex(manipulation);
        this.currentFrame.record(manipulation);
    }

    private extractRelatedEntity(manipulation: mM.Manipulation): GenericEntity | null {
        if (mM.LifecycleManipulation.isInstance(manipulation)) {
            const lm = manipulation as mM.LifecycleManipulation;
            return lm.entity;
        }
        else if (mM.PropertyManipulation.isInstance(manipulation)) {
            const pm = manipulation as mM.PropertyManipulation;
            const lep = pm.owner as LocalEntityProperty;
            return lep.entity;
        }

        return null!;
    }

    record(manipulation: mM.Manipulation): void {
        this.manipulations.length = this.index++;
        this.manipulations.push(manipulation);
        this.notifyListeners();
    }

    replace(manipulation: mM.Manipulation, substitude: mM.Manipulation): void {
        const index = this.manipulations.findLastIndex(m => m == manipulation);

        if (index != -1) {
            this.manipulations[index] = substitude;
        }
        // no notification here as the general status did not change
    }

    getManipulations(): mM.Manipulation[] {
        return this.manipulations.slice(0, this.index);
    }

    private notifyListeners(): void {
        for (const l of this.listeners) {
            l(this);
        }
    }

    getExtendOn(): mM.Manipulation | undefined {
        return undefined;
    }

    private endCompoundManipulation(): void {
        const frame = this.outerFrames.pop()!;
        const cM = mM.CompoundManipulation.create();
        const iCM = mM.CompoundManipulation.create();
        cM.inverseManipulation = iCM;
        const manis = cM.compoundManipulationList;
        const inverseManis = iCM.compoundManipulationList;

        const endingFrame = this.currentFrame;
        for (const m of endingFrame.getManipulations()) {
            manis.push(m);
            inverseManis.push(m.inverseManipulation!);
        }

        const extendOn = endingFrame.getExtendOn();
        
        if (extendOn) {
            frame.replace(extendOn, cM);
        }
        else
            frame.record(cM);

        this.currentFrame = frame;
    }

    openNestedFrame(extendOn?: mM.Manipulation): ManipulationFrame {
        const frame = new NestedTrackingFrame(extendOn);
        this.outerFrames.push(this.currentFrame);
        this.currentFrame = frame;

        return {
            run(manipulator) {
                try {
                    return manipulator();
                }
                finally {
                    this.close();
                }
            },

            async runAsync(manipulator) {
                try {
                    return (await manipulator());
                }
                finally {
                    this.close();
                }
            },

            close: () => {
                this.endCompoundManipulation();
            },
        }
    }
} 
