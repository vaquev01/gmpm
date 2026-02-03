import { NextResponse } from 'next/server';
import { clearServerLogs, getServerLogs } from '@/lib/serverLogs';

export async function GET() {
  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    entries: getServerLogs(),
  });
}

export async function DELETE() {
  clearServerLogs();
  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
  });
}
