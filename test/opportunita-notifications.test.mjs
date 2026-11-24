import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {notifyOpportunityLead,OPPORTUNITY_LEAD_RECIPIENTS} from '../src/opportunity.js';

const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const worker=readFileSync(new URL('../src/opportunity.js',import.meta.url),'utf8');
const entry=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const sample={
  full_name:'Mario Rossi <test>',
  phone:'+39 333 111 2222',
  transaction_interest:'cessione',
  contact_preference:'WhatsApp',
  notes:'Vorrei ricevere dettagli & informazioni',
  source_page:'/',
  id:'12345',
  created_at:'2026-11-18T12:00:00Z',
};

test('single recipient allowlist scoped to lounge notifications and same existing sender',()=>{
  assert.deepEqual(OPPORTUNITY_LEAD_RECIPIENTS,[
    'valerianogaetano@hotmail.com',
  ]);
  assert.equal(config.send_email.length,1);
  assert.equal(config.send_email[0].name,'EMAIL');
  assert.deepEqual(config.send_email[0].allowed_sender_addresses,['info@impresax.org']);
  assert.deepEqual(config.send_email[0].allowed_destination_addresses,OPPORTUNITY_LEAD_RECIPIENTS);
  assert.match(entry,/serveOpportunity\(request, env, ctx\)/);
  assert.match(worker,/insert into public\.activity_sale_leads/);
  assert.match(worker,/ctx\.waitUntil\(mailWork\)/);
});

test('each saved lounge lead emails Gaetano only with essential fields; HTML is escaped',async()=>{
  const sends=[];
  const fake={EMAIL:{send:async(payload)=>{
    sends.push(payload);
    return {messageId:'provider-id-'+sends.length};
  }}};
  const result=await notifyOpportunityLead(fake,sample);
  assert.deepEqual(result,{sent:1,failed:0});
  assert.equal(sends.length,1);
  assert.deepEqual(sends.map(x=>x.to),OPPORTUNITY_LEAD_RECIPIENTS);
  for(const msg of sends){
    assert.equal(msg.from.email,'info@impresax.org');
    assert.match(msg.subject,/Lounge Bar Catanzaro Lido/);
    assert.match(msg.text,/Mario Rossi <test>/);
    assert.match(msg.text,/333 111 2222/);
    assert.match(msg.text,/Acquisto dell'attività/);
    assert.match(msg.text,/WhatsApp/);
    assert.match(msg.html,/Mario Rossi &lt;test&gt;/);
    assert.doesNotMatch(msg.html,/Mario Rossi <test>/);
  }
});

test('recipient delivery failure never throws and persists lead independently',async()=>{
  let calls=0;
  const fake={EMAIL:{send:async(msg)=>{
    calls++;
    assert.equal(msg.to,'valerianogaetano@hotmail.com');
    const error=new Error('Unverified destination');error.code='E_RECIPIENT_NOT_ALLOWED';throw error;
  }}};
  const result=await notifyOpportunityLead(fake,sample);
  assert.equal(calls,1);
  assert.deepEqual(result,{sent:0,failed:1});
});

test('missing mail binding returns failure without throwing, so lead persistence remains independent',async()=>{
  assert.deepEqual(await notifyOpportunityLead({},sample),{sent:0,failed:1});
});
