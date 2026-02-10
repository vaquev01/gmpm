import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.serverLog.deleteMany();
  await prisma.signal.deleteMany();
  await prisma.trackedAsset.deleteMany();
  await prisma.portfolio.deleteMany();

  const p1 = await prisma.portfolio.create({
    data: {
      name: 'Portfolio 14:36:48',
      status: 'ACTIVE',
      capital: 100000,
      leverage: 1,
      defaultLots: 1,
      assets: {
        create: [
          {
            symbol: 'AUDUSD=X',
            entryPrice: 0.65,
            side: 'LONG',
            lots: 1,
            scanScore: 70,
            finalScore: 80,
            confluences: ['Macro aligned', 'Meso allowed'],
          },
          {
            symbol: 'XLP',
            entryPrice: 85.67,
            side: 'LONG',
            lots: 1,
            scanScore: 74,
            finalScore: 78,
            confluences: ['Defensive sector', 'Vol normal'],
          },
        ],
      },
    },
  });

  await prisma.portfolio.create({
    data: {
      name: 'Portfolio 17:10:51',
      status: 'ACTIVE',
      capital: 300000,
      leverage: 2,
      defaultLots: 1,
      assets: {
        create: [
          {
            symbol: 'AUDJPY=X',
            entryPrice: 109.76,
            side: 'LONG',
            lots: 1,
            scanScore: 74,
            finalScore: 76,
            scenarioStatus: 'PRONTO',
            riskProfile: 'MODERATE',
            confluences: ['FX strength', 'Liquidity ok'],
          },
        ],
      },
    },
  });

  const now = Date.now();
  await prisma.serverLog.createMany({
    data: [
      {
        ts: BigInt(now),
        level: 'info',
        message: 'seed',
        details: `portfolios created: ${p1.id}`,
        source: 'seed',
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
