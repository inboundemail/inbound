import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    console.log('Received POST request:', requestBody);

    return NextResponse.json({ success: true, message: 'Request logged successfully' });
  } catch (error) {
    console.error('Error processing POST request:', error);
    return NextResponse.json({ success: false, message: 'Failed to process request' }, { status: 500 });
  }
}
