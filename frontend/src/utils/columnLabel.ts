export function columnLabel(column: number) {
  return column < 26 ? String.fromCharCode(65 + column) : `A${String.fromCharCode(65 + column - 26)}`;
}
