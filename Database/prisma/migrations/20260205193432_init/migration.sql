-- CreateEnum
CREATE TYPE "PortfolioStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AssetSide" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "SignalStatus" AS ENUM ('ACTIVE', 'HIT_TP1', 'HIT_TP2', 'HIT_TP3', 'HIT_SL', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServerLogLevel" AS ENUM ('debug', 'info', 'warn', 'error');

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PortfolioStatus" NOT NULL DEFAULT 'ACTIVE',
    "capital" DOUBLE PRECISION NOT NULL,
    "leverage" DOUBLE PRECISION NOT NULL,
    "defaultLots" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedAsset" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "side" "AssetSide" NOT NULL,
    "lots" DOUBLE PRECISION NOT NULL,
    "scanScore" INTEGER,
    "finalScore" INTEGER,
    "stopLoss" DOUBLE PRECISION,
    "takeProfit1" DOUBLE PRECISION,
    "takeProfit2" DOUBLE PRECISION,
    "riskReward" DOUBLE PRECISION,
    "technicalScore" INTEGER,
    "scenarioStatus" TEXT,
    "entryQuality" TEXT,
    "riskProfile" TEXT,
    "confluences" TEXT[],
    "thesis" TEXT,
    "mesoReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "direction" "AssetSide" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfits" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "components" JSONB NOT NULL,
    "enhancedComponents" JSONB,
    "regime" TEXT NOT NULL,
    "regimeType" TEXT,
    "gates" JSONB,
    "gatesAllPass" BOOLEAN,
    "validityHours" INTEGER NOT NULL,
    "status" "SignalStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPrice" DOUBLE PRECISION,
    "currentPnL" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerLog" (
    "id" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "level" "ServerLogLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "details" TEXT,
    "source" TEXT,

    CONSTRAINT "ServerLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Portfolio_status_idx" ON "Portfolio"("status");

-- CreateIndex
CREATE INDEX "TrackedAsset_portfolioId_idx" ON "TrackedAsset"("portfolioId");

-- CreateIndex
CREATE INDEX "TrackedAsset_symbol_idx" ON "TrackedAsset"("symbol");

-- CreateIndex
CREATE INDEX "Signal_asset_idx" ON "Signal"("asset");

-- CreateIndex
CREATE INDEX "Signal_status_idx" ON "Signal"("status");

-- CreateIndex
CREATE INDEX "Signal_createdAt_idx" ON "Signal"("createdAt");

-- CreateIndex
CREATE INDEX "ServerLog_level_idx" ON "ServerLog"("level");

-- CreateIndex
CREATE INDEX "ServerLog_ts_idx" ON "ServerLog"("ts");

-- AddForeignKey
ALTER TABLE "TrackedAsset" ADD CONSTRAINT "TrackedAsset_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
