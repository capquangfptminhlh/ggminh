#!/usr/bin/env node
'use strict';
// Private operator CLI, excluded by !tools/** from Electron packaging.
// Verify the money in your actual bank first; this tool does not access banks.
const {runGoogleSaasBillingAdmin}=require('./google-saas-billing-core');
runGoogleSaasBillingAdmin({args:process.argv.slice(2)})
 .then(result=>{
  if(process.argv[2]==='ready'&&result.status!=='configured')process.exitCode=2;
 })
 .catch(error=>{
  console.error('Staging billing review blocked: '+(error.code||'OPERATION_FAILED'));
  process.exitCode=1;
 });
