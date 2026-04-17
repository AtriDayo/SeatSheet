-- CreateTable
CREATE TABLE "SeatPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "columns" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "column" INTEGER NOT NULL,
    "studentNo" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Seat_planId_idx" ON "Seat"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_planId_row_column_key" ON "Seat"("planId", "row", "column");

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SeatPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
