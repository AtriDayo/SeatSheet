export interface Seat {
  id?: string;
  row: number;
  column: number;
  name: string | null;
  studentNo: string | null;
}

export type DoorSide = "left" | "right";

export interface SeatPlan {
  id: string;
  name: string;
  rows: number;
  columns: number;
  doorSide: DoorSide;
  aisleAfterColumns: number[];
  showStudentNo: boolean;
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
  seats: Seat[];
}
