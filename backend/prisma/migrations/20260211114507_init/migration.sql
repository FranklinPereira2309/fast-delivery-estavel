-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('COUNTER', 'TABLE', 'OWN_DELIVERY', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('G', 'ML', 'UN', 'KG', 'L');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('AVAILABLE', 'BUSY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('Moto', 'Carro', 'Bicicleta');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('available', 'occupied', 'billing');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addresses" TEXT[],
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "lastOrderDate" TEXT,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waiter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "Waiter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "UnitType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "minStock" DOUBLE PRECISION NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "wasteFactor" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientAddress" TEXT,
    "clientPhone" TEXT,
    "total" DOUBLE PRECISION NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "type" "SaleType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" TEXT,
    "driverId" TEXT,
    "tableNumber" INTEGER,
    "waiterId" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "tableSessionId" INTEGER,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "readyAt" TIMESTAMP(3),

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSession" (
    "tableNumber" INTEGER NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'available',
    "clientName" TEXT,
    "clientId" TEXT,
    "waiterId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientAddress" TEXT,
    "clientPhone" TEXT,

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("tableNumber")
);

-- CreateTable
CREATE TABLE "DeliveryDriver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "vehiclePlate" TEXT NOT NULL,
    "vehicleModel" TEXT NOT NULL,
    "vehicleBrand" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'AVAILABLE',

    CONSTRAINT "DeliveryDriver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSettings" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "deliveryFee" TEXT NOT NULL,
    "tableCount" INTEGER NOT NULL,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DeliveryDriver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "TableSession"("tableNumber") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
