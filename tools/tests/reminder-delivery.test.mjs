import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryCode,deliverToDevices} from '../lib/reminder-delivery.mjs';

test('expired registrations include the raw NotRegistered response observed in production',()=>{
  assert.equal(deliveryCode({errorInfo:{code:'NotRegistered'}}),'expired');
  assert.equal(deliveryCode({code:'messaging/registration-token-not-registered'}),'expired');
  // INVALID_ARGUMENT can describe a bad payload, so must not delete a valid registration.
  assert.equal(deliveryCode({code:'messaging/invalid-argument'}),'failed');
});

test('separate accounts and multiple devices all receive an attempt despite expired and transient failures',async()=>{
  const attempted=[],removed=[],results=[];
  for(const tokens of [['owner-expired','owner-working'],['friend-working','friend-temporary']]){
    results.push(await deliverToDevices({tokens,send:async token=>{
      attempted.push(token);
      if(token.endsWith('expired')) throw {errorInfo:{code:'NotRegistered'}};
      if(token.endsWith('temporary')) throw {code:'messaging/server-unavailable'};
    },remove:async token=>removed.push(token)}));
  }
  assert.deepEqual(attempted,['owner-expired','owner-working','friend-working','friend-temporary']);
  assert.deepEqual(removed,['owner-expired']);
  assert.deepEqual(results,[{attempted:2,sent:1,expired:1,failed:0},{attempted:2,sent:1,expired:0,failed:1}]);
});
