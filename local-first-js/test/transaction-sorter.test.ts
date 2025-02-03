import { describe, expect, it } from "vitest";
import { Transaction } from "../src/managed-entities.js";
import { sortTransactions } from "../src/transaction-sorter.js";

describe("transaction sorter", () => {

  it("sorts empty array", () => {
    checkShufflingAndSorting([]);
  });


  //
  // a
  //
  it("sorts single elment array", () => {
    checkShufflingAndSorting([
      newTx("a", 1, [])
    ]);
  });

  //
  // a-b-c-d-e-f
  //
  it("sorts linear chain of transactions", () => {
    checkShufflingAndSorting([
      newTx("a", 1, []),
      newTx("b", 1, ["a"]),
      newTx("c", 1, ["b"]),
      newTx("d", 1, ["c"]),
      newTx("e", 1, ["d"]),
      newTx("f", 1, ["e"]),
    ]);
  });

  //
  // a-b-c-d  (x)-y-z
  //
  it("ignores garbage transactions", () => {
    checkShufflingAndSorting([
      newTx("a", 1, []),
      newTx("b", 1, ["a"]),
      newTx("c", 1, ["b"]),
      newTx("d", 1, ["c"]),
    ], [
      // garbage = transactions that are not part of the chain rooted at genesis transaction ("a")
      newTx("y", 1, ["x"]),
      newTx("z", 1, ["y"]),
    ]
    );
  });

  //   b
  //  / \
  // a-c-d
  it("sorts small diamond", () => {
    checkShufflingAndSorting([
      newTx("a", 1, []),
      newTx("b", 2, ["a"]),
      newTx("c", 3, ["a"]),
      newTx("d", 3, ["a", "b"]),
    ]);
  });

  //   ba
  //  /  \
  // a-bb-c
  //  \  /
  //   bc
  it("backup for sorting is txId", () => {
    checkShufflingAndSorting([
      newTx("a", 1, []),
      newTx("ba", 2, ["a"]),
      newTx("bb", 2, ["a"]),
      newTx("bc", 2, ["a"]),
      newTx("c", 3, ["ba", "bb", "bc"]),
    ]);
  });

});

/*
 * Shuffles okTxs randomly and sorter should sort them in the original order again.
 * Garbage is optionally mixed in, sorter should throw it away.
 */
function checkShufflingAndSorting(okTxs: Transaction[], garbageTxs: Transaction[] = []) {
  // Mix with garbage and shuffle
  const allTxs = [...okTxs, ...garbageTxs];
  const shuffledTxs = shuffle(allTxs);

  // sort
  const { transactions, leafs } = sortTransactions(shuffledTxs);

  // check transactions

  const actualTxIds = transactions.map(tx => tx.id);
  const expectedTxIds = okTxs.map(tx => tx.id);

  expect(actualTxIds, "sorted TXs are wrong").toEqual(expectedTxIds);

  //  check leafs
  //
  // i.e. TXs that nothing depends on
  // next commit has all the leafs as its dependencies

  const expectedLeafs = new Set(okTxs.map(tx => tx.id));
  okTxs.forEach(tx =>
    tx.deps.forEach(dep =>
      expectedLeafs.delete(dep)
    )
  )

  const actualLeafIds = new Set(leafs.map(tx => tx.id))
  expect(actualLeafIds, "Wrong size of leafs").toEqual(expectedLeafs);
}


function newTx(id: string, date: number, deps: string[]): Transaction {
  return {
    id,
    date,
    deps,
    version: 1, // ignored
    hash: "ignored",
    payload: "ignored",
  }
}

function shuffle(array: any[]): any[] {
  const result = [...array]

  let currentIndex = result.length;

  while (currentIndex != 0) {
    // Pick a remaining element...
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [result[currentIndex], result[randomIndex]] = [result[randomIndex], result[currentIndex]];
  }

  return result
}
