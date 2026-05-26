export interface Seat {
  id?: string;
  row: number;
  column: number;
  name: string | null;
  studentNo: string | null;
}

export type DoorSide = "left" | "right";

export interface RotationGroupSwapRule {
  id: string;
  type: "groupSwap";
  sourceGroupIndex: number;
  targetGroupIndex: number;
}

export interface RotationGroupCycleRule {
  id: string;
  type: "groupCycle";
  groupIndex: number;
  direction: "forward" | "backward";
  steps: number;
}

export interface RotationSeatSwapRule {
  id: string;
  type: "seatSwap";
  sourceRow: number;
  sourceColumn: number;
  targetRow: number;
  targetColumn: number;
}

export type RotationRule =
  | RotationGroupSwapRule
  | RotationGroupCycleRule
  | RotationSeatSwapRule;

export interface RotationConfig {
  rules: RotationRule[];
}

export interface SeatPlan {
  id: string;
  name: string;
  rows: number;
  columns: number;
  doorSide: DoorSide;
  aisleAfterColumns: number[];
  showStudentNo: boolean;
  rotationConfig: RotationConfig;
  seats: Seat[];
  createdAt: string;
  updatedAt: string;
}

export interface EditableSeatPlan {
  name: string;
  rows: number;
  columns: number;
  doorSide: DoorSide;
  aisleAfterColumns: number[];
  showStudentNo: boolean;
  rotationConfig: RotationConfig;
  seats: Seat[];
}
