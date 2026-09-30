import type { EditableSeatPlan, RotationRule, Seat } from "../types/seat";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}格式不正确`);
  return value as Record<string, unknown>;
}

function integer(value: unknown, label: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label}必须是 ${min}–${max} 范围内的整数`);
  }
  return value;
}

function text(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim().length > max) throw new Error(`${label}必须是最多 ${max} 字的文本`);
  return value.trim() || null;
}

function parseRule(value: unknown, index: number): RotationRule {
  const rule = record(value, `规则 ${index + 1}`);
  const id = text(rule.id, "规则 ID", 80);
  if (!id) throw new Error("轮换规则缺少 ID");
  if (rule.type === "groupSwap") return { id, type: "groupSwap",
    sourceGroupIndex: integer(rule.sourceGroupIndex, "来源大组", 0), targetGroupIndex: integer(rule.targetGroupIndex, "目标大组", 0) };
  if (rule.type === "groupCycle") {
    if (rule.direction !== "forward" && rule.direction !== "backward") throw new Error("轮换方向不正确");
    return { id, type: "groupCycle", groupIndex: integer(rule.groupIndex, "轮换大组", 0), direction: rule.direction,
      steps: integer(rule.steps, "轮换步数", 1, 200) };
  }
  if (rule.type === "seatSwap") return { id, type: "seatSwap",
    sourceRow: integer(rule.sourceRow, "来源排数", 0), sourceColumn: integer(rule.sourceColumn, "来源列数", 0),
    targetRow: integer(rule.targetRow, "目标排数", 0), targetColumn: integer(rule.targetColumn, "目标列数", 0) };
  throw new Error("轮换规则类型不正确");
}

export function parseImportedSeatPlan(json: string): EditableSeatPlan {
  const payload = record(JSON.parse(json), "座位表");
  const rows = integer(payload.rows, "排数", 1, 30);
  const columns = integer(payload.columns, "列数", 1, 30);
  if (!Array.isArray(payload.seats)) throw new Error("JSON 缺少座位列表");
  const seats = new Map<string, Seat>();
  payload.seats.forEach((value, index) => {
    const seat = record(value, `座位 ${index + 1}`);
    const row = integer(seat.row, "座位排数", 0, rows - 1);
    const column = integer(seat.column, "座位列数", 0, columns - 1);
    const key = `${row}:${column}`;
    if (seats.has(key)) throw new Error(`第 ${row + 1} 排第 ${column + 1} 列座位重复`);
    seats.set(key, { row, column, name: text(seat.name, "姓名", 80), studentNo: text(seat.studentNo, "学号", 40) });
  });
  const rawAisles = payload.aisleAfterColumns ?? [];
  if (!Array.isArray(rawAisles)) throw new Error("过道列表格式不正确");
  const aisleAfterColumns = rawAisles.map((value) => integer(value, "过道位置", 0, columns - 2)).sort((a, b) => a - b);
  if (new Set(aisleAfterColumns).size !== aisleAfterColumns.length) throw new Error("过道位置不能重复");
  if (payload.doorSide !== undefined && payload.doorSide !== "left" && payload.doorSide !== "right") throw new Error("门的位置不正确");
  if (payload.showStudentNo !== undefined && typeof payload.showStudentNo !== "boolean") throw new Error("显示学号必须是布尔值");
  const config = payload.rotationConfig === undefined ? { rules: [] } : record(payload.rotationConfig, "轮换设置");
  if (!Array.isArray(config.rules) || config.rules.length > 100) throw new Error("轮换规则必须是最多 100 项的列表");
  const rules = config.rules.map(parseRule);
  if (new Set(rules.map((rule) => rule.id)).size !== rules.length) throw new Error("轮换规则 ID 不能重复");
  return {
    name: text(payload.name, "座位表名称", 80) || "导入座位表", rows, columns,
    doorSide: payload.doorSide === "left" ? "left" : "right", aisleAfterColumns,
    showStudentNo: payload.showStudentNo !== false, rotationConfig: { rules },
    seats: Array.from({ length: rows * columns }, (_, i) => {
      const row = Math.floor(i / columns), column = i % columns;
      return seats.get(`${row}:${column}`) ?? { row, column, name: null, studentNo: null };
    })
  };
}
