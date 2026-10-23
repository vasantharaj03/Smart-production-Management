export function shiftCode(value) {
  return String(value || "").trim().charAt(0).toUpperCase();
}

export function achievementPercent(produced, target) {
  const targetQuantity = Number(target) || 0;
  const producedQuantity = Number(produced) || 0;
  return targetQuantity > 0
    ? Math.min(100, (producedQuantity / targetQuantity) * 100)
    : 0;
}

export function targetCompleted(produced, target) {
  const targetQuantity = Number(target) || 0;
  return targetQuantity > 0 && (Number(produced) || 0) >= targetQuantity;
}

export function targetAppliesToShift(target, shift) {
  return !target.shift_name || shiftCode(target.shift_name) === shiftCode(shift);
}

export function updateDailyProduction(totals, event) {
  const key = [
    event.shift.toUpperCase(),
    event.product.code.toUpperCase(),
    event.machine.code.toUpperCase(),
  ].join("|");
  const previous = totals[key] || {};

  return {
    ...totals,
    [key]: {
      produced: Math.max(Number(previous.produced) || 0, event.production.total),
      good: Math.max(Number(previous.good) || 0, event.production.good),
      defective: Math.max(Number(previous.defective) || 0, event.production.defective),
    },
  };
}

export function updateProductionSnapshot(current, event, date) {
  const totals = current.date === date && current.sessionId === event.streamSessionId
    ? current.totals
    : {};
  return {
    date,
    sessionId: event.streamSessionId,
    totals: updateDailyProduction(totals, event),
  };
}

export function targetProduction(target, dailyProduction, allTargets = []) {
  const wantedShift = shiftCode(target.shift_name);
  const wantedProduct = String(target.product_code || "").toUpperCase();
  const wantedMachineCode = String(target.machine_code || "").toUpperCase();
  const wantedMachineName = String(target.machine_name || "").toUpperCase();
  const scopedTargets = !wantedShift
    ? allTargets.filter((other) => {
      if (
        String(other.product_code || "").toUpperCase() !== wantedProduct ||
        !shiftCode(other.shift_name)
      ) {
        return false;
      }
      const otherMachine = String(other.machine_code || "").toUpperCase();
      return !wantedMachineCode || !otherMachine || otherMachine === wantedMachineCode;
    })
    : [];

  const shiftEntries = Object.entries(dailyProduction).flatMap(([key, totals]) => {
    const [shift, product, machine] = key.split("|");
    if (wantedShift && shiftCode(shift) !== wantedShift) return [];
    if (
      !wantedShift &&
      scopedTargets.some((other) => {
        const otherMachine = String(other.machine_code || "").toUpperCase();
        return (
          String(other.product_code || "").toUpperCase() === product &&
          shiftCode(other.shift_name) === shiftCode(shift) &&
          (!wantedMachineCode || wantedMachineCode === machine) &&
          (!otherMachine || otherMachine === machine)
        );
      })
    ) return [];
    return [{ product, machine, produced: Number(totals.produced) || 0 }];
  });
  const matchingEntries = shiftEntries.filter(({ product, machine }) =>
    (!wantedProduct || product === wantedProduct) &&
    (!wantedMachineCode || machine === wantedMachineCode) &&
    (!wantedMachineName || machine === wantedMachineName || Boolean(wantedMachineCode))
  );

  return {
    produced: matchingEntries.reduce((sum, entry) => sum + entry.produced, 0),
    hasMatchingEvents: matchingEntries.length > 0,
    observedIdentifiers: [...new Set(shiftEntries.map(({ product, machine }) => `${product} / ${machine}`))].slice(0, 3),
  };
}

export function productProductionSummary(product, dailyProduction, currentShift = "") {
  const productCode = String(product.product_code || "").toUpperCase();
  const wantedShift = shiftCode(currentShift);
  const liveProduced = Object.entries(dailyProduction).reduce((sum, [key, totals]) => {
    const [shift, code] = key.split("|");
    if (
      code !== productCode ||
      (wantedShift && shiftCode(shift) !== wantedShift)
    ) {
      return sum;
    }
    return sum + (Number(totals.produced) || 0);
  }, 0);
  const recordedProduced = Number(product.produced_quantity) || 0;
  const target = Number(product.target_quantity) || 0;

  return {
    target,
    produced: Math.max(recordedProduced, liveProduced),
    hasTarget: target > 0,
  };
}
