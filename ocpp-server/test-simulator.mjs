#!/usr/bin/env node
/**
 * OCPP 1.6 Chargepoint Simulator
 * Simulates: BootNotification → Heartbeat → StatusNotification → StartTransaction → MeterValues → StopTransaction
 */

import WebSocket from 'ws';

const WS_URL = 'wss://ezdrive-ocpp.fly.dev/ocpp/EZDRIVE-FDF-001';
const IDENTITY = 'EZDRIVE-FDF-001';

let callId = 1;
const pendingCalls = new Map();

function sendCall(ws, action, payload) {
  const id = String(callId++);
  const msg = JSON.stringify([2, id, action, payload]);
  console.log(`→ [${action}]`, JSON.stringify(payload).substring(0, 120));
  ws.send(msg);
  return new Promise((resolve, reject) => {
    pendingCalls.set(id, { resolve, reject, action });
    setTimeout(() => {
      if (pendingCalls.has(id)) {
        pendingCalls.delete(id);
        reject(new Error(`Timeout waiting for ${action}`));
      }
    }, 10000);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runSimulation(ws) {
  try {
    // 1. BootNotification
    console.log('\n=== 1. BootNotification ===');
    const boot = await sendCall(ws, 'BootNotification', {
      chargePointVendor: 'Wallbox',
      chargePointModel: 'Commander 2',
      chargePointSerialNumber: 'WB-FDF-001',
      firmwareVersion: '5.12.3',
      chargeBoxSerialNumber: 'WB-FDF-001-CB'
    });
    console.log('← Boot:', JSON.stringify(boot));

    await sleep(1000);

    // 2. Heartbeat
    console.log('\n=== 2. Heartbeat ===');
    const hb = await sendCall(ws, 'Heartbeat', {});
    console.log('← Heartbeat:', JSON.stringify(hb));

    await sleep(500);

    // 3. StatusNotification — connector 1 Available
    console.log('\n=== 3. StatusNotification (Available) ===');
    const sn1 = await sendCall(ws, 'StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Available',
      timestamp: new Date().toISOString()
    });
    console.log('← Status:', JSON.stringify(sn1));

    await sleep(500);

    // 4. Authorize
    console.log('\n=== 4. Authorize ===');
    const auth = await sendCall(ws, 'Authorize', {
      idTag: 'EZDRIVE-TEST-TOKEN-001'
    });
    console.log('← Authorize:', JSON.stringify(auth));

    await sleep(500);

    // 5. StartTransaction
    console.log('\n=== 5. StartTransaction ===');
    const start = await sendCall(ws, 'StartTransaction', {
      connectorId: 1,
      idTag: 'EZDRIVE-TEST-TOKEN-001',
      meterStart: 1000,
      timestamp: new Date().toISOString()
    });
    console.log('← Start:', JSON.stringify(start));

    const transactionId = start?.transactionId;
    console.log('   TransactionId:', transactionId);

    await sleep(500);

    // 6. StatusNotification — connector 1 Charging
    console.log('\n=== 6. StatusNotification (Charging) ===');
    const sn2 = await sendCall(ws, 'StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Charging',
      timestamp: new Date().toISOString()
    });
    console.log('← Status:', JSON.stringify(sn2));

    await sleep(1000);

    // 7. MeterValues
    console.log('\n=== 7. MeterValues ===');
    const mv = await sendCall(ws, 'MeterValues', {
      connectorId: 1,
      transactionId,
      meterValue: [{
        timestamp: new Date().toISOString(),
        sampledValue: [
          { value: '1500', context: 'Sample.Periodic', format: 'Raw', measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
          { value: '7200', context: 'Sample.Periodic', format: 'Raw', measurand: 'Power.Active.Import', unit: 'W' }
        ]
      }]
    });
    console.log('← MeterValues:', JSON.stringify(mv));

    await sleep(1000);

    // 8. StopTransaction
    console.log('\n=== 8. StopTransaction ===');
    const stop = await sendCall(ws, 'StopTransaction', {
      transactionId,
      meterStop: 3500,
      timestamp: new Date().toISOString(),
      reason: 'EVDisconnected',
      idTag: 'EZDRIVE-TEST-TOKEN-001'
    });
    console.log('← Stop:', JSON.stringify(stop));

    await sleep(500);

    // 9. StatusNotification — connector 1 Available again
    console.log('\n=== 9. StatusNotification (Available) ===');
    const sn3 = await sendCall(ws, 'StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Available',
      timestamp: new Date().toISOString()
    });
    console.log('← Status:', JSON.stringify(sn3));

    // Check health
    await sleep(500);
    console.log('\n=== SIMULATION COMPLETE ===');
    console.log('Check dashboard: https://lovable.dev/projects/4d912ab8-d8b6-4e44-8a5b-07f304e1c3d1');

    ws.close();
  } catch (err) {
    console.error('Simulation error:', err.message);
    ws.close();
  }
}

// Connect
console.log(`Connecting to ${WS_URL}...`);
const ws = new WebSocket(WS_URL, ['ocpp1.6']);

ws.on('open', () => {
  console.log('✅ Connected as', IDENTITY);
  runSimulation(ws);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg[0] === 3) { // CallResult
    const id = msg[1];
    const payload = msg[2];
    if (pendingCalls.has(id)) {
      pendingCalls.get(id).resolve(payload);
      pendingCalls.delete(id);
    }
  } else if (msg[0] === 4) { // CallError
    const id = msg[1];
    console.error('← ERROR:', msg[2], msg[3]);
    if (pendingCalls.has(id)) {
      pendingCalls.get(id).reject(new Error(msg[3]));
      pendingCalls.delete(id);
    }
  } else if (msg[0] === 2) { // Call from server
    console.log('← Server call:', msg[2], JSON.stringify(msg[3]).substring(0, 80));
    // Auto-respond with empty result
    ws.send(JSON.stringify([3, msg[1], {}]));
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

ws.on('close', (code, reason) => {
  console.log(`Disconnected (${code}): ${reason}`);
  process.exit(0);
});
