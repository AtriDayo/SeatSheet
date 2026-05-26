import type { RotationConfig, RotationRule, Seat } from "../types/seat";

export interface SeatGroup {
  index: number;
  startColumn: number;
  endColumn: number;
  columns: number[];
  width: number;
}

export interface RotationFrame {
  label: string;
  seats: Seat[];
  ruleId?: string;
}

function cloneSeat(seat: Seat): Seat {
  return {
    id: seat.id,
    row: seat.row,
    column: seat.column,
    name: seat.name,
    studentNo: seat.studentNo
  };
}

function seatKey(row: number, column: number) {
  return `${row}:${column}`;
}

function sortSeats(seats: Seat[]) {
  return [...seats].sort((a, b) => a.row - b.row || a.column - b.column);
}

function seatMap(seats: Seat[]) {
  return new Map(seats.map((seat) => [seatKey(seat.row, seat.column), seat]));
}

function cyclicIndex(length: number, current: number) {
  return ((current % length) + length) % length;
}

export function deriveSeatGroups(columns: number, aisleAfterColumns: number[]) {
  const aisles = [...new Set(aisleAfterColumns)]
    .filter((column) => column >= 0 && column < columns - 1)
    .sort((a, b) => a - b);
  const groups: SeatGroup[] = [];
  let startColumn = 0;

  aisles.forEach((aisleColumn, index) => {
    groups.push({
      index,
      startColumn,
      endColumn: aisleColumn,
      columns: Array.from({ length: aisleColumn - startColumn + 1 }, (_, offset) => startColumn + offset),
      width: aisleColumn - startColumn + 1
    });
    startColumn = aisleColumn + 1;
  });

  groups.push({
    index: groups.length,
    startColumn,
    endColumn: columns - 1,
    columns: Array.from({ length: columns - startColumn }, (_, offset) => startColumn + offset),
    width: columns - startColumn
  });

  return groups.filter((group) => group.width > 0);
}

function swapSeatContent(left: Seat, right: Seat) {
  const leftName = left.name;
  const leftStudentNo = left.studentNo;
  left.name = right.name;
  left.studentNo = right.studentNo;
  right.name = leftName;
  right.studentNo = leftStudentNo;
}

function applySeatSwapRule(seats: Seat[], rule: Extract<RotationRule, { type: "seatSwap" }>) {
  const nextSeats = sortSeats(seats).map(cloneSeat);
  const map = seatMap(nextSeats);
  const source = map.get(seatKey(rule.sourceRow, rule.sourceColumn));
  const target = map.get(seatKey(rule.targetRow, rule.targetColumn));

  if (!source || !target || source === target) {
    return nextSeats;
  }

  swapSeatContent(source, target);
  return nextSeats;
}

function applyGroupSwapRule(
  seats: Seat[],
  groups: SeatGroup[],
  rule: Extract<RotationRule, { type: "groupSwap" }>
) {
  const sourceGroup = groups.find((group) => group.index === rule.sourceGroupIndex);
  const targetGroup = groups.find((group) => group.index === rule.targetGroupIndex);
  const nextSeats = sortSeats(seats).map(cloneSeat);

  if (!sourceGroup || !targetGroup || sourceGroup.index === targetGroup.index || sourceGroup.width !== targetGroup.width) {
    return nextSeats;
  }

  const map = seatMap(nextSeats);

  for (let row = 0; row <= Math.max(...nextSeats.map((seat) => seat.row), 0); row += 1) {
    sourceGroup.columns.forEach((column, offset) => {
      const sourceSeat = map.get(seatKey(row, column));
      const targetSeat = map.get(seatKey(row, targetGroup.columns[offset]));

      if (sourceSeat && targetSeat) {
        swapSeatContent(sourceSeat, targetSeat);
      }
    });
  }

  return nextSeats;
}

function applyGroupCycleRule(
  seats: Seat[],
  groups: SeatGroup[],
  rule: Extract<RotationRule, { type: "groupCycle" }>
) {
  const group = groups.find((item) => item.index === rule.groupIndex);
  const nextSeats = sortSeats(seats).map(cloneSeat);

  if (!group) {
    return nextSeats;
  }

  const groupSeats = nextSeats
    .filter((seat) => group.columns.includes(seat.column))
    .sort((a, b) => a.row - b.row || a.column - b.column);

  if (groupSeats.length <= 1) {
    return nextSeats;
  }

  const payloads = groupSeats.map((seat) => ({
    name: seat.name,
    studentNo: seat.studentNo
  }));
  const step = rule.direction === "forward" ? rule.steps : -rule.steps;

  groupSeats.forEach((seat, index) => {
    const payload = payloads[cyclicIndex(groupSeats.length, index - step)];
    seat.name = payload.name;
    seat.studentNo = payload.studentNo;
  });

  return nextSeats;
}

export function applyRotationRule(seats: Seat[], groups: SeatGroup[], rule: RotationRule) {
  switch (rule.type) {
    case "groupSwap":
      return applyGroupSwapRule(seats, groups, rule);
    case "groupCycle":
      return applyGroupCycleRule(seats, groups, rule);
    case "seatSwap":
      return applySeatSwapRule(seats, rule);
  }
}

export function buildRotationFrames(seats: Seat[], groups: SeatGroup[], rotationConfig: RotationConfig) {
  const frames: RotationFrame[] = [
    { label: "当前座位", seats: sortSeats(seats).map(cloneSeat) }
  ];

  rotationConfig.rules.forEach((rule, index) => {
    frames.push({
      label: `第 ${index + 1} 步`,
      seats: applyRotationRule(frames[frames.length - 1].seats, groups, rule),
      ruleId: rule.id
    });
  });

  return frames;
}
