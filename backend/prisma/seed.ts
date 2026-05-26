import { prisma } from "../src/prisma.js";
import { updateActivePlan } from "../src/seatPlanService.js";

const names = [
  ["周一鸣", "2026001"],
  ["林夏", "2026002"],
  ["陈景", "2026003"],
  ["许诺", "2026004"],
  ["顾青", "2026005"],
  ["沈星", "2026006"]
];

await updateActivePlan({
  name: "示例座位表",
  rows: 4,
  columns: 5,
  doorSide: "right",
  aisleAfterColumns: [1, 3],
  showStudentNo: true,
  rotationConfig: { rules: [] },
  seats: names.map(([name, studentNo], index) => ({
    row: Math.floor(index / 5),
    column: index % 5,
    name,
    studentNo
  }))
});

await prisma.$disconnect();
