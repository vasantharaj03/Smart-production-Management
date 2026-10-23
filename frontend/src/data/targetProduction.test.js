import assert from "node:assert/strict";
import test from "node:test";

import {
  achievementPercent,
  productProductionSummary,
  targetAppliesToShift,
  targetCompleted,
  targetProduction,
  updateDailyProduction,
  updateProductionSnapshot,
} from "./targetProduction.js";

const products = [
  ["P70", "HairDye"],
  ["P012", "Shampoo Sachet"],
  ["p10", "shampoo"],
  ["P20", "Soap"],
  ["p60", "dairy product"],
  ["PO30", "shampoo"],
];

function event(productCode, total, sessionId = "stream-one", shift = "A") {
  return {
    streamSessionId: sessionId,
    shift,
    product: { code: productCode },
    machine: { code: "M001" },
    production: { total, good: total, defective: 0 },
  };
}

test("production totals stay separate for each configured product", () => {
  let current = { date: "2026-10-23", sessionId: "stream-one", totals: {} };
  for (const [productCode] of products) {
    current = updateProductionSnapshot(
      current,
      event(productCode, 100),
      "2026-10-23",
    );
  }

  for (const [productCode] of products) {
    const production = targetProduction(
      { product_code: productCode, shift_name: "A - Day" },
      current.totals,
    );
    assert.equal(production.produced, 100, productCode);
  }
});

test("only newer cumulative readings advance a product total", () => {
  let current = { date: "2026-10-23", sessionId: "stream-one", totals: {} };
  current = updateProductionSnapshot(current, event("P70", 100), "2026-10-23");
  current = updateProductionSnapshot(current, event("P70", 100), "2026-10-23");
  current = updateProductionSnapshot(current, event("P70", 80), "2026-10-23");
  current = updateProductionSnapshot(current, event("P70", 150), "2026-10-23");

  const production = targetProduction(
    { product_code: "P70", shift_name: "A - Day" },
    current.totals,
  );
  assert.equal(production.produced, 150);
});

test("a stream restart does not retain old session totals", () => {
  const previous = updateProductionSnapshot(
    { date: "2026-10-23", sessionId: "stream-one", totals: {} },
    event("P70", 500),
    "2026-10-23",
  );
  const restarted = updateProductionSnapshot(
    previous,
    event("P70", 100, "stream-two"),
    "2026-10-23",
  );

  assert.equal(Object.keys(restarted.totals).length, 1);
  assert.equal(Object.values(restarted.totals)[0].produced, 100);
});

test("production from a different shift is not counted against the target", () => {
  const current = updateProductionSnapshot(
    { date: "2026-10-23", sessionId: "stream-one", totals: {} },
    event("P20", 250, "stream-one", "B"),
    "2026-10-23",
  );

  assert.equal(
    targetProduction(
      { product_code: "P20", shift_name: "A - Day" },
      current.totals,
    ).produced,
    0,
  );
});

test("all active products get independent production and target values", () => {
  let dailyProduction = {};
  for (const [productCode] of products) {
    dailyProduction = updateDailyProduction(dailyProduction, event(productCode, 150));
  }

  for (const [productCode] of products) {
    const result = productProductionSummary(
      {
        product_code: productCode,
        target_quantity: productCode === "P70" ? 500 : 0,
        produced_quantity: 20,
      },
      dailyProduction,
    );

    assert.equal(result.produced, 150, productCode);
    assert.equal(result.hasTarget, productCode === "P70", productCode);
    assert.equal(result.target, productCode === "P70" ? 500 : 0, productCode);
  }
});

test("targets without a shift apply to the current shift dashboard", () => {
  assert.equal(targetAppliesToShift({ shift_name: null }, "A"), true);
  assert.equal(targetAppliesToShift({ shift_name: "A - Day" }, "A"), true);
  assert.equal(targetAppliesToShift({ shift_name: "B - Evening" }, "A"), false);
});

test("target achievement is capped at 100 percent", () => {
  assert.equal(achievementPercent(120, 100), 100);
  assert.equal(achievementPercent(100, 100), 100);
  assert.equal(achievementPercent(50, 100), 50);
  assert.equal(achievementPercent(50, 0), 0);
});

test("target completion requires reaching a positive fixed target", () => {
  assert.equal(targetCompleted(100, 100), true);
  assert.equal(targetCompleted(120, 100), true);
  assert.equal(targetCompleted(99, 100), false);
  assert.equal(targetCompleted(100, 0), false);
});

test("unassigned-shift targets do not claim output assigned to a scoped target", () => {
  let totals = {};
  totals = updateDailyProduction(totals, event("P012", 100, "stream-one", "A - Day"));
  totals = updateDailyProduction(totals, {
    ...event("P012", 40, "stream-one", "A - Day"),
    machine: { code: "M002" },
  });
  totals = updateDailyProduction(totals, event("P012", 25, "stream-one", "B - Evening"));

  const progress = targetProduction(
    { product_code: "P012", machine_code: null, shift_name: null },
    totals,
    [{ product_code: "P012", machine_code: "M001", shift_name: "A - Day" }],
  );

  assert.equal(progress.produced, 65);
});
