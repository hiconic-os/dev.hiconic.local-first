import { Transaction } from "./managed-entities.js";
import { Heap } from "./utils/heap.js";

interface TxNode {
    tx: Transaction
    unprocessedDeps: Set<TxNode>
    successors: TxNode[]
}

export interface TransactionOrdering {
    transactions: Transaction[]
    leafs: Transaction[]
}

/**
 * Sorts transactions in the dependecy first, successor later order. Diamond situations are resolved by sorting by date.
 */
export function sortTransactions(transactions: Transaction[]): TransactionOrdering {

    // Terminology:
    //  if A is depenedency of B, then B is a successor of A

    if (transactions.length <= 1)
        return { transactions, leafs: transactions };

    const txIdToNode = new Map<string, TxNode>();

    let genesisTxNode: TxNode | null = null;
    for (const tx of transactions) {
        const txNode = {
            tx,
            unprocessedDeps: new Set(),
            successors: []
        } as TxNode;

        if (tx.deps.length === 0)
            genesisTxNode = txNode;

        txIdToNode.set(tx.id, txNode);
    }

    if (!genesisTxNode)
        throw Error("Genesis transaction not found.");


    for (const txNode of txIdToNode.values())
        for (const dep of txNode.tx.deps) {
            const depNode = txIdToNode.get(dep);
            if (!depNode) // we have a transaction, but not it's dependency (maybe we didn't get everything in a sync)
                continue;

            depNode.successors.push(txNode);
            txNode.unprocessedDeps.add(depNode);
        }

    const resultTxs = [] as Transaction[];
    const resultLeafs = [] as Transaction[];

    // sort primarily by date, extremely unlikely fallback by tx id 
    const nextInLine = new Heap<TxNode>((t1, t2) => {
        return (t1.tx.date - t2.tx.date) ||
            ((t1.tx.id < t2.tx.id) ? -1 : 1)
    });
    nextInLine.insert(genesisTxNode);
    while (!nextInLine.isEmpty()) {
        const txNode = nextInLine.removeSmallest()!
        resultTxs.push(txNode.tx);

        if (txNode.successors.length == 0) {
            resultLeafs.push(txNode.tx);
            continue;
        }

        for (const successor of txNode.successors) {
            successor.unprocessedDeps.delete(txNode);

            if (successor.unprocessedDeps.size == 0)
                nextInLine.insert(successor);
        }
    }

    return {
        transactions: resultTxs,
        leafs: resultLeafs
    }
}
