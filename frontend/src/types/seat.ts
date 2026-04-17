export interface Seat {
  id?: string;
  row: number;
  column: number;
  name: string | null;
  studentNo: string | null;
}

export interface SeatPlan {
  id: string;
  name: string;
  rows: number;
  columns: number;
  seats: Seat[];
  createdAt: string;
  updatedAt: string;
}

export interface EditableSeatPlan {
  name: string;
  rows: number;
  columns: number;
  seats: Seat[];
}
