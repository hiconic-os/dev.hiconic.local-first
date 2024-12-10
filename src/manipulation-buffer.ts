import { session } from "@dev.hiconic/tf.js_hc-js-api";
import * as mM from "@dev.hiconic/gm_manipulation-model";

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

    beginCompoundManipulation(): void;
    
    endCompoundManipulation(): void;
    
    compoundManipulation<R>(manipulator: () => R): R;

    getCommitManipulations(): mM.Manipulation[];
}

interface TrackingFrame {
    record(manipulation: mM.Manipulation): void
    getManipulations(): mM.Manipulation[];
}

class NestedTrackingFrame implements TrackingFrame {
    private readonly manipulations = new Array<mM.Manipulation>();
    
    record(manipulation: mM.Manipulation): void {
        this.manipulations.push(manipulation);
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

    constructor(session: session.ManagedGmSession) {
        this.session = session;
        this.session.listeners().add({onMan: m => this.onMan(m)});
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

        this.applyManipulationUntracked(m);

        this.notifyListeners();
    }

    undo(): void {
        if (!this.canUndo())
            return;

        const m = this.manipulations[--this.index];

        this.applyManipulationUntracked(m.inverseManipulation);

        this.notifyListeners();
    }

    clear(): void {
        this.manipulations.length = 0;
        this.index = 0;
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

    private onMan(manipulation: mM.Manipulation): void {
        if (this.suspendTrackingCount > 0)
            return

        this.currentFrame.record(manipulation);
    }

    record(manipulation: mM.Manipulation): void {
        this.manipulations.length = this.index++;
        this.manipulations.push(manipulation);
        this.notifyListeners();
    }

    getManipulations(): mM.Manipulation[] {
        return this.manipulations.slice(0, this.index);
    }

    private notifyListeners(): void {
        for (const l of this.listeners) {
            l(this);
        }
    }

    beginCompoundManipulation(): void {
        const frame = new NestedTrackingFrame();
        this.outerFrames.push(this.currentFrame);
        this.currentFrame = frame;
    }
    
    endCompoundManipulation(): void {
        const frame = this.outerFrames.pop()!;
        const cM = mM.CompoundManipulation.create();
        const iCM = mM.CompoundManipulation.create();
        cM.inverseManipulation = iCM;
        const manis = cM.compoundManipulationList;
        const inverseManis = iCM.compoundManipulationList;

        const endingFrame = this.currentFrame;
        for (const m of endingFrame.getManipulations()) {
            manis.push(m);
            inverseManis.push(m.inverseManipulation);
        }
        frame.record(cM);
        this.currentFrame = frame;
    }
    
    compoundManipulation<R>(manipulator: () => R): R {
        this.beginCompoundManipulation();
        try {
            return manipulator();
        }   
        finally {
            this.endCompoundManipulation();
        }     
    }
} 
